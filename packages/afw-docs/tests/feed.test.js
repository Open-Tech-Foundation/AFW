import { describe, expect, test } from "../../afw-cli/tests/harness.js";

import { postContentHtml, renderAtomFeed, renderBlogFeed } from "../build/feed.js";

const posts = [
  {
    path: "/blog/hello",
    title: "Hello <World>",
    description: "News & notes",
    date: "2026-07-02",
    author: "Ada",
    tags: ["release", "docs"],
  },
];

describe("renderBlogFeed", () => {
  test("renders RSS with an absolute self link and escaped post metadata", () => {
    const xml = renderBlogFeed({
      posts,
      baseUrl: "https://example.com/",
      feedPath: "/blog/rss.xml",
      channel: { title: "Example Blog", description: "Updates", link: "/blog" },
    });

    expect(xml).toContain(`<rss version="2.0"`);
    expect(xml).toContain(`<atom:link href="https://example.com/blog/rss.xml" rel="self" type="application/rss+xml"/>`);
    expect(xml).toContain(`<title>Hello &lt;World&gt;</title>`);
    expect(xml).toContain(`<description>News &amp; notes</description>`);
    expect(xml).toContain(`<category>release</category>`);
  });
});

describe("renderAtomFeed", () => {
  test("renders Atom entries with absolute links, ISO dates, and escaped metadata", () => {
    const xml = renderAtomFeed({
      posts,
      baseUrl: "https://example.com/",
      feedPath: "/blog/atom.xml",
      channel: { title: "Example Blog", description: "Updates", link: "/blog" },
    });

    expect(xml).toContain(`<feed xmlns="http://www.w3.org/2005/Atom">`);
    expect(xml).toContain(`<link href="https://example.com/blog/atom.xml" rel="self" type="application/atom+xml"/>`);
    expect(xml).toContain(`<link href="https://example.com/blog/hello"/>`);
    expect(xml).toContain(`<title>Hello &lt;World&gt;</title>`);
    expect(xml).toContain(`<summary>News &amp; notes</summary>`);
    expect(xml).toContain(`<published>2026-07-02T00:00:00.000Z</published>`);
    expect(xml).toContain(`<author><name>Ada</name></author>`);
    expect(xml).toContain(`<category term="docs"/>`);
  });
});

for (const [name, render, tag] of [
  ["RSS", renderBlogFeed, "lastBuildDate"],
  ["Atom", renderAtomFeed, "updated"],
]) {
  const feedTimestamp = xml => Date.parse(xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))[1]);
  describe(`${name} feed timestamps`, () => {
    test("uses the newest post date while retaining pinned item order and individual dates", () => {
      const pinned = Object.freeze([
        Object.freeze({ path: "/blog/pinned", title: "Pinned", date: "2026-01-01", order: 0 }),
        Object.freeze({ path: "/blog/latest", title: "Latest", date: "2026-10-02" }),
        Object.freeze({ path: "/blog/older", title: "Older", date: "2026-09-01" }),
      ]);
      const xml = render({ posts: pinned, baseUrl: "https://example.com" });
      expect(feedTimestamp(xml)).toBe(Date.parse("2026-10-02T00:00:00Z"));
      expect(xml.indexOf("<title>Pinned</title>") < xml.indexOf("<title>Latest</title>")).toBe(true);
      expect(xml).toContain(name === "RSS"
        ? "<pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>"
        : "<published>2026-01-01T00:00:00.000Z</published>");
    });

    test("ignores invalid and missing dates when later posts supply valid dates", () => {
      const xml = render({ posts: [
        { path: "/blog/invalid", title: "Invalid", date: "not-a-date" },
        { path: "/blog/undated", title: "Undated" },
        { path: "/blog/latest", title: "Latest", date: "2026-10-02" },
        { path: "/blog/older", title: "Older", date: "2026-09-01" },
      ], baseUrl: "https://example.com" });
      expect(feedTimestamp(xml)).toBe(Date.parse("2026-10-02T00:00:00Z"));
    });

    test("compares dates by their absolute instants across time zones", () => {
      const xml = render({ posts: [
        { path: "/blog/earlier", title: "Earlier", date: "2026-10-03T00:30:00+14:00" },
        { path: "/blog/later", title: "Later", date: "2026-10-02T23:00:00-02:00" },
      ], baseUrl: "https://example.com" });
      expect(feedTimestamp(xml)).toBe(Date.parse("2026-10-03T01:00:00Z"));
    });

    test("falls back to generation time when the feed has no valid dates", () => {
      for (const entries of [[], [{ path: "/blog/undated", title: "Undated" }, { path: "/blog/invalid", title: "Invalid", date: "invalid" }]]) {
        const before = Math.floor(Date.now() / 1000) * 1000;
        const timestamp = feedTimestamp(render({ posts: entries, baseUrl: "https://example.com" }));
        expect(timestamp >= before && timestamp <= Date.now()).toBe(true);
      }
    });
  });
}

describe("full post content", () => {
  const page = `<html><body><main><article class="afwd-prose"><!--c[x--><p>Hi <a href="/docs">docs</a> <a href="//cdn.example/x">cdn</a></p>` +
    `<div class="afw-code"><button class="afw-copy">Copy</button><pre>a ]]> b</pre></div><script>x()</script><img src="/a.png"></article></main></body></html>`;

  test("postContentHtml keeps the prose, drops live-page parts and absolutizes root links", () => {
    const html = postContentHtml(page, "https://example.com/", "/cover.png");
    expect(html.startsWith('<p><img src="https://example.com/cover.png" alt=""></p>')).toBe(true);
    expect(html).toContain('<a href="https://example.com/docs">');
    expect(html).toContain('<a href="//cdn.example/x">');
    expect(html).toContain('<img src="https://example.com/a.png">');
    for (const gone of ["<!--", "<button", "<script"]) expect(html.includes(gone)).toBe(false);
    expect(postContentHtml("<p>no article</p>", "https://example.com")).toBe("");
  });

  test("RSS carries it as content:encoded and Atom as html content; language is passed through", () => {
    const content = postContentHtml(page, "https://example.com");
    const entry = [{ ...posts[0], content, updated: "2026-07-05" }];
    const rss = renderBlogFeed({ posts: entry, baseUrl: "https://example.com", channel: { language: "ta" } });
    expect(rss).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"');
    expect(rss).toContain("<content:encoded><![CDATA[");
    // A `]]>` in the post cannot end the CDATA section early.
    expect(rss).toContain("a ]]]]><![CDATA[> b");
    expect(rss).toContain("<language>ta</language>");
    const atom = renderAtomFeed({ posts: entry, baseUrl: "https://example.com" });
    expect(atom).toContain('<content type="html">&lt;p&gt;Hi');
    expect(atom).toContain("<updated>2026-07-05T00:00:00.000Z</updated>");
  });
});
