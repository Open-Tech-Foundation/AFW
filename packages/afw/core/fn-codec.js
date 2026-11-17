// The wire encoding of server function arguments and results, shared by the browser
// stub and the server registry: @opentf/serialize's `{ v, $refs }` envelope, which
// round-trips Date, Map, Set, BigInt, URL, RegExp, Error, typed arrays, undefined,
// NaN/±Infinity/-0, Temporal and shared or cyclic references, while plain data stays
// readable JSON. Functions, symbols and class instances are refused.

import { SerializeError, parse, stringify } from "@opentf/serialize";

export { SerializeError };

export const CONTENT_TYPE = "application/json";

/** The most query calls one action refreshes in its response; the rest go back stale. */
export const MAX_REFRESH = 20;

/** Action request header: the body is `{ input, live }`, `live` the calls the page shows. */
export const LIVE_HEADER = "x-afw-live";

/** Action response header: the body is `{ result, refresh }` (single-flight updates). */
export const REFRESH_HEADER = "x-afw-refresh";

/** Deepest nesting accepted from a request (`[[1]]` is depth 2). */
export const MAX_DEPTH = 64;

/** Encode a value for the wire. */
export function encode(value) {
  return stringify(value);
}

/**
 * Decode a wire value. An empty text is `undefined` (a call without arguments).
 * `maxLength` / `maxDepth` bound untrusted input; failures throw a `SerializeError`
 * with a `code` (`INPUT_TOO_LARGE`, `INVALID_JSON`, `INVALID_ENVELOPE`, …). A
 * `__proto__` key stays an own property, never a prototype.
 */
export function decode(text, { maxLength = Infinity, maxDepth = Infinity } = {}) {
  if (text === "") return undefined;
  return parse(text, { maxLength, maxDepth });
}
