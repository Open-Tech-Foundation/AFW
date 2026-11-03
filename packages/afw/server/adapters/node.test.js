import { describe, expect, test } from "runtime:test";

import { createFetchHandler } from "../api.js";
import { sendWebResponse, toNodeListener, toWebRequest } from "./node.js";

// The adapter is Node-specific (`req.on`, `Buffer`), but its contract is
// stream-agnostic — so the fakes stay web-standard and a two-function `Buffer`
// shim covers what the adapter touches (`concat`/`from`). That keeps this suite
// on the shared esdev runner instead of a Node-only harness.
globalThis.Buffer ??= {
  concat(parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  },
  from(data) {
    if (typeof data === "string") return new TextEncoder().encode(data);
    return new Uint8Array(data);
  },
};

// A minimal IncomingMessage: method/url/headers plus an `on()` emitter that
// delivers `body` as bytes, then ends — the only stream surface the adapter reads.
function fakeReq({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
  const listeners = {};
  const stream = {
    method,
    url,
    headers: { host: "localhost", ...headers },
    on(ev, fn) {
      (listeners[ev] ??= []).push(fn);
      return stream;
    },
  };
  queueMicrotask(() => {
    if (body) {
      const bytes = new TextEncoder().encode(body);
      for (const fn of listeners.data ?? []) fn(bytes);
    }
    for (const fn of listeners.end ?? []) fn();
  });
  return stream;
}

// A minimal ServerResponse capturing status/headers/body, with the write/drain/close
// surface the adapter streams through. `writable: false` makes `write()` report a
// full buffer until `drain()` is called.
function fakeRes({ writable = true } = {}) {
  const listeners = {};
  const res = {
    statusCode: 0,
    headers: null,
    headersSent: false,
    body: "",
    chunks: [],
    ended: false,
    destroyed: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
    },
    write(chunk) {
      const text = new TextDecoder().decode(chunk);
      this.chunks.push(text);
      this.body += text;
      return writable;
    },
    end(chunk) {
      if (chunk) this.body += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      this.ended = true;
    },
    destroy(error) {
      this.destroyed = error;
    },
    on(ev, fn) {
      (listeners[ev] ??= []).push(fn);
      return res;
    },
    once(ev, fn) {
      const wrapped = (...args) => {
        res.off(ev, wrapped);
        fn(...args);
      };
      return res.on(ev, wrapped);
    },
    off(ev, fn) {
      listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn);
      return res;
    },
    emit(ev) {
      for (const fn of [...(listeners[ev] ?? [])]) fn();
    },
    listenerCount(ev) {
      return (listeners[ev] ?? []).length;
    },
  };
  return res;
}

