// The docs and blog generators on the Vite + Node workflow: `@opentf/afw-docs/vite`
// beside `@opentf/vite-plugin-afw`, reading the same afw.config as the esdev workflow.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { promisify } from "node:util";

import { createServer } from "vite";

import { copySite, pkg } from "./helpers.mjs";

const exists = (p) => access(p).then(() => true, () => false);
const vite = join(pkg, "node_modules", "vite", "bin", "vite.js");

describe("vite build (ssg)", () => {
  let dir, cleanup, dist;
  before(async () => {
    ({ dir, cleanup } = await copySite());
    await promisify(execFile)(process.execPath, [vite, "build", "--logLevel", "error"], { cwd: dir });
    dist = join(dir, "dist");
  });
  after(() => cleanup?.());
  const read = (path) => readFile(join(dist, path), "utf8");

  test("the sidebar follows _meta and leaves drafts out", async () => {
    const page = await read("docs/index.html");
    // Hydration markers (<!--…-->) sit around the link text; read the text without them.
    const markup = page.replace(/<!--[\s\S]*?-->/g, "");
    const labels = [...markup.matchAll(/class="afwd-sidebar-link[^"]*"[^>]*>(.*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
    assert.deepEqual(labels, ["Overview", "Start here", "Advanced guide"]);
    assert.doesNotMatch(page, /Secret draft/);
    assert.ok(!(await exists(join(dist, "docs", "draft"))), "the draft page is not prerendered");
  });

  test("last-updated comes from frontmatter and reaches the page and the sitemap", async () => {
    assert.match(await read("docs/getting-started/index.html"), /datetime="2026-01-02T00:00:00\.000Z"/);
    assert.match(await read("sitemap.xml"), /getting-started<\/loc><lastmod>2026-01-02T00:00:00\.000Z/);
  });

  test("the blog lists published posts only", async () => {
    const index = await read("blog/index.html");
    assert.match(index, /Hello from Vite/);
    assert.doesNotMatch(index, /From the future/);
    assert.ok(!(await exists(join(dist, "blog", "scheduled"))));
  });

  test("RSS and Atom feeds carry full posts and every page links them", async () => {
    const rss = await read("blog/rss.xml");
    assert.match(rss, /<title>Fixture Blog<\/title>/);
    assert.match(rss, /https:\/\/docs\.example\/blog\/hello/);
    assert.match(rss, /full-content/);
    assert.match(await read("blog/atom.xml"), /<feed/);
    for (const page of ["index.html", "docs/index.html", "blog/hello/index.html"]) {
      assert.match(await read(page), /type="application\/rss\+xml"[^>]*href="\/blog\/rss\.xml"/);
    }
  });

  test("llms.txt summarizes the site with its own description", async () => {
    const llms = await read("llms.txt");
    assert.match(llms, /^# Fixture Docs/);
    assert.match(llms, /> A docs and blog site built on Vite\./);
    assert.match(llms, /https:\/\/docs\.example\/docs\/guides\/advanced/);
    assert.match(await read("llms-full.txt"), /quixotic zebra/);
  });

  test("code fences are highlighted in the page, the client bundle and the theme", async () => {
    const page = await read("docs/index.html");
    assert.match(page, /<code class="language-js"><span class="sh-keyword">const<\/span>/);
    const assets = await readdir(join(dist, "assets"));
    const js = (await Promise.all(assets.filter((f) => f.endsWith(".js")).map((f) => read(`assets/${f}`)))).join("\n");
    // The client module carries the same markup, so a page reached by client-side
    // navigation is highlighted too.
    // (The minifier may re-quote the string, so the quotes are escaped or not.)
    assert.match(js, /language-js\\?"><span class=\\?"sh-keyword\\?">const/);
    const css = (await Promise.all(assets.filter((f) => f.endsWith(".css")).map((f) => read(`assets/${f}`)))).join("\n");
    assert.match(css, /\.sh-keyword/);
    assert.match(css, /--sh-keyword/);
  });

  test("the search index is written", async () => {
    const files = await readdir(join(dist, "_search"));
    assert.ok(files.includes("manifest.json"), files.join(", "));
  });
});

describe("vite dev", () => {
  let server, dir, cleanup;
  before(async () => {
    ({ dir, cleanup } = await copySite());
    server = await createServer({ root: dir, logLevel: "silent", server: { middlewareMode: true, hmr: false } });
  });
  after(async () => {
    await server?.close();
    await cleanup?.();
  });
  const moduleCode = async (specifier) => {
    const { id } = await server.pluginContainer.resolveId(specifier, join(dir, "entry.js"));
    return (await server.transformRequest(id)).code;
  };

  test("serves the generated modules, drafts included", async () => {
    assert.match(await moduleCode("@opentf/afw-docs/nav"), /Secret draft/);
    assert.match(await moduleCode("@opentf/afw-docs/posts"), /From the future/);
    assert.match(await moduleCode("@opentf/afw-docs/updated"), /2026-01-02/);
  });

  test("a new page invalidates the navigation and reloads", async () => {
    const sent = [];
    const send = server.ws.send;
    server.ws.send = (payload) => sent.push(payload);
    try {
      await moduleCode("@opentf/afw-docs/nav");
      const file = join(dir, "app", "docs", "faq", "page.mdx");
      await mkdir(join(dir, "app", "docs", "faq"), { recursive: true });
      await writeFile(file, "---\ntitle: FAQ\n---\n\n# FAQ\n");
      server.watcher.emit("add", file);
      assert.ok(sent.length >= 1 && sent.every((m) => m.type === "full-reload"));
      assert.match(await moduleCode("@opentf/afw-docs/nav"), /"FAQ"/);
    } finally {
      server.ws.send = send;
    }
  });

  test("the dev server highlights a page's code fences", async () => {
    const page = await server.transformRequest("/app/docs/page.mdx");
    assert.match(page.code, /<span class=\\"sh-keyword\\">const<\/span>/);
  });

  test("a docs page compiles for the dev client", async () => {
    const page = await server.transformRequest("/app/docs/getting-started/page.mdx");
    assert.match(page.code, /registerHotRoute\(import\.meta\.hot/);
  });
});
