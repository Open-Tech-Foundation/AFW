// Development route refresh (esdev `import.meta.hot`): an edited page or layout
// rebuilds alone, keeps its `$state` when the declarations match, and leaves the
// rest of the route view — outer layouts, the inner page and their state — in place.

import { afterEach, expect, test } from "runtime:test";
import { effect, signal } from "../core/signals.js";
import { hotRouteState, hotState, registerHotHydrate, registerHotModule, registerHotRoute } from "./hmr.js";
import { mountApp, router, routes } from "./router.js";

const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

// The slice of esdev's `import.meta.hot` the route runtime uses.
function fakeHot() {
  return {
    data: {}, accepted: 0, invalidated: 0,
    keep(key, create) { return (this.data[key] ??= create()); },
    accept() { this.accepted++; },
    invalidate() { this.invalidated++; },
  };
}

// Vite's `import.meta.hot`: the same `data`, `accept` and `invalidate`, but no `keep`.
function fakeViteHot() {
  const hot = fakeHot();
  delete hot.keep;
  return hot;
}

const log = [];
// A page factory version: `$state` count kept in route slots, a button to change it.
function pageVersion(label, stateName = "count") {
  return () => {
    const count = hotRouteState(stateName, () => signal(0));
    const root = document.createElement("section");
    root.className = "page";
    const text = document.createTextNode("");
    effect(() => { text.data = `${label}:${count.value}`; });
    const button = document.createElement("button");
    button.className = "inc";
    button.onclick = () => count.value++;
    root.append(text, button);
    root.__lifecycle = { mounts: [() => { log.push(`mount ${label}`); return () => log.push(`cleanup ${label}`); }], cleanups: [] };
    return root;
  };
}
function layoutVersion(label, { fail = false } = {}) {
  return (props) => {
    const open = hotRouteState("open", () => signal(1));
    const root = document.createElement("main");
    root.className = "layout";
    const head = document.createElement("p");
    head.className = "head";
    effect(() => { head.textContent = `${label}:${open.value}`; });
    root.append(head, props.children);
    if (fail) throw new Error("layout broke");
    return root;
  };
}

let app;
async function mountRoute(pageHot, layoutHot, pageV1, layoutV1) {
  routes.pages = {}; routes.layouts = {}; routes.notFound = null;
  app = document.createElement("div");
  document.body.appendChild(app);
  window.history.replaceState({}, "", "/");
  const pages = { "/app/page.jsx": { default: registerHotRoute(pageHot, pageV1, '["count:State"]') } };
  if (layoutHot) pages["/app/layout.jsx"] = { default: registerHotRoute(layoutHot, layoutV1, '["open:State"]') };
  await mountApp({ target: app, pages });
  await tick();
}
const logged = (...labels) => log.filter((entry) => labels.includes(entry.split(" ")[1]));
const text = (selector) => app.querySelector(selector)?.firstChild?.data ?? app.querySelector(selector)?.textContent;

afterEach(() => {
  app?.remove();
  log.length = 0;
  window.history.replaceState({}, "", "/");
});

test("a page edit keeps its state and leaves the layout untouched", async () => {
  const pageHot = fakeHot(), layoutHot = fakeHot();
  await mountRoute(pageHot, layoutHot, pageVersion("A"), layoutVersion("L"));
  app.querySelector(".inc").click(); app.querySelector(".inc").click();
  const layout = app.querySelector(".layout");
  const head = app.querySelector(".head");
  expect(text(".page")).toBe("A:2");

  registerHotRoute(pageHot, pageVersion("B"), '["count:State"]');
  await tick();

  expect(text(".page")).toBe("B:2");
  expect(app.querySelector(".layout")).toBe(layout);
  expect(app.querySelector(".head")).toBe(head);
  expect(logged("A", "B")).toEqual(["mount A", "cleanup A", "mount B"]);
  expect(pageHot.invalidated).toBe(0);
});

test("a page edit that changes its state declarations starts fresh", async () => {
  const pageHot = fakeHot();
  await mountRoute(pageHot, null, pageVersion("A"));
  app.querySelector(".inc").click();
  expect(text(".page")).toBe("A:1");

  registerHotRoute(pageHot, pageVersion("B", "total"), '["total:State"]');
  await tick();

  expect(text(".page")).toBe("B:0");
});

