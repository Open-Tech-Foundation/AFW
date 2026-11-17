// Writes to the query cache: single-flight refresh through a real server handler,
// setQueryData, optimistic overlays; plus query retries, timeouts and revalidateOn.
import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import { decode } from "../core/fn-codec.js";
import { scope } from "../core/signals.js";
import { action, createServerFunctions, query, serverFunctionKind } from "../server/index.js";
import { optimistic, setQueryData } from "./mutate.js";
import { __resetQueryCache } from "./query-cache.js";
import { resource } from "./resource.js";
import { __setRetryDelays, serverFunction } from "./server-function.js";

const ORIGIN = "http://app.test";
const realFetch = globalThis.fetch;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
let requests, owned, todos, failNext;

// The real server handler behind the stubs, as a same-origin browser would reach it.
const server = {
  listTodos: query(async ({ done }) => todos.filter((t) => t.done === done)),
  getTodo: query(async ({ id }) => todos.find((t) => t.id === id) ?? null),
  adminList: query(async () => ["admin"]),
  addTodo: action(async ({ title }, { refresh }) => {
    if (failNext) throw new Error("refused");
    todos.push({ id: todos.length + 1, title, done: false });
    refresh(server.listTodos);
    return { id: todos.length };
  }),
  renameTodo: action(async ({ id, title }, { refresh }) => {
    todos.find((t) => t.id === id).title = title;
    refresh(server.getTodo, { id });
    return "ok";
  }),
  touchAdmin: action(async (_, { refresh }) => { refresh(server.adminList); return "ok"; }),
  plain: action(async () => "plain"),
};
const paths = {
  listTodos: "/todos/__fn/list", getTodo: "/todos/__fn/get", adminList: "/admin/__fn/list",
  addTodo: "/todos/__fn/add", renameTodo: "/todos/__fn/rename", touchAdmin: "/todos/__fn/touch", plain: "/todos/__fn/plain",
};
const fns = createServerFunctions(Object.fromEntries(Object.entries(paths).map(([name, path]) => [path, server[name]])));
// The browser stubs the build would generate for them.
const stub = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, serverFunction(path, serverFunctionKind(server[name]))]));

beforeEach(() => {
  requests = [];
  owned = [];
  failNext = false;
  todos = [{ id: 1, title: "a", done: false }, { id: 2, title: "b", done: true }];
  globalThis.fetch = async (url, init = {}) => {
    const request = new Request(new URL(url, ORIGIN), { ...init, headers: { origin: ORIGIN, ...init.headers } });
    requests.push({ method: request.method, path: new URL(request.url).pathname, live: request.headers.get("x-afw-live"), body: init.body });
    return (await fns.handle(request, { locals: {} })) ?? new Response("not found", { status: 404 });
  };
});
afterEach(() => {
  for (const s of owned) s.dispose();
  globalThis.fetch = realFetch;
  __resetQueryCache();
  __setRetryDelays([300, 1000]);
});

function mount(make) {
  const s = scope(make);
  owned.push(s);
  return Object.assign(s.result, { unmount: () => s.dispose() });
}
const titles = (r) => r.data?.map((t) => t.title);

