// Lazy components: the placeholder keeps props and children, loads once, then hands
// them to the real component; <Pending> waits on it; failures go where errors go.
import { afterEach, describe, expect, test } from "runtime:test";

import { onError } from "../core/errors.js";
import { setProp, spread } from "./dom.js";
import "./error-boundary.js";
import { __resetHydrationPayload } from "./hydrate.js";
import { lazyComponent } from "./lazy.js";
import "./pending.js";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
let n = 0;

/** A stand-in for a compiled component: an element with a `tag`, props and an exposed method. */
function component() {
  const tag = `afw-fake-${++n}`;
  class Fake extends HTMLElement {
    static get tag() {
      if (!customElements.get(tag)) customElements.define(tag, Fake);
      return tag;
    }
    set data(value) {
      this._data = value;
      this.setAttribute("data-count", String(value.length));
    }
    get data() {
      return this._data;
    }
    connectedCallback() {
      Object.assign(this, { focusChart: () => `focused ${this._data.length}` });
    }
  }
  return Fake;
}

/** A loader the test settles: `release(value)` / `fail(error)`; `calls` counts imports. */
function controlled() {
  const state = { calls: 0 };
  const promise = new Promise((resolve, reject) => {
    state.release = resolve;
    state.fail = reject;
  });
  state.loader = () => (state.calls++, promise);
  return state;
}

afterEach(() => {
  document.body.replaceChildren();
  __resetHydrationPayload();
});

describe("lazy components", () => {
  test("keeps props and children until the component loads, then hands them over", async () => {
    const Fake = component();
    const load = controlled();
    const Chart = lazyComponent(load.loader, `afw-lazy-a-${n}`);
    const el = document.createElement(Chart.tag);
    setProp(el, "data", [1, 2, 3]);
    el.append(document.createElement("b"));
    document.body.append(el);
    expect(el.querySelector(Fake.tag)).toBe(null);
    load.release({ default: Fake });
    await tick();
    const inner = el.querySelector(Fake.tag);
    expect(inner.data).toEqual([1, 2, 3]);
    expect(inner.querySelector("b")).not.toBe(null); // children moved in
    setProp(el, "data", [1]); // a later update reaches the component
    expect(inner.getAttribute("data-count")).toBe("1");
    spread(el, { data: [1, 2] }, true);
    expect(inner.data).toEqual([1, 2]);
  });

  test("callback props assigned before it loads reach the component", async () => {
    const Fake = component();
    const Chart = lazyComponent(() => Promise.resolve({ default: Fake }), `afw-lazy-j-${n}`);
    const el = document.createElement(Chart.tag);
    const picked = () => "picked";
    el["onpicked"] = picked; // how the compiler passes `onpicked={…}` to a component
    const changed = () => "changed";
    el["onchange"] = changed; // a name the DOM has: lands on the built-in handler property
    document.body.append(el);
    await tick();
    const inner = el.querySelector(Fake.tag);
    expect(inner.onpicked).toBe(picked);
    expect(inner.onchange).toBe(changed);
    expect(el.onchange).toBe(null); // not left on the placeholder too
  });

  test("every instance shares one download; calling the loader preloads it", async () => {
    const Fake = component();
    const load = controlled();
    const Chart = lazyComponent(load.loader, `afw-lazy-b-${n}`);
    Chart(); // preload, e.g. on hover
    for (let i = 0; i < 3; i++) document.body.append(document.createElement(Chart.tag));
    load.release({ default: Fake });
    await tick();
    expect(load.calls).toBe(1);
    expect(document.querySelectorAll(Fake.tag)).toHaveLength(3);
  });

  test("a named export resolves through .then", async () => {
    const Fake = component();
    const Chart = lazyComponent(() => Promise.resolve({ LineChart: Fake }).then((m) => m.LineChart), `afw-lazy-c-${n}`);
    document.body.append(document.createElement(Chart.tag));
    await tick();
    expect(document.querySelector(Fake.tag)).not.toBe(null);
  });

  test("forwards the component's exposed methods to the placeholder a ref points at", async () => {
    const Fake = component();
    const Chart = lazyComponent(() => Promise.resolve({ default: Fake }), `afw-lazy-d-${n}`);
    const el = document.createElement(Chart.tag);
    setProp(el, "data", [1, 2]);
    document.body.append(el);
    expect(el.focusChart).toBe(undefined); // not before it loads
    await tick();
    expect(el.focusChart()).toBe("focused 2");
  });

  test("the nearest <Pending> shows its fallback until the component loads", async () => {
    const Fake = component();
    const load = controlled();
    const Chart = lazyComponent(load.loader, `afw-lazy-e-${n}`);
    const pending = document.createElement("afw-internal-pending");
    pending.fallback = document.createTextNode("loading");
    pending.append(document.createElement(Chart.tag));
    document.body.append(pending);
    await tick();
    const shown = () => [...pending.shadowRoot.querySelectorAll("slot")].map((s) => s.name || "content");
    expect(shown()).toEqual(["fallback"]);
    load.release({ default: Fake });
    await tick();
    expect(shown()).toEqual(["content"]);
  });

  test("a failed download shows <Pending error>, whose retry reloads the page", async () => {
    const load = controlled();
    const Chart = lazyComponent(load.loader, `afw-lazy-f-${n}`);
    const pending = document.createElement("afw-internal-pending");
    let retry;
    pending.error = (error, again) => ((retry = again), document.createTextNode(`failed: ${error.message}`));
    pending.append(document.createElement(Chart.tag));
    document.body.append(pending);
    load.fail(new Error("chunk 404"));
    await tick();
    expect(pending.querySelector('[slot="error"]').textContent).toBe("failed: chunk 404");
    expect(typeof retry).toBe("function");
  });

  test("without a boundary, a failed download goes to the nearest ErrorBoundary", async () => {
    const quiet = onError(() => {});
    const Chart = lazyComponent(() => Promise.reject(new Error("offline")), `afw-lazy-g-${n}`);
    const eb = document.createElement("afw-internal-error-boundary");
    eb.fallback = (error) => document.createTextNode(`boundary: ${error.message}`);
    eb.append(document.createElement(Chart.tag));
    document.body.append(eb);
    await tick();
    await tick();
    quiet();
    expect(eb.textContent).toBe("boundary: offline");
  });

  test("a loader that resolves to something that is not a component is an error", async () => {
    const errors = [];
    const quiet = onError((error) => errors.push(error.message));
    const Chart = lazyComponent(() => Promise.resolve({ notIt: 1 }), `afw-lazy-h-${n}`);
    document.body.append(document.createElement(Chart.tag));
    await tick();
    quiet();
    expect(errors[0]).toContain("default export is a component");
  });

  test("a server-rendered placeholder reads its props from the hydration payload", async () => {
    const Fake = component();
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "__afw_h";
    script.textContent = JSON.stringify([{ data: [9, 9] }]);
    document.body.append(script);
    __resetHydrationPayload(); // a fresh document's payload, not one an earlier case read
    const Chart = lazyComponent(() => Promise.resolve({ default: Fake }), `afw-lazy-i-${n}`);
    const holder = document.createElement("div");
    holder.innerHTML = `<${Chart.tag} data-h="0"></${Chart.tag}>`;
    document.body.append(holder);
    await tick();
    expect(holder.querySelector(Fake.tag).data).toEqual([9, 9]);
  });
});