test("a layout edit keeps the page node, the page state and the layout state", async () => {
  const pageHot = fakeHot(), layoutHot = fakeHot();
  await mountRoute(pageHot, layoutHot, pageVersion("P"), layoutVersion("L1"));
  app.querySelector(".inc").click();
  const pageNode = app.querySelector(".page");
  const oldLayout = app.querySelector(".layout");
  // Bump the layout's own state through its slot-backed signal.
  const slots = oldLayout.__afwHotSlots.slots;
  slots.get("open").value = 5;
  expect(text(".head")).toBe("L1:5");

  registerHotRoute(layoutHot, layoutVersion("L2"), '["open:State"]');
  await tick();

  const newLayout = app.querySelector(".layout");
  expect(newLayout).not.toBe(oldLayout);
  expect(text(".head")).toBe("L2:5");
  expect(app.querySelector(".page")).toBe(pageNode);
  expect(newLayout.contains(pageNode)).toBe(true);
  expect(text(".page")).toBe("P:1");
  expect(logged("P")).toEqual(["mount P"]); // the page never remounted
  // The old layout's bindings are disposed: changing its state no longer writes.
  slots.get("open").value = 6;
  expect(text(".head")).toBe("L2:6");
  expect(oldLayout.querySelector(".head").textContent).toBe("L1:5");
});

test("a failed layout rebuild keeps the current view and its page", async () => {
  const pageHot = fakeHot(), layoutHot = fakeHot();
  await mountRoute(pageHot, layoutHot, pageVersion("P"), layoutVersion("L1"));
  const pageNode = app.querySelector(".page");
  const layout = app.querySelector(".layout");
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    registerHotRoute(layoutHot, layoutVersion("L2", { fail: true }), '["open:State"]');
    await tick();
  } finally {
    console.error = original;
  }
  expect(app.querySelector(".layout")).toBe(layout);
  expect(layout.contains(pageNode)).toBe(true);
  expect(text(".head")).toBe("L1:1");
});

test("editing a factory that is not on screen changes nothing", async () => {
  const pageHot = fakeHot(), otherHot = fakeHot();
  registerHotRoute(otherHot, pageVersion("Other"), '["count:State"]');
  await mountRoute(pageHot, null, pageVersion("A"));
  const node = app.querySelector(".page");
  registerHotRoute(otherHot, pageVersion("Other2"), '["count:State"]');
  await tick();
  expect(app.querySelector(".page")).toBe(node);
  expect(text(".page")).toBe("A:0");
});

test("an update's own metadata and toc reach the refresh, not the originally imported module's", async () => {
  const pageHot = fakeHot();
  await mountRoute(pageHot, null, pageVersion("A"));
  registerHotRoute(pageHot, pageVersion("B"), '["count:State"]', "", {
    metadata: { title: "Edited title" },
    toc: [{ depth: 2, id: "new", text: "New" }],
  });
  await tick();
  expect(text(".page")).toBe("B:0");
  expect(document.title).toBe("Edited title");
  expect(router.toc).toEqual([{ depth: 2, id: "new", text: "New" }]);
  expect(pageHot.invalidated).toBe(0);
});

test("a changed helper export invalidates instead of refreshing", async () => {
  const pageHot = fakeHot();
  await mountRoute(pageHot, null, pageVersion("A"));
  registerHotRoute(pageHot, pageVersion("B"), '["count:State"]', "export const KIND = 1;\n");
  await tick();
  expect(pageHot.invalidated).toBe(1);
});

// An MDX page (or any `<>…</>` view) has a fragment root: once inserted the fragment is
// empty, so a refresh has to replace the nodes it held, and a layout refresh has to get
// them back as its children.
function fragmentVersion(label) {
  return () => {
    const frag = document.createDocumentFragment();
    const h = document.createElement("h2");
    h.className = "frag";
    h.textContent = label;
    const p = document.createElement("p");
    p.className = "frag-body";
    p.textContent = `${label} body`;
    frag.append(h, p);
    return frag;
  };
}

