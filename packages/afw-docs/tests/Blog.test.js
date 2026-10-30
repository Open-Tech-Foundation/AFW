// Blog index and post header: the newest post leads as a hero card, a card reads title →
// excerpt → meta, decorative images stay out of the accessible name, and a post's banner
// shows its frontmatter `updated` date only when that is a later day than `date`.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import PostList from "../components/PostList.jsx";
import PostBanner from "../components/PostBanner.jsx";
import FeedLinks from "../components/FeedLinks.jsx";
import BlogLayout from "../components/BlogLayout.jsx";
import { setRouteState } from "@opentf/afw";

const POSTS = [
  { slug: "new", path: "/blog/new", title: "Newest", description: "Fresh.", date: "2026-10-29", author: "Ada", authorAvatar: "/a.svg", cover: "/c.svg", readingTime: 8 },
  { slug: "old", path: "/blog/old", title: "Older", description: "Earlier.", date: "2026-09-01", cover: "/d.svg", readingTime: 3 },
  { slug: "plain", path: "/blog/plain", title: "Plain", date: "2026-08-01", readingTime: 1 },
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PostList", () => {
  test("the newest post is the hero; the rest are rows", async () => {
    const view = render(PostList, { posts: POSTS });
    await tick();
    const cards = [...view.container.querySelectorAll(".afwd-post-card")];
    expect(cards.length).toBe(3);
    expect(cards[0].classList.contains("afwd-post-card-featured")).toBe(true);
    expect(cards[0].closest(".afwd-post-rows")).toBe(null);
    expect(cards.slice(1).every((c) => c.closest(".afwd-post-rows"))).toBe(true);
    expect(cards[0].querySelector("img").getAttribute("loading")).toBe("eager");
  });

  test("featured={false} lists every post as a row", async () => {
    const view = render(PostList, { posts: POSTS, featured: false });
    await tick();
    expect(view.container.querySelector(".afwd-post-card-featured")).toBe(null);
    expect(view.container.querySelectorAll(".afwd-post-rows .afwd-post-card").length).toBe(3);
  });

  test("a card reads title, excerpt, then the meta row, with decorative images", async () => {
    const view = render(PostList, { posts: POSTS });
    await tick();
    const body = view.container.querySelector(".afwd-post-card-body");
    const [title, desc, meta] = body.children;
    expect([title.className, desc.className]).toEqual(["afwd-post-card-title", "afwd-post-card-desc"]);
    // The third child is the <PostMeta> host, holding the meta row.
    expect(meta.querySelector(".afwd-post-meta")).not.toBe(null);
    expect(body.children.length).toBe(3);
    expect(body.firstElementChild.tagName).toBe("H2");
    for (const img of view.container.querySelectorAll("img")) expect(img.getAttribute("alt")).toBe("");
  });

  test("no posts says so", async () => {
    const view = render(PostList, { posts: [] });
    await tick();
    expect(view.container.textContent).toContain("No posts yet.");
  });
});

describe("PostBanner", () => {
  test("shows the updated date when it is a later day than publication", async () => {
    const view = render(PostBanner, { post: { ...POSTS[0], updated: "2026-10-30" }, showUpdated: true });
    await tick();
    const updated = view.container.querySelector(".afwd-post-updated time");
    expect(updated.getAttribute("datetime")).toBe("2026-10-30");
    expect(updated.textContent).toBe("October 30, 2026");
  });

  test("hides it on the publication day, without `showUpdated`, and with no update", async () => {
    for (const props of [
      { post: { ...POSTS[0], updated: "2026-10-29" }, showUpdated: true },
      { post: { ...POSTS[0], updated: "2026-10-30" } },
      { post: POSTS[0], showUpdated: true },
    ]) {
      const view = render(PostBanner, props);
      await tick();
      expect(view.container.querySelector(".afwd-post-updated")).toBe(null);
    }
  });

  test("marks a draft the dev server is showing", async () => {
    const view = render(PostBanner, { post: { ...POSTS[0], draft: true } });
    await tick();
    expect(view.container.querySelector(".afwd-post-draft").textContent).toBe("Draft");
  });
});

describe("FeedLinks", () => {
  test("icon links to both feeds under the base, as plain anchors with accessible names", async () => {
    const view = render(FeedLinks, { base: "/news/" });
    await tick();
    const nav = view.container.querySelector("nav.afwd-feed-links");
    expect(nav.getAttribute("aria-label")).toBe("Subscribe");
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/news/rss.xml", "/news/atom.xml"]);
    expect(links.map((a) => a.getAttribute("type"))).toEqual(["application/rss+xml", "application/atom+xml"]);
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Subscribe via RSS", "Subscribe via Atom"]);
    expect(links.every((a) => a.querySelector("svg[aria-hidden='true']"))).toBe(true);
    expect(view.container.querySelector("afw-link")).toBe(null);
  });

  test("the inline variant is one subscribe line, defaulting to /blog", async () => {
    const view = render(FeedLinks, { variant: "inline" });
    await tick();
    const line = view.container.querySelector("p.afwd-feed-inline");
    expect(line.textContent.replace(/\s+/g, " ").trim()).toBe("Subscribe: RSS · Atom");
    expect([...line.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/blog/rss.xml", "/blog/atom.xml"]);
  });
});

describe("BlogLayout structured data", () => {
  test("a post's BlogPosting names the site as publisher and the page as its main entity", async () => {
    setRouteState({ pathname: "/blog/new" });
    const view = render(BlogLayout, {
      posts: POSTS, frame: false, siteUrl: "https://example.com",
      config: { title: "Example", logo: "/logo.svg" },
    });
    await tick();
    const ld = JSON.parse(view.container.querySelector('script[type="application/ld+json"]').textContent);
    expect(ld.publisher).toEqual({ "@type": "Organization", name: "Example", logo: { "@type": "ImageObject", url: "https://example.com/logo.svg" } });
    expect(ld.mainEntityOfPage).toEqual({ "@type": "WebPage", "@id": "https://example.com/blog/new" });
    expect(ld.image).toBe("https://example.com/c.svg");
    // The index carries the subscribe icons; the post carries the inline line.
    expect(view.container.querySelector(".afwd-feed-inline")).not.toBe(null);
    setRouteState({ pathname: "/" });
  });
});
