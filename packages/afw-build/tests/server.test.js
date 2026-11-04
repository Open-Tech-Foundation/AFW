import { describe, expect, test } from "runtime:test";

import { discoverServerFiles, hasServerFiles, serverConflicts, serverModule } from "../index.js";
import { memoryHost } from "./memory-host.js";

const app = (files) => memoryHost(Object.fromEntries(Object.entries(files).map(([p, c]) => [`/site/app/${p}`, c])));

describe("discoverServerFiles", () => {
  test("finds routes, middleware and loaders, sorted, skipping excluded folders", async () => {
    const host = app({
      "api/users/[id]/route.ts": "", "api/route.js": "", "_middleware.js": "", "admin/_middleware.ts": "",
      "todos/loader.js": "", "todos/page.jsx": "", "drafts/api/route.js": "", "Button.jsx": "",
    });
    const files = await discoverServerFiles(host, "/site/app", { exclude: ["drafts"] });
    expect(files.routes).toEqual(["/site/app/api/route.js", "/site/app/api/users/[id]/route.ts"]);
    expect(files.middleware).toEqual(["/site/app/_middleware.js", "/site/app/admin/_middleware.ts"]);
    expect(files.loaders).toEqual(["/site/app/todos/loader.js"]);
    expect(hasServerFiles(files)).toBe(true);
    expect(hasServerFiles(await discoverServerFiles(app({ "page.jsx": "" }), "/site/app"))).toBe(false);
  });
});

describe("serverConflicts", () => {
  test("a page and a route in one folder, and loaders without a page", async () => {
    const host = app({
      "about/page.jsx": "", "about/route.js": "", "orphan/loader.js": "", "api/x/route.js": "", "api/x/loader.ts": "",
      "ok/page.md": "", "ok/loader.js": "",
    });
    const problems = serverConflicts(host, "/site/app", await discoverServerFiles(host, "/site/app"));
    expect(problems.length).toBe(3);
    expect(problems[0]).toContain("a page and an API route answer /about");
    expect(problems.some((p) => p.includes("orphan/loader.js has no sibling page.*"))).toBe(true);
    expect(problems.some((p) => p.includes("api/x/loader.ts sits next to a route.* API endpoint"))).toBe(true);
  });
});

describe("serverModule", () => {
  test("imports every server file and composes the handler", async () => {
    const host = app({ "api/hello/route.js": "", "_middleware.js": "", "todos/page.jsx": "", "todos/loader.js": "", "loader.ts": "", "page.jsx": "" });
    const { code, files } = await serverModule(host, "/site/app", { i18n: { locales: ["en", "fr"] } });
    expect(code).toContain('import * as r0 from "/site/app/api/hello/route.js";');
    expect(code).toContain('import * as m0 from "/site/app/_middleware.js";');
    expect(code).toContain('import * as l1 from "/site/app/todos/loader.js";');
    expect(code).toContain('const options = {"appDir":"/site/app","i18n":{"locales":["en","fr"],"defaultLocale":"en"}};');
    expect(code).toContain('export const loaderRoutes = ["/","/todos"];');
    expect(code).toContain("export function createHandler({ files, renderPage, fallback } = {})");
    expect(files.length).toBe(4);
  });

  test("an app with no server files still yields a working module", async () => {
    const { code, files } = await serverModule(app({ "page.jsx": "" }), "/site/app");
    expect(code).toContain("const routeModules = {\n\n};");
    expect(files).toEqual([]);
  });

  test("with pages, registers every route file and exports the renderer", async () => {
    const host = app({ "page.jsx": "", "layout.jsx": "", "404.jsx": "", "blog/page.md": "---\ndraft: true\n---", "api/route.js": "" });
    const { code, files } = await serverModule(host, "/site/app", { pages: true, drafts: false, i18n: { locales: ["en", "fr"] } });
    expect(code).toContain('import * as p0 from "/site/app/404.jsx";');
    expect(code).toContain('["/app/layout.jsx"]: p1,');
    expect(code).not.toContain("blog/page.md");
    expect(code).toContain("configureI18n(options.i18n);");
    expect(code).toContain("export function createPageRenderer({ shell: html, baseUrl = \"\" })");
    expect(code).toContain("const shell = stampHydrateSentinel(html);");
    expect(code).toContain('import { renderDocument, stampHydrateSentinel } from "@opentf/afw-build/document";');
    expect(files).toContain("/site/app/page.jsx");
    const plain = await serverModule(host, "/site/app");
    expect(plain.code).not.toContain("createPageRenderer");
    expect(plain.code).not.toContain("registerRoutes");
  });

  test("a layout conflict is an error", async () => {
    await expect(serverModule(app({ "page.jsx": "", "route.js": "" }), "/site/app")).rejects.toThrow("a page and an API route answer /:");
  });
});
