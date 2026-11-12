import { describe, expect, test } from "runtime:test";

import { prerender } from "../index.js";
import { memoryHost } from "./memory-host.js";

const SHELL = `<html><head><title>Shell</title></head><body><div id="app" data-afw-hydrate></div></body></html>`;

function fakeRender({ paths, skipped = [], homeDescription = "Home desc", layoutDescription = "Site desc", notFoundPage = true } = {}) {
  return {
    async collectRoutePaths() {
      return { paths, skipped };
    },
    async renderRoute(url, params, search, { data } = {}) {
      if (url === "/__afw_404__") return notFoundPage ? { html: "<h1>404</h1>", metadata: {}, hydration: "" } : null;
      const description = url === "/" ? (homeDescription ?? undefined) : undefined;
      return { html: `<p>${url}${data ? ` ${JSON.stringify(data)}` : ""}</p>`, metadata: { title: url, description }, hydration: "", status: 200 };
    },
    renderHead(meta) {
      return `<title>${meta.title ?? ""}</title>${meta.robots ? `<meta name="robots" content="${meta.robots}">` : ""}`;
    },
    async resolveMetadata() {
      return { description: layoutDescription };
    },
  };
}

const loaders = (byRoute) => ({
  match: (url) => (byRoute[url.replace(/^\/fr(?=\/|$)/, "") || "/"] !== undefined ? { url } : null),
  async loadSerialized(m) {
    const value = byRoute[m.url.replace(/^\/fr(?=\/|$)/, "") || "/"];
    if (value === "notFound") throw Object.assign(new Error("nf"), { afwNotFound: true });
    return { data: value, json: value === undefined ? "" : JSON.stringify(value) };
  },
});

describe("prerender", () => {
  test("writes each page, loader data, 404, sitemap and robots", async () => {
    const host = memoryHost({});
    const result = await prerender(host, {
      render: fakeRender({ paths: [{ path: "/", params: {}, route: "/" }, { path: "/todos", params: {}, route: "/todos" }] }),
      shellHtml: SHELL, outDir: "/out", publicDir: "/public", baseUrl: "https://x.test",
      loaders: loaders({ "/todos": { n: 1 } }), lastUpdated: { "/todos": "2026-01-01" },
    });
    expect(result).toEqual({ count: 2, skipped: [], failed: [], siteDescription: "Home desc", paths: ["/", "/todos"] });
    expect(host.files.get("/out/index.html")).toContain('<div id="app" data-afw-hydrate="/"><p>/</p></div>');
    expect(host.files.get("/out/todos/index.html")).toContain('id="__afw_data">{"n":1}');
    expect(host.files.get("/out/todos/__data.json")).toBe('{"n":1}');
    expect(host.files.has("/out/__data.json")).toBe(false);
    expect(host.files.get("/out/404.html")).toContain('<meta name="robots" content="noindex">');
    expect(host.files.get("/out/sitemap.xml")).toContain("<loc>https://x.test/todos</loc><lastmod>2026-01-01</lastmod>");
    expect(host.files.get("/out/robots.txt")).toContain("Sitemap: https://x.test/sitemap.xml");
  });

  test("renders every locale, decoding generated segments for static hosts", async () => {
    const host = memoryHost({});
    await prerender(host, {
      render: fakeRender({ paths: [{ path: "/", params: {}, route: "/" }, { path: "/p/a%20b", params: { id: "a b" }, route: "/p/[id]" }] }),
      shellHtml: SHELL, outDir: "/out", publicDir: "/public", i18n: { locales: ["en", "fr"] },
    });
    expect([...host.files.keys()].filter((k) => k.endsWith(".html")).sort()).toEqual([
      "/out/404.html", "/out/fr/index.html", "/out/fr/p/a b/index.html", "/out/index.html", "/out/p/a b/index.html",
    ]);
    expect(host.files.get("/out/fr/index.html")).toContain('<html lang="fr">');
  });

  test("a loader's notFound() fails that path; the rest still render", async () => {
    const host = memoryHost({});
    const result = await prerender(host, {
      render: fakeRender({ paths: [{ path: "/gone", params: {}, route: "/gone" }, { path: "/ok", params: {}, route: "/ok" }] }),
      shellHtml: SHELL, outDir: "/out", publicDir: "/public", loaders: loaders({ "/gone": "notFound" }),
    });
    expect(result.failed).toEqual(["/gone"]);
    expect(result.count).toBe(1);
    expect(host.files.has("/out/gone/index.html")).toBe(false);
  });

  test("public/ overrides the sitemap and robots; no site URL skips the sitemap", async () => {
    const host = memoryHost({ "/public/robots.txt": "custom" });
    await prerender(host, {
      render: fakeRender({ paths: [{ path: "/", params: {}, route: "/" }], homeDescription: null, notFoundPage: false }),
      shellHtml: SHELL, outDir: "/out", publicDir: "/public",
    });
    expect(host.files.has("/out/sitemap.xml")).toBe(false);
    expect(host.files.has("/out/robots.txt")).toBe(false);
    expect(host.files.has("/out/404.html")).toBe(false);
  });

  test("the site description falls back to the root layout's metadata", async () => {
    const result = await prerender(memoryHost({}), {
      render: fakeRender({ paths: [{ path: "/", params: {}, route: "/" }], homeDescription: null }),
      shellHtml: SHELL, outDir: "/out", publicDir: "/public",
    });
    expect(result.siteDescription).toBe("Site desc");
  });
});

describe("partial prerender", () => {
  test("only the given routes are written, without 404, sitemap or robots", async () => {
    const host = memoryHost({});
    const result = await prerender(host, {
      render: fakeRender({
        paths: [{ path: "/", params: {}, route: "/" }, { path: "/about", params: {}, route: "/about" }, { path: "/terms", params: {}, route: "/(legal)/terms" }],
        skipped: ["/posts/[slug]", "/admin/[id]"],
      }),
      shellHtml: SHELL, outDir: "/out", publicDir: "/public", baseUrl: "https://x.test",
      routes: new Set(["/about", "/(legal)/terms", "/posts/[slug]"]),
    });
    expect(result.paths).toEqual(["/about", "/terms"]);
    expect(result.skipped).toEqual(["/posts/[slug]"]);
    expect(host.files.has("/out/index.html")).toBe(false);
    expect(host.files.has("/out/about/index.html")).toBe(true);
    expect(host.files.has("/out/terms/index.html")).toBe(true);
    for (const f of ["/out/404.html", "/out/sitemap.xml", "/out/robots.txt"]) expect(host.files.has(f)).toBe(false);
  });
});
