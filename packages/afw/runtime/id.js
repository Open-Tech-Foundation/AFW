//! `$id()` on the client — stable per-instance ids for ARIA links (`aria-labelledby`,
//! `aria-controls`, `for`) and anchor names (SPEC §3.6).
//
// The compiler lowers the n-th `const x = $id()` of a component body to
// `componentId(n)`, which returns `afw-<base>-<n>`. The base belongs to the component
// host, so every id of one instance shares it:
//
// - A server-rendered host carries its base in `data-afw-uid` (stamped by
//   `ssgComponent`). Reading it back makes the adopted ids match the server HTML
//   exactly, whatever order the client upgrades components in.
// - A host built on the client (CSR, or an SPA navigation) takes a fresh `c<n>` base.
//   Server bases start with `s`/`m`, so the two can never collide.
//
// The base is cached per host, so a body that runs again on the same element (a
// mismatch rebuild, a hot refresh) keeps the ids it handed out the first time.

import { getCurrentInstance } from "../core/context.js";

const bases = new WeakMap();
let next = 0;

/** The host's id base: its server-rendered `data-afw-uid`, else a fresh client one. */
function baseOf(host) {
  let base = bases.get(host);
  if (base === undefined) {
    base = host.getAttribute?.("data-afw-uid") || `c${next++}`;
    bases.set(host, base);
  }
  return base;
}

/**
 * The `n`-th `$id()` of the component whose body is running. Compiler-emitted; write
 * `const id = $id()` in a component instead of calling this.
 */
export function componentId(n) {
  const host = getCurrentInstance();
  return `afw-${host ? baseOf(host) : `c${next++}`}-${n}`;
}
