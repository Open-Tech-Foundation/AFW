// The wire encoding of server function arguments and results, shared by the browser
// stub and the server registry. One module, so the encoding changes in one place.
//
// Placeholder: plain JSON. The planned codec is a type-preserving JSON format (Date,
// Map, Set, BigInt, …) from a dedicated package; it replaces `encode` / `decode` here
// once that package's decoder is safe for untrusted input.

export const CONTENT_TYPE = "application/json";

/** Encode a value for the wire. `undefined` becomes absent (JSON `null` at the top). */
export function encode(value) {
  return JSON.stringify(value === undefined ? null : value);
}

/** Decode a wire value. Throws on malformed input. `JSON.parse` keeps `__proto__` as an
 *  own key, so a decoded object can never carry a forged prototype. */
export function decode(text) {
  if (typeof text !== "string" || text === "") return undefined;
  return JSON.parse(text);
}
