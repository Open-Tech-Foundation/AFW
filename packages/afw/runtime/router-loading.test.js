// `loading.jsx` and `error.jsx`: the nearest of each wraps a route's page. Loading
// shows while a navigation waits (after LOADING_DELAY) and while the page's resources
// load; error replaces the page when its loader fails, it throws, or an error inside
// it reaches no <ErrorBoundary>.

import { afterEach, beforeEach, describe, expect, test } from "runtime:test";

import { onError } from "../core/errors.js";
import "./error-boundary.js";
import { handleError } from "./error-boundary.js";
import "./pending.js";
import { resource } from "./resource.js";
import { LOADING_DELAY, mountApp, navigate, nearestRouteFile, registerRoutes, routes, setRouteData } from "./router.js";
import { __resetInlineRouteData } from "./route-data.js";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const realFetch = globalThis.fetch;
let quiet;

const view = (text, tag = "p") => () => {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
};
const layout = ({ children }) => {
  const main = document.createElement("main");
  main.id = "layout";
  main.append(children);
  return main;
};
const errorView = ({ error, retry }) => {
  const p = document.createElement("p");
  p.id = "error";
  p.textContent = `error: ${error.message}`;
  p.onclick = retry;
  return p;
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
/** Visible text of the app: what a shadow root's slots actually display. */
function shownText(root) {
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) return out.push(node.textContent);
    if (node.nodeType !== 1) return;
    if (node.shadowRoot) {
      for (const slot of node.shadowRoot.querySelectorAll("slot")) {
        const nodes = slot.name
          ? [...node.children].filter((c) => c.slot === slot.name)
          : [...node.childNodes].filter((c) => !(c.nodeType === 1 && c.slot));
        nodes.forEach(walk);
      }
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return out.join("").trim();
}

beforeEach(() => {
  routes.pages = {};
  routes.layouts = {};
  routes.loading = {};
  routes.errors = {};
  routes.notFound = null;
  routes.loaderRoutes = new Set();
  __resetInlineRouteData();
  quiet = onError(() => {});
});

afterEach(() => {
  quiet();
  globalThis.fetch = realFetch;
  document.body.innerHTML = "";
  setRouteData(undefined);
});

async function mount(pages, loaders = []) {
  const app = document.createElement("div");
  document.body.appendChild(app);
  window.history.replaceState({}, "", "/");
  mountApp({ pages: { "/p/app/page.jsx": { default: view("home") }, ...pages }, target: app, loaders });
  await tick();
  return app;
}

describe("registration", () => {
  test("loading and error files register by folder; the nearest one applies", () => {
    registerRoutes({
      "/p/app/error.jsx": { default: errorView },
      "/p/app/dash/loading.jsx": { default: view("dash loading") },
      "/p/app/dash/page.jsx": { default: view("dash") },
    });
    expect(nearestRouteFile(routes.loading, "/dash/settings")).toBe(routes.loading["/dash"]);
    expect(nearestRouteFile(routes.loading, "/other")).toBe(null);
    expect(nearestRouteFile(routes.errors, "/dash/[id]")).toBe(routes.errors["/"]);
    expect(nearestRouteFile(routes.errors, null)).toBe(routes.errors["/"]); // the 404 page
    expect(routes.pages["/dash/loading"]).toBe(undefined); // never a page
  });

  test("a Markdown loading or error file is rejected", () => {
    expect(() => registerRoutes({ "/p/app/loading.mdx": {} })).toThrow(/Use loading.jsx/);
    expect(() => registerRoutes({ "/p/app/x/error.md": {} })).toThrow(/Use error.jsx/);
  });
});

describe("loading.jsx", () => {
  test("shows inside the layouts while a slow loader runs, then the page replaces it", async () => {
    let release;
    globalThis.fetch = () => new Promise((resolve) => (release = () => resolve(json({ n: 1 }))));
    const app = await mount({
      "/p/app/layout.jsx": { default: layout },
      "/p/app/todos/loading.jsx": { default: view("loading todos") },
      "/p/app/todos/page.jsx": { default: view("todos page") },
    }, ["/todos"]);
    const done = navigate("/todos");
    await tick(LOADING_DELAY + 30);
    expect(app.querySelector("#layout").textContent).toBe("loading todos");
    release();
    await done;
    await tick();
    expect(shownText(app)).toBe("todos page");
  });

  test("a fast navigation never shows it", async () => {
    globalThis.fetch = async () => json({ n: 1 });
    const app = await mount({
      "/p/app/todos/loading.jsx": { default: view("loading todos") },
      "/p/app/todos/page.jsx": { default: view("todos page") },
    }, ["/todos"]);
    const seen = [];
    new MutationObserver(() => seen.push(shownText(app))).observe(app, { childList: true, subtree: true });
    await navigate("/todos");
    await tick(LOADING_DELAY + 30);
    expect(seen.some((t) => t.includes("loading todos"))).toBe(false);
    expect(shownText(app)).toBe("todos page");
  });

  test("is the fallback for resources the page reads, so the page shows it until they load", async () => {
    let settle;
    const app = await mount({
      "/p/app/feed/loading.jsx": { default: view("loading feed") },
      "/p/app/feed/page.jsx": { default: () => {
        const items = resource(() => new Promise((r) => (settle = r)));
        const p = document.createElement("p");
        p.textContent = "feed";
        items.data; // read while the page builds: the route boundary waits on it
        return p;
      } },
    });
    await navigate("/feed");
    await tick(LOADING_DELAY + 30);
    expect(shownText(app)).toBe("loading feed");
    settle([1]);
    await tick();
    expect(shownText(app)).toBe("feed");
  });
});

describe("error.jsx", () => {
  test("replaces the page inside its layouts when the loader fails, and retry loads again", async () => {
    let fail = true;
    globalThis.fetch = async () => (fail ? json({ error: "down" }, 500) : json({ ok: true }));
    const app = await mount({
      "/p/app/layout.jsx": { default: layout },
      "/p/app/error.jsx": { default: errorView },
      "/p/app/todos/page.jsx": { default: view("todos page") },
    }, ["/todos"]);
    await navigate("/todos");
    expect(app.querySelector("#layout #error").textContent).toContain("failed (500)");
    fail = false;
    app.querySelector("#error").click();
    await tick();
    await tick();
    expect(app.querySelector("#layout").textContent).toBe("todos page");
  });

  test("without an error.jsx, a failed loader still renders the page without data", async () => {
    globalThis.fetch = async () => json({}, 500);
    const app = await mount({ "/p/app/todos/page.jsx": { default: view("todos page") } }, ["/todos"]);
    await navigate("/todos");
    expect(app.textContent).toBe("todos page");
  });

  test("replaces a page that throws while it builds", async () => {
    const app = await mount({
      "/p/app/error.jsx": { default: errorView },
      "/p/app/broken/page.jsx": { default: () => { throw new Error("bad render"); } },
    });
    await navigate("/broken");
    expect(app.querySelector("#error").textContent).toBe("error: bad render");
  });

  test("catches an error inside the page that no ErrorBoundary caught", async () => {
    const app = await mount({
      "/p/app/layout.jsx": { default: layout },
      "/p/app/error.jsx": { default: errorView },
      "/p/app/dash/page.jsx": { default: view("dash", "section") },
    });
    await navigate("/dash");
    handleError(app.querySelector("section"), new Error("widget crashed"));
    await tick();
    expect(app.querySelector("#layout #error").textContent).toBe("error: widget crashed");
  });

  test("leaves errors outside the page (in a layout) alone", async () => {
    const app = await mount({
      "/p/app/layout.jsx": { default: layout },
      "/p/app/error.jsx": { default: errorView },
      "/p/app/dash/page.jsx": { default: view("dash", "section") },
    });
    await navigate("/dash");
    handleError(app.querySelector("#layout"), new Error("navbar crashed"));
    await tick();
    expect(app.querySelector("#error")).toBe(null);
    expect(app.textContent).toBe("dash");
  });

  test("a resource's failed first load under loading.jsx reaches error.jsx", async () => {
    const app = await mount({
      "/p/app/error.jsx": { default: errorView },
      "/p/app/feed/loading.jsx": { default: view("loading") },
      "/p/app/feed/page.jsx": { default: () => {
        const items = resource(() => Promise.reject(new Error("feed down")));
        const p = document.createElement("p");
        p.textContent = String(items.data);
        return p;
      } },
    });
    await navigate("/feed");
    await tick();
    await tick();
    expect(app.querySelector("#error").textContent).toBe("error: feed down");
  });

  test("a server-rendered error page hydrates the error view", async () => {
    // What the server sends for a failed loader: error.jsx's HTML and the marker.
    const app = document.createElement("div");
    app.setAttribute("data-afw-hydrate", "");
    app.innerHTML = "<p id=\"error\">error: Something went wrong</p>";
    document.body.appendChild(app);
    const data = document.createElement("script");
    data.type = "application/json";
    data.id = "__afw_data";
    data.textContent = JSON.stringify({ __afwRouteError: { status: 500, message: "Something went wrong" } });
    document.body.appendChild(data);
    let props;
    window.history.replaceState({}, "", "/todos");
    mountApp({
      pages: {
        "/p/app/error.jsx": { default: (p) => ((props = p), errorView(p)) },
        "/p/app/todos/page.jsx": { default: view("todos page") },
      },
      target: app,
      loaders: ["/todos"],
    });
    await tick();
    await tick();
    expect(props.error.message).toBe("Something went wrong");
    expect(props.error.status).toBe(500);
    expect(app.textContent).toBe("error: Something went wrong");
  });
});
