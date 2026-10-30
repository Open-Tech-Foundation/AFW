import { expect, test } from "runtime:test";
import { join } from "runtime:path";
import { discard, tempDir, writeTree } from "../../afw-cli/tests/fixture.js";
import { blogPostsPlugin, loadPosts } from "../build/blog-posts-plugin.js";
import { renderAtomFeed, renderBlogFeed } from "../build/feed.js";

const post = (title, date, extra = "") => `---\ntitle: ${title}\ndate: ${date}\n${extra}---\n# ${title}\nPost body.`;

async function fixture() {
  const dir = await tempDir("blog-posts");
  await writeTree(dir, {
    "app/blog/[slug]/page.mdx": post("Generated post", "2026-10-03"),
    "app/blog/[...path]/page.md": post("Generated catch-all", "2026-10-03"),
    "app/blog/pinned/page.mdx": post("Pinned", "2026-01-01", "order: 0\ntags: release, docs\n"),
    "app/blog/latest/page.md": post("Latest", "2026-10-02"),
    "app/blog/older/page.mdx": post("Older", "2026-09-01"),
    "app/blog/.draft/page.mdx": post("Draft", "2026-10-03"),
    "app/blog/_private/page.mdx": post("Private", "2026-10-03"),
    "app/blog/excluded/page.mdx": post("Excluded", "2026-10-03"),
  });
  return { dir, options: { appDir: join(dir, "app"), exclude: new Set(["excluded"]) } };
}

test("blog index omits parameterized posts while retaining static metadata and ordering", async () => {
  const { dir, options } = await fixture();
  try {
    const posts = await loadPosts(options);
    expect(posts.map(post => post.path)).toEqual(["/blog/pinned", "/blog/latest", "/blog/older"]);
    expect(posts[0].tags).toEqual(["release", "docs"]);
    expect(posts[0].date).toBe("2026-01-01");
    expect(posts[0].readingTime > 0).toBe(true);
  } finally { await discard(dir); }
});

test("virtual blog cards and generated RSS/Atom feeds contain no placeholder links", async () => {
  const { dir, options } = await fixture();
  try {
    const plugin = blogPostsPlugin(options);
    const resolved = plugin.resolve.handler("@opentf/afw-docs/posts");
    const result = await plugin.load.handler(resolved.id);
    const posts = JSON.parse(result.code.split("\n")[0].replace(/^export const posts = /, "").replace(/;$/, ""));
    expect(posts.map(post => post.path)).toEqual(["/blog/pinned", "/blog/latest", "/blog/older"]);
    expect(result.dependsOn.length).toBe(3);
    expect(result.dependsOn.some(path => path.includes("["))).toBe(false);
    for (const xml of [renderBlogFeed({ posts, baseUrl: "https://example.com" }), renderAtomFeed({ posts, baseUrl: "https://example.com" })]) {
      expect(xml.includes("/blog/[")).toBe(false);
      expect(xml.includes("Generated post")).toBe(false);
      expect(xml).toContain("https://example.com/blog/latest");
    }
  } finally { await discard(dir); }
});

test("drafts and scheduled posts are left out unless asked for, and only the dev server asks", async () => {
  const dir = await tempDir("blog-drafts");
  await writeTree(dir, {
    "app/blog/live/page.mdx": post("Live", "2026-01-02", "updated: 2026-03-04\n"),
    "app/blog/wip/page.mdx": post("Work in progress", "2026-01-03", "draft: true\n"),
    "app/blog/soon/page.mdx": post("Soon", "2999-01-01"),
  });
  const appDir = join(dir, "app");
  try {
    const live = await loadPosts({ appDir });
    expect(live.map((p) => p.slug)).toEqual(["live"]);
    // `updated` is the frontmatter's own date, never git's.
    expect(live[0].updated).toBe("2026-03-04");
    const all = await loadPosts({ appDir, drafts: true });
    expect(all.map((p) => p.slug)).toEqual(["soon", "wip", "live"]);
    expect(all.filter((p) => p.draft).map((p) => p.slug)).toEqual(["soon", "wip"]);

    const plugin = blogPostsPlugin({ appDir });
    const load = async (command) => {
      const result = await plugin.load.handler(plugin.resolve.handler("@opentf/afw-docs/posts").id, { command });
      return JSON.parse(result.code.split("\n")[0].replace(/^export const posts = /, "").replace(/;$/, ""));
    };
    expect((await load("build")).length).toBe(1);
    expect((await load("start")).length).toBe(3);
  } finally { await discard(dir); }
});
