// The query cache: dedupe, freshness, shared updates, per-input invalidation and
// garbage collection, through the server function stub and `resource()`.
import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import { decode, encode } from "../core/fn-codec.js";
import { scope } from "../core/signals.js";
import { invalidate } from "./invalidate.js";
import { __queryCacheSize, __resetQueryCache, callKey } from "./query-cache.js";
import { resource } from "./resource.js";
import { serverFunction } from "./server-function.js";

const realFetch = globalThis.fetch;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
let requests, owned, gate, n = 0;

// Each request answers `{ n, input }`: how many requests its URL has had, and the input.
beforeEach(() => {
  requests = [];
  owned = [];
  gate = null;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url, "http://x");
    requests.push({ url: u.pathname + u.search, signal: init.signal, method: init.method ?? "GET" });
    if (gate) await gate.promise;
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const n = requests.filter((r) => r.url === u.pathname + u.search).length;
    const input = decode(u.searchParams.get("a") ?? init.body ?? "");
    return new Response(encode({ n, input }), { headers: { "content-type": "application/json" } });
  };
});
afterEach(() => {
  for (const s of owned) s.dispose();
  globalThis.fetch = realFetch;
  __resetQueryCache();
});

/** A request the test releases by hand. */
function hold() {
  let release;
  gate = { promise: new Promise((r) => (release = r)) };
  return () => { gate = null; release(); };
}

// A resource in a scope this test owns, as a component's would be; `unmount()` disposes it.
function mount(make) {
  const s = scope(make);
  owned.push(s);
  return Object.assign(s.result, { unmount: () => s.dispose() });
}
const query = (name = "q") => serverFunction(`/c/__fn/${name}${++n}`, "query");

describe("dedupe", () => {
  test("resources showing the same call share one request", async () => {
    const getTodo = query();
    const a = mount(() => resource(() => ({ id: 1 }), getTodo));
    const b = mount(() => resource(() => getTodo({ id: 1 })));
    await settle();
    expect(requests.length).toBe(1);
    expect(a.data).toEqual({ n: 1, input: { id: 1 } });
    expect(b.data).toEqual(a.data);
  });

  test("different inputs are different entries", async () => {
    const getTodo = query();
    mount(() => resource(() => ({ id: 1 }), getTodo));
    mount(() => resource(() => ({ id: 2 }), getTodo));
    await settle();
    expect(requests.length).toBe(2);
  });

  test("object key order does not matter", () => {
    expect(callKey("/e", { a: 1, b: { c: 2, d: 3 } })).toBe(callKey("/e", { b: { d: 3, c: 2 }, a: 1 }));
    expect(callKey("/e", { a: 1 })).not.toBe(callKey("/e", { a: 2 }));
  });

  test("direct calls in flight share a request; later calls make a new one", async () => {
    const listTodos = query();
    const [x, y] = await Promise.all([listTodos({ p: 1 }), listTodos({ p: 1 })]);
    expect(requests.length).toBe(1);
    expect(x).toBe(y);
    await listTodos({ p: 1 });
    expect(requests.length).toBe(2, "staleTime 0 outside a resource: always revalidates");
  });

  test("actions are never shared", async () => {
    const addTodo = serverFunction(`/c/__fn/add${++n}`, "action");
    await Promise.all([addTodo({ t: "a" }), addTodo({ t: "a" })]);
    expect(requests.length).toBe(2);
  });
});