describe("single-flight refresh", () => {
  test("an action updates every shown call of the query it refreshed, in one request", async () => {
    const open = mount(() => resource(() => ({ done: false }), stub.listTodos));
    const done = mount(() => resource(() => stub.listTodos({ done: true }).then((list) => list.map((t) => ({ ...t, title: t.title.toUpperCase() })))));
    await settle();
    expect([titles(open), titles(done)]).toEqual([["a"], ["B"]]);
    requests.length = 0;
    expect(await stub.addTodo({ title: "c" })).toEqual({ id: 3 });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["POST /todos/__fn/add"]);
    expect(titles(open)).toEqual(["a", "c"]);
    expect(titles(done)).toEqual(["B"], "a fetcher's own transform still applies");
    await settle();
    expect(requests.length).toBe(1);
  });

  test("the action request carries the calls the page shows", async () => {
    mount(() => resource(() => ({ done: false }), stub.listTodos));
    mount(() => resource(() => ({ id: 1 }), stub.getTodo));
    await settle();
    requests.length = 0;
    await stub.plain();
    expect(requests[0].live).toBe("1");
    expect(decode(requests[0].body).live).toEqual([[paths.listTodos, { done: false }], [paths.getTodo, { id: 1 }]]);
  });

  test("with nothing shown, the body is the plain input", async () => {
    await stub.plain("x");
    expect(requests[0].live).toBe(null);
    expect(decode(requests[0].body)).toBe("x");
  });

  test("a refresh with an input updates that call only", async () => {
    const one = mount(() => resource(() => ({ id: 1 }), stub.getTodo));
    const two = mount(() => resource(() => ({ id: 2 }), stub.getTodo));
    await settle();
    requests.length = 0;
    await stub.renameTodo({ id: 1, title: "renamed" });
    expect([one.data.title, two.data.title]).toEqual(["renamed", "b"]);
    expect(requests.length).toBe(1);
  });

  test("a query under other middleware is refetched through its own endpoint", async () => {
    const admin = mount(() => resource(stub.adminList));
    await settle();
    requests.length = 0;
    await stub.touchAdmin();
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(["POST /todos/__fn/touch", "GET /admin/__fn/list"]);
    expect(admin.data).toEqual(["admin"]);
  });

  test("an off-screen cached call of the refreshed query is marked stale", async () => {
    const first = mount(() => resource(() => ({ done: true }), stub.listTodos, { staleTime: Infinity }));
    await settle();
    first.unmount();
    await stub.addTodo({ title: "c" });
    requests.length = 0;
    mount(() => resource(() => ({ done: true }), stub.listTodos, { staleTime: Infinity }));
    await settle();
    expect(requests.map((r) => r.path)).toEqual([paths.listTodos]);
  });

  test("a keyed resource whose fetcher made the refreshed call re-runs against the cache", async () => {
    const count = mount(() => resource(() => stub.listTodos({ done: false }).then((l) => l.length), { key: "open-count" }));
    await settle();
    requests.length = 0;
    await stub.addTodo({ title: "c" });
    await settle();
    expect(count.data).toBe(2);
    expect(requests.length).toBe(1);
  });
});

describe("setQueryData", () => {
  test("writes one call: resources showing it, and fetchers that made it, update with no request", async () => {
    const todo = mount(() => resource(() => ({ id: 1 }), stub.getTodo));
    const title = mount(() => resource(() => stub.getTodo({ id: 1 }).then((t) => t.title)));
    await settle();
    requests.length = 0;
    setQueryData(stub.getTodo, { id: 1 }, (current) => ({ ...current, title: "pushed" }));
    expect(todo.data.title).toBe("pushed");
    await settle();
    expect(title.data).toBe("pushed");
    expect(requests.length).toBe(0);
  });

  test("a remount shows written data at once", () => {
    setQueryData(stub.getTodo, { id: 7 }, { id: 7, title: "seeded" });
    const r = mount(() => resource(() => ({ id: 7 }), stub.getTodo, { staleTime: Infinity }));
    expect(r.data.title).toBe("seeded");
    expect(r.loading).toBe(false);
  });

  test("refuses what is not a server function", () => {
    expect(() => setQueryData(() => 1, undefined, 1)).toThrow("server function");
  });
});

describe("optimistic", () => {
  test("shows the update while the action runs, then the refreshed data", async () => {
    const open = mount(() => resource(() => ({ done: false }), stub.listTodos));
    const count = mount(() => resource(() => stub.listTodos({ done: false }).then((l) => l.length)));
    await settle();
    const pending = optimistic(stub.addTodo({ title: "c" }), stub.listTodos, (list) => [...list, { id: 0, title: "c…" }]);
    expect(titles(open)).toEqual(["a", "c…"]);
    await tick();
    expect(count.data).toBe(2);
    expect(await pending).toEqual({ id: 3 });
    expect(titles(open)).toEqual(["a", "c"]);
  });

  test("reverts when the action fails, and rejects with its error", async () => {
    const open = mount(() => resource(() => ({ done: false }), stub.listTodos));
    await settle();
    failNext = true;
    const pending = optimistic(stub.addTodo({ title: "c" }), stub.listTodos, (list) => [...list, { id: 0, title: "c…" }]);
    expect(titles(open)).toEqual(["a", "c…"]);
    await expect(pending).rejects.toThrow();
    expect(titles(open)).toEqual(["a"]);
  });

  test("with an input, only that call shows the update", async () => {
    const one = mount(() => resource(() => ({ id: 1 }), stub.getTodo));
    const two = mount(() => resource(() => ({ id: 2 }), stub.getTodo));
    await settle();
    const pending = optimistic(stub.renameTodo({ id: 1, title: "x" }), stub.getTodo, { id: 1 }, (t) => ({ ...t, title: "x…" }));
    expect([one.data.title, two.data.title]).toEqual(["x…", "b"]);
    await pending;
    expect(one.data.title).toBe("x");
  });

  test("an update must be a function", () => {
    expect(() => optimistic(Promise.resolve(), stub.listTodos, { done: false })).toThrow("must be a function");
  });
});