test("a fragment-root page refreshes in place, replacing exactly its nodes", async () => {
  const pageHot = fakeHot(), layoutHot = fakeHot();
  await mountRoute(pageHot, layoutHot, fragmentVersion("F1"), layoutVersion("L"));
  expect(text(".frag")).toBe("F1");
  const layout = app.querySelector(".layout");

  registerHotRoute(pageHot, fragmentVersion("F2"), '["count:State"]');
  await tick();
  expect(text(".frag")).toBe("F2");
  expect(app.querySelectorAll(".frag").length).toBe(1);
  expect(app.querySelectorAll(".frag-body").length).toBe(1);
  expect(app.querySelector(".layout")).toBe(layout);

  // A layout refresh gets the page's nodes back as its children, not an empty fragment.
  registerHotRoute(layoutHot, layoutVersion("L2"), '["open:State"]');
  await tick();
  expect(text(".head").startsWith("L2")).toBe(true);
  expect(text(".frag")).toBe("F2");
  expect(app.querySelectorAll(".frag").length).toBe(1);

  // And the page refreshes again under the new layout.
  registerHotRoute(pageHot, fragmentVersion("F3"), '["count:State"]');
  await tick();
  expect(text(".frag")).toBe("F3");
  expect(app.querySelectorAll(".frag, .frag-body").length).toBe(2);
});

test("a page edit refreshes in place under Vite's hot API, which has no keep()", async () => {
  const pageHot = fakeViteHot(), layoutHot = fakeViteHot();
  await mountRoute(pageHot, layoutHot, pageVersion("A"), layoutVersion("L"));
  app.querySelector(".inc").click();
  const layout = app.querySelector(".layout");
  expect(text(".page")).toBe("A:1");

  registerHotRoute(pageHot, pageVersion("B"), '["count:State"]');
  await tick();

  expect(text(".page")).toBe("B:1");
  expect(app.querySelector(".layout")).toBe(layout);
  expect(pageHot.invalidated).toBe(0);
  expect(pageHot.accepted).toBe(2);
});

// A stateful component the way hot (development) builds compile it: `$state` lives in
// the host's `_hotState` slots, read through `hotState`.
class HotCount extends HTMLElement {
  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;
    if (!this._hotRefreshing) this._hotState = new Map();
    const count = hotState(this, "count", () => signal(0));
    const button = document.createElement("button");
    button.className = "count";
    effect(() => { button.textContent = `${this.dataset.label}:${count.value}`; });
    button.onclick = () => count.value++;
    this.replaceChildren(button);
  }
}
if (!customElements.get("x-hot-count")) customElements.define("x-hot-count", HotCount);

function pageWithCounters(title, labels) {
  return () => {
    const root = document.createElement("section");
    const h1 = document.createElement("h1");
    h1.textContent = title;
    root.append(h1);
    for (const label of labels) {
      const counter = document.createElement("x-hot-count");
      counter.dataset.label = label;
      root.append(counter);
    }
    return root;
  };
}

test("a page edit keeps the state of the components it renders", async () => {
  const pageHot = fakeHot();
  await mountRoute(pageHot, null, pageWithCounters("A", ["first", "second"]));
  const [first, second] = app.querySelectorAll(".count");
  first.click(); first.click(); second.click();
  expect([...app.querySelectorAll(".count")].map((b) => b.textContent)).toEqual(["first:2", "second:1"]);
  const oldHosts = [...app.querySelectorAll("x-hot-count")];

  registerHotRoute(pageHot, pageWithCounters("B", ["first", "second"]), "[]");
  await tick();

  expect(app.querySelector("h1").textContent).toBe("B");
  const hosts = [...app.querySelectorAll("x-hot-count")];
  expect(hosts.some((h) => oldHosts.includes(h))).toBe(false); // new elements…
  expect([...app.querySelectorAll(".count")].map((b) => b.textContent)).toEqual(["first:2", "second:1"]); // …same state, in order
  app.querySelector(".count").click();
  expect(app.querySelector(".count").textContent).toBe("first:3"); // and still live
});

