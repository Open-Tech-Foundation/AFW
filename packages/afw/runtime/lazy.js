// Lazy components: `const Chart = () => import("./Chart.jsx")` at module level, used
// as `<Chart …/>`. The compiler rewrites the declaration to
// `lazyComponent(<the same loader>, "<stable tag>")`, so the bundler still splits
// `Chart.jsx` into its own chunk and `<Chart>` compiles like any component (by `.tag`).
//
// The tag is a placeholder element. It keeps the props and children it is given, loads
// the chunk when it first connects (one download for every instance), then creates the
// real component, hands it the props and children, and forwards later prop updates and
// the component's `$expose`d methods. While it loads it counts as loading for the
// nearest <Pending>; a failed download goes where other errors go. It renders only in
// the browser: the server sends the empty placeholder (server/builtins.js).

import { signal } from "../core/signals.js";
import { setProp } from "./dom.js";
import { handleError } from "./error-boundary.js";
import { hydrationProps } from "./hydrate.js";
import { closestPending } from "./pending-scope.js";

/** The component a loader resolved to: a module's default export, or the component itself. */
function componentOf(loaded) {
  if (loaded && typeof loaded.tag === "string") return loaded;
  const component = loaded?.default;
  if (component && typeof component.tag === "string") return component;
  throw new TypeError("a lazy component's import() must resolve to a module whose default export is a component, or to a component (.then((m) => m.Name))");
}

/**
 * Compiler-emitted. Returns the loader, callable to preload (`Chart()`), with the
 * placeholder's `tag` (registered on first read, like a compiled component's).
 */
export function lazyComponent(loader, tag) {
  let pending = null;
  let component = null;
  const load = () =>
    (pending ??= Promise.resolve()
      .then(loader)
      .then((loaded) => (component = componentOf(loaded))));

  class LazyElement extends HTMLElement {
    #props = new Map();
    #inner = null;
    #loading = signal(true);
    #loaded = signal(false);
    #boundary = null;
    #handle = {
      loading: () => this.#loading.value,
      settled: () => this.#loaded.value,
      // A failed import() is cached by the browser for the page's life: retry reloads it.
      refetch: () => globalThis.location?.reload(),
    };

    #read = false;

    constructor() {
      super();
      // Compiler-emitted props reach a lazy host here (setProp / spread), not as attributes.
      this.__afwLazy = { set: (name, value) => this.#set(name, value) };
    }

    #set(name, value) {
      this.#props.set(name, value);
      if (this.#inner) setProp(this.#inner, name, value);
    }

    connectedCallback() {
      if (!this.shadowRoot) {
        // Shows nothing until the component arrives (the children stay in the light DOM).
        const root = this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = ":host{display:contents}";
        root.append(style);
      }
      if (this.#inner) return;
      // Props the server rendered this placeholder with (the hydration payload). Read on
      // connect, not in the constructor: a parser-created element gets its attributes
      // after construction. Props set since then win.
      if (!this.#read) {
        this.#read = true;
        const props = hydrationProps(this);
        if (props) for (const key in props) if (!this.#props.has(key)) this.#props.set(key, props[key]);
      }
      if (!this.#boundary) {
        this.#boundary = closestPending(this);
        this.#boundary?.__track(this.#handle);
      }
      load().then(() => this.#mount(), (error) => this.#fail(error));
    }

    disconnectedCallback() {
      queueMicrotask(() => {
        if (this.isConnected || !this.#boundary) return;
        this.#boundary.__untrack(this.#handle);
        this.#boundary = null;
      });
    }

    #mount() {
      if (this.#inner || !this.isConnected) return;
      const inner = document.createElement(component.tag);
      for (const [name, value] of this.#props) setProp(inner, name, value);
      // `on*` callback props are assigned to a component directly (`el.onpicked = fn`),
      // so they sit on this placeholder as own properties: hand them over too.
      for (const key of Object.keys(this)) {
        if (/^on[A-Za-z]/.test(key) && typeof this[key] === "function") setProp(inner, key, this[key]);
      }
      inner.append(...this.childNodes);
      this.#inner = inner;
      this.append(inner); // connects it: its body runs and its `$expose` methods land
      this.shadowRoot.append(document.createElement("slot"));
      // A parent's ref points at this placeholder: forward the exposed methods.
      for (const key of Object.keys(inner)) {
        if (typeof inner[key] === "function" && !(key in this)) this[key] = (...args) => inner[key](...args);
      }
      this.#loading.value = false;
      this.#loaded.value = true;
    }

    #fail(error) {
      this.#loading.value = false;
      if (this.#boundary) this.#boundary.__fail(error, this.#handle);
      else handleError(this, error, { phase: "lazy", retry: this.#handle.refetch });
    }
  }

  const define = () => {
    if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, LazyElement);
  };
  const lazy = () => load();
  Object.defineProperty(lazy, "tag", { get: () => (define(), tag) });
  return lazy;
}
