// The browser side of server functions (docs/SERVER_FUNCTIONS.md). The build replaces a
// `*.server` module with stubs made here: `serverFunction("/todos/__fn/<id>", "query")`
// is an async function with the server function's signature that calls its endpoint.

import { CONTENT_TYPE, LIVE_HEADER, MAX_REFRESH, REFRESH_HEADER, decode, encode } from "../core/fn-codec.js";
import { liveCalls, trackServerCall } from "./invalidate.js";
import { applyRefresh } from "./mutate.js";
import { callKey, fetchShared } from "./query-cache.js";

// Queries go by GET while the encoded arguments fit comfortably in a URL.
const MAX_GET_ARGS = 2000;

// A query whose request never reached the server (`fetch` itself rejected: offline, a
// dropped connection) is retried after these delays. An HTTP error answer is the
// server's, and actions are never retried: their request may have been applied.
let retryDelays = [300, 1000];

/** Replace the query retry delays (tests only). */
export function __setRetryDelays(delays) {
  retryDelays = delays;
}

/** Wait `ms`, or reject as soon as `signal` aborts. */
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    function stop() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** `fetch`, retried on network failure for queries. */
async function request(url, init, retry) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const aborted = init.signal?.aborted || error?.name === "AbortError";
      if (!retry || aborted || attempt >= retryDelays.length) throw error;
      await wait(retryDelays[attempt], init.signal);
    }
  }
}

/** A failed server function call: `status`, and `issues` when the input was invalid. */
export class ServerFunctionError extends Error {
  constructor(message, { status, issues, redirected = false } = {}) {
    super(message);
    this.name = "ServerFunctionError";
    this.status = status;
    this.issues = issues;
    this.redirected = redirected;
  }
}

/**
 * A stub for the server function at `endpoint`. `kind` is `"query"` (GET, or POST for
 * large arguments) or `"action"` (POST). The stub takes the input and an optional
 * `{ signal }` to abort the call.
 *
 * Query calls go through the query cache: identical calls in flight share one request,
 * and a call made by a starting resource may answer from a fresh entry (`staleTime`).
 * Actions always make their own request.
 */
export function serverFunction(endpoint, kind) {
  function call(input, { signal } = {}) {
    if (kind !== "query") {
      trackServerCall(endpoint); // a resource starting this call depends on it (invalidate)
      return act(input, signal);
    }
    let key;
    try {
      key = callKey(endpoint, input);
    } catch (error) {
      return Promise.reject(error); // an input the codec refuses (a function, a symbol)
    }
    const staleTime = trackServerCall(endpoint, key) ?? 0;
    return fetchShared(key, (shared) => send(input, shared).then((r) => r.value), { signal, staleTime, call: [endpoint, input] });
  }
  // An action sends the calls the page shows, so its `refresh()` can answer them in the
  // response; the fresh data is in the cache before the call resolves.
  async function act(input, signal) {
    const live = liveCalls(MAX_REFRESH);
    const { value, refreshed } = live.length
      ? await send({ input, live }, signal, { [LIVE_HEADER]: "1" })
      : await send(input, signal);
    if (!refreshed) return value;
    await applyRefresh(value.refresh);
    return value.result;
  }
  async function send(input, signal, extra) {
    const args = encode(input);
    const init = { signal, credentials: "same-origin", redirect: "manual", headers: { accept: CONTENT_TYPE, ...extra } };
    const retry = kind === "query";
    const response = kind === "query" && args.length <= MAX_GET_ARGS
      ? await request(`${endpoint}?a=${encodeURIComponent(args)}`, init, retry)
      : await request(endpoint, { ...init, method: "POST", headers: { ...init.headers, "content-type": CONTENT_TYPE }, body: args }, retry);
    // A redirect (an auth guard sending to a login page, say) is not data: the caller decides.
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new ServerFunctionError("The server redirected the call", { status: response.status || 302, redirected: true });
    }
    if (response.ok) return { value: decode(await response.text()), refreshed: response.headers.get(REFRESH_HEADER) === "1" };
    let body = null;
    try {
      body = await response.json();
    } catch {
      // a response without the JSON error body (a proxy, a middleware Response)
    }
    throw new ServerFunctionError(body?.error?.message ?? `Server function failed (${response.status})`, {
      status: response.status, issues: body?.error?.issues,
    });
  }
  // `invalidate(listTodos)` finds the resources that called this endpoint.
  Object.defineProperty(call, "endpoint", { value: endpoint });
  return call;
}