// A response body the test feeds by hand, to observe what is written before it ends.
function manualStream() {
  let controller;
  const stream = new ReadableStream({ start: (c) => (controller = c) });
  const encode = (t) => new TextEncoder().encode(t);
  return {
    stream,
    push: (text) => controller.enqueue(encode(text)),
    close: () => controller.close(),
    error: (e) => controller.error(e),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("toWebRequest", () => {
  test("builds a Fetch Request with method, url, and headers", async () => {
    const req = await toWebRequest(fakeReq({ method: "GET", url: "/api/x?q=1", headers: { "x-test": "1" } }));
    expect(req.method).toBe("GET");
    expect(new URL(req.url).pathname).toBe("/api/x");
    expect(req.headers.get("x-test")).toBe("1");
  });

  test("reads the request body for non-GET methods", async () => {
    const req = await toWebRequest(fakeReq({ method: "POST", url: "/api/x", body: '{"a":1}' }));
    expect(await req.json()).toEqual({ a: 1 });
  });
});

describe("sendWebResponse", () => {
  test("writes status, headers, and body to the Node response", async () => {
    const res = fakeRes();
    await sendWebResponse(res, Response.json({ ok: true }, { status: 201 }));
    expect(res.statusCode).toBe(201);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  test("multiple Set-Cookie headers stay separate (array header value)", async () => {
    const res = fakeRes();
    const webRes = new Response(null, { status: 200 });
    webRes.headers.append("set-cookie", "session=abc; Path=/; HttpOnly");
    webRes.headers.append("set-cookie", "csrf=xyz; Path=/");
    await sendWebResponse(res, webRes);
    expect(res.headers["set-cookie"]).toEqual(["session=abc; Path=/; HttpOnly", "csrf=xyz; Path=/"]);
  });
});

describe("sendWebResponse — streaming", () => {
  test("chunks are written as they are produced, before the body ends", async () => {
    const res = fakeRes();
    const body = manualStream();
    const done = sendWebResponse(res, new Response(body.stream, { headers: { "content-type": "text/event-stream" } }));
    body.push("data: 1\n\n");
    await flush();
    expect(res.chunks).toEqual(["data: 1\n\n"]);
    expect(res.ended).toBe(false);
    body.push("data: 2\n\n");
    body.close();
    await done;
    expect(res.chunks).toEqual(["data: 1\n\n", "data: 2\n\n"]);
    expect(res.ended).toBe(true);
    expect(res.listenerCount("close")).toBe(0);
  });

  test("waits for drain when the socket buffer is full", async () => {
    const res = fakeRes({ writable: false });
    const body = manualStream();
    const done = sendWebResponse(res, new Response(body.stream));
    body.push("a");
    body.push("b");
    await flush();
    expect(res.chunks).toEqual(["a"]); // holding "b" until the buffer drains
    res.emit("drain");
    await flush();
    expect(res.chunks).toEqual(["a", "b"]);
    res.emit("drain");
    body.close();
    await done;
    expect(res.ended).toBe(true);
  });

  test("a client disconnect cancels the body", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      // Enqueue only while the stream is live: after the disconnect cancels it, a
      // pending timer must not enqueue (that throws, outside the test's reach).
      pull: (c) => new Promise((r) => setTimeout(() => { if (!cancelled) c.enqueue(new TextEncoder().encode("tick")); r(); }, 1)),
      cancel: () => { cancelled = true; },
    });
    const res = fakeRes();
    const done = sendWebResponse(res, new Response(stream));
    await new Promise((r) => setTimeout(r, 10));
    res.emit("close");
    await done;
    expect(cancelled).toBe(true);
    expect(res.ended).toBe(false);
  });
});

describe("toNodeListener", () => {
  test("routes a matched request through the handler", async () => {
    const listener = toNodeListener(async () => Response.json({ hit: true }));
    const res = fakeRes();
    await listener(fakeReq({ url: "/api/thing" }), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ hit: true });
  });

  test("a null result becomes a 404 (or the fallback)", async () => {
    const res404 = fakeRes();
    await toNodeListener(async () => null)(fakeReq(), res404);
    expect(res404.statusCode).toBe(404);

    const resFb = fakeRes();
    await toNodeListener(async () => null, { fallback: () => new Response("shell", { status: 200 }) })(fakeReq(), resFb);
    expect(resFb.statusCode).toBe(200);
    expect(resFb.body).toBe("shell");
  });

  test("a body that fails mid-stream aborts the connection instead of appending JSON", async () => {
    const body = manualStream();
    const res = fakeRes();
    const done = toNodeListener(async () => new Response(body.stream))(fakeReq(), res);
    body.push("partial");
    await flush();
    body.error(new Error("upstream died"));
    await done;
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("partial");
    expect(res.destroyed?.message).toBe("upstream died");
  });

  test("a handler that throws before responding still gets a 500", async () => {
    const res = fakeRes();
    await toNodeListener(async () => { throw new Error("boom"); })(fakeReq(), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal Server Error" });
  });
});

describe("createFetchHandler", () => {
  test("turns a null-returning handler into a total Fetch handler", async () => {
    const fetch404 = createFetchHandler(async () => null);
    expect((await fetch404(new Request("http://x/api/none"))).status).toBe(404);

    const fetchHit = createFetchHandler(async () => Response.json("ok"));
    expect(await (await fetchHit(new Request("http://x/api/x"))).json()).toBe("ok");
  });
});
