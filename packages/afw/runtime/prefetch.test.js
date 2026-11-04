// prefetch() and <Link prefetch>: warm a route's chunks and loader data; the
// navigation reuses the data once; invalidate() drops it.
import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import "../components/Link.jsx"; // registers <afw-link>
import { invalidate } from "./invalidate.js";
import { mountApp, navigate, prefetch, router, routes, setRouteData } from "./router.js";

const realFetch = globalThis.fetch;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
let dataCalls, imports;

beforeEach(() => {
  dataCalls = 0;
  imports = [];
  globalThis.fetch = async () => Response.json({ call: ++dataCalls });
  routes.pages = {}; routes.layouts = {}; routes.notFound = null; routes.loaderRoutes = new Set();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = "";
  setRouteData(undefined);
});

const lazy = (name) => async () => {
  imports.push(name);
  return { default: () => { const d = document.createElement("div"); d.id = name; return d; } };
};

async function mount() {
  const app = document.createElement("div");
  document.body.appendChild(app);
  window.history.replaceState({}, "", "/");
  mountApp({
    pages: {
      "/p/app/page.jsx": { default: () => document.createElement("main") },
      "/p/app/todos/page.jsx": lazy("todos"),
      "/p/app/todos/layout.jsx": lazy("todos-layout"),
    },
    target: app, loaders: ["/todos"],
  });
  await settle();
  return app;
}

describe("prefetch", () => {
  test("loads the page and layout chunks and the loader data, which the navigation reuses", async () => {
    await mount();
    prefetch("/todos");
    prefetch("/todos"); // deduplicated
    await settle();
    expect(imports.sort()).toEqual(["todos", "todos-layout"]);
    expect(dataCalls).toBe(1);
    await navigate("/todos");
    expect(dataCalls).toBe(1, "the navigation used the prefetched data");
    expect(router.data).toEqual({ call: 1 });
    await navigate("/");
    await navigate("/todos");
    expect(dataCalls).toBe(2, "prefetched data is used once");
  });

  test("invalidate() drops prefetched data", async () => {
    await mount();
    prefetch("/todos");
    await settle();
    await invalidate();
    await navigate("/todos");
    expect(dataCalls).toBe(2);
  });

  test("ignores other origins and unknown routes", async () => {
    await mount();
    prefetch("https://elsewhere.test/todos");
    prefetch("/nowhere");
    await settle();
    expect([imports.length, dataCalls]).toEqual([0, 0]);
  });
});

describe("<Link prefetch>", () => {
  // A real <afw-link>: connectedCallback builds its <a>.
  function link(attrs = {}) {
    const el = document.createElement("afw-link");
    el.setAttribute("href", "/todos");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el.querySelector("a");
  }

  test("warms the route on hover by default", async () => {
    await mount();
    link().dispatchEvent(new Event("pointerenter"));
    await settle();
    expect(dataCalls).toBe(1);
    expect(imports.sort()).toEqual(["todos", "todos-layout"]);
  });

  test("and on focus", async () => {
    await mount();
    link().dispatchEvent(new Event("focus"));
    await settle();
    expect(dataCalls).toBe(1);
  });

  test('prefetch="none" never warms', async () => {
    await mount();
    const a = link({ prefetch: "none" });
    a.dispatchEvent(new Event("pointerenter"));
    a.dispatchEvent(new Event("focus"));
    await settle();
    expect(dataCalls).toBe(0);
  });
});
