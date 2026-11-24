// Client-side navigation for the kit's own links, with the rules <Link> uses: modified
// clicks (new tab, download), other buttons, `target`, other origins and MPA mode stay
// with the browser. The kit renders plain <a> so `aria-current` can follow the route.

import { router, shouldInterceptNav } from "@opentf/afw";

/** A click handler for an in-app `<a href>`. */
export function navigateOnClick(event) {
  const a = event.currentTarget;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!a?.href || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
  if (new URL(a.href).origin !== location.origin || !shouldInterceptNav()) return;
  event.preventDefault();
  router.push(a.getAttribute("href"));
}

/** Whether `href` is the current page: the same path, or (unless `exact`) an ancestor of it. */
export function isCurrentPath(pathname, href, exact = false) {
  if (!href || pathname == null) return false;
  const clean = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const path = clean(pathname);
  const target = clean(href.split(/[?#]/)[0]);
  if (path === target) return true;
  return !exact && target !== "/" && path.startsWith(`${target}/`);
}
