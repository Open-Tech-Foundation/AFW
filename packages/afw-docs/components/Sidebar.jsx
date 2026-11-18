// Documentation sidebar — renders the build-time nav tree (from
// `@opentf/afw-docs/nav`). Static content (crawlable with JS off); the active link
// updates reactively in SidebarNode.
//
// On desktop it is the sticky left column of the docs grid. On mobile (< 768px) the
// same element becomes an off-canvas drawer: hidden off-screen, slid in over a
// backdrop. The drawer is opened by the navbar hamburger, which lives in a different
// component (and, on the website, a different layout), so the two are coupled the same
// way Search/SearchTrigger are — through a global toggle installed here:
//
//   • `window.__afwToggleSidebar()` / `__afwCloseSidebar()` — called by the burger.
//   • `document.documentElement[data-afw-has-sidebar]` — set while a Sidebar is
//     mounted, so the burger shows only on pages that actually have one.
//   • a `afw:sidebar` CustomEvent (`{ open }`) — lets the burger mirror `aria-expanded`.
//
// The drawer closes on navigation, Escape, backdrop click, its close button, or a viewport
// resize up to the desktop breakpoint. While it is a drawer it is a dialog (`role`,
// `aria-label`); while open it is modal: `aria-modal`, the rest of the page `inert`, focus
// moved to its close button and given back to the opener on close. Scroll stays in the
// drawer through `overscroll-behavior`, not by locking the page's overflow.
//
// Above the tree sits a single icon button that collapses (or re-expands) every group at
// once — it drives the nodes through the shared `collapseAll` signal, since they are
// rendered recursively by SidebarNode.
//
// Size: the tree comes from the cached nav module (nav-source.js), not from props, and
// each node is given only its position; its links are plain `<a>`s whose clicks and
// prefetch this component handles once for the whole tree. A large tree opens only the
// branch holding the current page. So a page's sidebar costs its open branch, not the site.

import { navigate, onMount, prefetch, router, shouldInterceptNav } from "@opentf/afw";

import SidebarNode from "./SidebarNode.jsx";
import NavbarLink from "./NavbarLink.jsx";
import { EXPAND_ALL_LIMIT, countLinks, sectionTree } from "./nav-source.js";
import { collapseAll } from "./sidebar-collapse.js";

// A sidebar link this event concerns: an `<a href>` inside the tree.
const linkOf = (event) => event.target?.closest?.(".afwd-sidebar-nav a[href]");

// Client-side navigation for the tree's links, as `<Link>` does for one: modified or
// non-primary clicks, other origins, and full-page (MPA) mode are left to the browser.
function onNavClick(event) {
  const link = linkOf(event);
  if (!link) return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  if (link.target && link.target !== "_self") return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !shouldInterceptNav()) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}

// Warm the route on hover or focus, as `<Link>`'s default "intent" prefetch does.
function onNavIntent(event) {
  const link = linkOf(event);
  if (!link || !shouldInterceptNav()) return;
  const url = new URL(link.href, location.href);
  if (url.origin === location.origin) prefetch(url.pathname + url.search);
}

const DESKTOP_QUERY = "(min-width: 768px)";

// How many Sidebars are mounted right now. On SPA navigation a new section's Sidebar can
// mount *before* the old one unmounts, so the burger's `data-afw-has-sidebar` flag must
// be reference-counted — otherwise the departing instance's cleanup would clear the flag
// the arriving instance just set, and the burger would vanish after navigating.
let liveSidebars = 0;

