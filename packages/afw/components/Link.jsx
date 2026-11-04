// <Link href> — client-side (SPA) navigation.
//
// A *pure JSX component*, shipped as source and compiled by the consuming app's
// pipeline (like a UI library ships components for the user's bundler). The
// framework dogfoods its own JSX → Custom Element model here instead of a
// hand-written HTMLElement class — so it gets reactive props, the children slot,
// and a matching SSG renderer for free, with no separate runtime build step.
//
// `class` is a declared prop, so it lands on the rendered <a> (the link), not on
// the <afw-link> host — no duplicated styling.

import { onMount } from "../runtime/lifecycle.js";
import { localizePath, navigate, prefetch, shouldInterceptNav } from "../runtime/router.js";

// `prefetch`: "intent" (default) warms the route on hover, focus or touch; "viewport"
// when the link scrolls into view; `false` / "none" never.
const prefetchMode = (value) =>
  value === false || value === "false" || value === "none" ? "none" : value === "viewport" ? "viewport" : "intent";

export default function Link(props) {
  const href = props.href;
  const className = props.class;
  const reload = props.reload;
  // Keep the link in the active locale (no-op when i18n is off). Locale is a
  // per-load constant under URL-prefix routing, so resolving it once here is
  // correct — a navigation that changes the locale rebuilds this component.
  const target = localizePath(href);
  // `reload` (a bare attribute → "") forces a full-page navigation for this link.
  // Absent resolves to null (getAttribute), so use loose `!= null` to treat only a
  // present, non-false value as opting out.
  const forceReload = reload != null && reload !== false;
  const ariaLabel = props["aria-label"] || props.ariaLabel;
  const ariaCurrent = props["aria-current"] || props.ariaCurrent;
  const mode = prefetchMode(props.prefetch);
  const canPrefetch = () => mode !== "none" && !forceReload && shouldInterceptNav();
  const warm = () => {
    if (canPrefetch()) prefetch(target);
  };
  let anchor = $ref();
  onMount(() => {
    if (mode !== "viewport" || typeof IntersectionObserver === "undefined" || !anchor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        warm();
      }
    });
    observer.observe(anchor);
    return () => observer.disconnect();
  });

  const onclick = (e) => {
    // Let the browser handle modified clicks (new tab, etc.) and non-primary buttons.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    // Full-page navigation when this link opts out (`reload`) or the app runs in MPA
    // mode (docs/HYDRATION.md §7) — leave the click to the browser.
    if (forceReload || !shouldInterceptNav()) {
      return;
    }
    e.preventDefault();
    navigate(target);
  };

  return (
    <a
      href={target}
      class={className}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      onclick={onclick}
      onpointerenter={mode === "intent" ? warm : undefined}
      onfocus={mode === "intent" ? warm : undefined}
      ontouchstart={mode === "intent" ? warm : undefined}
      ref={anchor}
    >
      {props.children}
    </a>
  );
}
