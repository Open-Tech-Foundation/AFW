// Navigation: SideNav, PageHeader, Breadcrumbs, Pagination.
//
//   <SideNav label="Main">
//     <SideNavItem href="/">Overview</SideNavItem>
//     <SideNavGroup label="Projects">
//       <SideNavItem href="/projects">All projects</SideNavItem>
//       <SideNavItem href="/projects/archived">Archived</SideNavItem>
//     </SideNavGroup>
//   </SideNav>
//
//   <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects", href: "/projects" }, { label: "Atlas", href: "/projects/atlas" }]} />
//   <PageHeader title="Atlas" description="Shipping dashboard"><Button>Share</Button></PageHeader>
//   <Pagination page={page} pageCount={12} onPageChange={(p) => (page = p)} />
//
// Links are plain <a> (they work without script and open in a new tab) and navigate on the
// client like <Link>. The current page is `aria-current="page"`, from the router's path,
// on the server and after every client navigation.

import { localizePath, router } from "@opentf/afw";
import { isCurrentPath, navigateOnClick } from "../internal/navigate.js";
import { Heading } from "./Typography.jsx";

export function SideNav({ label = "Main", children, ...rest }) {
  return (
    <nav {...rest} class={["afw-ui-sidenav", rest.class]} aria-label={label}>
      <ul class="afw-ui-sidenav-list">{children}</ul>
    </nav>
  );
}

// `exact`: current only on this path, not on pages below it (use for "/" and overviews).
export function SideNavItem({ href, exact = false, children, ...rest }) {
  const current = $derived(isCurrentPath(router.pathname, href, exact));
  return (
    <li class="afw-ui-sidenav-entry">
      <a
        {...rest}
        href={localizePath(href)}
        class={["afw-ui-sidenav-item", rest.class]}
        aria-current={current ? "page" : undefined}
        onclick={navigateOnClick}
      >
        {children}
      </a>
    </li>
  );
}

// A collapsible group on <details>; it opens itself when it holds the current page.
export function SideNavGroup({ label, open = false, children, ...rest }) {
  const details = $ref();
  $effect(() => {
    router.pathname; // re-check after each navigation
    if (details) queueMicrotask(() => details.querySelector('[aria-current="page"]') && (details.open = true));
  });
  return (
    <li class="afw-ui-sidenav-entry">
      <details {...rest} ref={details} class={["afw-ui-sidenav-group", rest.class]} open={open || undefined}>
        <summary class="afw-ui-sidenav-group-label">{label}</summary>
        <ul class="afw-ui-sidenav-list">{children}</ul>
      </details>
    </li>
  );
}

// The page's title row: heading, an optional description, and actions (its children).
export function PageHeader({ title, description, children, ...rest }) {
  return (
    <div {...rest} class={["afw-ui-page-header", rest.class]}>
      <div class="afw-ui-page-header-text">
        <Heading level={1} size="2xl" class="afw-ui-page-title">
          {title}
        </Heading>
        {description ? <p class="afw-ui-page-description">{description}</p> : null}
      </div>
      <div class="afw-ui-page-actions">{children}</div>
    </div>
  );
}

// `items`: `{ label, href }` from the root to the current page (the last item). Separators
// are drawn by CSS and hidden from screen readers.
export function Breadcrumbs({ items = [], label = "Breadcrumbs", ...rest }) {
  return (
    <nav {...rest} class={["afw-ui-breadcrumbs", rest.class]} aria-label={label}>
      <ol class="afw-ui-breadcrumbs-list">
        {items.map((item, i) => (
          <li key={item.href ?? i} class="afw-ui-breadcrumbs-item">
            <a
              href={localizePath(item.href)}
              class="afw-ui-breadcrumbs-link"
              aria-current={i === items.length - 1 ? "page" : undefined}
              onclick={navigateOnClick}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The page numbers to show around `page` of `count`, `siblings` either side, with the
 * first and last always present and `"…"` for each gap: `[1, "…", 4, 5, 6, "…", 12]`.
 */
export function pageRange(page, count, siblings = 1) {
  if (count <= 0) return [];
  const pages = new Set([1, count]);
  for (let p = page - siblings; p <= page + siblings; p++) if (p >= 1 && p <= count) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0) {
      const gap = p - sorted[i - 1];
      if (gap === 2) out.push(p - 1); // one hidden page: show it instead of "…"
      else if (gap > 2) out.push("…");
    }
    out.push(p);
  });
  return out;
}

// With `href(page)` the pages are links (a crawlable, shareable URL per page); otherwise
// buttons that call `onPageChange(page)`.
export function Pagination({
  page = 1,
  pageCount = 1,
  onPageChange,
  href,
  siblings = 1,
  label = "Pagination",
  previousLabel = "Previous",
  nextLabel = "Next",
  pageLabel = (p) => `Page ${p}`,
  ...rest
}) {
  const items = $derived(pageRange(page, pageCount, siblings));
  const go = (p) => (e) => {
    if (href) navigateOnClick(e);
    else onPageChange?.(p);
  };
  const control = (p, text, extra) =>
    href ? (
      <a
        href={p == null ? undefined : localizePath(href(p))}
        class="afw-ui-pagination-link"
        aria-disabled={p == null ? "true" : undefined}
        aria-current={extra === "current" ? "page" : undefined}
        aria-label={extra === "current" || extra === "page" ? pageLabel(p) : undefined}
        onclick={p == null ? undefined : go(p)}
      >
        {text}
      </a>
    ) : (
      <button
        type="button"
        class="afw-ui-pagination-link"
        disabled={p == null || undefined}
        aria-current={extra === "current" ? "page" : undefined}
        aria-label={extra === "current" || extra === "page" ? pageLabel(p) : undefined}
        onclick={p == null ? undefined : go(p)}
      >
        {text}
      </button>
    );
  return (
    <nav {...rest} class={["afw-ui-pagination", rest.class]} aria-label={label}>
      <ul class="afw-ui-pagination-list">
        <li class="afw-ui-pagination-prev">{control(page > 1 ? page - 1 : null, previousLabel)}</li>
        {items.map((p, i) => (
          <li key={`${p}-${i}`}>
            {p === "…" ? (
              <span class="afw-ui-pagination-gap" aria-hidden="true">
                …
              </span>
            ) : (
              control(p, String(p), p === page ? "current" : "page")
            )}
          </li>
        ))}
        <li class="afw-ui-pagination-next">{control(page < pageCount ? page + 1 : null, nextLabel)}</li>
      </ul>
    </nav>
  );
}
