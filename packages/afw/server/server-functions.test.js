import { describe, expect, test } from "runtime:test";
import { parse, stringify } from "@opentf/serialize";
import { z } from "zod";

import { ValidationError, action, createServerFunctions, notFound, query, serverFunctionKind } from "./index.js";

const ORIGIN = "http://app.test";
const post = (path, body, headers = {}) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body });
const get = (path, args, headers = {}) =>
  new Request(`${ORIGIN}${path}${args === undefined ? "" : `?a=${encodeURIComponent(stringify(args))}`}`, { headers });
// A successful result, decoded as the browser stub decodes it.
const read = async (res) => parse(await res.text());

// A hand-written Standard Schema, to show no particular library is required.
const positiveNumber = {
  "~standard": {
    version: 1, vendor: "test",
    validate: (v) => (typeof v === "number" && v > 0 ? { value: v } : { issues: [{ message: "must be a positive number", path: [] }] }),
  },
};

describe("query() and action()", () => {
  test("mark their kind and can be called directly from server code", async () => {
    const double = query(positiveNumber, async (n, { locals }) => n * 2 + (locals?.bonus ?? 0));
    const save = action(async (input) => ({ saved: input }));
    expect(serverFunctionKind(double)).toBe("query");
    expect(serverFunctionKind(save)).toBe("action");
    expect(serverFunctionKind(() => 1)).toBe(null);
    expect(await double(4)).toBe(8);
    expect(await double(4, { locals: { bonus: 1 } })).toBe(9);
    await expect(double(-1)).rejects.toThrow("Invalid input");
  });

  test("reject a schema that is not a Standard Schema", () => {
    expect(() => query({ parse() {} }, async () => 1)).toThrow("Standard Schema");
    expect(() => action("nope")).toThrow("must be a function");
  });
});

