import { afterEach, describe, expect, test } from "runtime:test";

import { signal, scope } from "../core/signals.js";
import { __setResourceServer, resource } from "./resource.js";

afterEach(() => __setResourceServer(null));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("resource()", () => {
  test("loading → data on resolve", async () => {
    const d = deferred();
    const r = resource(() => d.promise);
    expect(r.loading).toBe(true);
    expect(r.data).toBe(undefined);
    d.resolve(42);
    await tick();
    expect(r.loading).toBe(false);
    expect(r.data).toBe(42);
    expect(r.error).toBe(undefined);
  });

  test("options.initial seeds data before the first resolution", async () => {
    const d = deferred();
    const r = resource(() => d.promise, { initial: [] });
    expect(r.data).toEqual([]);
    d.resolve([1]);
    await tick();
    expect(r.data).toEqual([1]);
  });

  test("a reactive source re-runs the fetcher when it changes", async () => {
    const id = signal(1);
    const calls = [];
    const r = resource(
      () => id.value,
      (v) => {
        calls.push(v);
        return Promise.resolve(v * 10);
      },
    );
    await tick();
    expect(r.data).toBe(10);
    id.value = 2;
    await tick();
    expect(r.data).toBe(20);
    expect(calls).toEqual([1, 2]);
  });

  test("an out-of-order resolution is discarded (stale token)", async () => {
    const id = signal(1);
    const slow = deferred();
    const r = resource(
      () => id.value,
      (v) => (v === 1 ? slow.promise : Promise.resolve("fresh")),
    );
    id.value = 2; // supersedes the in-flight slow fetch
    await tick();
    expect(r.data).toBe("fresh");
    slow.resolve("stale");
    await tick();
    expect(r.data).toBe("fresh"); // the late resolution must not win
    expect(r.loading).toBe(false);
  });

  test("the previous run's abort signal fires on re-run", async () => {
    const id = signal(1);
    const signals = [];
    resource(
      () => id.value,
      (v, { signal: s }) => {
        signals.push(s);
        return new Promise(() => {}); // never resolves
      },
    );
    id.value = 2;
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  test("scope dispose aborts the in-flight fetch", () => {
    const signals = [];
    const { dispose } = scope(() =>
      resource((_v, { signal: s }) => {
        signals.push(s);
        return new Promise(() => {});
      }),
    );
    expect(signals[0].aborted).toBe(false);
    dispose();
    expect(signals[0].aborted).toBe(true);
  });

  test("a rejection sets error and keeps the last good data", async () => {
    let fail = false;
    const r = resource(() => (fail ? Promise.reject(new Error("down")) : Promise.resolve("ok")));
    await tick();
    expect(r.data).toBe("ok");
    fail = true;
    await expect(r.refetch()).rejects.toThrow("down"); // refetch() reports the failure
    expect(r.error?.message).toBe("down");
    expect(r.data).toBe("ok"); // stale-while-error
    expect(r.loading).toBe(false);
  });

  test("a later success clears the error", async () => {
    let fail = true;
    const r = resource(() => (fail ? Promise.reject(new Error("down")) : Promise.resolve("ok")));
    await tick();
    expect(r.error?.message).toBe("down");
    fail = false;
    await r.refetch();
    expect(r.error).toBe(undefined);
    expect(r.data).toBe("ok");
  });

  test("a null/false source pauses the fetch until it yields a value", async () => {
    const id = signal(null);
    const calls = [];
    const r = resource(
      () => id.value,
      (v) => {
        calls.push(v);
        return Promise.resolve(v);
      },
    );
    expect(calls).toEqual([]);
    expect(r.loading).toBe(false); // settled, not fetching
    expect(r.refetch()).toBe(undefined); // refetch is a no-op while paused
    id.value = "u1";
    await tick();
    expect(calls).toEqual(["u1"]);
    expect(r.data).toBe("u1");
  });

  test("refetch re-runs with the current source value and returns a promise", async () => {
    let n = 0;
    const r = resource(() => Promise.resolve(++n));
    await tick();
    expect(r.data).toBe(1);
    await r.refetch();
    expect(r.data).toBe(2);
  });

  test("server mode: no fetch, loading stays true (SSG renders the loading branch)", async () => {
    __setResourceServer(true);
    const calls = [];
    const r = resource(() => {
      calls.push(1);
      return Promise.resolve("x");
    });
    await tick();
    expect(calls).toEqual([]);
    expect(r.loading).toBe(true);
    expect(r.data).toBe(undefined);
  });
  test("server mode: a source that starts paused settles as not loading (matches the client)", () => {
    __setResourceServer(true);
    const r = resource(() => null, () => Promise.resolve("x"));
    expect(r.loading).toBe(false);
    __setResourceServer(false);
    const client = resource(() => null, () => Promise.resolve("x"));
    expect(client.loading).toBe(r.loading);
  });

  test("server mode: a source that throws there still renders the loading branch", () => {
    __setResourceServer(true);
    const r = resource(() => { throw new Error("no window"); }, () => Promise.resolve("x"));
    expect(r.loading).toBe(true);
  });

  test("refetch() resolves with the new data", async () => {
    let n = 0;
    const r = resource(() => Promise.resolve(++n));
    await tick();
    expect(await r.refetch()).toBe(2);
  });

  test("a refetch superseded by a newer run resolves undefined and does not reject", async () => {
    const id = signal(1);
    const slow = deferred();
    const r = resource(() => id.value, (v) => (v === 1 ? slow.promise : Promise.resolve("two")));
    const first = r.refetch();
    id.value = 2;
    slow.reject(new Error("too late"));
    expect(await first).toBe(undefined);
    await tick();
    expect(r.data).toBe("two");
    expect(r.error).toBe(undefined);
  });

  test("pausing during a fetch drops its late result", async () => {
    const id = signal(1);
    const slow = deferred();
    const r = resource(() => id.value, () => slow.promise);
    expect(r.loading).toBe(true);
    id.value = null;
    expect(r.loading).toBe(false);
    slow.resolve("late");
    await tick();
    expect(r.data).toBe(undefined);
    expect(r.loading).toBe(false);
  });

  test("disposing during a fetch drops its late result", async () => {
    const slow = deferred();
    const s = scope(() => resource(() => slow.promise));
    s.dispose();
    slow.resolve("late");
    await tick();
    expect(s.result.data).toBe(undefined);
  });

  test("a fetcher that throws synchronously sets error", async () => {
    const r = resource(() => { throw new Error("sync"); });
    await tick();
    expect(r.error?.message).toBe("sync");
    expect(r.loading).toBe(false);
  });
  test("an ignored failing refetch() is not an unhandled rejection", async () => {
    const unhandled = [];
    const onUnhandled = (e) => {
      unhandled.push(e);
      e.preventDefault?.();
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    try {
      let fail = false;
      const r = resource(() => (fail ? Promise.reject(new Error("down")) : Promise.resolve("ok")));
      await tick();
      fail = true;
      r.refetch(); // fire and forget, as a click handler does
      await tick();
      await tick();
      expect(r.error?.message).toBe("down");
      expect(unhandled).toHaveLength(0);
    } finally {
      window.removeEventListener("unhandledrejection", onUnhandled);
    }
  });
});
