// Public entry for the AFW runtime: reactivity + DOM operations.
// CSR-generated modules import their helpers (signal/computed/bindText/…) from here.
export * from "./core/signals.js";
export * from "./core/reactive.js";
export * from "./core/errors.js";
export * from "./runtime/index.js";
// `Link` is shipped as JSX source and compiled by the consuming app's pipeline
// (the `.jsx` lands in the module graph and afwc transforms it). Its compiled
// module self-registers `afw-link` (CSR `customElements.define` / SSG `defineSSG`).
// The bare import forces that registration to be retained — call sites address `<Link>`
// by its literal `afw-link` tag (a framework built-in), not `Link.tag`, so the binding
// alone would be tree-shaken. (Other compiled components register on first `.tag` read
// and need no bare import.)
import "./components/Link.jsx";
export { default as Link } from "./components/Link.jsx";