describe("query retries", () => {
  // A fetch that fails at the network level `failures` times before reaching the server.
  function flakyNetwork(failures) {
    const inner = globalThis.fetch;
    let left = failures;
    globalThis.fetch = (url, init) => {
      if (left-- > 0) return Promise.reject(new TypeError("Failed to fetch"));
      return inner(url, init);
    };
  }

  test("a query whose request never reached the server is retried", async () => {
    __setRetryDelays([1, 1]);
    flakyNetwork(2);
    expect(await stub.getTodo({ id: 1 })).toEqual({ id: 1, title: "a", done: false });
  });

  test("it gives up after the retries", async () => {
    __setRetryDelays([1, 1]);
    flakyNetwork(3);
    await expect(stub.getTodo({ id: 1 })).rejects.toThrow("Failed to fetch");
  });

  test("an action is never retried", async () => {
    __setRetryDelays([1, 1]);
    flakyNetwork(1);
    await expect(stub.plain()).rejects.toThrow("Failed to fetch");
    expect(requests.length).toBe(0);
  });

  test("an HTTP error is the server's answer: not retried", async () => {
    __setRetryDelays([1, 1]);
    globalThis.fetch = async () => { requests.push(1); return new Response("{}", { status: 500 }); };
    await expect(stub.getTodo({ id: 1 })).rejects.toThrow();
    expect(requests.length).toBe(1);
  });

  test("an abort during the wait stops the retries", async () => {
    __setRetryDelays([50]);
    flakyNetwork(5);
    const c = new AbortController();
    const call = stub.getTodo({ id: 1 }, { signal: c.signal });
    await tick();
    c.abort();
    await expect(call).rejects.toThrow();
  });
});

describe("timeout", () => {
  test("a run that takes longer fails with a TimeoutError", async () => {
    const r = mount(() => resource((_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))), { timeout: 10, errors: "inline" }));
    await new Promise((res) => setTimeout(res, 40));
    expect(r.error?.name).toBe("TimeoutError");
    expect(r.loading).toBe(false);
  });

  test("a faster run is unaffected", async () => {
    const r = mount(() => resource(() => Promise.resolve("quick"), { timeout: 1000 }));
    await settle();
    expect(r.data).toBe("quick");
  });
});

describe("revalidateOn", () => {
  const visible = () => document.dispatchEvent(new Event("visibilitychange"));

  test('"focus" refetches when the tab becomes visible again', async () => {
    let n = 0;
    const r = mount(() => resource(async () => ++n, { revalidateOn: "focus" }));
    await settle();
    visible();
    await settle();
    expect(r.data).toBe(2);
  });

  test('"online" refetches when the browser reconnects', async () => {
    let n = 0;
    const r = mount(() => resource(async () => ++n, { revalidateOn: ["online"] }));
    await settle();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(r.data).toBe(2);
  });

  test("data younger than staleTime is kept; unmounted resources stop listening", async () => {
    let n = 0;
    const fresh = mount(() => resource(async () => ++n, { revalidateOn: "focus", staleTime: 60_000 }));
    let m = 0;
    const gone = mount(() => resource(async () => ++m, { revalidateOn: "focus" }));
    await settle();
    gone.unmount();
    visible();
    await settle();
    expect([fresh.data, m]).toEqual([1, 1]);
  });

  test("without the option nothing refetches", async () => {
    let n = 0;
    const r = mount(() => resource(async () => ++n));
    await settle();
    visible();
    await settle();
    expect(r.data).toBe(1);
  });

  test("an unknown event is refused", () => {
    expect(() => mount(() => resource(async () => 1, { revalidateOn: "hover" }))).toThrow("revalidateOn");
  });
});
