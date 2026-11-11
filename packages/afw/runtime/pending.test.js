import { afterEach, describe, expect, test } from "runtime:test";

import { enterHost, exitHost } from "../core/context.js";
import { onError } from "../core/errors.js";
import { scope } from "../core/signals.js";
import "./error-boundary.js";
import "./pending.js";
import { enterPending, exitPending } from "./pending-scope.js";
import { resource } from "./resource.js";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** A fetcher whose runs the test settles by hand: `calls[i].resolve(v)` / `.reject(e)`. */
function deferred() {
  const calls = [];
  const fetcher = () => new Promise((resolve, reject) => calls.push({ resolve, reject }));
  return { fetcher, calls, last: () => calls[calls.length - 1] };
}

/**
 * A `<Pending>` built the way compiled code builds one: props, then the children
 * inside `enterPending`/`exitPending`, then connected.
 */
function boundary(props, build, parent = document.body) {
  const el = document.createElement("afw-internal-pending");
  Object.assign(el, props);
  enterPending(el);
  try {
    build?.(el);
  } finally {
    exitPending();
  }
  parent.appendChild(el);
  return el;
}

/** What the boundary displays: the slots in its shadow root. */
const shown = (el) => [...el.shadowRoot.querySelectorAll("slot")].map((s) => s.name || "content");

const text = (t) => {
  const p = document.createElement("p");
  p.textContent = t;
  return p;
};

afterEach(() => document.body.replaceChildren());