test("a component added by the edit starts fresh; the rest keep theirs", async () => {
  const pageHot = fakeHot();
  await mountRoute(pageHot, null, pageWithCounters("A", ["one"]));
  app.querySelector(".count").click();

  registerHotRoute(pageHot, pageWithCounters("B", ["one", "two"]), "[]");
  await tick();

  expect([...app.querySelectorAll(".count")].map((b) => b.textContent)).toEqual(["one:1", "two:0"]);
});

// A component (compiled-style host) that renders <x-hot-count> in its own view.
function panelVersion(label) {
  return class extends HTMLElement {
    static tag = "x-hot-panel";
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      if (!this._hotRefreshing) this._hotState = new Map();
      const title = document.createElement("h2");
      title.textContent = label;
      const counter = document.createElement("x-hot-count");
      counter.dataset.label = "inner";
      this.replaceChildren(title, counter);
    }
  };
}

test("a component edit keeps the state of the components it renders", async () => {
  const hot = fakeHot();
  registerHotModule(hot, [[panelVersion("Panel A"), "shape"]]);
  const holder = document.createElement("div");
  document.body.append(holder);
  try {
    holder.append(document.createElement("x-hot-panel"));
    holder.querySelector(".count").click();
    holder.querySelector(".count").click();
    const oldCounter = holder.querySelector("x-hot-count");
    expect(holder.querySelector(".count").textContent).toBe("inner:2");

    registerHotModule(hot, [[panelVersion("Panel B"), "shape"]]);

    expect(holder.querySelector("h2").textContent).toBe("Panel B");
    expect(holder.querySelector("x-hot-count") === oldCounter).toBe(false);
    expect(holder.querySelector(".count").textContent).toBe("inner:2");
  } finally {
    holder.remove();
  }
});

// A development page's adopt factory: claims the server-rendered section in place and
// keeps its `$state` in the route slots, as the compiler's hot hydrate target emits it.
function adoptVersion(label) {
  return () => {
    const count = hotRouteState("count", () => signal(0));
    const root = app.querySelector(".page");
    const text = root.firstChild;
    effect(() => { text.data = `${label}:${count.value}`; });
    root.querySelector(".inc").onclick = () => count.value++;
    return root;
  };
}

async function mountAdopted(pageHot, wrap) {
  routes.pages = {}; routes.layouts = {}; routes.notFound = null;
  app = document.createElement("div");
  app.setAttribute("data-afw-hydrate", "");
  app.innerHTML = '<section class="page">A:0<button class="inc"></button></section>';
  document.body.appendChild(app);
  window.history.replaceState({}, "", "/");
  const server = app.querySelector(".page");
  const module = { default: registerHotRoute(pageHot, pageVersion("A"), '["count:State"]') };
  module.hydrateAt = wrap ? registerHotHydrate(pageHot, adoptVersion("A"), '["count:State"]') : adoptVersion("A");
  await mountApp({ target: app, pages: { "/app/page.jsx": module } });
  await tick();
  return server;
}

test("an edit to an adopted page refreshes it in place and keeps its state", async () => {
  const pageHot = fakeHot();
  const server = await mountAdopted(pageHot, true);
  expect(app.querySelector(".page")).toBe(server); // adopted, not rebuilt
  app.querySelector(".inc").click(); app.querySelector(".inc").click();
  expect(text(".page")).toBe("A:2");

  registerHotRoute(pageHot, pageVersion("B"), '["count:State"]');
  await tick();

  expect(app.querySelector(".page")).not.toBe(server);
  expect(text(".page")).toBe("B:2");
  expect(pageHot.invalidated).toBe(0);
});

test("without registerHotHydrate the route refresh cannot find an adopted page", async () => {
  const pageHot = fakeHot();
  const server = await mountAdopted(pageHot, false);
  app.querySelector(".inc").click();
  registerHotRoute(pageHot, pageVersion("B"), '["count:State"]');
  await tick();
  expect(app.querySelector(".page")).toBe(server);
  expect(text(".page")).toBe("A:1");
});

test("registerHotHydrate returns the adopt factory unchanged without a hot API", () => {
  const adopt = () => null;
  expect(registerHotHydrate(undefined, adopt)).toBe(adopt);
});
