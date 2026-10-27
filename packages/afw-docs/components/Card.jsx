// A single tile in a <Cards> grid: a title, an optional description, and a link. An
// internal `href` uses SPA navigation (<Link>); an `external` href is a plain anchor.
// `desc` (prop) or children supply the body.

import { Link } from "@opentf/afw";

export default function Card(props) {
  return props.external ? (
    <a href={props.href} target="_blank" rel="noreferrer" class="afwd-card">
      <span class="afwd-card-title">{props.title}</span>
      {props.desc ? <span class="afwd-card-desc">{props.desc}</span> : null}
      {props.children}
    </a>
  ) : (
    <Link href={props.href} class="afwd-card">
      <span class="afwd-card-title">{props.title}</span>
      {props.desc ? <span class="afwd-card-desc">{props.desc}</span> : null}
      {props.children}
    </Link>
  );
}