export default function Sidebar(props) {
  const nav = sectionTree(props.nav, router.pathname);
  // Given a `nav` prop, the nodes take their items as props; otherwise they look them up.
  const given = !!props.nav;
  // Top-level groups start open on a small tree; on a large one only the current branch does.
  const openTopLevel = countLinks(nav) <= EXPAND_ALL_LIMIT;
  // Top-level site links (config.nav). On desktop they live in the navbar; on mobile the
  // navbar hides them and the drawer surfaces them above the section tree, so the whole
  // nav is reachable from one place.
  const navLinks = (props.config && props.config.nav) || [];
  // The collapse-all button is only meaningful when the tree actually has groups.
  const hasGroups = nav.some((item) => item.items && item.items.length > 0);
  let open = $state(false);
  // A drawer below the desktop breakpoint; the sticky column above it (not a dialog then).
  let drawer = $state(false);
  const asideRef = $ref();
  const shellRef = $ref();
  const closeRef = $ref();

  const close = () => (open = false);
  // Stable per-instance toggle so cleanup can tell whether the global still points at us.
  const toggle = () => (open = !open);

  onMount(() => {
    const root = document.documentElement;
    liveSidebars += 1;
    root.setAttribute("data-afw-has-sidebar", "");

    // The burger (navbar) drives the drawer through these globals — same decoupling as
    // the Search modal's `__afwOpenSearch`. The latest-mounted Sidebar owns them.
    window.__afwToggleSidebar = toggle;
    window.__afwCloseSidebar = close;

    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);

    // If the viewport grows to desktop while the drawer is open, drop the drawer state
    // (CSS turns the element back into the sticky column; this releases the scroll lock
    // and resyncs the burger).
    const mql = window.matchMedia(DESKTOP_QUERY);
    drawer = !mql.matches;
    const onDesktop = (e) => {
      drawer = !e.matches;
      if (e.matches) close();
    };
    mql.addEventListener?.("change", onDesktop);

    return () => {
      window.removeEventListener("keydown", onKey);
      mql.removeEventListener?.("change", onDesktop);
      releasePage();
      root.removeAttribute("data-afw-sidebar-open");
      // Only drop the flag/globals if we're the last Sidebar and still the owner — an
      // arriving instance may already have taken over during navigation.
      liveSidebars -= 1;
      if (liveSidebars <= 0) {
        liveSidebars = 0;
        root.removeAttribute("data-afw-has-sidebar");
      }
      if (window.__afwToggleSidebar === toggle) delete window.__afwToggleSidebar;
      if (window.__afwCloseSidebar === close) delete window.__afwCloseSidebar;
    };
  });

  // Reflect open state: lock body scroll, mark the root (for styling), and notify the
  // burger so it can mirror `aria-expanded`. Reading `open` (not writing it) keeps this
  // effect free of the route/resize effects.
  // Modality for the open drawer: everything outside the drawer's shell (its panel and
  // backdrop) goes `inert` — each sibling on the way up to <body>, restored on close.
  let inerted = [];
  let opener = null;
  function holdPage() {
    const shell = shellRef;
    if (!shell || inerted.length) return;
    for (let node = shell; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling === node || sibling.inert || sibling.tagName === "SCRIPT") continue;
        sibling.inert = true;
        inerted.push(sibling);
      }
    }
  }
  function releasePage() {
    for (const el of inerted) el.inert = false;
    inerted = [];
  }

  // Reflect open state: modality, the root mark (for styling), and the burger's
  // `aria-expanded` (via `afw:sidebar`). Reading `open` (not writing it) keeps this effect
  // free of the route/resize effects.
  $effect(() => {
    const isOpen = open;
    if (typeof document === "undefined") return;
    document.documentElement.toggleAttribute("data-afw-sidebar-open", isOpen);
    if (isOpen && drawer) {
      opener = document.activeElement;
      holdPage();
      // The panel is `visibility: hidden` until its slide-in starts, and a hidden element
      // cannot take focus: move focus once it renders.
      const focusClose = () => closeRef?.focus({ preventScroll: true });
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(focusClose));
      else focusClose();
    } else if (inerted.length) {
      releasePage();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }
    window.dispatchEvent(new CustomEvent("afw:sidebar", { detail: { open: isOpen } }));
  });

  // Close on navigation — clicking a drawer link should dismiss it.
  $effect(() => {
    router.pathname; // subscribe
    close();
  });

  // Keep the active item in view. On navigation a fresh Sidebar mounts (see the
  // reference-count note above) scrolled to the top, so a deep-in-a-long-tree active link
  // would sit off-screen. When it's outside the sidebar's own scroll viewport, bring it
  // into view — adjusting only the sidebar's scrollTop, never the page's scroll.
  $effect(() => {
    router.pathname; // re-run on navigation
    if (typeof requestAnimationFrame === "undefined") return;
    // Defer a frame so the newly-active class (and any auto-expanded branch) is in the DOM.
    const raf = requestAnimationFrame(() => {
      const aside = asideRef;
      const active = aside && aside.querySelector(".afwd-sidebar-nav [aria-current=\"page\"]");
      if (!active) return;
      const a = active.getBoundingClientRect();
      const c = aside.getBoundingClientRect();
      if (a.top < c.top || a.bottom > c.bottom) {
        aside.scrollTop += a.top - c.top - (aside.clientHeight - a.height) / 2;
      }
    });
    return () => cancelAnimationFrame(raf);
  });

  return (
    <div class="afwd-sidebar-shell" ref={shellRef}>
      <div
        class={open ? "afwd-sidebar-backdrop is-open" : "afwd-sidebar-backdrop"}
        onclick={close}
        aria-hidden="true"
      ></div>
      <aside
        id="afw-sidebar"
        ref={asideRef}
        class={open ? "afwd-sidebar is-open" : "afwd-sidebar"}
        role={drawer ? "dialog" : undefined}
        aria-label={drawer ? "Navigation" : undefined}
        aria-modal={drawer && open ? "true" : undefined}
      >
        <button type="button" class="afwd-sidebar-close" ref={closeRef} onclick={close} aria-label="Close navigation">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        {navLinks.length ? (
          <nav class="afwd-drawer-links" aria-label="Site">
            {navLinks.map((link) => (
              <NavbarLink link={link} />
            ))}
          </nav>
        ) : null}
        {hasGroups ? (
          <div class="afwd-sidebar-tools">
            <button
              type="button"
              class="afwd-sidebar-collapse-all"
              onclick={() => collapseAll.set(collapseAll.collapsed)}
              aria-label={collapseAll.collapsed ? "Expand all sections" : "Collapse all sections"}
              title={collapseAll.collapsed ? "Expand all sections" : "Collapse all sections"}
            >
              {() =>
                collapseAll.collapsed ? (
                  // chevrons pointing apart — press to expand everything
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m7 9 5-5 5 5" />
                    <path d="m7 15 5 5 5-5" />
                  </svg>
                ) : (
                  // chevrons pointing together — press to collapse everything
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m7 4 5 5 5-5" />
                    <path d="m7 20 5-5 5 5" />
                  </svg>
                )
              }
            </button>
          </div>
        ) : null}
        <nav class="afwd-sidebar-nav" aria-label="Documentation" onclick={onNavClick} onpointerover={onNavIntent} onfocusin={onNavIntent}>
          <ul class="afwd-sidebar-list">
            {nav.map((item, i) => (
              <SidebarNode item={given ? item : undefined} nodeId={String(i)} open={openTopLevel} />
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
