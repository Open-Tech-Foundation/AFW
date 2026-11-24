import { describe, expect, test } from "runtime:test";

import { resetWarnings } from "../core/dev.js";
import { signal } from "../core/signals.js";
import { bindChild, bindList, setHandler, setProp } from "./dom.js";

function render(items, keyFn) {
  const parent = document.createElement("div");
  bindList(
    parent,
    () => items.value,
    (sig) => {
      const el = document.createElement("section");
      el.dataset.bornAs = sig.value.id ?? String(sig.value);
      return el;
    },
    keyFn,
  );
  return parent;
}

function captureWarnings(fn) {
  resetWarnings();
  const original = console.warn;
  const out = [];
  console.warn = (m) => out.push(m);
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return out;
}

// The index-key fallback (SPEC §5.4.4) silently re-points surviving nodes at
// their neighbour's data on a splice/reorder, so per-node state follows the wrong
// item. It stays the spec'd default; these cover the dev warning that fires at the
// exact reconcile where it goes wrong, and stays quiet when it cannot.
describe("bindList — keyless index-fallback warning", () => {
  test("warns when a keyless list reorders", () => {
    const items = signal([{ id: "W0" }, { id: "W1" }, { id: "W2" }]);
    const warnings = captureWarnings(() => {
      render(items, undefined);
      items.value = [items.value[0], items.value[2]]; // close middle W1
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("moved from index 2 to 1");
    console.log(warnings[0]);
  });

  test("warns only once, however many reorders follow", () => {
    const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
    const items = signal([a, b, c]);
    const warnings = captureWarnings(() => {
      render(items, undefined);
      items.value = [a, c];
      items.value = [c, a];
      items.value = [c];
    });
    expect(warnings.length).toBe(1);
  });

  test("silent when a key is supplied", () => {
    const items = signal([{ id: "W0" }, { id: "W1" }, { id: "W2" }]);
    const warnings = captureWarnings(() => {
      render(items, (i) => i.id);
      items.value = [items.value[0], items.value[2]];
    });
    expect(warnings).toEqual([]);
  });

  test("silent for append-only keyless lists (indices stay put)", () => {
    const a = { id: "a" }, b = { id: "b" };
    const items = signal([a]);
    const warnings = captureWarnings(() => {
      render(items, undefined);
      items.value = [a, b];
    });
    expect(warnings).toEqual([]);
  });

  test("silent for keyless primitive lists", () => {
    const items = signal(["a", "b", "c"]);
    const warnings = captureWarnings(() => {
      const parent = document.createElement("div");
      bindList(parent, () => items.value, () => document.createElement("li"), undefined);
      items.value = ["c", "a"];
    });
    expect(warnings).toEqual([]);
  });

  test("keyed lists destroy the right node", () => {
    const items = signal([{ id: "W0" }, { id: "W1" }, { id: "W2" }]);
    const parent = render(items, (i) => i.id);
    items.value = [items.value[0], items.value[2]];
    const after = [...parent.querySelectorAll("section")];
    expect(after.map((n) => n.dataset.bornAs)).toEqual(["W0", "W2"]);
  });
});

describe("bindList — multi-node items", () => {
  // An item that is a fragment holding a conditional: `x => x % 2 ? <li.odd/> : <li.even/>`.
  const parityItem = (x) => {
    const frag = document.createDocumentFragment();
    const anchor = document.createComment("");
    frag.appendChild(anchor);
    bindChild(anchor, () => {
      const li = document.createElement("li");
      li.className = x.value.n % 2 ? "odd" : "even";
      li.textContent = x.value.n;
      return li;
    });
    return frag;
  };
  const shown = (ul) => [...ul.querySelectorAll("li")].map((li) => li.className + li.textContent);

  test("an item whose conditional swapped is removed whole", () => {
    const items = signal([{ n: 1 }, { n: 2 }]);
    const ul = document.createElement("ul");
    bindList(ul, () => items.value, parityItem);
    expect(shown(ul)).toEqual(["odd1", "even2"]);
    items.value = [{ n: 2 }]; // index 0 swaps odd → even; index 1 goes
    expect(shown(ul)).toEqual(["even2"]);
    items.value = [];
    expect(shown(ul)).toEqual([]);
  });

  test("a keyed item whose conditional swapped moves with its new nodes", () => {
    const a = { id: "a", n: 1 };
    const b = { id: "b", n: 2 };
    const items = signal([a, b]);
    const ul = document.createElement("ul");
    bindList(ul, () => items.value, parityItem, (x) => x.id);
    items.value = [{ id: "a", n: 4 }, b]; // a swaps to even
    expect(shown(ul)).toEqual(["even4", "even2"]);
    items.value = [b, { id: "a", n: 4 }]; // and moves after b
    expect(shown(ul)).toEqual(["even2", "even4"]);
    expect(ul.querySelectorAll("li").length).toBe(2);
  });
});

// A component host that does not declare `value`/`disabled`/… gets them as attributes, so
// a `...rest` snapshot (which reads attributes) forwards them to the element it renders.
describe("setProp on a component host", () => {
  class Plain extends HTMLElement {}
  if (!customElements.get("afw-test-plain-host")) customElements.define("afw-test-plain-host", Plain);
  class Declares extends HTMLElement {
    set value(v) { this._v = v; }
    get value() { return this._v; }
  }
  if (!customElements.get("afw-test-declares-host")) customElements.define("afw-test-declares-host", Declares);

  test("undeclared value/disabled/checked land as attributes", () => {
    const el = document.createElement("afw-test-plain-host");
    setProp(el, "value", "delete");
    setProp(el, "disabled", true);
    setProp(el, "checked", false);
    expect(el.getAttribute("value")).toBe("delete");
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.hasAttribute("checked")).toBe(false);
    setProp(el, "disabled", false);
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  test("a declared prop still receives the property, rich values included", () => {
    const el = document.createElement("afw-test-declares-host");
    const rich = { a: 1 };
    setProp(el, "value", rich);
    expect(el.value).toBe(rich);
    expect(el.hasAttribute("value")).toBe(false);
  });

  test("a plain element keeps property semantics", () => {
    const input = document.createElement("input");
    setProp(input, "value", "typed");
    expect(input.value).toBe("typed");
    expect(input.hasAttribute("value")).toBe(false);
  });
});

// `on*` props on a child component: a declared callback or standard handler is a
// property; any other event is a listener on the host (it bubbles up from the content).
describe("setHandler", () => {
  class WithCallback extends HTMLElement {
    set onPick(fn) { this._pick = fn; }
    get onPick() { return this._pick; }
  }
  if (!customElements.get("afw-test-handler-host")) customElements.define("afw-test-handler-host", WithCallback);

  test("a declared callback prop receives the function", () => {
    const el = document.createElement("afw-test-handler-host");
    const fn = () => {};
    setHandler(el, "onPick", fn);
    expect(el._pick).toBe(fn);
  });

  test("a standard handler is the property; focusout and custom events are listeners", () => {
    const el = document.createElement("afw-test-handler-host");
    const inner = document.createElement("input");
    el.append(inner);
    document.body.append(el);
    const seen = [];
    setHandler(el, "onclick", () => seen.push("click"));
    setHandler(el, "onfocusout", () => seen.push("focusout"));
    setHandler(el, "onsaved", () => seen.push("saved"));
    expect(typeof el.onclick).toBe("function");
    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    inner.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    inner.dispatchEvent(new CustomEvent("saved", { bubbles: true }));
    expect(seen).toEqual(["click", "focusout", "saved"]);
    el.remove();
  });
});
