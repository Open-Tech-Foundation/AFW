// Prev / next page links, derived from a depth-first flatten of the nav tree.

import { Link, router } from "@opentf/afw";

export default function Pagination(props) {
  const nav = props.nav || [];

  const flat = [];
  const walk = (items) => {
    for (const it of items) {
      if (it.path) flat.push(it);
      if (it.items) walk(it.items);
    }
  };
  walk(nav);

  const adjacent = (path) => {
    const i = flat.findIndex((x) => x.path === path);
    return {
      prev: i > 0 ? flat[i - 1] : null,
      next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null,
    };
  };

  // A single reactive signal (not a `{() => …}` thunk): `pos` is in scope for the
  // hoisted branch builders, and recomputes on `router.pathname`.
  const pos = $derived(adjacent(router.pathname));

  return (
    <nav class="afw-pagination" aria-label="Pagination">
      {pos.prev ? (
        <Link href={pos.prev?.path} class="afw-page-link afw-page-prev">
          <span class="afw-page-dir">← Previous</span>
          <span class="afw-page-title">{pos.prev?.title}</span>
        </Link>
      ) : (
        <span class="afw-page-spacer" />
      )}
      {pos.next ? (
        <Link href={pos.next?.path} class="afw-page-link afw-page-next">
          <span class="afw-page-dir">Next →</span>
          <span class="afw-page-title">{pos.next?.title}</span>
        </Link>
      ) : (
        <span class="afw-page-spacer" />
      )}
    </nav>
  );
}
