import { afterEach, describe, expect, test } from "runtime:test";

import { devFetch } from "./dev-fetch.js";

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

/** A fetch that refuses `failures` connections, then answers. */
function restarting(failures) {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls <= failures) throw new TypeError("Failed to fetch");
    return new Response("ok");
  };
  return () => calls;
}

describe("devFetch", () => {
  test("in development, a refused connection is retried until the server is back", async () => {
    const calls = restarting(3);
    const res = await devFetch("/x", {}, { dev: true });
    expect(await res.text()).toBe("ok");
    expect(calls()).toBe(4);
  });

  test("in production, a refused connection fails at once", async () => {
    const calls = restarting(1);
    await expect(devFetch("/x", {}, { dev: false })).rejects.toThrow("Failed to fetch");
    expect(calls()).toBe(1);
  });

  test("HTTP errors and aborts are not retried", async () => {
    let calls = 0;
    globalThis.fetch = async () => (calls++, new Response("no", { status: 500 }));
    expect((await devFetch("/x", {}, { dev: true })).status).toBe(500);
    expect(calls).toBe(1);

    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await expect(devFetch("/x", { signal: controller.signal }, { dev: true })).rejects.toThrow("Failed to fetch");
  });

  test("it gives up after a few seconds", async () => {
    const start = Date.now();
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await expect(devFetch("/x", {}, { dev: true })).rejects.toThrow("Failed to fetch");
    expect(Date.now() - start).toBeGreaterThan(2500);
  });
});