describe("abort", () => {
  test("the shared request continues while any caller still wants it", async () => {
    const listTodos = query();
    const release = hold();
    const one = new AbortController();
    const first = listTodos(undefined, { signal: one.signal });
    const second = listTodos();
    one.abort();
    await expect(first).rejects.toThrow();
    release();
    expect((await second).n).toBe(1);
    expect(requests[0].signal.aborted).toBe(false);
  });

  test("unmounting the only resource during its request aborts it", async () => {
    const getTodo = query();
    hold();
    mount(() => resource(() => ({ id: 1 }), getTodo)).unmount();
    expect(requests[0].signal.aborted).toBe(true);
  });

  test("the shared request aborts once every caller has aborted, and a new call starts fresh", async () => {
    const listTodos = query();
    const release = hold();
    const one = new AbortController();
    const two = new AbortController();
    const calls = [listTodos(undefined, { signal: one.signal }), listTodos(undefined, { signal: two.signal })];
    one.abort();
    two.abort();
    expect(requests[0].signal.aborted).toBe(true);
    release();
    for (const call of calls) await expect(call).rejects.toThrow();
    await listTodos();
    expect(requests.length).toBe(2);
  });

  test("an unmounted resource does not abort the request another one shows", async () => {
    const getTodo = query();
    const release = hold();
    const a = mount(() => resource(() => ({ id: 1 }), getTodo));
    const b = mount(() => resource(() => ({ id: 1 }), getTodo));
    a.unmount();
    release();
    await settle();
    expect(b.data.n).toBe(1);
    expect(requests.length).toBe(1);
  });
});

describe("cached data", () => {
  test("a remount shows the cached data at once and revalidates it", async () => {
    const getTodo = query();
    const first = mount(() => resource(() => ({ id: 1 }), getTodo));
    await settle();
    first.unmount();
    const again = mount(() => resource(() => ({ id: 1 }), getTodo));
    expect(again.data).toEqual({ n: 1, input: { id: 1 } });
    expect(again.loading).toBe(true, "staleTime 0: shown, then revalidated");
    await settle();
    expect(again.data.n).toBe(2);
    expect(again.loading).toBe(false);
  });

  test("within staleTime a remount makes no request", async () => {
    const getTodo = query();
    const first = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: 60_000 }));
    await settle();
    first.unmount();
    const again = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: 60_000 }));
    expect(again.loading).toBe(false);
    expect(again.data.n).toBe(1);
    await settle();
    expect(requests.length).toBe(1);
  });

  test("staleTime applies to a fetcher that calls the server function", async () => {
    const listTodos = query();
    mount(() => resource(() => listTodos(), { staleTime: 60_000 }));
    await settle();
    const again = mount(() => resource(() => listTodos(), { staleTime: 60_000 }));
    await settle();
    expect(again.data.n).toBe(1);
    expect(requests.length).toBe(1);
  });

  test("refetch() ignores staleTime", async () => {
    const getTodo = query();
    const r = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: Infinity }));
    await settle();
    expect((await r.refetch()).n).toBe(2);
  });

  test("a refetch updates every resource showing the same call", async () => {
    const getTodo = query();
    const a = mount(() => resource(() => ({ id: 1 }), getTodo));
    const b = mount(() => resource(() => ({ id: 1 }), getTodo));
    await settle();
    await a.refetch();
    expect(b.data.n).toBe(2);
  });

  test("resource(listTodos) calls a server function without input", async () => {
    const listTodos = query();
    const r = mount(() => resource(listTodos));
    await settle();
    expect(r.data).toEqual({ n: 1, input: undefined });
    expect(requests[0].url).toContain("?a=");
  });

  test("an input the codec refuses is the resource's error", async () => {
    const getTodo = query();
    const r = mount(() => resource(() => ({ fn: () => 1 }), getTodo, { errors: "inline" }));
    await settle();
    expect(r.error).toBeInstanceOf(Error);
    expect(requests.length).toBe(0);
  });
});

describe("key option", () => {
  test("caches a plain fetcher: shared, and shown at once on remount", async () => {
    let calls = 0;
    const fetchUser = (id) => Promise.resolve({ id, calls: ++calls });
    const a = mount(() => resource(() => 7, fetchUser, { key: (id) => ["user", id] }));
    const b = mount(() => resource(() => 7, fetchUser, { key: (id) => ["user", id] }));
    await settle();
    expect(calls).toBe(1);
    expect(b.data).toBe(a.data);
    a.unmount();
    b.unmount();
    const again = mount(() => resource(() => 7, fetchUser, { key: (id) => ["user", id], staleTime: Infinity }));
    expect(again.data).toEqual({ id: 7, calls: 1 });
    expect(again.loading).toBe(false);
  });

  test("a keyed fetcher that calls a server function is invalidated by it", async () => {
    const listTodos = query();
    const options = { key: "todos", staleTime: Infinity };
    const r = mount(() => resource(() => listTodos().then((t) => t.n), options));
    await settle();
    expect(r.data).toBe(1);
    await invalidate(listTodos);
    expect(r.data).toBe(2);
    r.unmount();
    // Off screen and cached for good (staleTime Infinity): invalidate marks it stale.
    await invalidate(listTodos);
    const again = mount(() => resource(() => listTodos().then((t) => t.n), options));
    expect(again.data).toBe(2);
    await settle();
    expect(again.data).toBe(3);
  });
});

