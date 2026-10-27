// The blog index listing: renders a PostCard per post. Pass the list from
// `@opentf/afw-docs/posts`:
//
//   import { posts } from "@opentf/afw-docs/posts";
//   <PostList posts={posts} />
import PostCard from "./PostCard.jsx";

export default function PostList(props) {
  const posts = props.posts || [];
  return (
    <div class="afwd-post-list">
      {posts.length
        ? posts.map((post) => <PostCard post={post} />)
        : <p class="afwd-post-empty">No posts yet.</p>}
    </div>
  );
}
