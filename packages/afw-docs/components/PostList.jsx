// The blog index listing: renders a PostCard per post. Pass the list from
// `@opentf/afw-docs/posts`:
//
//   import { posts } from "@opentf/afw-docs/posts";
//   <PostList posts={posts} />
import PostCard from "./PostCard.jsx";

// The newest post leads as a full-width hero card and the rest follow as compact rows.
// `featured={false}` lists every post the same way.
export default function PostList(props) {
  const posts = props.posts || [];
  const featured = props.featured !== false && posts.length > 0;
  const rest = featured ? posts.slice(1) : posts;
  return (
    <div class="afwd-post-list">
      {posts.length ? null : <p class="afwd-post-empty">No posts yet.</p>}
      {featured ? <PostCard post={posts[0]} featured /> : null}
      {rest.length ? (
        <div class="afwd-post-rows">
          {rest.map((post) => <PostCard post={post} />)}
        </div>
      ) : null}
    </div>
  );
}
