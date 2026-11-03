import { PostList } from "@opentf/afw-docs";
import { posts } from "@opentf/afw-docs/posts";

export default function BlogIndex() {
  return (
    <section>
      <h1>Blog</h1>
      <PostList posts={posts} />
    </section>
  );
}
