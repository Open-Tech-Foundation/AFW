// invalidate(): resources record the server functions they call and refetch when one
// is invalidated; invalidate() refetches everything and the page's loader data.
import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import { scope } from "../core/signals.js";
import { invalidate } from "./invalidate.js";
import { resource } from "./resource.js";
import { mountApp, routes, router, setRouteData } from "./router.js";
import { serverFunction } from "./server-function.js";

const realFetch = globalThis.fetch;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
let calls, owned, n = 0;

// Each endpoint answers with how many times it has been called.
beforeEach(() => {
  calls = {};
  owned = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url, "http://x").pathname;
    calls[path] = (calls[path] ?? 0) + 1;
    if (path.endsWith("__data.json")) return Response.json({ version: calls[path] });
    return new Response(JSON.stringify({ v: { n: calls[path] } }), { headers: { "content-type": "application/json" } });
  };
});
afterEach(() => {
  for (const s of owned) s.dispose(); // resources of one test never reach the next
  globalThis.fetch = realFetch;
  document.body.innerHTML = "";
  setRouteData(undefined);
});

// Resources created inside a scope this test owns, as a component's would be.
const live = (make) => { const s = scope(make); owned.push(s); return s.result; };
// Fresh endpoints per test.
const fns = () => { n++; return [serverFunction(`/t/__fn/list${n}`, "query"), serverFunction(`/u/__fn/users${n}`, "query")]; };

describe("invalidate", () => {
  test("refetches the resources that called the server function, and only those", async () => {
    const [listTodos, listUsers] = fns();
    const todos = live(() => resource(() => listTodos()));
    const users = live(() => resource(() => listUsers()));
    await settle();
    expect([todos.data.n, users.data.n]).toEqual([1, 1]);
    await invalidate(listTodos);
    expect([todos.data.n, users.data.n]).toEqual([2, 1]);
    await invalidate(listTodos, listUsers);
    expect([todos.data.n, users.data.n]).toEqual([3, 2]);
  });

  test("a resource with a reactive source is tracked too", async () => {
    const [listTodos] = fns();
    const r = live(() => resource(() => "a", () => listTodos()));
    await settle();
    await invalidate(listTodos);
    expect(r.data.n).toBe(2);
  });

  test("invalidatedBy names a server function called after an await", async () => {
    const [listTodos, listUsers] = fns();
    const named = live(() => resource(async () => { await tick(); return listUsers(); }, { invalidatedBy: [listUsers] }));
    const unnamed = live(() => resource(async () => { await tick(); return listTodos(); }));
    await settle();
    await invalidate(listUsers);
    expect(named.data.n).toBe(2);
    await invalidate(listTodos);
    expect(unnamed.data.n).toBe(1, "a call after an await is not seen without invalidatedBy");
  });

  test("a disposed resource is no longer refetched", async () => {
    const [listTodos] = fns();
    const s = scope(() => resource(() => listTodos()));
    await settle();
    s.dispose();
    await invalidate(listTodos);
    expect(s.result.data.n).toBe(1);
  });

  test("invalidate() refetches every live resource and the current page's loader data", async () => {
    const [listTodos] = fns();
    const app = document.createElement("div");
    document.body.appendChild(app);
    routes.pages = {}; routes.layouts = {}; routes.loaderRoutes = new Set();
    window.history.replaceState({}, "", "/todos");
    mountApp({ pages: { "/p/app/todos/page.jsx": { default: () => document.createElement("div") } }, target: app, loaders: ["/todos"] });
    await settle();
    expect(router.data).toEqual({ version: 1 });
    const plain = live(() => resource(() => fetch("/plain").then((res) => res.json())));
    const todos = live(() => resource(() => listTodos()));
    await settle();
    await invalidate();
    expect(router.data).toEqual({ version: 2 });
    expect(todos.data.n).toBe(2);
    expect(plain.data.v.n).toBe(2);
  });

  test("rejects what is not a server function", async () => {
    await expect(invalidate(() => 1)).rejects.toThrow("server functions");
  });
});