describe("createServerFunctions", () => {
  const listTodos = query(z.object({ done: z.boolean() }), async ({ done }, { locals }) => ({ done, owner: locals.user }));
  const addTodo = action(z.object({ title: z.string().min(1) }), async ({ title }) => ({ id: 1, title }));
  const secret = query(async (_, { locals }) => {
    if (!locals.user) throw new Response(null, { status: 401 });
    if (locals.user === "eve") notFound();
    return "the secret";
  });
  const broken = action(async () => { throw new Error("database password is hunter2"); });
  const fns = createServerFunctions({
    "/todos/__fn/list": listTodos, "/todos/__fn/add": addTodo, "/admin/__fn/secret": secret, "/__fn/broken": broken,
  });

  test("answers only its endpoints", async () => {
    expect(fns.size).toBe(4);
    expect(await fns.handle(get("/todos"))).toBe(null);
    expect(await fns.handle(get("/todos/__fn/unknown"))).toBe(null);
  });

  test("a query answers GET and POST with the middleware's locals", async () => {
    const res = await fns.handle(get("/todos/__fn/list", { done: true }), { locals: { user: "ada" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await read(res)).toEqual({ done: true, owner: "ada" });
    const viaPost = await fns.handle(post("/todos/__fn/list", stringify({ done: false })), { locals: { user: "ada" } });
    expect(await read(viaPost)).toEqual({ done: false, owner: "ada" });
  });

  test("an action is POST only", async () => {
    const res = await fns.handle(get("/todos/__fn/add", { title: "x" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(await read(await fns.handle(post("/todos/__fn/add", stringify({ title: "Write tests" }))))).toEqual({ id: 1, title: "Write tests" });
  });

  test("invalid input is a 400 with the schema's issues, and the function never runs", async () => {
    let ran = false;
    const guarded = createServerFunctions({ "/__fn/x": action(z.object({ n: z.number() }), async () => { ran = true; }) });
    const res = await guarded.handle(post("/__fn/x", stringify({ n: "one" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.issues[0].path).toEqual(["n"]);
    expect(ran).toBe(false);
  });

  test("malformed bodies, wrong content types and oversized bodies are refused", async () => {
    expect((await fns.handle(post("/todos/__fn/add", "{not json"))).status).toBe(400);
    expect((await fns.handle(post("/todos/__fn/add", '{"title":"x"}'))).status).toBe(400, "plain JSON without the envelope");
    expect((await fns.handle(post("/todos/__fn/add", '{"v":"@0"}'))).status).toBe(400, "a token with no $refs entry");
    expect((await fns.handle(new Request(`${ORIGIN}/todos/__fn/list?a=%7Bbad`, { headers: { origin: ORIGIN } }))).status).toBe(400, "malformed query arguments");
    expect((await fns.handle(post("/todos/__fn/add", "title=x", { "content-type": "application/x-www-form-urlencoded" }))).status).toBe(415);
    const small = createServerFunctions({ "/__fn/x": action(async () => 1) }, { maxBodyBytes: 10 });
    expect((await small.handle(post("/__fn/x", stringify({ big: "x".repeat(50) })))).status).toBe(413);
    const shallow = createServerFunctions({ "/__fn/x": action(async () => 1) }, { maxDepth: 3 });
    expect((await shallow.handle(post("/__fn/x", stringify([[[[1]]]])))).status).toBe(400, "nesting deeper than maxDepth");
    expect((await shallow.handle(post("/__fn/x", stringify([[1]])))).status).toBe(200);
    // The default depth limit holds without options.
    const deep = stringify(Array.from({ length: 100 }).reduce((inner) => [inner], 1));
    expect((await createServerFunctions({ "/__fn/x": action(async () => 1) }).handle(post("/__fn/x", deep))).status).toBe(400);
  });

  test("a decoded __proto__ key stays an own key, never a prototype", async () => {
    const echo = createServerFunctions({ "/__fn/echo": action(async (input) => ({ isAdmin: input.isAdmin ?? null, own: Object.keys(input) })) });
    const res = await echo.handle(post("/__fn/echo", '{"v":{"__proto__":{"isAdmin":true}}}'));
    expect(await read(res)).toEqual({ isAdmin: null, own: ["__proto__"] });
    expect(Object.prototype.isAdmin).toBe(undefined);
  });

  test("cross-site requests are refused; same-origin and non-browser clients are not", async () => {
    expect((await fns.handle(post("/todos/__fn/add", stringify({ title: "x" }), { origin: "https://evil.test" }))).status).toBe(403);
    const fetchSite = (site) => new Request(`${ORIGIN}/todos/__fn/list?a=${encodeURIComponent(stringify({ done: true }))}`, { headers: { "sec-fetch-site": site } });
    expect((await fns.handle(fetchSite("cross-site"))).status).toBe(403);
    expect((await fns.handle(fetchSite("same-origin"))).status).toBe(200);
    const curl = new Request(`${ORIGIN}/todos/__fn/add`, { method: "POST", headers: { "content-type": "application/json" }, body: stringify({ title: "x" }) });
    expect((await fns.handle(curl)).status).toBe(200);
  });

  test("a thrown Response passes through, notFound() is 404, other errors are a generic 500", async () => {
    expect((await fns.handle(get("/admin/__fn/secret"))).status).toBe(401);
    expect((await fns.handle(get("/admin/__fn/secret"), { locals: { user: "eve" } })).status).toBe(404);
    expect(await read(await fns.handle(get("/admin/__fn/secret"), { locals: { user: "ada" } }))).toBe("the secret");
    const res = await fns.handle(post("/__fn/broken", stringify(null)));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("hunter2");
  });

  test("arguments and results keep their types across the wire", async () => {
    const shift = action(async ({ at, tags, n }) => ({ at: new Date(at.getTime() + 1000), tags: new Map([...tags].map((t) => [t, t.length])), n: n * 2n, none: undefined }));
    const res = await createServerFunctions({ "/__fn/shift": shift }).handle(post("/__fn/shift", stringify({ at: new Date(0), tags: new Set(["ab"]), n: 21n })));
    const out = await read(res);
    expect(out.at instanceof Date && out.at.getTime()).toBe(1000);
    expect(out.tags instanceof Map && out.tags.get("ab")).toBe(2);
    expect(out.n).toBe(42n);
    expect("none" in out && out.none === undefined).toBe(true);
  });

  test("a result the codec refuses is a generic 500", async () => {
    class Row {}
    const res = await createServerFunctions({ "/__fn/row": query(async () => new Row()) }).handle(get("/__fn/row"));
    expect(res.status).toBe(500);
  });

  test("only query() and action() exports can be registered", () => {
    expect(() => createServerFunctions({ "/__fn/x": async () => 1 })).toThrow("not a query() or action()");
  });

  test("ValidationError carries the issues", () => {
    const error = new ValidationError([{ message: "bad", path: ["a"] }]);
    expect(error.issues[0].message).toBe("bad");
  });
});

describe("refresh() — single-flight updates", () => {
  let version = 0;
  const todos = [];
  const listTodos = query(z.object({ done: z.boolean() }), async ({ done }, { locals }) => ({ done, todos: [...todos], v: ++version, user: locals.user }));
  const getTodo = query(async ({ id }) => ({ id, title: todos[id] }));
  const flaky = query(async () => { throw new Error("down"); });
  const adminList = query(async () => "admin");
  const nested = query(async () => "nested");
  const addTodo = action(async ({ title, also }, { refresh }) => {
    todos.push(title);
    refresh(listTodos);
    if (also) refresh(getTodo, { id: todos.length - 1 });
    return { added: title };
  });
  const quiet = action(async () => "no refresh");
  const outOfScope = action(async (_, { refresh }) => { refresh(adminList, nested); return "ok"; });
  const failing = action(async (_, { refresh }) => { refresh(flaky); return "ok"; });
  const many = action(async (_, { refresh }) => { for (let id = 0; id < 25; id++) refresh(getTodo, { id }); return "ok"; });
  const misuse = action(async (_, { refresh }) => { refresh(quiet); return "ok"; });
  const fns = createServerFunctions({
    "/todos/__fn/list": listTodos, "/__fn/todo": getTodo, "/todos/__fn/flaky": flaky,
    "/admin/__fn/list": adminList, "/todos/archive/__fn/list": nested,
    "/todos/__fn/add": addTodo, "/todos/__fn/quiet": quiet, "/todos/__fn/out": outOfScope,
    "/todos/__fn/failing": failing, "/todos/__fn/many": many, "/todos/__fn/misuse": misuse,
  });
  const live = (calls, input = {}) => stringify({ input, live: calls });
  const act = (path, body, headers = { "x-afw-live": "1" }) => fns.handle(post(path, body, headers), { locals: { user: "ada" } });

  test("re-runs the refreshed query for each input the page shows, after the write", async () => {
    const res = await act("/todos/__fn/add", live([["/todos/__fn/list", { done: false }], ["/todos/__fn/list", { done: true }], ["/__fn/todo", { id: 9 }]], { title: "a" }));
    expect(res.headers.get("x-afw-refresh")).toBe("1");
    const { result, refresh } = await read(res);
    expect(result).toEqual({ added: "a" });
    expect(refresh.endpoints).toEqual(["/todos/__fn/list"]);
    expect(refresh.fresh.map(([path, input, data]) => [path, input.done, data.todos, data.user])).toEqual([
      ["/todos/__fn/list", false, ["a"], "ada"],
      ["/todos/__fn/list", true, ["a"], "ada"],
    ]);
    expect(refresh.stale).toEqual([]);
  });

  test("a query with an input runs for that input, shown or not; a parent folder's query is in scope", async () => {
    const { refresh } = await read(await act("/todos/__fn/add", live([], { title: "b", also: true })));
    expect(refresh.endpoints).toEqual(["/todos/__fn/list"], "a query refreshed with an input covers that call only");
    expect(refresh.fresh).toEqual([["/__fn/todo", { id: todos.length - 1 }, { id: todos.length - 1, title: "b" }]]);
  });

  test("queries under other middleware are not run there: they go back stale", async () => {
    const { refresh } = await read(await act("/todos/__fn/out", live([["/admin/__fn/list", undefined], ["/todos/archive/__fn/list", undefined]])));
    expect(refresh.fresh).toEqual([]);
    expect(refresh.stale).toEqual([["/admin/__fn/list"], ["/todos/archive/__fn/list"]]);
  });

  test("a refreshed query that fails goes back stale and the action still succeeds", async () => {
    const res = await act("/todos/__fn/failing", live([["/todos/__fn/flaky", undefined]]));
    expect(res.status).toBe(200);
    const { result, refresh } = await read(res);
    expect(result).toBe("ok");
    expect(refresh.stale).toEqual([["/todos/__fn/flaky", undefined]]);
  });

  test("a shown input the query's schema refuses goes back stale", async () => {
    const { refresh } = await read(await act("/todos/__fn/add", live([["/todos/__fn/list", { done: "yes" }]], { title: "c" })));
    expect(refresh.fresh).toEqual([]);
    expect(refresh.stale).toEqual([["/todos/__fn/list", { done: "yes" }]]);
  });

  test(`at most 20 calls run; the rest go back stale`, async () => {
    const { refresh } = await read(await act("/todos/__fn/many", live([])));
    expect(refresh.fresh.length).toBe(20);
    expect(refresh.stale.length).toBe(5);
  });

  test("an action without refresh() answers its plain result, envelope or not", async () => {
    const res = await act("/todos/__fn/quiet", live([["/todos/__fn/list", { done: false }]]));
    expect(res.headers.get("x-afw-refresh")).toBe(null);
    expect(await read(res)).toBe("no refresh");
    expect(await read(await act("/todos/__fn/quiet", stringify(undefined), {}))).toBe("no refresh");
  });

  test("a malformed or oversized envelope is a 400", async () => {
    expect((await act("/todos/__fn/quiet", stringify({ input: 1, live: "x" }))).status).toBe(400);
    expect((await act("/todos/__fn/quiet", stringify({ live: [] }))).status).toBe(400);
    const tooMany = Array.from({ length: 21 }, () => ["/todos/__fn/list", { done: false }]);
    expect((await act("/todos/__fn/quiet", live(tooMany))).status).toBe(400);
  });

  test("refresh() of something other than a query is a server bug (500)", async () => {
    expect((await act("/todos/__fn/misuse", live([]))).status).toBe(500);
  });

  test("called directly from server code, refresh() does nothing", async () => {
    expect(await addTodo({ title: "direct" })).toEqual({ added: "direct" });
    expect(await addTodo({ title: "direct" }, { locals: {} })).toEqual({ added: "direct" });
  });
});
