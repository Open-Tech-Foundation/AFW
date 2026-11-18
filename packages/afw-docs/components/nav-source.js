// Where the docs components get the nav tree.
//
// The tree comes from the generated `@opentf/afw-docs/nav` module: one JavaScript chunk
// the browser caches for the whole site. A component that is not given a `nav` prop looks
// its section up there, so a server-rendered page carries no copy of the tree in its
// hydration payload (it used to carry several, plus every sidebar node's subtree, which
// made each page grow with the size of the site).
//
// Sidebar nodes name their place in the tree by position ("0", "0-2", "0-2-1"), so a node's
// only prop is that id.

import navMap from "@opentf/afw-docs/nav";

/**
 * The section tree for `pathname` in a `{ [base]: tree }` map: the longest base that
 * prefixes the path ("/" matches anything). A bare array is a single section.
 */
export function pickSection(nav, pathname) {
  if (Array.isArray(nav)) return nav;
  let best = null;
  let bestLen = -1;
  for (const base in nav) {
    const match = base === "/" ? true : pathname === base || pathname.startsWith(base + "/");
    if (match && base.length > bestLen) {
      best = nav[base];
      bestLen = base.length;
    }
  }
  return best || nav[Object.keys(nav)[0]] || [];
}

/** The tree a component shows: its `nav` prop, else the generated nav's section for the path. */
export function sectionTree(nav, pathname) {
  return nav || pickSection(navMap, pathname);
}

/** The node at a position id ("0-2-1") in `tree`, or undefined. */
export function nodeAt(tree, nodeId) {
  let items = tree;
  let node;
  for (const part of String(nodeId).split("-")) {
    node = items?.[Number(part)];
    items = node?.items;
  }
  return node;
}

/**
 * A tree with more links than this starts with only the branch holding the current page
 * open; the rest are one row each until expanded. A smaller tree opens every top-level
 * group, as before.
 */
export const EXPAND_ALL_LIMIT = 150;

const counts = new WeakMap();

/** How many links (`path` entries) `tree` holds. */
export function countLinks(tree) {
  if (!Array.isArray(tree)) return 0;
  let n = counts.get(tree);
  if (n === undefined) {
    n = 0;
    for (const item of tree) n += (item.path ? 1 : 0) + countLinks(item.items);
    counts.set(tree, n);
  }
  return n;
}
