// Blog section layout — the package's BlogLayout, driven by the generated post list.
// `frame={false}` because the marketing navbar/footer come from the root site layout
// (app/layout.jsx); BlogLayout renders the post banner + "On this page" TOC.
import { BlogLayout } from "@opentf/afw-docs";
import { posts } from "@opentf/afw-docs/posts";
import config from "../../afw.config.js";

// Posts are articles; the index page below overrides back to `website`.
export const metadata = {
  openGraph: { type: "article" },
};

export default function BlogLayoutRoute(props) {
  return (
    <BlogLayout config={config.docs} posts={posts} siteUrl={config.site?.url} frame={false}>
      {props.children}
    </BlogLayout>
  );
}
