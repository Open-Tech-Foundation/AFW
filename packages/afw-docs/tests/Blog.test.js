// Blog index and post header: the newest post leads as a hero card, a card reads title →
// excerpt → meta, decorative images stay out of the accessible name, and a post's banner
// shows its frontmatter `updated` date only when that is a later day than `date`.

import { describe, expect, test } from "runtime:test";
import { render } from "@opentf/afw-test";
import PostList from "../components/PostList.jsx";
import PostBanner from "../components/PostBanner.jsx";

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
