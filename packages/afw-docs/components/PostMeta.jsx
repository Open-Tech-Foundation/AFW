// A post's metadata row: date · author · reading time. Pass a post record (from
// `@opentf/afw-docs/posts`) as `post`, or the fields directly. Missing fields are
// omitted. Used in both the post banner and the index cards.
import ReadingTime from "./ReadingTime.jsx";
import { formatDate } from "./format.js";

export default function PostMeta(props) {
  const post = props.post || props;
  return (
    <div class="afwd-post-meta">
      {post.author ? (
        <span class="afwd-post-author">
          {post.authorAvatar ? (
            <img class="afwd-post-avatar" src={post.authorAvatar} alt={post.author} loading="lazy" />
          ) : null}
          <span class="afwd-post-author-name">{post.author}</span>
          {post.authorRole ? <span class="afwd-post-author-role">{post.authorRole}</span> : null}
        </span>
      ) : null}
      {post.date ? (
        <time class="afwd-post-date" datetime={String(post.date)}>
          {formatDate(post.date)}
        </time>
      ) : null}
      {post.readingTime ? <ReadingTime minutes={post.readingTime} /> : null}
    </div>
  );
}
