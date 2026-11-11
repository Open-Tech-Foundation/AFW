// <Pending> — one loading state for every resource beneath it.
//
//   <Pending fallback={<Skeleton/>} refreshing={<TopProgress/>} delay={200}>
//     <UserList/>
//     <Stats/>
//   </Pending>
//
// Resources register with their nearest boundary (pending-scope.js). The boundary
// shows `fallback` until each has settled once, then its children. A later refetch
// keeps the children and shows `refreshing` beside them (or the fallback again with
// `refetch="fallback"`). A first-load failure goes to the nearest <ErrorBoundary>.
//
// The children are built and connected the whole time, so their fetches start at
// once; a shadow root decides what is displayed — a `<slot>` for the children, or a
// named slot for the fallback. Both stay in the light DOM, so page CSS applies. The
// server renders the same shadow root declaratively, showing the fallback.

import { effect, signal, untracked } from "../core/signals.js";
import { isHydratable, toNodes } from "./dom.js";
import { handleError } from "./error-boundary.js";
import { HydrationMismatch, isHydrating } from "./hydrate.js";

const TAG = "afw-internal-pending";

function slotNamed(name) {
  const slot = document.createElement("slot");
  if (name) slot.name = name;
  return slot;
}

export class PendingElement extends HTMLElement {
  #tracked = signal([]);
  #fallback = null;
  #refreshing = null;
  #refetchMode = "keep";
  #delay = 0;
  #root = null;
  #slots = null;
  #dispose = null;
  #timer = null;
  /** What the shadow root displays: null (nothing), "fallback", "refreshing" or "content". */
  #shown = null;
  /** Has the content been displayed once (later waits are refetches)? */
  #revealed = false;
  /** Server-rendered: wait for the children's hydration before deciding anything. */
  #server = false;
  #built = false;

  set fallback(value) {
    this.#fallback = value;
    this.#place("fallback", value);
  }
  get fallback() {
    return this.#fallback;
  }
  set refreshing(value) {
    this.#refreshing = value;
    this.#place("refreshing", value);
  }
  get refreshing() {
    return this.#refreshing;
  }
  /** `"keep"` (default): content stays during a refetch. `"fallback"`: show the fallback again. */
  set refetch(value) {
    this.#refetchMode = value === "fallback" ? "fallback" : "keep";
  }
  get refetch() {
    return this.#refetchMode;
  }
  /** Milliseconds to wait before showing the fallback or `refreshing`. */
  set delay(value) {
    this.#delay = Math.max(0, Number(value) || 0);
  }
  get delay() {
    return this.#delay;
  }

  /** A resource this boundary waits on (called by resource.js). */
  __track(handle) {
    this.#tracked.value = [...this.#tracked.value, handle];
  }
  __untrack(handle) {
    this.#tracked.value = this.#tracked.value.filter((h) => h !== handle);
  }
  /** The compiler finished building (or adopting) this boundary's children. */
  __built() {
    this.#built = true;
    this.#start();
  }
  /** A tracked resource failed its first load: hand it to the nearest <ErrorBoundary>. */
  __fail(error, handle) {
    handleError(this, error, { phase: "resource", retry: () => handle.refetch() });
  }

  connectedCallback() {
    if (!this.#root) {
      // A server-rendered boundary already has its (declarative) shadow root, showing
      // the fallback; keep displaying it until the resources say otherwise.
      const server = this.shadowRoot;
      if (server && server.querySelector('slot[name="fallback"]')) {
        this.#shown = "fallback";
        this.#server = true;
      }
      this.#root = server ?? this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:contents}";
      this.#slots = { style, fallback: slotNamed("fallback"), refreshing: slotNamed("refreshing"), content: slotNamed("") };
      this.#render(this.#shown);
    }
    this.#start();
  }

  // Start on a microtask: the child components connect after this element, and their
  // resources register as they do. A server-rendered boundary also waits for the page's
  // hydration code to adopt its children (`__built`), since the page's own resources
  // register as that code reads them. Until then the current display stays.
  #start() {
    if (this.#server && !this.#built) return;
    queueMicrotask(() => {
      if (!this.isConnected || this.#dispose) return;
      this.#dispose = effect(() => {
        let waiting = false;
        let busy = false;
        for (const handle of this.#tracked.value) {
          if (!handle.loading()) continue;
          busy = true;
          if (!handle.settled()) waiting = true;
        }
        const target = waiting || (busy && this.#refetchMode === "fallback")
          ? "fallback"
          : busy ? "refreshing" : "content";
        untracked(() => this.#update(target));
      });
    });
  }

  disconnectedCallback() {
    this.#dispose?.();
    this.#dispose = null;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #update(target) {
    clearTimeout(this.#timer);
    this.#timer = null;
    if (target === "content" || target === this.#shown || this.#delay === 0 || this.#shown === "fallback") {
      this.#show(target);
      return;
    }
    // Wait `delay` before showing a loading state: a fast response never flashes one.
    // Meanwhile a first load shows nothing and a refetch keeps the content.
    this.#show(this.#revealed ? "content" : null);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#show(target);
    }, this.#delay);
  }

  #show(state) {
    if (state === "content") this.#revealed = true;
    // `data-pending`: a refetch is in progress and its loading state is showing.
    this.toggleAttribute("data-pending", this.#revealed && (state === "refreshing" || state === "fallback"));
    if (state === this.#shown) return;
    this.#shown = state;
    this.#render(state);
  }

  #render(state) {
    const { style, fallback, refreshing, content } = this.#slots;
    if (state === "fallback") this.#root.replaceChildren(style, fallback);
    else if (state === "refreshing") this.#root.replaceChildren(style, refreshing, content);
    else if (state === "content") this.#root.replaceChildren(style, content);
    else this.#root.replaceChildren(style);
  }

  /** Put `value` in the light DOM, wrapped for the named slot (replacing any previous one). */
  #place(name, value) {
    let wrapper = null;
    for (const child of this.children) {
      if (child.slot === name) {
        wrapper = child;
        break;
      }
    }
    // Hydrating: adopt the fallback the server rendered instead of rebuilding it.
    if (wrapper && isHydratable(value) && isHydrating() && !wrapper.__afwAdopted) {
      try {
        value.adopt({ node: wrapper.firstChild }, [...wrapper.childNodes]);
        wrapper.__afwAdopted = true;
        return;
      } catch (error) {
        if (!(error instanceof HydrationMismatch)) throw error;
      }
    }
    const nodes = toNodes(value);
    if (!nodes.length) {
      wrapper?.remove();
      return;
    }
    if (!wrapper) {
      wrapper = document.createElement("span");
      wrapper.slot = name;
      wrapper.style.display = "contents";
      this.prepend(wrapper);
    }
    wrapper.replaceChildren(...nodes);
  }
}

// Exported so `import { Pending } from "@opentf/afw"` resolves; the import side
// effect registers the element (JSX uses the `afw-internal-pending` tag).
export const Pending = PendingElement;
if (typeof customElements !== "undefined" && !customElements.get(TAG)) {
  customElements.define(TAG, PendingElement);
}
