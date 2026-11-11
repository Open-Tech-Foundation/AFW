import { describe, expect, test } from "runtime:test";

import { alternateLinks, localizePath, renderDocument, renderNotFound, splitLocale, stampHydrateSentinel } from "../index.js";

const SHELL = `<!doctype html><html><head><title>Shell</title></head><body><div id="app"></div></body></html>`;

// A stand-in for the server render API: echoes what it was asked to render.
function fakeRender({ notFoundPage = true } = {}) {
  const calls = [];
  return {
    calls,
    async renderRoute(url, params, search, { data, error } = {}) {
      calls.push({ url, params, search, data, error });
      if (error) {
        return { html: `<p>error: ${error.message}</p>`, metadata: { title: "Error" }, hydration: "", status: 500,
          dataJson: '{"__afwRouteError":{"status":500,"message":"Something went wrong"}}' };
      }
      if (url === "/__afw_404__" || url.startsWith("/missing")) {
        return notFoundPage ? { html: "<h1>Not found</h1>", metadata: { title: "404" }, hydration: "", status: 404 } : null;
      }
      return { html: `<h1>${url}</h1>`, metadata: { title: url, description: "d" }, hydration: '{"x":1}', status: 200 };
    },
    renderHead(meta) {
      return [`<title>${meta.title}</title>`, meta.robots ? `<meta name="robots" content="${meta.robots}">` : "",
        ...(meta.links ?? []).map((l) => `<link rel="${l.rel}" hreflang="${l.hreflang}" href="${l.href}">`)].join("");
    },
  };
}

function fakeLoaders(result) {
  return {
    match: (url) => (url.startsWith("/todos") ? { route: "/todos" } : null),
    async loadSerialized(m, ctx) {
      if (result === "notFound") throw Object.assign(new Error("nf"), { afwNotFound: true });
      if (result === "fail") throw new Error("db down");
      if (result === "redirect") throw new Response(null, { status: 302, headers: { location: "/login" } });
      return { data: { ...result, ctx: Object.keys(ctx) }, json: JSON.stringify(result) };
    },
  };
}

describe("renderDocument", () => {
  test("places markup, head, hydration props and loader data into the shell", async () => {
    const render = fakeRender();
    const doc = await renderDocument(render, {
      shell: stampHydrateSentinel(SHELL), url: "/todos", search: "?a=1", loaders: fakeLoaders({ n: 1 }),
      loaderContext: { request: {}, locals: {} },
    });
    expect(doc.status).toBe(200);
    expect(doc.loaded).toBe(true);
    expect(doc.html).toContain('<div id="app" data-afw-hydrate="/todos"><h1>/todos</h1></div>');
    expect(doc.html).toContain("<title>/todos</title>");
    expect(doc.html).not.toContain("<title>Shell</title>");
    expect(doc.html).toContain('<script type="application/json" id="__afw_h">{"x":1}</script>');
    expect(doc.html).toContain('<script type="application/json" id="__afw_data">{"n":1}</script>');
    expect(render.calls[0].data.ctx).toEqual(["query", "request", "locals"]);
    expect(render.calls[0].search).toBe("?a=1");
  });

  test("an unmatched URL renders the 404 page with status 404 and noindex", async () => {
    const doc = await renderDocument(fakeRender(), { shell: SHELL, url: "/missing" });
    expect(doc.status).toBe(404);
    expect(doc.html).toContain('<meta name="robots" content="noindex">');
  });

  test("a loader's notFound() renders the 404 page, or throws for static generation", async () => {
    const doc = await renderDocument(fakeRender(), { shell: SHELL, url: "/todos", loaders: fakeLoaders("notFound") });
    expect(doc.status).toBe(404);
    expect(doc.html).toContain("Not found");
    await expect(renderDocument(fakeRender(), { shell: SHELL, url: "/todos", loaders: fakeLoaders("notFound"), notFound: "throw" })).rejects.toThrow("nf");
  });

  test('a failed loader renders the error page with status 500 under errors: "render"', async () => {
    const render = fakeRender();
    const doc = await renderDocument(render, { shell: SHELL, url: "/todos", loaders: fakeLoaders("fail"), errors: "render" });
    expect(doc.status).toBe(500);
    expect(render.calls[0].error.message).toBe("db down");
    expect(doc.html).toContain("<p>error: db down</p>");
    expect(doc.html).toContain('<script type="application/json" id="__afw_data">{"__afwRouteError":');
  });

  test("a failed loader throws by default (static generation) and for a thrown Response", async () => {
    await expect(renderDocument(fakeRender(), { shell: SHELL, url: "/todos", loaders: fakeLoaders("fail") })).rejects.toThrow("db down");
    let thrown;
    try {
      await renderDocument(fakeRender(), { shell: SHELL, url: "/todos", loaders: fakeLoaders("redirect"), errors: "render" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof Response).toBe(true);
  });

  test("localized URLs get lang and hreflang alternates", async () => {
    const doc = await renderDocument(fakeRender(), { shell: SHELL, url: "/fr/about", i18n: { locales: ["en", "fr"] } });
    expect(doc.html).toContain('<html lang="fr">');
    expect(doc.html).toContain('<link rel="alternate" hreflang="en" href="/about">');
    expect(doc.html).toContain('<link rel="alternate" hreflang="x-default" href="/about">');
  });

  test("no page and no 404 page is null", async () => {
    expect(await renderDocument(fakeRender({ notFoundPage: false }), { shell: SHELL, url: "/missing" })).toBe(null);
    expect(await renderNotFound(fakeRender({ notFoundPage: false }), { shell: SHELL })).toBe(null);
  });
});

test("locale path helpers", () => {
  const i18n = { locales: ["en", "fr"], defaultLocale: "en" };
  expect(splitLocale("/fr/x", i18n)).toEqual({ locale: "fr", path: "/x" });
  expect(splitLocale("/fr", i18n)).toEqual({ locale: "fr", path: "/" });
  expect(splitLocale("/x", i18n)).toEqual({ locale: "en", path: "/x" });
  expect(splitLocale("/x", null)).toEqual({ locale: null, path: "/x" });
  expect(localizePath("/", "fr", "en")).toBe("/fr");
  expect(alternateLinks("/x", null)).toEqual([]);
});