describe("first load", () => {
  test("shows the fallback until a resource read by the children resolves", async () => {
    const d = deferred();
    const users = resource(d.fetcher);
    const el = boundary({ fallback: text("Loading") }, (b) => b.append(text(String(users.data))));
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    expect(el.querySelector('[slot="fallback"]').textContent).toBe("Loading");
    d.last().resolve(["ada"]);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("waits on a resource created by a component inside it", async () => {
    const d = deferred();
    const el = boundary({ fallback: text("Loading") }, () => {});
    const host = el.appendChild(document.createElement("div"));
    enterHost(host);
    try {
      resource(d.fetcher);
    } finally {
      exitHost();
    }
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    d.last().resolve(1);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("waits for every resource before revealing the content", async () => {
    const a = deferred();
    const b = deferred();
    const ra = resource(a.fetcher);
    const rb = resource(b.fetcher);
    const el = boundary({ fallback: text("…") }, () => [ra.data, rb.data]);
    a.last().resolve(1);
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    b.last().resolve(2);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("with nothing to wait on, the content shows at once", async () => {
    const el = boundary({ fallback: text("…") }, (b) => b.append(text("static")));
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("a paused resource does not hold the fallback", async () => {
    const d = deferred();
    const paused = resource(() => null, d.fetcher);
    const el = boundary({ fallback: text("…") }, () => paused.data);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("nested boundaries resolve independently", async () => {
    const outerData = deferred();
    const innerData = deferred();
    const outerRes = resource(outerData.fetcher);
    const innerRes = resource(innerData.fetcher);
    let inner;
    const outer = boundary({ fallback: text("outer") }, (o) => {
      outerRes.data;
      inner = boundary({ fallback: text("inner") }, () => innerRes.data, o);
    });
    outerData.last().resolve(1);
    await tick();
    expect(shown(outer)).toEqual(["content"]);
    expect(shown(inner)).toEqual(["fallback"]);
    innerData.last().resolve(2);
    await tick();
    expect(shown(inner)).toEqual(["content"]);
  });

  test("a disposed resource stops holding the boundary", async () => {
    const d = deferred();
    const el = boundary({ fallback: text("…") }, () => {});
    const host = el.appendChild(document.createElement("div"));
    const owned = scope(() => {
      enterHost(host);
      try {
        resource(d.fetcher);
      } finally {
        exitHost();
      }
    });
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    owned.dispose();
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("a component's resource stops with the component: fetch aborted, boundary released", async () => {
    let aborted = false;
    const el = boundary({ fallback: text("…") }, () => {});
    const host = el.appendChild(document.createElement("div"));
    host._cleanups = []; // what a compiled component's connectedCallback sets up
    enterHost(host);
    try {
      resource((_, { signal }) => {
        signal.addEventListener("abort", () => (aborted = true));
        return new Promise(() => {});
      });
    } finally {
      exitHost();
    }
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    for (const dispose of host._cleanups) dispose(); // its disconnect teardown
    await tick();
    expect(aborted).toBe(true);
    expect(shown(el)).toEqual(["content"]);
  });

  test("`delay` shows nothing at first, and no fallback for a fast load", async () => {
    const d = deferred();
    const r = resource(d.fetcher);
    const el = boundary({ fallback: text("…"), delay: 40 }, () => r.data);
    await tick();
    expect(shown(el)).toEqual([]);
    d.last().resolve(1);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("`delay` shows the fallback once a slow load passes it", async () => {
    const d = deferred();
    const r = resource(d.fetcher);
    const el = boundary({ fallback: text("…"), delay: 20 }, () => r.data);
    await tick(40);
    expect(shown(el)).toEqual(["fallback"]);
    d.last().resolve(1);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });
});

describe("refetch", () => {
  async function loaded(props) {
    const d = deferred();
    const r = resource(d.fetcher);
    const el = boundary({ fallback: text("Loading"), ...props }, () => r.data);
    d.last().resolve(1);
    await tick();
    return { d, r, el };
  }

  test("keeps the content, shows `refreshing` beside it and sets data-pending", async () => {
    const { d, r, el } = await loaded({ refreshing: text("Updating") });
    r.refetch();
    await tick();
    expect(shown(el)).toEqual(["refreshing", "content"]);
    expect(el.hasAttribute("data-pending")).toBe(true);
    expect(el.querySelector('[slot="refreshing"]').textContent).toBe("Updating");
    d.last().resolve(2);
    await tick();
    expect(shown(el)).toEqual(["content"]);
    expect(el.hasAttribute("data-pending")).toBe(false);
  });

  test('`refetch="fallback"` shows the fallback again', async () => {
    const { d, r, el } = await loaded({ refetch: "fallback" });
    r.refetch();
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    expect(el.hasAttribute("data-pending")).toBe(true);
    d.last().resolve(2);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });

  test("with `delay`, a fast refetch never shows `refreshing`", async () => {
    const { d, r, el } = await loaded({ refreshing: text("Updating"), delay: 40 });
    r.refetch();
    await tick();
    expect(shown(el)).toEqual(["content"]);
    expect(el.hasAttribute("data-pending")).toBe(false);
    d.last().resolve(2);
    await tick(60);
    expect(shown(el)).toEqual(["content"]);
  });

  test("replacing a slot prop swaps its light-DOM wrapper", async () => {
    const { el } = await loaded({ refreshing: text("one") });
    el.refreshing = text("two");
    expect(el.querySelectorAll('[slot="refreshing"]')).toHaveLength(1);
    expect(el.querySelector('[slot="refreshing"]').textContent).toBe("two");
    el.refreshing = null;
    expect(el.querySelector('[slot="refreshing"]')).toBe(null);
  });
});

describe("errors", () => {
  function inErrorBoundary(build) {
    const eb = document.createElement("afw-internal-error-boundary");
    eb.fallback = (error, reset) => {
      const p = text(`failed: ${error.message}`);
      p.onclick = reset;
      return p;
    };
    build(eb);
    document.body.appendChild(eb);
    return eb;
  }

  test("a first-load failure goes to the nearest ErrorBoundary, and retry refetches", async () => {
    const off = onError(() => {}); // keep the expected report off the console
    let attempt = 0;
    const r = resource(() => (++attempt === 1 ? Promise.reject(new Error("down")) : Promise.resolve("ok")));
    let el;
    const eb = inErrorBoundary((host) => {
      el = boundary({ fallback: text("…") }, () => r.data, host);
    });
    await tick();
    expect(eb.textContent).toBe("failed: down");
    eb.firstChild.onclick();
    await tick();
    await tick();
    off();
    expect(attempt).toBe(2);
    expect(eb.contains(el)).toBe(true);
    expect(r.data).toBe("ok");
    expect(shown(el)).toEqual(["content"]);
  });

  test("a failed refetch keeps the data and is reported", async () => {
    const phases = [];
    const off = onError((error, context) => phases.push(context.phase));
    let attempt = 0;
    const r = resource(() => (++attempt === 1 ? Promise.resolve("v1") : Promise.reject(new Error("flaky"))));
    const el = boundary({ fallback: text("…") }, () => r.data);
    await tick();
    r.refetch();
    await tick();
    off();
    expect(phases).toEqual(["resource"]);
    expect(r.data).toBe("v1");
    expect(r.error.message).toBe("flaky");
    expect(shown(el)).toEqual(["content"]);
  });

  test("without an ErrorBoundary, the failure is reported and the content shows", async () => {
    const phases = [];
    const off = onError((error, context) => phases.push(context.phase));
    const r = resource(() => Promise.reject(new Error("down")));
    const el = boundary({ fallback: text("…") }, () => r.data);
    await tick();
    off();
    expect(phases).toEqual(["resource"]);
    expect(r.error.message).toBe("down");
    expect(shown(el)).toEqual(["content"]);
  });

  test('`errors: "inline"` keeps the failure on `error` only', async () => {
    const phases = [];
    const off = onError((error, context) => phases.push(context.phase));
    const r = resource(() => Promise.reject(new Error("down")), { errors: "inline" });
    const eb = inErrorBoundary((host) => boundary({ fallback: text("…") }, () => r.data, host));
    await tick();
    off();
    expect(phases).toEqual([]);
    expect(eb.textContent).not.toContain("failed");
    expect(r.error.message).toBe("down");
  });

  test("a resource outside any boundary keeps today's behavior", async () => {
    const phases = [];
    const off = onError((error, context) => phases.push(context.phase));
    const r = resource(() => Promise.reject(new Error("down")));
    await tick();
    off();
    expect(phases).toEqual([]);
    expect(r.error.message).toBe("down");
  });
});

describe("sections (the dashboard pattern)", () => {
  test("a page resource read only inside a section holds that section, not the page", async () => {
    const slow = deferred();
    const revenue = resource(slow.fetcher); // created by the page, outside any build
    let section;
    const page = boundary({ fallback: text("page loading") }, (p) => {
      p.append(text("header"));
      section = boundary({ fallback: text("chart loading") }, () => revenue.data, p);
    });
    await tick();
    expect(shown(page)).toEqual(["content"]);
    expect(shown(section)).toEqual(["fallback"]);
    slow.last().resolve(42);
    await tick();
    expect(shown(section)).toEqual(["content"]);
  });

  test("`error` shows a failed first load in the section, and retry reloads it", async () => {
    let attempt = 0;
    const r = resource(() => (++attempt === 1 ? Promise.reject(new Error("down")) : Promise.resolve("ok")));
    let retry;
    const el = boundary({
      fallback: text("loading"),
      error: (e, again) => {
        retry = again;
        return text(`section failed: ${e.message}`);
      },
    }, () => r.data);
    await tick();
    expect(shown(el)).toEqual(["error"]);
    expect(el.querySelector('[slot="error"]').textContent).toBe("section failed: down");
    retry();
    expect(el.querySelector('[slot="error"]')).toBe(null);
    await tick();
    expect(attempt).toBe(2);
    expect(r.data).toBe("ok");
    expect(shown(el)).toEqual(["content"]);
  });

  test("`error` keeps the failure from reaching an outer ErrorBoundary", async () => {
    const eb = document.createElement("afw-internal-error-boundary");
    eb.fallback = () => text("page failed");
    const r = resource(() => Promise.reject(new Error("down")));
    boundary({ fallback: text("…"), error: () => text("section failed") }, () => r.data, eb);
    document.body.appendChild(eb);
    await tick();
    expect(eb.textContent).not.toContain("page failed");
  });

  test("retry after a failed first load shows the fallback again while it reloads", async () => {
    const d = deferred();
    const r = resource(d.fetcher);
    let retry;
    const el = boundary({ fallback: text("loading"), error: (e, again) => ((retry = again), text("failed")) }, () => r.data);
    d.last().reject(new Error("down"));
    await tick();
    retry();
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    d.last().resolve(1);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });
});

describe("server-rendered boundary", () => {
  test("keeps the server fallback until its children are adopted", async () => {
    const el = document.createElement("afw-internal-pending");
    el.attachShadow({ mode: "open" }).innerHTML = '<slot name="fallback"></slot>'; // declarative root
    document.body.appendChild(el);
    await tick();
    expect(shown(el)).toEqual(["fallback"]); // nothing registered yet, but not revealed
    const d = deferred();
    const r = resource(d.fetcher);
    enterPending(el); // the page's hydrate code adopting the children
    r.data;
    exitPending();
    await tick();
    expect(shown(el)).toEqual(["fallback"]);
    d.last().resolve(1);
    await tick();
    expect(shown(el)).toEqual(["content"]);
  });
});
