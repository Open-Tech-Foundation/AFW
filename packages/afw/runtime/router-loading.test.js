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

describe("layout errors", () => {
  const root = ({ children }) => {
    const main = document.createElement("main");
    main.id = "root";
    main.append(children);
    return main;
  };
  const dash = ({ children }) => {
    const aside = document.createElement("aside");
    aside.id = "dash";
    aside.textContent = "dash shell ";
    aside.append(children);
    return aside;
  };
  const named = (name) => ({ error, retry }) => {
    const p = document.createElement("p");
    p.id = `${name}-error`;
    p.textContent = `${name}: ${error.message}`;
    p.onclick = retry;
    return p;
  };
  const shell = (extra = {}) => ({
    "/p/app/layout.jsx": { default: root },
    "/p/app/error.jsx": { default: named("root") },
    "/p/app/dash/layout.jsx": { default: dash },
    "/p/app/dash/error.jsx": { default: named("dash") },
    "/p/app/dash/page.jsx": { default: view("dash page", "section") },
    ...extra,
  });

  test("a layout that throws is replaced by the error.jsx above it, inside the layouts above", async () => {
    const app = await mount(shell({ "/p/app/dash/layout.jsx": { default: () => { throw new Error("shell broke"); } } }));
    await navigate("/dash");
    expect(app.querySelector("#root #root-error").textContent).toBe("root: shell broke");
    expect(app.querySelector("#dash-error")).toBe(null); // not the error.jsx inside the broken layout
  });

  test("a failed layout loader shows the error.jsx above that layout; retry loads it again", async () => {
    let fail = true;
    globalThis.fetch = async () => (fail ? json({ error: "Internal Server Error", layout: "/dash" }, 500) : json({ user: "ada" }));
    const app = await mount(shell(), ["/dash"]);
    await navigate("/dash");
    expect(app.querySelector("#root #root-error").textContent).toContain("failed (500)");
    expect(app.querySelector("#dash")).toBe(null);
    fail = false;
    app.querySelector("#root-error").click();
    await tick();
    await tick();
    expect(app.querySelector("#dash").textContent).toBe("dash shell dash page");
  });

  test("a page loader failure under the same layout still uses the page's error.jsx", async () => {
    globalThis.fetch = async () => json({ error: "Internal Server Error" }, 500);
    const app = await mount(shell(), ["/dash"]);
    await navigate("/dash");
    expect(app.querySelector("#dash #dash-error")).not.toBe(null);
  });

  test("an unhandled error inside a layout replaces that layout with the error.jsx above it", async () => {
    const app = await mount(shell());
    await navigate("/dash");
    handleError(app.querySelector("#dash"), new Error("widget in shell crashed"));
    await tick();
    expect(app.querySelector("#root #root-error").textContent).toBe("root: widget in shell crashed");
    expect(app.querySelector("#dash")).toBe(null);
  });

  test("an error in the root layout has nothing above it: reported, not replaced", async () => {
    const app = await mount(shell());
    await navigate("/dash");
    handleError(app.querySelector("#root"), new Error("navbar crashed"));
    await tick();
    expect(app.querySelector("#root-error")).toBe(null);
    expect(app.querySelector("#dash section").textContent).toBe("dash page");
  });

  test("a server-rendered layout-loader error hydrates the error view above that layout", async () => {
    const app = document.createElement("div");
    app.setAttribute("data-afw-hydrate", "");
    app.innerHTML = "<main id=\"root\"><p id=\"root-error\">root: Something went wrong</p></main>";
    document.body.appendChild(app);
    const data = document.createElement("script");
    data.type = "application/json";
    data.id = "__afw_data";
    data.textContent = JSON.stringify({ __afwRouteError: { status: 500, message: "Something went wrong", layout: "/dash" } });
    document.body.appendChild(data);
    let props;
    window.history.replaceState({}, "", "/dash");
    const pages = shell({ "/p/app/error.jsx": { default: (p) => ((props = p), named("root")(p)) } });
    mountApp({ pages: { "/p/app/page.jsx": { default: view("home") }, ...pages }, target: app, loaders: ["/dash"] });
    await tick();
    await tick();
    expect(props.error.afwLayoutRoute).toBe("/dash");
    expect(app.querySelector("#root #root-error").textContent).toBe("root: Something went wrong");
    expect(app.querySelector("#dash")).toBe(null);
  });
});

describe("route groups and optional segments in the client router", () => {
  const shell = (id) => ({ children }) => {
    const el = document.createElement("div");
    el.id = id;
    el.append(children);
    return el;
  };

  test("a grouped page renders at its URL inside its group's layout, with its group's error.jsx", async () => {
    const app = await mount({
      "/p/app/(marketing)/layout.jsx": { default: shell("marketing") },
      "/p/app/(marketing)/pricing/page.jsx": { default: view("pricing") },
      "/p/app/(app)/layout.jsx": { default: shell("app-shell") },
      "/p/app/(app)/error.jsx": { default: errorView },
      "/p/app/(app)/dashboard/page.jsx": { default: () => { throw new Error("dash broke"); } },
    });
    await navigate("/pricing");
    expect(app.querySelector("#marketing").textContent).toBe("pricing");
    expect(app.querySelector("#app-shell")).toBe(null);
    await navigate("/dashboard");
    expect(app.querySelector("#app-shell #error").textContent).toBe("error: dash broke");
  });

  test("an optional segment page answers both URLs", async () => {
    let seen;
    const app = await mount({ "/p/app/[[lang]]/docs/page.jsx": { default: ({ params }) => ((seen = params.lang), view("docs")()) } });
    await navigate("/docs");
    expect(seen).toBe(undefined);
    await navigate("/fr/docs");
    expect(seen).toBe("fr");
    expect(app.textContent).toBe("docs");
  });
});
