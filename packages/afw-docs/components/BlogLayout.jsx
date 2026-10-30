// Blog section layout. Wraps both the index (`/blog`) and individual posts
// (`/blog/<slug>`). It identifies the current page by matching `router.pathname`
// against the post list (from `@opentf/afw-docs/posts`):
//
//   import BlogLayout from "@opentf/afw-docs"; // BlogLayout
//   import { posts } from "@opentf/afw-docs/posts";
//   import config from "../../afw.config.js";
//   export default function (props) {
//     return <BlogLayout config={config.docs} posts={posts} frame={false}>{props.children}</BlogLayout>;
//   }
//
// On a post it renders the PostBanner (from the post's frontmatter) above the prose
// body, plus a reusable "On this page" TOC; on the index it just renders the children
// (typically a <PostList/>). `frame` (default true) adds the navbar/footer chrome;
// pass `frame={false}` when nesting inside a site layout that already provides them.
//
// The layout factory re-runs on every navigation (the router rebuilds the route +
// layout chain), so reading `router.pathname` resolves to the page being shown.
import { Link, RawHtml, router } from "@opentf/afw";

import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import Toc from "./Toc.jsx";
import PostBanner from "./PostBanner.jsx";
import FeedLinks from "./FeedLinks.jsx";
import { editedAfterPublish } from "./post-dates.js";

// Structured data for crawlers: the current post as a BlogPosting, emitted in
// the body (JSON-LD is discovered wherever it sits). `siteUrl` (optional site
// origin) absolutizes the post/cover URLs. Fields the post lacks are omitted.
function blogPostingJsonLd(post, siteUrl, dateModified) {
  const base = (siteUrl || "").replace(/\/+$/, "");
  const abs = (p) => (p ? base + p : undefined);
  const article = { "@context": "https://schema.org", "@type": "BlogPosting" };
  if (post.title) article.headline = post.title;
  if (post.description) article.description = post.description;
  if (post.path) article.url = abs(post.path) || post.path;
  if (post.cover) article.image = abs(post.cover) || post.cover;
  if (post.date) article.datePublished = post.date;
  if (dateModified) article.dateModified = dateModified;
  if (post.author) article.author = { "@type": "Person", name: post.author };
  const json = JSON.stringify(article).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

export default function BlogLayout(props) {
  const config = props.config || {};
  const posts = props.posts || [];
  const frame = props.frame !== false;
  const indexPath = props.indexPath || "/blog";
  const siteUrl = props.siteUrl || "";
  // Subscribe links on the index and under each post; `feeds={false}` turns them off.
  const feeds = props.feeds !== false;

  const post = posts.find((p) => p.path === router.pathname);
  // The post's own frontmatter `updated`, shown in the banner. Never git: see blog-posts-plugin.js.
  const editedIso = post && editedAfterPublish(post.updated, post.date) ? post.updated : null;

  const body = post ? (
    <div class="afwd-blog afwd-blog-post">
      {/* `afw-content` so the shared Toc can read this article's headings. */}
      <main id="afw-content" class="afwd-blog-main" data-afw-search-body>
        {/* Give blog posts a search breadcrumb too (docs get theirs from <Breadcrumbs>),
            so a result looks the same whether it's a doc or a post. Inline `key:value`
            syntax sets the meta literally, independent of visible text. */}
        <span data-afw-search-meta="breadcrumb:Blog" hidden></span>
        <Link href={indexPath} class="afwd-blog-back" data-afw-search-ignore>
          ← {config.title ? `${config.title} Blog` : "Blog"}
        </Link>
        <PostBanner post={post} showUpdated />
        <RawHtml html={blogPostingJsonLd(post, siteUrl, editedIso || post.date)} />
        <article class="afwd-prose">{props.children}</article>
        {feeds ? <FeedLinks base={indexPath} variant="inline" /> : null}
      </main>
      <Toc />
    </div>
  ) : (
    <div class="afwd-blog afwd-blog-index">
      <main class="afwd-blog-main">
        {feeds ? <FeedLinks base={indexPath} /> : null}
        {props.children}
      </main>
    </div>
  );

  return frame ? (
    <div class="afwd-shell">
      <Navbar config={config} />
      <div class="afwd-shell-body">{body}</div>
      <Footer config={config} />
    </div>
  ) : (
    body
  );
}
