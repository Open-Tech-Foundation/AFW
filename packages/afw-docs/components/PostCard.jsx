// One post in the blog index: a link to the post with its meta + title + excerpt.
import { Link } from "@opentf/afw";
import PostMeta from "./PostMeta.jsx";

export default function PostCard(props) {
  const post = props.post;
  return (
    <Link href={post.path} class={post.cover ? "afwd-post-card afwd-has-cover" : "afwd-post-card"}>
      {post.cover ? (
        <img class="afwd-post-card-cover" src={post.cover} alt={post.title} loading="lazy" />
      ) : null}
      <div class="afwd-post-card-body">
        <PostMeta post={post} />
        <div class="afwd-post-card-title">{post.title}</div>
        {post.description ? <p class="afwd-post-card-desc">{post.description}</p> : null}
      </div>
    </Link>
  );
}
