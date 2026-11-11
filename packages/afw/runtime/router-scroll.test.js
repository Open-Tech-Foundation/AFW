// Scroll-restoration bookkeeping and the view-transition gates. Layout-dependent
// behavior (actual scroll positions, a growing page) is covered in a real browser:
// browser-tests/scroll.test.js.

import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import { mountApp, navigate, routes } from "./router.js";
import { __resetScroll, enterEntry, rememberScroll, restoreScroll } from "./scroll.js";

const tick = () => new Promise((r) => setTimeout(r, 0));
const page = (text) => () => {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
};
const pages = { "/p/app/page.jsx": { default: page("home") }, "/p/app/a/page.jsx": { default: page("a") } };
let realStart, realMatch, transitions;

beforeEach(() => {
  routes.pages = {};
  routes.layouts = {};
  routes.loading = {};
  routes.errors = {};
  routes.notFound = null;
  routes.loaderRoutes = new Set();
  __resetScroll();
  realStart = document.startViewTransition;
  realMatch = globalThis.matchMedia;
  transitions = 0;
  document.startViewTransition = (update) => {
    transitions++;
    const done = Promise.resolve().then(update);
    return { updateCallbackDone: done, ready: done, finished: done };
  };
});

afterEach(() => {
  document.startViewTransition = realStart;
  globalThis.matchMedia = realMatch;
  document.body.innerHTML = "";
});

async function mount(options = {}) {
  const app = document.createElement("div");
  document.body.appendChild(app);
  window.history.replaceState({}, "", "/");
  await mountApp({ pages, target: app, ...options });
  await tick();
  return app;
}

describe("history entries", () => {
  test("every entry gets a key; push makes a new one, pop keeps the current one", () => {
    window.history.replaceState({}, "", "/");
    const first = enterEntry("/", "pop");
    expect(history.state.afwKey).toBe(first);
    const pushed = enterEntry("/a", "push");
    expect(pushed).not.toBe(first);
    expect(location.pathname).toBe("/a");
    expect(enterEntry("/a", "pop")).toBe(pushed);
  });

  test("a position saved for an entry is restored for it, and only for it", () => {
    const key = enterEntry("/", "pop");
    rememberScroll(); // saves window.scroll* (0, 0 in this DOM)
    expect(restoreScroll(key)).toBe(true);
    expect(restoreScroll("nope")).toBe(false);
    expect(restoreScroll(null)).toBe(false);
  });

  test("navigation stamps keys on the entries it creates", async () => {
    await mount();
    const home = history.state.afwKey;
    expect(typeof home).toBe("string");
    await navigate("/a");
    expect(history.state.afwKey).not.toBe(home);
  });
});

describe("view transitions", () => {
  test("off by default", async () => {
    await mount();
    await navigate("/a");
    expect(transitions).toBe(0);
  });

  test("with viewTransitions, client navigations run inside one; the first paint does not", async () => {
    const app = await mount({ viewTransitions: true });
    expect(transitions).toBe(0);
    await navigate("/a");
    expect(transitions).toBe(1);
    expect(app.textContent).toBe("a");
  });

  test("skipped when the user prefers reduced motion", async () => {
    globalThis.matchMedia = (q) => ({ matches: q.includes("reduce") });
    await mount({ viewTransitions: true });
    await navigate("/a");
    expect(transitions).toBe(0);
  });

  test("skipped when the browser has no View Transitions API", async () => {
    document.startViewTransition = undefined;
    const app = await mount({ viewTransitions: true });
    await navigate("/a");
    expect(app.textContent).toBe("a");
  });
});
