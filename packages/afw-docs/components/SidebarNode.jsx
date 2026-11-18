// One node of the sidebar tree — a link, a collapsible group, or both. Recurses into
// `item.items`. Groups with children get a chevron toggle; the branch containing the
// active route stays open, and top-level groups start expanded unless the Sidebar says the
// tree is large (`open={false}`, past EXPAND_ALL_LIMIT links), where only the active branch
// does. A closed group renders no
// children: they are built in the browser, from the cached nav module, when it opens.
// Open/closed state is per-session only (no persistence) — a reload resets to this
// derived default.
//
// The node's only prop is its position (`nodeId`); it looks its item up in the section
// tree (nav-source.js), so the page's hydration payload holds no tree. Given an `item`
// prop (the Sidebar was given a `nav`), it uses that instead. Links are plain `<a>`s:
// the Sidebar routes their clicks.
//
// The sidebar's "collapse all" button drives every node at once through the shared
// `collapseAll` signal (components/sidebar-collapse.js).

import { localizePath, router } from "@opentf/afw";

import { nodeAt, sectionTree } from "./nav-source.js";
import { collapseAll } from "./sidebar-collapse.js";

// True when `path` is `node` itself or lives somewhere in its subtree.
function treeContainsPath(node, path) {
  if (!node) return false;
  if (node.path === path) return true;
  if (!node.items || !node.items.length) return false;
  return node.items.some((child) => treeContainsPath(child, path));
}

export default function SidebarNode(props) {
  // Deterministic position path ("0", "0-2", "0-2-1") — unique and identical on
  // server/client, so the aria-controls id is collision-free and hydration-safe.
  const nodeId = props.nodeId || "0";
  const given = !!props.item;
  const tree = given ? null : sectionTree(undefined, router.pathname);
  const item = props.item || nodeAt(tree, nodeId) || {};
  const depth = nodeId.split("-").length - 1;
  const hasChildren = item.items && item.items.length > 0;
  const panelId = `afw-nav-${nodeId}`;
  // `open` (top-level nodes only): the Sidebar's call — false on a large tree, where only
  // the branch holding the current page starts open.
  const openTopLevel = props.open !== false;

  const containsActive = () => treeContainsPath(item, router.pathname);
  let expanded = $state(hasChildren && (containsActive() || (depth === 0 && openTopLevel)));

  // Re-open the branch that holds the active route whenever navigation enters it.
  $effect(() => {
    if (hasChildren && containsActive()) expanded = true;
  });

  // Follow the sidebar's "collapse all" / "expand all" button. A press collapses *every*
  // group, the active branch included — otherwise, reading a page inside the only open
  // branch, the press would visibly change nothing. Navigation under a standing
  // collapse-all is the other case: there the branch holding the new route opens, exactly
  // as it does without the button. Deciding both here (rather than leaning on the effect
  // above) keeps the two independent of the order they run in.
  // A command already standing when this node is created isn't a press — it's the tree
  // being rebuilt under one.
  let seenSeq = collapseAll.command ? collapseAll.command.seq : 0;
  $effect(() => {
    const cmd = collapseAll.command;
    if (!hasChildren || !cmd) return;
    const isPress = cmd.seq !== seenSeq;
    seenSeq = cmd.seq;
    expanded = cmd.expanded || (!isPress && containsActive());
  });

  const toggle = () => (expanded = !expanded);
  // The current page: `aria-current="page"` (the styling hook), plus the legacy class.
  const isCurrent = () => router.pathname === item.path;
  const current = () => (isCurrent() ? "page" : undefined);
  const linkClass = () => (isCurrent() ? "afwd-sidebar-link afwd-active" : "afwd-sidebar-link");
  const chevronClass = () =>
    expanded ? "afwd-sidebar-chevron is-open" : "afwd-sidebar-chevron";

  return (
    <li class={hasChildren ? "afwd-sidebar-node afwd-sidebar-group" : "afwd-sidebar-node"}>
      {hasChildren ? (
        item.path ? (
          // Group that is also a page: leading chevron toggles, the link navigates.
          // Chevron on the left mirrors the label-only groups below (no leading dot —
          // the chevron already marks the row).
          <div class="afwd-sidebar-group-row">
            <button
              type="button"
              class="afwd-sidebar-group-toggle afwd-sidebar-group-toggle--icon"
              aria-expanded={expanded ? "true" : "false"}
              aria-controls={panelId}
              aria-label={expanded ? `Collapse ${item.title}` : `Expand ${item.title}`}
              onclick={toggle}
            >
              <svg
                class={chevronClass()}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <a href={localizePath(item.path)} class={linkClass()} aria-current={current()}>
              {item.title}
            </a>
          </div>
        ) : (
          // Section title with no page of its own — the whole row toggles.
          <button
            type="button"
            class="afwd-sidebar-group-toggle"
            aria-expanded={expanded ? "true" : "false"}
            aria-controls={panelId}
            onclick={toggle}
          >
            <svg
              class={chevronClass()}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span class="afwd-sidebar-group-label">{item.title}</span>
          </button>
        )
      ) : item.path ? (
        <a href={localizePath(item.path)} class={linkClass()} aria-current={current()}>
          <span class="afwd-sidebar-dot" aria-hidden="true"></span>
          {item.title}
        </a>
      ) : (
        <span class="afwd-sidebar-group-title">{item.title}</span>
      )}
      {hasChildren && expanded ? (
        <ul id={panelId} class="afwd-sidebar-sublist">
          {item.items.map((child, i) => (
            <SidebarNode item={given ? child : undefined} nodeId={`${nodeId}-${i}`} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
