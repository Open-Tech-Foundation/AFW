// The browser side of server functions (docs/SERVER_FUNCTIONS.md). The build replaces a
// `*.server` module with stubs made here: `serverFunction("/todos/__fn/<id>", "query")`
// is an async function with the server function's signature that calls its endpoint.

import { CONTENT_TYPE, decode, encode } from "../core/fn-codec.js";
import { devFetch } from "./dev-fetch.js";
import { trackServerCall } from "./invalidate.js";

// Queries go by GET while the encoded arguments fit comfortably in a URL.
const MAX_GET_ARGS = 2000;

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
 */
export function serverFunction(endpoint, kind) {
  async function call(input, { signal } = {}) {
    trackServerCall(endpoint); // a resource starting this call depends on it (invalidate)
    const args = encode(input);
    const init = { signal, credentials: "same-origin", redirect: "manual", headers: { accept: CONTENT_TYPE } };
    const response = kind === "query" && args.length <= MAX_GET_ARGS
      ? await devFetch(`${endpoint}?a=${encodeURIComponent(args)}`, init)
      : await devFetch(endpoint, { ...init, method: "POST", headers: { ...init.headers, "content-type": CONTENT_TYPE }, body: args });
    // A redirect (an auth guard sending to a login page, say) is not data: the caller decides.
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new ServerFunctionError("The server redirected the call", { status: response.status || 302, redirected: true });
    }
    if (response.ok) return decode(await response.text());
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
