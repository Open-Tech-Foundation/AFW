// A blog post's header: title, optional description, and the metadata row. Rendered
// by BlogLayout above the post's prose body, driven by the post record so the MDX
// file stays pure content (no hand-written title/date in the body).
import PostMeta from "./PostMeta.jsx";

export default function PostBanner(props) {
  const post = props.post || props;
  return (
    <header class="afwd-post-banner">
      {post.cover ? (
        <img class="afwd-post-cover" src={post.cover} alt="" />
      ) : null}
      <h1 class="afwd-post-title">{post.title}</h1>
      {post.description ? <p class="afwd-post-desc">{post.description}</p> : null}
      <PostMeta post={post} showUpdated={props.showUpdated} />
      {post.tags && post.tags.length ? (
        <div class="afwd-post-tags">
          {post.tags.map((tag) => (
            <span class="afwd-post-tag">{tag}</span>
          ))}
        </div>
      ) : null}
    </header>
  );
}
