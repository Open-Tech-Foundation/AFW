import { afterEach, describe, expect, test } from "runtime:test";
import { z } from "zod";

import { ServerFunctionError, serverFunction } from "./server-function.js";
import { action, createServerFunctions, query } from "../server/index.js";

// Route the stub's fetch to the real server handler, as a same-origin browser would.
const ORIGIN = "http://app.test";
const realFetch = globalThis.fetch;
const calls = [];
function serve(endpoints, locals = {}) {
  const fns = createServerFunctions(endpoints);
  globalThis.fetch = async (url, init = {}) => {
    const request = new Request(new URL(url, ORIGIN), { ...init, headers: { origin: ORIGIN, ...init.headers } });
    calls.push({ method: request.method, url: request.url });
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return (await fns.handle(request, { locals })) ?? new Response("not found", { status: 404 });
  };
}
afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
});

describe("serverFunction", () => {
  test("a query round-trips by GET; large arguments go by POST", async () => {
    serve({ "/t/__fn/q": query(async ({ n }, { locals }) => ({ n, user: locals.user })) }, { user: "ada" });
    const listTodos = serverFunction("/t/__fn/q", "query");
    expect(await listTodos({ n: 1 })).toEqual({ n: 1, user: "ada" });
    expect(calls[0].method).toBe("GET");
    expect(await listTodos({ n: 2, pad: "x".repeat(3000) })).toEqual({ n: 2, user: "ada" });
    expect(calls[1].method).toBe("POST");
  });

  test("Date, Map, BigInt and undefined survive the round trip", async () => {
    serve({ "/t/__fn/a": action(async ({ at, n }) => ({ at, n: n + 1n, seen: new Map([["k", undefined]]) })) });
    const out = await serverFunction("/t/__fn/a", "action")({ at: new Date(5), n: 1n });
    expect([out.at instanceof Date, out.at.getTime(), out.n, out.seen.has("k")]).toEqual([true, 5, 2n, true]);
  });

  test("an action posts its input", async () => {
    serve({ "/t/__fn/a": action(async (input) => ({ saved: input.title })) });
    expect(await serverFunction("/t/__fn/a", "action")({ title: "x" })).toEqual({ saved: "x" });
    expect(calls[0].method).toBe("POST");
  });

  test("invalid input rejects with status 400 and the schema's issues", async () => {
    serve({ "/t/__fn/a": action(z.object({ title: z.string().min(1) }), async () => 1) });
    const error = await serverFunction("/t/__fn/a", "action")({ title: "" }).catch((e) => e);
    expect(error instanceof ServerFunctionError).toBe(true);
    expect(error.status).toBe(400);
    expect(error.issues[0].path).toEqual(["title"]);
  });

  test("refusals and failures reject with their status; a redirect is reported, not followed", async () => {
    serve({
      "/t/__fn/denied": query(async () => { throw new Response(null, { status: 403 }); }),
      "/t/__fn/login": query(async () => { throw new Response(null, { status: 302, headers: { location: "/login" } }); }),
      "/t/__fn/boom": action(async () => { throw new Error("secret detail"); }),
    });
    expect((await serverFunction("/t/__fn/denied", "query")().catch((e) => e)).status).toBe(403);
    const redirect = await serverFunction("/t/__fn/login", "query")().catch((e) => e);
    expect([redirect.status, redirect.redirected]).toEqual([302, true]);
    const boom = await serverFunction("/t/__fn/boom", "action")().catch((e) => e);
    expect([boom.status, boom.message]).toEqual([500, "Internal Server Error"]);
  });

  test("an aborted call rejects", async () => {
    serve({ "/t/__fn/q": query(async () => 1) });
    const controller = new AbortController();
    controller.abort();
    await expect(serverFunction("/t/__fn/q", "query")(null, { signal: controller.signal })).rejects.toThrow("aborted");
  });
});
