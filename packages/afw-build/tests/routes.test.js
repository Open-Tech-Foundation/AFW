import { describe, expect, test } from "runtime:test";

import {
  discoverLoaders, discoverPages, isUnpublishedSource, resolveAppRoot, routeKey, routesModule,
} from "../index.js";
import { memoryHost } from "./memory-host.js";

const app = (files) => memoryHost(Object.fromEntries(Object.entries(files).map(([p, c]) => [`/site/app/${p}`, c])));

describe("discoverPages", () => {
  test("finds page, layout and 404 files in sorted order, skipping hidden and excluded folders", async () => {
    const host = app({
      "page.jsx": "", "layout.jsx": "", "404.jsx": "", "blog/[slug]/page.mdx": "", "blog/new/page.tsx": "",
      "docs/intro/page.md": "", "components/Button.jsx": "", ".hidden/page.jsx": "", "node_modules/x/page.jsx": "",
      "drafts/page.jsx": "",
    });
    expect(await discoverPages(host, "/site/app", { exclude: ["drafts"] })).toEqual([
      "/site/app/404.jsx", "/site/app/blog/[slug]/page.mdx", "/site/app/blog/new/page.tsx",
      "/site/app/docs/intro/page.md", "/site/app/layout.jsx", "/site/app/page.jsx",
    ]);
  });

  test("a Markdown 404 is an error", async () => {
    await expect(discoverPages(app({ "404.md": "" }), "/site/app")).rejects.toThrow("Unsupported Markdown 404 route");
  });

  test("finds loading and error files; Markdown ones are errors", async () => {
    const host = app({ "page.jsx": "", "error.jsx": "", "dash/loading.tsx": "", "dash/page.jsx": "" });
    expect(await discoverPages(host, "/site/app")).toEqual([
      "/site/app/dash/loading.tsx", "/site/app/dash/page.jsx", "/site/app/error.jsx", "/site/app/page.jsx",
    ]);
    await expect(discoverPages(app({ "loading.mdx": "" }), "/site/app")).rejects.toThrow("Use loading.jsx or loading.tsx");
    await expect(discoverPages(app({ "x/error.md": "" }), "/site/app")).rejects.toThrow("Use error.jsx or error.tsx");
  });

  test("drafts and scheduled pages drop out without `drafts`", async () => {
    const host = app({
      "a/page.md": "---\ndraft: true\n---\n# A", "b/page.md": "---\ndate: 2999-01-01\n---\n# B",
      "c/page.md": "---\ndate: 2000-01-01\n---\n# C", "d/page.jsx": "",
    });
    expect(await discoverPages(host, "/site/app", { drafts: false })).toEqual(["/site/app/c/page.md", "/site/app/d/page.jsx"]);
    expect((await discoverPages(host, "/site/app")).length).toBe(4);
  });
});

describe("discoverLoaders", () => {
  test("pairs routes with loader files and rejects JS/TS duplicates", async () => {
    expect(await discoverLoaders(app({ "loader.js": "", "posts/[id]/loader.ts": "" }), "/site/app")).toEqual([
      ["/", "/site/app/loader.js"], ["/posts/[id]", "/site/app/posts/[id]/loader.ts"],
    ]);
    await expect(discoverLoaders(app({ "loader.js": "", "loader.ts": "" }), "/site/app")).rejects.toThrow("Conflicting loaders for /");
  });
});

describe("routesModule", () => {
  test("generates lazy pages, loader patterns and the guard, never importing loaders", async () => {
    const host = app({ "page.jsx": "", "todos/page.jsx": "", "todos/loader.js": "SECRET", "routeGuard.js": "" });
    const { code, files } = await routesModule(host, "/site/app");
    expect(code).toContain('["/app/page.jsx"]: () => import("/site/app/page.jsx"),');
    expect(code).toContain('export const loaderRoutes = ["/todos"];');
    expect(code).toContain('export { default as guard } from "/site/app/routeGuard.js";');
    expect(code).not.toContain("loader.js");
    expect(files).toEqual(["/site/app/page.jsx", "/site/app/todos/page.jsx", "/site/app/todos/loader.js", "/site/app/routeGuard.js"]);
  });

  test("without a guard file the export is undefined", async () => {
    expect((await routesModule(app({ "page.jsx": "" }), "/site/app")).code).toContain("export const guard = undefined;");
  });
});

describe("resolveAppRoot", () => {
  test("a leaf appDir anchors beside the importing entry; a nested one at the cwd", async () => {
    const host = memoryHost({ "/repo/site/app/page.jsx": "" }, { cwd: "/repo" });
    expect(await resolveAppRoot(host, "app", "/repo/site/src/entry.js")).toBe("/repo/site/app");
    expect(await resolveAppRoot(host, "site/app", "/repo/site/entry.js")).toBe("/repo/site/app");
    expect(await resolveAppRoot(host, "app", undefined)).toBe("/repo/app");
  });
});

test("routeKey keeps the /app anchor", () => {
  expect(routeKey("/x/content/blog/page.jsx", "/x/content")).toBe("/app/blog/page.jsx");
});

test("isUnpublishedSource reads draft and date frontmatter", () => {
  expect(isUnpublishedSource("---\ndraft: true\n---")).toBe(true);
  expect(isUnpublishedSource('---\ndate: "2999-01-01"\n---')).toBe(true);
  expect(isUnpublishedSource("---\ntitle: x\n---")).toBe(false);
  expect(isUnpublishedSource("# no frontmatter")).toBe(false);
});
