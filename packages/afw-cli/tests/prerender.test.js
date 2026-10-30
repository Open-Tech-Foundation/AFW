import { expect, test } from "runtime:test";
import { file } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { discard, tempDir, writeTree } from "./fixture.js";
import { runPrerender } from "../src/prerender.js";

const root = dirname(dirname(dirname(dirname(fromFileURL(import.meta.url)))));

test("encoded static URLs write decoded HTML and loader files while retaining encoded canonical URLs", async () => {
  const dir = await tempDir("encoded-prerender");
  try {
    await writeTree(dir, {
      "package.json": '{"type":"module"}',
      "app/post/[slug]/page.jsx": `
export function getStaticPaths() { return [{ params: { slug: "hello world" } }, { params: { slug: "100%25" } }]; }
export function generateMetadata({ params }) { return { title: params.slug }; }
export default function Post({ params }) { return <h1>{params.slug}</h1>; }
`,
    });
    const outDir = join(dir, "dist");
    const result = await runPrerender({
      root: dir,
      pages: [join(dir, "app/post/[slug]/page.jsx")],
      afwEntry: join(root, "packages/afw/index.js"),
      afwc: join(root, "target/debug/afwc"),
      shellHtml: '<html><head></head><body><div id="app" data-afw-hydrate></div></body></html>',
      outDir, baseUrl: "https://example.com",
      loaders: {
        match(path) { return { path }; },
        async loadSerialized({ path }) { return { data: { path }, json: JSON.stringify({ path }) }; },
      },
    });
    expect(result.failed).toEqual([]);
    expect(result.count).toBe(2);
    const html = await file(join(outDir, "post/hello world/index.html")).text();
    expect(html).toContain('href="https://example.com/post/hello%20world"');
    expect(html).toContain('<title data-afw-head="">hello world</title>');
    expect(html).toContain('<div id="app" data-afw-hydrate="/post/hello%20world">');
    expect(await file(join(outDir, "post/hello world/__data.json")).json()).toEqual({ path: "/post/hello%20world" });
    expect(await file(join(outDir, "post/100%25/__data.json")).json()).toEqual({ path: "/post/100%2525" });
  } finally { await discard(dir); }
});

test("article:* tags go on articles only: og:type article or a dated page, never an index", async () => {
  const dir = await tempDir("article-tags");
  try {
    await writeTree(dir, {
      "package.json": '{"type":"module"}',
      "app/blog/page.jsx": `export const metadata = { title: "Blog" };\nexport default function Index() { return <h1>Blog</h1>; }`,
      "app/blog/post/page.jsx": `export const metadata = { title: "Post", date: "2026-10-29" };\nexport default function Post() { return <h1>Post</h1>; }`,
      "app/guide/page.jsx": `export const metadata = { title: "Guide", openGraph: { type: "article" } };\nexport default function Guide() { return <h1>Guide</h1>; }`,
    });
    const outDir = join(dir, "dist");
    const result = await runPrerender({
      root: dir,
      pages: ["app/blog/page.jsx", "app/blog/post/page.jsx", "app/guide/page.jsx"].map((p) => join(dir, p)),
      afwEntry: join(root, "packages/afw/index.js"),
      afwc: join(root, "target/debug/afwc"),
      shellHtml: '<html><head></head><body><div id="app" data-afw-hydrate></div></body></html>',
      outDir, baseUrl: "https://example.com",
      lastUpdated: { "/blog": "2026-10-30T00:00:00Z", "/blog/post": "2026-10-31T00:00:00Z", "/guide": "2026-10-01T00:00:00Z" },
    });
    expect(result.failed).toEqual([]);
    const page = (p) => file(join(outDir, p, "index.html")).text();
    const index = await page("blog");
    expect(index.includes("article:")).toBe(false);
    const post = await page("blog/post");
    expect(post).toContain('property="article:published_time" content="2026-10-29"');
    expect(post).toContain('property="article:modified_time" content="2026-10-31T00:00:00Z"');
    expect(await page("guide")).toContain('property="article:modified_time" content="2026-10-01T00:00:00Z"');
  } finally { await discard(dir); }
});

test("a page with state prerenders: the compiler's @opentf/afw/signals import resolves", async () => {
  const dir = await tempDir("signals-prerender");
  try {
    await writeTree(dir, {
      "package.json": '{"type":"module"}',
      "app/page.jsx": `export default function Home() { let n = $state(2); const d = $derived(n * 2); return <p id="n">{n} {d}</p>; }`,
    });
    const outDir = join(dir, "dist");
    const result = await runPrerender({
      root: dir,
      pages: [join(dir, "app/page.jsx")],
      afwEntry: join(root, "packages/afw/index.js"),
      afwc: join(root, "target/debug/afwc"),
      shellHtml: '<html><head></head><body><div id="app" data-afw-hydrate></div></body></html>',
      outDir, baseUrl: "https://example.com",
    });
    expect(result.failed).toEqual([]);
    expect(await file(join(outDir, "index.html")).text()).toContain('<p id="n"><!--$-->2<!--/--> <!--$-->4<!--/--></p>');
  } finally { await discard(dir); }
});
