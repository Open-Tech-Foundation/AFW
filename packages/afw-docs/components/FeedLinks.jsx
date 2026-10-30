// Subscribe links for a blog's RSS and Atom feeds (`<base>/rss.xml`, `<base>/atom.xml`,
// written by the release build). Plain anchors, not <Link>: a feed is a file for the
// browser or a reader app, not a route the client router can render.
//
// `variant="icons"` (the index) shows an icon and the format name per feed;
// `variant="inline"` (a post's foot) is a one-line "Subscribe: RSS · Atom".

const FEEDS = [
  { file: "rss.xml", label: "RSS", type: "application/rss+xml" },
  { file: "atom.xml", label: "Atom", type: "application/atom+xml" },
];

function FeedIcon() {
  return (
    <svg class="afwd-feed-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
      <circle cx="5" cy="19" r="2.2" />
      <path d="M3 10.5v3a7.5 7.5 0 0 1 7.5 7.5h3A10.5 10.5 0 0 0 3 10.5Z" />
      <path d="M3 3.5v3A14.5 14.5 0 0 1 17.5 21h3A17.5 17.5 0 0 0 3 3.5Z" />
    </svg>
  );
}

export default function FeedLinks(props) {
  const base = (props.base || "/blog").replace(/\/+$/, "");
  return props.variant === "inline" ? (
    <p class="afwd-feed-inline">
      Subscribe:{" "}
      <a href={`${base}/rss.xml`} type="application/rss+xml">RSS</a>
      {" · "}
      <a href={`${base}/atom.xml`} type="application/atom+xml">Atom</a>
    </p>
  ) : (
    <nav class="afwd-feed-links" aria-label="Subscribe">
      {FEEDS.map((feed) => (
        <a
          class="afwd-feed-link"
          href={`${base}/${feed.file}`}
          type={feed.type}
          aria-label={`Subscribe via ${feed.label}`}
        >
          <FeedIcon />
          <span>{feed.label}</span>
        </a>
      ))}
    </nav>
  );
}
