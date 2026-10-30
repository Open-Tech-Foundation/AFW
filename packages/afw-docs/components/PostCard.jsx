// One post in the blog index: a link to the post with its title, excerpt and meta row. `featured` renders it as the index hero.
import { Link } from "@opentf/afw";
import PostMeta from "./PostMeta.jsx";

export default function PostCard(props) {
  const post = props.post;
  return (
    <Link
      href={post.path}
      class={"afwd-post-card" + (post.cover ? " afwd-has-cover" : "") + (props.featured ? " afwd-post-card-featured" : "")}
    >
      {post.cover ? (
        // Decorative here: the title below already names the link, so a screen reader
        // would otherwise read it twice.
        <img class="afwd-post-card-cover" src={post.cover} alt="" loading={props.featured ? "eager" : "lazy"} />
      ) : null}
      <div class="afwd-post-card-body">
        <h2 class="afwd-post-card-title">{post.title}</h2>
        {post.description ? <p class="afwd-post-card-desc">{post.description}</p> : null}
        <PostMeta post={post} />
      </div>
    </Link>
  );
}
