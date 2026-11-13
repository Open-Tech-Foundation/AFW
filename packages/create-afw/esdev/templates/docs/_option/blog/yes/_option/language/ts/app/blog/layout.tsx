import { BlogLayout } from "@opentf/afw-docs";
import { posts } from "@opentf/afw-docs/posts";
import config from "../../afw.config.js";

export default function Blog({ children }: { children: unknown }) {
  return <BlogLayout config={config.docs} posts={posts} siteUrl={config.site.url}>{children}</BlogLayout>;
}