describe("invalidate", () => {
  test("a server function and its input refetch only that call", async () => {
    const getTodo = query();
    const one = mount(() => resource(() => ({ id: 1 }), getTodo));
    const two = mount(() => resource(() => getTodo({ id: 2 })));
    await settle();
    await invalidate(getTodo, { id: 1 });
    expect([one.data.n, two.data.n]).toEqual([2, 1]);
    await invalidate(getTodo);
    expect([one.data.n, two.data.n]).toEqual([3, 2]);
  });

  test("inputs and server functions mix", async () => {
    const getTodo = query();
    const listUsers = query("u");
    const one = mount(() => resource(() => ({ id: 1 }), getTodo));
    const users = mount(() => resource(listUsers));
    await settle();
    await invalidate(getTodo, { id: 1 }, listUsers);
    expect([one.data.n, users.data.n]).toEqual([2, 2]);
  });

  test("an off-screen entry is marked stale and refetched on its next mount", async () => {
    const getTodo = query();
    const first = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: Infinity }));
    await settle();
    first.unmount();
    await invalidate(getTodo, { id: 1 });
    const again = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: Infinity }));
    expect(again.data.n).toBe(1, "the old data shows while it reloads");
    await settle();
    expect(again.data.n).toBe(2);
  });

  test("invalidate() marks every entry stale", async () => {
    const getTodo = query();
    const first = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: Infinity }));
    await settle();
    first.unmount();
    await invalidate();
    const again = mount(() => resource(() => ({ id: 1 }), getTodo, { staleTime: Infinity }));
    await settle();
    expect(again.data.n).toBe(2);
  });

  test("an invalidation during a request does not reuse it", async () => {
    const getTodo = query();
    const release = hold();
    const r = mount(() => resource(() => ({ id: 1 }), getTodo));
    const pending = invalidate(getTodo, { id: 1 });
    release();
    await pending;
    await settle();
    expect(requests.length).toBe(2);
    expect(r.data.n).toBe(2);
  });

  test("invalidatedBy resources refetch for any input of the named function", async () => {
    const getTodo = query();
    let calls = 0;
    const r = mount(() => resource(async () => ++calls, { invalidatedBy: [getTodo] }));
    await settle();
    await invalidate(getTodo, { id: 9 });
    expect(r.data).toBe(2);
  });

  test("a failed refetch does not reject invalidate()", async () => {
    const getTodo = query();
    const r = mount(() => resource(() => ({ id: 1 }), getTodo, { errors: "inline" }));
    await settle();
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    await invalidate(getTodo);
    expect(r.error?.status).toBe(500);
    expect(r.data.n).toBe(1);
  });

  test("a value without a server function before it is refused", async () => {
    await expect(invalidate({ id: 1 })).rejects.toThrow("server functions");
  });
});

describe("garbage collection", () => {
  test("an unused entry is dropped after gcTime; a used one stays", async () => {
    const getTodo = query();
    const kept = mount(() => resource(() => ({ id: 1 }), getTodo, { gcTime: 0 }));
    const gone = mount(() => resource(() => ({ id: 2 }), getTodo, { gcTime: 0 }));
    await settle();
    gone.unmount();
    expect(__queryCacheSize()).toBe(1);
    kept.unmount();
    expect(__queryCacheSize()).toBe(0);
  });

  test("the default gcTime keeps an unused entry", async () => {
    const getTodo = query();
    const r = mount(() => resource(() => ({ id: 1 }), getTodo));
    await settle();
    r.unmount();
    expect(__queryCacheSize()).toBe(1);
  });
});
