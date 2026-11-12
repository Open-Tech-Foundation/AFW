// File-based client router for the AFW runtime.
//
// Pages/layouts compile to factory functions (default export) that return a DOM
// node; `mountApp` registers a route table discovered from the filesystem (by the
// dev server / build) and renders the matching page into the app root, swapping
// it on navigation. Route state (pathname/params/query) is exposed reactively via
// the `router` facade so views can read `router.pathname` etc. inside bindings.
//
// Dynamic segments use the `[param]` / `[...rest]` folder convention (SPEC §6).
//
// NOTE: passing route params to a page via its `props` argument
// (`function Page(props) { props.params.id }`) and layout `props.children`
// composition both require signal-free page props, which the compiler does not
// emit yet — for now pages read params via the reactive `router.params`, and a
// route loader's data via the reactive `router.data` (docs/DATA.md).

import { DEV } from "../core/dev.js";
import { clearError, reportError } from "../core/errors.js";
import { signal } from "../core/signals.js";
import { getRenderContext } from "../core/render-context.js";
import { resolveMetadataModules } from "../core/metadata.js";
import { prepareRouteHead, updateRouteHead } from "./head.js";
import { beginHydration, cursor, endHydration, renderedForPath } from "./hydrate.js";
import { collectHotState, withHotCarry } from "./hot-carry.js";
import { buildScopedView, runCleanup, runMount } from "./mount.js";
import { RouteRedirect, fetchRouteData, readInlineRouteData, routeErrorFrom } from "./route-data.js";
import { enterPending, exitPending } from "./pending-scope.js";
import { setRouteErrorHandler } from "./route-errors.js";
import { enterEntry, manageScroll, rememberScroll, restoreScroll } from "./scroll.js";
import { setRouteDataRefresher } from "./invalidate.js";
import { compareRoutes, compileRoute, decodeParams, urlCollisions } from "./route-match.js";

const isBrowser = typeof window !== "undefined";

/**
 * Drop a trailing slash (except for the root "/") so `router.pathname` matches the
 * no-trailing-slash route table and nav paths regardless of how the URL was entered —
 * a static host serves `/docs/x/`, a AFW Search result links to `/docs/x/`, etc. Without
 * this, `/docs/x/` wouldn't match the `/docs/x` nav entry and the breadcrumb / active
 * sidebar link / TOC would silently blank out.
 */
const normalizePath = (p) => (p || "/").replace(/(.)\/+$/, "$1");

const state = {
  pathname: signal(isBrowser ? normalizePath(window.location.pathname) : "/"),
  searchParams: signal(new URLSearchParams(isBrowser ? window.location.search : "")),
  params: signal({}),
  locale: signal(null),
  data: signal(undefined),
  toc: signal([]),
};

export const routes = { pages: {}, layouts: {}, loading: {}, errors: {}, notFound: null, loaderRoutes: new Set() };
let guard = null;
let rootEl = null;

// Navigation mode (docs/HYDRATION.md §7): "spa" (default) lets the client router
// intercept same-origin `<Link>` clicks for reload-free nav; "mpa" leaves every
// navigation to the browser (full page load), with each page hydrating its own first
// paint. MPA is always the substrate — this only toggles the SPA enhancement on top.
let navMode = "spa";

/** Whether the client router should intercept link clicks (SPA) vs. let the browser
 *  do a full navigation (MPA). Read by `<Link>`. */
export function shouldInterceptNav() {
  return navMode === "spa";
}

// i18n: path-prefix locale routing (docs/I18N.md). The route table stays
// locale-agnostic; a leading non-default locale segment is stripped before
// matching and recorded as `router.locale`. `prefix_except_default`: the default
// locale is served at the bare path, others are prefixed (`/fr/about`).
let i18nConfig = null;

/** Register the app's locales (called by `mountApp({ i18n })`). */
export function configureI18n(cfg) {
  if (!cfg || !Array.isArray(cfg.locales) || cfg.locales.length === 0) {
    i18nConfig = null;
    return;
  }
  const defaultLocale = cfg.defaultLocale ?? cfg.locales[0];
  i18nConfig = {
    locales: cfg.locales,
    defaultLocale,
    nonDefault: new Set(cfg.locales.filter((l) => l !== defaultLocale)),
  };
  state.locale.value = defaultLocale;
}

/** The configured locales + default, or null when i18n isn't enabled. */
export function i18nLocales() {
  return i18nConfig && { locales: i18nConfig.locales, defaultLocale: i18nConfig.defaultLocale };
}

/**
 * Split a leading non-default locale segment off `pathname`, returning the active
 * `locale` and the locale-agnostic `path` to match against the route table. When
 * i18n is off, or the first segment isn't a configured non-default locale, the
 * path passes through unchanged with the default (or null) locale.
 */
export function resolveLocale(pathname) {
  const def = i18nConfig ? i18nConfig.defaultLocale : null;
  if (!i18nConfig) return { locale: def, path: pathname };
  const m = (pathname || "/").match(/^\/([^/]+)(\/.*|)$/);
  if (m && i18nConfig.nonDefault.has(m[1])) return { locale: m[1], path: m[2] || "/" };
  return { locale: def, path: pathname };
}

/**
 * Prefix `path` with `locale` (bare for the default locale). Any locale already on
 * `path` is replaced. Used by `<Link>` and programmatic navigation to keep links
 * in the active locale. Pass-through when i18n is off.
 */
export function localizePath(path, locale = router.locale) {
  if (!i18nConfig) return path;
  // Strip ANY existing locale prefix (default included, unlike `resolveLocale`
  // which keeps the canonical default bare) so a link can be re-pointed cleanly.
  const m = (path || "/").match(/^\/([^/]+)(\/.*|)$/);
  const bare = m && i18nConfig.locales.includes(m[1]) ? m[2] || "/" : path;
  if (!locale || locale === i18nConfig.defaultLocale) return bare;
  return bare === "/" ? `/${locale}` : `/${locale}${bare}`;
}

/**
 * Set the active locale directly, without navigating. The reactive `router.locale`
 * updates and any `t()`/formatter bindings re-render fine-grained. Intended for
 * previews, tests, and programmatic control — in a routed app the locale is derived
 * from the URL prefix (docs/I18N.md §2), so navigation is the normal path.
 */
export function setLocale(locale) {
  const route = getRenderContext()?.route;
  if (route) {
    route.locale = locale;
    return;
  }
  state.locale.value = locale;
}
let currentNodes = [];
// The page's part of `currentNodes` — the page node, or the route <Pending> around it —
// and the matched route pattern: where an error no <ErrorBoundary> caught may be
// replaced by the route's `error.jsx` (see `showRouteError`).
let currentRegion = null;
let currentRoute = null;

/** Opt-in `document.startViewTransition()` around client navigations (`mountApp`). */
let viewTransitions = false;
/** Has this app committed a page yet (the first paint is never a transition)? */
let committed = false;

/**
 * Run `update` (a synchronous DOM swap) inside a view transition when they are on,
 * supported, `animate` allows it (never the first paint) and the user hasn't asked
 * for reduced motion; otherwise run it directly. An error thrown by `update` is
 * rethrown either way.
 */
async function swapView(update, animate = true) {
  const supported = isBrowser && typeof document.startViewTransition === "function";
  const reduced = isBrowser && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!viewTransitions || !animate || !supported || reduced) {
    update();
    return;
  }
  let failure = null;
  const transition = document.startViewTransition(() => {
    try {
      update();
    } catch (error) {
      failure = error;
    }
  });
  // A navigation during a running transition skips it: `ready` and `finished` then
  // reject (AbortError), which is expected, not an app error.
  transition.ready?.catch(() => {});
  transition.finished?.catch(() => {});
  await transition.updateCallbackDone.catch(() => {});
  if (failure) throw failure;
}

/** Scroll a forward navigation: to its `#anchor`, or the top. */
function scrollToTarget(url) {
  const anchor = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
  if (anchor) anchor.scrollIntoView();
  else window.scrollTo(0, 0);
}

/**
 * Where a committed navigation leaves the scroll: back/forward and a reload restore
 * the position saved for the entry (falling back to its `#anchor`, else unchanged);
 * a forward navigation goes to its anchor or the top.
 */
function landScroll(url, isPop, entry) {
  if (!isPop) return scrollToTarget(url);
  if (restoreScroll(entry)) return;
  if (url.hash) scrollToTarget(url);
}

/** How long a navigation waits before showing `loading.jsx`: a fast one never flashes it. */
export const LOADING_DELAY = 150;

const factoryOf = (module) => module?.default ?? module;
const currentLocation = () => window.location.pathname + window.location.search + window.location.hash;

function routeValue(key) {
  const route = getRenderContext()?.route;
  return route ? route[key] : state[key].value;
}

/** Reactive router facade — getters read signal values (tracked in effects). */
export const router = {
  get pathname() {
    return routeValue("pathname");
  },
  get searchParams() {
    return routeValue("searchParams");
  },
  get query() {
    return Object.fromEntries(routeValue("searchParams"));
  },
  get params() {
    return routeValue("params");
  },
  get locale() {
    return routeValue("locale");
  },
  get data() {
    return routeValue("data");
  },
  /** The current page's headings (`export const toc`, emitted for MDX), or `[]`. */
  get toc() {
    return routeValue("toc");
  },
  push: (path) => navigate(path),
  replace: (path) => navigate(path, true),
};

/** Derive the route ("/counter", "/") from a `.../app/<route>/page.jsx` path. The
 *  lookahead pins `/app` to a complete path segment, so a route folder that merely
 *  starts with "app" (`/appointments`) isn't clipped. */
function routeFromPath(filePath) {
  const r = filePath
    .replace(/^.*\/app(?=\/)/, "")
    .replace(/\/(page|layout|404|loading|error)\.(jsx|tsx|mdx|md)$/, "");
  return r === "" ? "/" : r;
}

/**
 * Register routes from a `{ path: entry }` map. Each `entry` is either a module
 * namespace (eager) or a `() => import(...)` loader (lazy, code-split) — both
 * resolve to a default-export factory at navigation time. `layout.jsx` files
 * register as layouts (wrapping nested pages), `404.jsx` as the fallback, and
 * `loading.jsx` / `error.jsx` as the loading and error views of the pages beneath
 * their folder.
 */
export function registerRoutes(modules) {
  // Validate before changing the table: an unsupported fallback otherwise
  // falls through as a page and resolves to "/", overwriting the homepage.
  for (const file in modules) {
    if (/\/404\.(mdx|md)$/.test(file)) {
      throw new Error(`Unsupported Markdown 404 route: ${file}. Use 404.jsx or 404.tsx instead.`);
    }
    const special = /\/(loading|error)\.(mdx|md)$/.exec(file);
    if (special) {
      throw new Error(`Unsupported Markdown ${special[1]} file: ${file}. Use ${special[1]}.jsx or ${special[1]}.tsx instead.`);
    }
  }
  for (const file in modules) {
    const entry = modules[file];
    if (/\/404\.(jsx|tsx)$/.test(file)) routes.notFound = entry;
    else if (/\/layout\.(jsx|tsx)$/.test(file)) routes.layouts[routeFromPath(file)] = entry;
    else if (/\/loading\.(jsx|tsx)$/.test(file)) routes.loading[routeFromPath(file)] = entry;
    else if (/\/error\.(jsx|tsx)$/.test(file)) routes.errors[routeFromPath(file)] = entry;
    else routes.pages[routeFromPath(file)] = entry;
  }
  // Route groups drop out of the URL, so two of them can hold the same page path.
  const [clash] = urlCollisions(Object.keys(routes.pages));
  if (clash) throw new Error(`Two pages answer ${clash[0]}: app${clash[1]} and app${clash[2]}. Move one to another path.`);
}

/**
 * Register which route *patterns* (`"/todos"`, `"/items/[id]"`) have a server
 * loader (docs/DATA.md) — the toolchain discovers `loader.{js,ts}` files and
 * passes the list via `mountApp({ loaders })`. `navigate` only fetches
 * `<path>/__data.json` for routes in this set; `matchRoute` returns the same
 * pattern string, so membership is a plain Set lookup.
 */
export function registerLoaderRoutes(paths) {
  routes.loaderRoutes = new Set(paths || []);
}

/** Set the reactive `router.data` directly (server render and tests). */
export function setRouteData(data) {
  state.data.value = data;
}

/** Layout entries that wrap `route`, outermost (root) first. */
export function layoutChain(route) {
  const chain = [];
  // The 404 fallback has no route pattern of its own, but it still belongs to the
  // app shell. Apply the root layout when one is registered so 404 pages inherit
  // the same navigation, footer, and other site-wide UI as regular pages.
  if (!route) return routes.layouts["/"] ? [routes.layouts["/"]] : chain;
  let p = route;
  while (true) {
    if (routes.layouts[p]) chain.unshift(routes.layouts[p]);
    if (p === "/") break;
    p = p.slice(0, p.lastIndexOf("/")) || "/";
  }
  return chain;
}

/**
 * The nearest `loading.jsx` / `error.jsx` entry for `route` (`table` is
 * `routes.loading` or `routes.errors`): the route's own folder first, then each
 * parent up to the app root. The 404 fallback (`route` null) uses the root's.
 */
export function nearestRouteFile(table, route) {
  let p = route || "/";
  while (true) {
    if (table[p]) return table[p];
    if (p === "/") return null;
    p = p.slice(0, p.lastIndexOf("/")) || "/";
  }
}

/** The folders of the layouts that wrap `route`, outermost (root) first — aligned with `layoutChain`. */
export function layoutFolders(route) {
  const folders = [];
  if (!route) return routes.layouts["/"] ? ["/"] : folders;
  let p = route;
  while (true) {
    if (routes.layouts[p]) folders.unshift(p);
    if (p === "/") break;
    p = p.slice(0, p.lastIndexOf("/")) || "/";
  }
  return folders;
}

/** Does the layout at `folder` wrap `route` (the folder itself, or anything beneath it)? */
export const layoutWraps = (folder, route) =>
  folder === "/" || route === folder || (route ?? "").startsWith(`${folder}/`);

/**
 * Where an error shows: the `error.jsx` entry for it (or null). A page's errors use the
 * nearest one from the page's folder; a broken layout's (`brokenLayout`, its folder) the
 * nearest one *above* that layout, since the layout itself is what failed. The root
 * layout has nothing above it.
 */
export function routeErrorSite(route, brokenLayout = null) {
  if (!brokenLayout) return { entry: nearestRouteFile(routes.errors, route) };
  if (brokenLayout === "/") return { entry: null };
  const parent = brokenLayout.slice(0, brokenLayout.lastIndexOf("/")) || "/";
  return { entry: nearestRouteFile(routes.errors, parent) };
}

/** Resolve a route entry (module namespace or lazy loader) to its factory. */
export async function resolveFactory(entry) {
  const mod = await resolveModule(entry);
  return mod && mod.default ? mod.default : mod;
}

/**
 * Resolve every route entry *in parallel* and return them in order.
 *
 * A route's page and its whole layout chain are separate code-split chunks, and all
 * of them are known before the first `import()` starts — so resolving them one after
 * another would stack their network latencies (a page under two layouts pays 3× the
 * round trip instead of 1×). Starting every `import()` in the same tick lets the
 * browser fetch them concurrently.
 *
 * `Promise.allSettled` rather than `Promise.all`: `all` rejects on the first failure
 * while the other imports are still in flight, so a second failure (a redeploy 404s
 * *every* stale chunk, not just one) would surface as an unhandled rejection. Settle
 * first, then rethrow the earliest failure — `navigate` still sees the same chunk-load
 * error it needs for stale-chunk recovery.
 */
async function resolveAll(entries, resolve) {
  const settled = await Promise.allSettled(entries.map((e) => resolve(e)));
  const failed = settled.find((r) => r.status === "rejected");
  if (failed) throw failed.reason;
  return settled.map((r) => r.value);
}

/**
 * Build the DOM node for a matched route: the page factory wrapped by its layout
 * chain (most-specific inward, root outermost). Returns the outermost `node` plus
 * the ordered `nodes` list (page → … → root) so callers can run lifecycle on each.
 * Each factory owns a reactive scope, disposed with its node on navigation.
 */
export async function buildRouteNode(match, query = {}, { error = null, loadingShown = false } = {}) {
  const props = { params: match.params, query };
  const folders = layoutFolders(match.route);
  // A failed loader replaces the page (its own loader) or a layout and everything in it
  // (a layout loader: `afwLayoutRoute`) with the error view at that site.
  const broken = error?.afwLayoutRoute ?? null;
  const keep = broken ? folders.filter((f) => f !== broken && layoutWraps(f, broken)) : folders;
  const chain = keep.map((f) => routes.layouts[f]);
  // The nearest `loading.jsx` wraps the page in a <Pending>. The error views that could be
  // needed — the page's, and the one above each layout — load up front with the rest.
  const loadingEntry = error ? null : nearestRouteFile(routes.loading, match.route);
  const pageError = error ? routeErrorSite(match.route, broken).entry : nearestRouteFile(routes.errors, match.route);
  const layoutErrors = keep.map((f) => routeErrorSite(match.route, f).entry);
  const errorEntries = [...new Set([pageError, ...layoutErrors].filter(Boolean))];
  const [pageModule, ...rest] = await resolveAll(
    [error ? null : match.entry, ...chain, loadingEntry, ...errorEntries],
    resolveModule,
  );
  const layoutModules = rest.slice(0, chain.length);
  const loadingModule = rest[chain.length];
  const errorModules = new Map(errorEntries.map((entry, i) => [entry, rest[chain.length + 1 + i]]));
  const namespace = module => typeof module === "function" ? { default: module } : module;
  const modules = [...layoutModules, pageModule].filter(Boolean).map(namespace);
  const layoutFactories = layoutModules.map(module => module?.default ?? module);
  if (!error) setRouteToc(pageModule);
  const errorView = (entry, e) => {
    const view = factoryOf(errorModules.get(entry));
    return buildScopedView(() => view({ ...props, error: e, retry: () => navigate(currentLocation(), true) }));
  };
  let node;
  const nodes = [];
  if (error) {
    if (!pageError) throw error;
    node = errorView(pageError, error);
    nodes.push(node);
  } else {
    const pageFactory = pageModule?.default ?? pageModule;
    const loading = factoryOf(loadingModule);
    let pending = loading ? routePending(loading, props, loadingShown) : null;
    let page;
    try {
      if (pending) enterPending(pending);
      try {
        page = buildScopedView(() => pageFactory(props));
      } finally {
        if (pending) exitPending();
      }
    } catch (e) {
      if (!pageError) throw e;
      reportError(e, { phase: "render" });
      if (pending) runCleanup(pending);
      pending = null;
      page = errorView(pageError, e);
    }
    nodes.push(page);
    node = page;
    if (pending) {
      pending.append(page);
      nodes.push(pending);
      node = pending;
    }
  }
  let region = node;
  try {
    for (let i = chain.length - 1; i >= 0; i--) {
      const inner = node;
      try {
        node = buildScopedView(() => layoutFactories[i]({ ...props, children: inner }));
      } catch (e) {
        // A layout that throws is replaced, with everything inside it, by the error view
        // above it; the layouts above it still wrap that view.
        const site = layoutErrors[i];
        if (!site) throw e;
        reportError(e, { phase: "render" });
        for (const n of nodes.splice(0)) runCleanup(n);
        node = errorView(site, e);
        nodes.push(node);
        region = null; // the page is gone; the error view is not re-handled
        continue;
      }
      node.__afwLayoutRoute = keep[i];
      nodes.push(node);
    }
  } catch (e) {
    for (const n of nodes) runCleanup(n);
    throw e;
  }
  return { node, nodes, modules, region };
}

/**
 * The route-level <Pending> a page with a `loading.jsx` is built inside: the loading
 * view is its fallback, held back by {@link LOADING_DELAY} unless the navigation is
 * already showing it (`immediate`).
 */
function routePending(loading, props, immediate) {
  const pending = document.createElement("afw-internal-pending");
  const view = buildScopedView(() => loading(props));
  pending.fallback = view;
  pending.delay = immediate ? 0 : LOADING_DELAY;
  pending.__lifecycle = { mounts: [() => runMount(view)], cleanups: [() => runCleanup(view)] };
  return pending;
}

/**
 * Show the route's `loading.jsx` inside its layouts if the navigation is still waiting
 * (on loader data or route chunks) after {@link LOADING_DELAY}. Returns
 * `{ cancel, shown }`; the navigation's own commit replaces the loading view.
 */
function scheduleRouteLoading(match, query, seq, entry) {
  const status = { shown: false, cancelled: false, timer: null };
  status.timer = setTimeout(async () => {
    try {
      const chain = layoutChain(match.route);
      const [loadingModule, ...layoutModules] = await resolveAll([entry, ...chain], resolveModule);
      if (status.cancelled || seq !== navSeq) return;
      const props = { params: match.params, query };
      let node = buildScopedView(() => factoryOf(loadingModule)(props));
      const nodes = [node];
      for (let i = chain.length - 1; i >= 0; i--) {
        const inner = node;
        node = buildScopedView(() => factoryOf(layoutModules[i])({ ...props, children: inner }));
        nodes.push(node);
      }
      await swapView(() => {
        // A transition runs this later: the page may have committed meanwhile.
        if (status.cancelled || seq !== navSeq) {
          for (const n of nodes) runCleanup(n);
          return;
        }
        for (const n of currentNodes) runCleanup(n);
        currentRegion = null;
        rootEl.replaceChildren(node);
        for (const n of nodes) runMount(n);
        currentNodes = nodes;
        status.shown = true;
      });
    } catch (e) {
      reportError(e, { phase: "route" });
    }
  }, LOADING_DELAY);
  return {
    cancel() {
      status.cancelled = true;
      clearTimeout(status.timer);
    },
    get shown() {
      return status.shown;
    },
  };
}

/**
 * An error no <ErrorBoundary> caught (a component throwing, a resource's first load
 * failing). Inside the page, the page's nearest `error.jsx` replaces it; inside a layout,
 * the `error.jsx` above that layout replaces the layout (and everything in it). The
 * layouts above stay. Retry navigates to the page again. First error per view wins.
 */
const handledViews = new WeakSet();
function showRouteError(el, error) {
  if (!el) return;
  const holds = (node) => viewNodes(node).some((n) => n === el || (n.contains && n.contains(el)));
  let target = null;
  let entry = null;
  if (currentRegion && holds(currentRegion)) {
    target = currentRegion;
    entry = nearestRouteFile(routes.errors, currentRoute);
  } else {
    // The innermost layout around the element (currentNodes runs inner → outer).
    target = currentNodes.find((n) => n.__afwLayoutRoute && holds(n)) ?? null;
    if (target) entry = routeErrorSite(currentRoute, target.__afwLayoutRoute).entry;
  }
  if (!target || !entry || handledViews.has(target)) return;
  handledViews.add(target);
  if (target === currentRegion) currentRegion = null; // the error view itself is not re-handled
  const seq = navSeq;
  // Deferred: never swap the tree in the middle of the connectedCallback that threw.
  queueMicrotask(async () => {
    try {
      const module = await resolveModule(entry);
      if (seq !== navSeq) return;
      const index = currentNodes.indexOf(target);
      const old = viewNodes(target);
      const parent = old[0]?.parentNode;
      if (index < 0 || !parent) return;
      const props = { params: state.params.value, query: Object.fromEntries(state.searchParams.value) };
      const view = buildScopedView(() =>
        factoryOf(module)({ ...props, error, retry: () => navigate(currentLocation(), true) }));
      parent.insertBefore(view, old[0]);
      for (const n of old) n.remove();
      for (let i = 0; i <= index; i++) runCleanup(currentNodes[i]);
      if (index >= currentNodes.indexOf(currentRegion)) currentRegion = null;
      currentNodes = [view, ...currentNodes.slice(index + 1)];
      runMount(view);
    } catch (e) {
      reportError(e, { phase: "fallback" });
    }
  });
}

/**
 * Adopt a matched route's server-rendered DOM (docs/HYDRATION.md §3.4, 2.1c) — the hydrate
 * analogue of {@link buildRouteNode}. One cursor threads the whole layout chain: the
 * outermost layout adopts at the container, and each layout hands that cursor to the next at
 * its `{children}` slot (`props.children` is a thunk that claims the nested route's subtree
 * and advances the cursor), down to the page. Returns `{ nodes }` (page → … → root) for
 * lifecycle, or `null` if the page or any layout isn't adoptable (no `hydrateAt` export) — the
 * caller then falls back to a clean CSR build. A thrown `HydrationMismatch` propagates up,
 * disposing each layer's partial wiring on the way (each `hydrateAt` has its own guard).
 */
export async function hydrateRouteNode(match, query, rootEl, { error = null } = {}) {
  // A page the server rendered with an `error.jsx` (a failed loader) adopts that view, at
  // the same site: the page's, or above the layout whose loader failed.
  const broken = error?.afwLayoutRoute ?? null;
  const errorEntry = error ? routeErrorSite(match.route, broken).entry : null;
  if (error && !errorEntry) return null;
  const props = error
    ? { params: match.params, query, error, retry: () => navigate(currentLocation(), true) }
    : { params: match.params, query };
  const folders = layoutFolders(match.route).filter((f) => !broken || (f !== broken && layoutWraps(f, broken)));
  const chain = folders.map((f) => routes.layouts[f]);
  // Page + layout chunks download concurrently (see `resolveAll`). Adoptability is
  // checked after they all land rather than short-circuiting on the page: bailing
  // early would only skip imports the CSR fallback below is about to need anyway.
  const [pageMod, ...layoutMods] = await resolveAll([errorEntry ?? match.entry, ...chain], resolveModule);
  if (!error) setRouteToc(pageMod);
  if (!pageMod || typeof pageMod.hydrateAt !== "function") return null;
  // The whole chain must be adoptable — one non-adoptable layout means a clean CSR build.
  if (layoutMods.some((m) => !m || typeof m.hydrateAt !== "function")) return null;

  // Compose the adopt thunks innermost-first: the page, then each layout wrapping it. Each
  // thunk pushes its claimed root node, so `nodes` ends up page → … → outermost (the inner
  // thunk runs — and pushes — during the outer layout's walk, before the outer pushes).
  const nodes = [];
  let thunk = (c) => {
    const n = buildScopedView(() => pageMod.hydrateAt(c, props));
    nodes.push(n);
    return n;
  };
  for (let i = chain.length - 1; i >= 0; i--) {
    const layout = layoutMods[i];
    const inner = thunk;
    const folder = folders[i];
    thunk = (c) => {
      const n = buildScopedView(() => layout.hydrateAt(c, { ...props, children: inner }));
      n.__afwLayoutRoute = folder;
      nodes.push(n);
      return n;
    };
  }
  try {
    thunk(cursor(rootEl)); // outermost adopts at the container; the chain threads inward
  } catch (error) {
    for (const node of nodes) runCleanup(node);
    throw error;
  }
  return { nodes };
}

/** Resolve a route entry (lazy loader or module namespace) to its module. */
export async function resolveModule(entry) {
  return typeof entry === "function" ? await entry() : entry;
}

/**
 * Set the reactive route state directly (no history/render). Used by server render
 * so a page reading `router.pathname`/`params`/`query` resolves to the route being
 * pre-rendered. The client uses `navigate` instead.
 */
/**
 * Publish the page module's `toc` export as `router.toc`. Called once the page module is
 * resolved and before any factory runs, so a layout's `<Toc>` renders the same outline on
 * the server, at hydration and after a client navigation.
 */
export function setRouteToc(pageModule) {
  const toc = Array.isArray(pageModule?.toc) ? pageModule.toc : [];
  const route = getRenderContext()?.route;
  if (route) route.toc = toc;
  else state.toc.value = toc;
}

export function setRouteState({ pathname = "/", search = "", params = {}, locale, data } = {}) {
  const route = getRenderContext()?.route;
  if (route) {
    Object.assign(route, {
      pathname: normalizePath(pathname),
      searchParams: new URLSearchParams(search),
      params,
      locale: locale !== undefined ? locale : resolveLocale(pathname).locale,
      data,
    });
    return;
  }
  state.pathname.value = normalizePath(pathname);
  state.searchParams.value = new URLSearchParams(search);
  state.params.value = params;
  state.locale.value = locale !== undefined ? locale : resolveLocale(pathname).locale;
  // Always assigned (even when the caller passed none) so a loader-less render
  // never shows a previous route's stale data.
  state.data.value = data;
}

/**
 * Match `pathname` against the registered routes, resolving `[param]` segments. A
 * leading non-default locale segment is stripped first (the route table is
 * locale-agnostic; see `resolveLocale`).
 */
export function matchRoute(pathname) {
  pathname = resolveLocale(pathname).path;
  for (const { route, pattern } of rankedPages()) {
    const m = pathname.match(pattern);
    if (m) {
      const params = decodeParams(route, m.groups, { strict: true });
      if (!params) return null;
      return { entry: routes.pages[route], params, route };
    }
  }
  return null;
}

// Compiled page patterns, most specific first (route-match.js `compareRoutes`), so a
// static `/blog/new` beats `/blog/[slug]` whatever order the files were discovered in.
// Rebuilt when the set of routes changes (registration, HMR, tests swapping the table).
let ranked = { key: null, list: [] };
function rankedPages() {
  const names = Object.keys(routes.pages);
  const key = names.join("\0");
  if (ranked.key !== key) {
    const list = names.sort(compareRoutes).map((route) => ({ route, pattern: compileRoute(route) }));
    ranked = { key, list };
  }
  return ranked.list;
}

// Monotonic navigation sequence: a navigation that awaited its loader-data fetch
// commits only if no newer navigation started meanwhile (stale data must never
// win over a later click).
let navSeq = 0;

// Prefetched loader data (`prefetch`): `pathname + search` → { data: Promise, at }. A
// navigation takes an entry once, while fresh; `invalidate()` clears them all.
const prefetched = new Map();
const PREFETCH_TTL_MS = 30_000;
// Route entries whose chunk prefetch started; a failed one may be retried.
const warmedEntries = new WeakSet();

function takePrefetched(key) {
  const hit = prefetched.get(key);
  prefetched.delete(key);
  return hit && Date.now() - hit.at < PREFETCH_TTL_MS ? hit.data : null;
}

/**
 * Warm a route before it is visited: start loading its page and layout chunks and, when
 * it has a loader, its data, which the navigation then reuses (once, within 30 s).
 * `<Link>` calls this on hover, focus or touch. A no-op on the server, before
 * `mountApp`, for another origin, for an unknown route, and when the browser asks to
 * save data.
 */
export function prefetch(path) {
  if (!isBrowser || !rootEl || !path) return;
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return;
  let url;
  try {
    url = new URL(path, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  const match = matchRoute(url.pathname);
  if (!match) return;
  for (const entry of [match.entry, ...layoutChain(match.route)]) {
    if (typeof entry !== "function" || warmedEntries.has(entry)) continue; // eager, or already started
    warmedEntries.add(entry);
    // A failure is the navigation's to report; it may be retried.
    Promise.resolve().then(() => resolveModule(entry)).catch(() => warmedEntries.delete(entry));
  }
  if (match.route && routes.loaderRoutes.has(match.route)) {
    const key = url.pathname + url.search;
    const hit = prefetched.get(key);
    if (hit && Date.now() - hit.at < PREFETCH_TTL_MS) return;
    const data = fetchRouteData(url.pathname, url.search);
    data.catch(() => prefetched.delete(key));
    prefetched.set(key, { data, at: Date.now() });
  }
}

/**
 * Reload the current page's loader data into `router.data` (`invalidate()`), and drop
 * prefetched data, which may be stale too.
 */
/** Go where a loader (or the server) redirected a navigation. */
function followRedirect(target) {
  if (target.reload) {
    window.location.assign(target.redirect);
    return;
  }
  return navigate(target.redirect, true);
}

export async function refreshRouteData() {
  prefetched.clear();
  if (!isBrowser || !rootEl) return;
  const pathname = state.pathname.value;
  const match = matchRoute(pathname);
  if (!match?.route || !routes.loaderRoutes.has(match.route)) return;
  const seq = navSeq;
  try {
    const data = await fetchRouteData(pathname, window.location.search);
    if (seq !== navSeq) return; // a navigation since owns the data
    if (data instanceof RouteRedirect) return followRedirect(data);
    state.data.value = data;
  } catch (e) {
    reportError(e, { phase: "data", path: pathname });
  }
}

// --- Stale-chunk recovery ---------------------------------------------------
// Pages/layouts are code-split, so a route is loaded by a lazy `() => import(...)`
// at navigation time. Asset filenames are content-hashed (`layout-DmM9YRKj.js`),
// so a new deploy replaces them: a tab that loaded the OLD `index.html` still holds
// the old chunk names, and the moment the user navigates to a not-yet-loaded route
// its `import()` 404s — "Failed to fetch dynamically imported module".
//
// Recovery is a single full page load, which fetches the fresh `index.html` (new
// hashes) and completes the navigation for real. We don't try to distinguish a
// redeploy from a transient network error first — a HEAD probe of the chunk isn't
// reliable across hosts (405 / no-HEAD, S3 returning 403 for missing keys, CORS
// preflight, CDN quirks). The reload is guarded by a one-time, tab-scoped
// sessionStorage flag that survives the reload, so a genuinely broken deploy (fresh
// HTML still 404s) reloads once and then surfaces the error instead of looping.

/**
 * Whether `e` is a failed dynamic `import()` of a code-split route chunk — the
 * signature of the stale-chunk-after-redeploy problem. The message differs per
 * engine, so match all three:
 *   Chrome/Edge: "Failed to fetch dynamically imported module: <url>"
 *   Firefox:     "error loading dynamically imported module: <url>"
 *   Safari:      "Importing a module script failed."
 */
function isChunkLoadError(e) {
  const msg = (e && (e.message || String(e))) || "";
  return /dynamically imported module|Importing a module script failed/i.test(msg);
}

// One-time reload guard. sessionStorage survives `location.reload()` and is scoped to
// this tab (auto-cleared when it closes), so it's the right place to remember "I've
// already tried reloading for this." A genuinely broken deploy — fresh HTML that still
// references a 404ing chunk — therefore reloads exactly once, then surfaces the error
// instead of looping. `clearChunkReloadFlag` drops it on the next successful render, so
// a *later* redeploy can recover in turn.
const CHUNK_RELOAD_FLAG = "afw:chunk-reloaded";

/**
 * Hard-reload once to pick up fresh HTML + asset hashes, guarded so it can't loop.
 * Returns `false` when a reload was already attempted (the caller should surface the
 * error instead of reloading again).
 */
function reloadForFreshAssets() {
  if (!isBrowser) return false;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return false; // already tried once
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  } catch {
    // sessionStorage unavailable — reload unguarded; a normal redeploy still recovers,
    // and the rare broken-deploy loop is the only thing we can't defend against here.
  }
  window.location.reload();
  return true;
}

/** Drop the one-time reload guard once a navigation renders successfully. */
function clearChunkReloadFlag() {
  if (!isBrowser) return;
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // ignore
  }
}

/**
 * Navigate to `path`. Runs an optional route guard, fetches the route's loader
 * data when it has any (docs/DATA.md — fetch *then* commit, like the guard),
 * swaps the rendered page (tearing down the previous one's lifecycle), and
 * updates window.history.
 */
export async function navigate(path, replace = false, isPop = false, hydrate = false) {
  if (!path || !rootEl) return;
  const seq = ++navSeq;
  const url = new URL(path, window.location.origin);
  // SPA mode restores scroll itself (scroll.js): save where the page being left was,
  // before anything (a loading view, the new page) replaces it.
  const spa = isBrowser && navMode === "spa";
  if (spa) rememberScroll();

  if (guard) {
    let redirected = false;
    const to = {
      // `pathname` is the documented, platform-standard field (matches the URL API
      // and `router.pathname`); `path` is kept as a back-compat alias. `fullPath`
      // is the whole relative URL (pathname + query + hash), for guards that need to
      // preserve or inspect the query/hash (e.g. redirect back after login).
      pathname: url.pathname,
      path: url.pathname,
      fullPath: url.pathname + url.search + url.hash,
      params: matchRoute(url.pathname)?.params || {},
      query: Object.fromEntries(url.searchParams),
    };
    await new Promise((resolve) => {
      // A guard redirect on **first paint** leaves hydration: the server DOM in `#app`
      // belongs to the route we're leaving, so the target route has to build fresh. The
      // hydration flag is seeded `true` from the server sentinel at module load, and this
      // path returns before the `hydrate && match` block that clears it in its `finally` —
      // so without this the flag stayed true for the rest of the session. Every island the
      // redirected build creates would then see `isHydrating() && this.firstChild` and take
      // the *adopt* arm against DOM its own parent had just `createElement`'d, mismatching
      // (`expected a region start marker, found <div>`) and rebuilding — and so would every
      // later SPA navigation. Clear it before the target navigation builds anything.
      const leaveHydration = () => {
        if (hydrate) endHydration();
      };
      const tools = {
        next: () => resolve(),
        redirect: (p) => {
          redirected = true;
          leaveHydration();
          navigate(p, true);
          resolve();
        },
        replace: (p) => {
          redirected = true;
          leaveHydration();
          navigate(p, true);
          resolve();
        },
      };
      Promise.resolve(guard(to, tools)).catch(() => resolve());
    });
    if (redirected) return;
  }

  const match =
    matchRoute(url.pathname) ||
    (routes.notFound ? { entry: routes.notFound, params: {}, route: null } : null);

  // Loader data (docs/DATA.md): resolved before any state write / history push /
  // DOM swap, mirroring the guard's "settle before commit" flow. First paint over
  // server HTML reads the inlined payload; every other navigation (SPA nav, dev/CSR
  // first load, popstate) fetches the `<path>/__data.json` endpoint. A failed fetch
  // is reported; with an `error.jsx` the page shows it, otherwise the navigation
  // commits with `data === undefined`.
  //
  // A route with a `loading.jsx` shows it inside its layouts when the navigation is
  // still waiting (data, route chunks) after LOADING_DELAY.
  const loadingEntry = !hydrate && match?.route ? nearestRouteFile(routes.loading, match.route) : null;
  const loading = loadingEntry && isBrowser
    ? scheduleRouteLoading(match, Object.fromEntries(url.searchParams), seq, loadingEntry)
    : null;
  try {
  let data;
  let dataError = null;
  if (match && match.route && routes.loaderRoutes.has(match.route)) {
    if (hydrate) {
      data = readInlineRouteData();
      // The server rendered this page's `error.jsx` (its loader failed).
      dataError = routeErrorFrom(data);
      if (dataError) data = undefined;
    } else {
      try {
        const warmed = takePrefetched(url.pathname + url.search);
        data = warmed ? await warmed.catch(() => fetchRouteData(url.pathname, url.search)) : await fetchRouteData(url.pathname, url.search);
      } catch (e) {
        reportError(e, { phase: "data", path: url.pathname });
        if (routeErrorSite(match.route, e?.afwLayoutRoute ?? null).entry) dataError = e;
      }
      if (seq !== navSeq) return; // a newer navigation superseded this one
      if (data instanceof RouteRedirect) return followRedirect(data);
    }
  }

  state.pathname.value = normalizePath(url.pathname);
  state.searchParams.value = url.searchParams;
  state.params.value = match ? match.params : {};
  state.locale.value = resolveLocale(url.pathname).locale;
  state.data.value = data;

  // The history entry this navigation lands on; back/forward and the first load keep
  // the one already there. Its key finds the scroll position saved for it.
  let entry = null;
  if (spa) entry = enterEntry(path, isPop ? "pop" : replace ? "replace" : "push");
  else if (!isPop) {
    if (replace) window.history.replaceState({}, "", path);
    else window.history.pushState({}, "", path);
  }

  // First paint over server-rendered DOM: *adopt* it (hydrate) instead of rebuilding,
  // when the route module exposes a `hydrateAt` adopt factory (compiled with the hydrate
  // target). `hydrateRouteNode` threads one cursor through the whole layout chain (2.1c);
  // a route whose page or any layout isn't adoptable returns null → clean CSR build. A
  // hydration mismatch is reported (never silent) and also falls through to a rebuild.
  //
  // The hydration flag must be live *before* the route modules are imported: route chunks
  // are code-split, so `customElements.define` — and the synchronous upgrade of every
  // server-rendered `<web-*>` host — happens during those imports, before the factories
  // run. Those upgrading components read `isHydrating()` to adopt their server DOM rather
  // than build (docs/HYDRATION.md §3.4). `endHydration()` in `finally` makes every
  // subsequent client navigation build fresh; the CSR fallback below then runs with the
  // flag cleared, so a rebuilt host builds instead of trying to re-adopt.
  if (hydrate && match) {
    beginHydration();
    try {
      const query = Object.fromEntries(url.searchParams);
      const adopted = await hydrateRouteNode(match, query, rootEl, { error: dataError });
      if (adopted) {
        currentNodes = adopted.nodes;
        currentRegion = dataError ? null : adopted.nodes[0];
        currentRoute = match.route;
        if (spa) landScroll(url, true, entry); // a reload of a server-rendered page
        committed = true;
        for (const n of adopted.nodes) runMount(n); // onMount for page + every layout
        clearError({ phase: "route" });
        clearChunkReloadFlag();
        return;
      }
      // Not a mismatch: the page or a layout has no adopt factory (the compiler could
      // not emit one), so the server HTML is rebuilt. Say so in development, where the
      // compiler's warning may have scrolled away.
      if (DEV && !dataError) console.warn(`[afw:hydrate] ${url.pathname}: the page or one of its layouts cannot adopt the server-rendered HTML, so it is rebuilt on the client. See the compiler's warning for that file.`);
    } catch (e) {
      reportError(e, { phase: "hydrate", path: url.pathname });
      // fall through to a clean CSR build below
    } finally {
      endHydration();
    }
  }

  // Resolve (and lazily load) the page + its layout chain before tearing down the
  // current view, so a slow/failed import doesn't leave a blank page.
  let nodes = null;
  let region = null;
  let metadata = {};
  if (match) {
    let built;
    try {
      built = await buildRouteNode(match, Object.fromEntries(url.searchParams), {
        error: dataError,
        loadingShown: loading?.shown ?? false,
      });
      metadata = await resolveMetadataModules(built.modules, { params: match.params, query: Object.fromEntries(url.searchParams) });
      if (seq !== navSeq) {
        for (const node of built.nodes) runCleanup(node);
        return;
      }
      nodes = built.nodes;
      region = built.region;
    } catch (e) {
      if (built) for (const node of built.nodes) runCleanup(node);
      if (seq !== navSeq) return;
      // A failed route-chunk import (stale after a redeploy, or the network dropped):
      // try one guarded full reload for fresh HTML + hashes. If we already reloaded once
      // and it still fails, fall through to the error overlay instead of looping.
      if (isChunkLoadError(e) && reloadForFreshAssets()) return;
      reportError(e, { phase: "route", path: url.pathname });
      for (const node of currentNodes) runCleanup(node);
      rootEl.replaceChildren();
      rootEl.innerHTML = `<pre style="color:#f87171;padding:1rem">Failed to load ${url.pathname}\n${e?.message ?? e}</pre>`;
      currentNodes = [];
      return;
    }
  }

  loading?.cancel();
  // The swap itself: one synchronous update, so a view transition (when enabled)
  // snapshots the old page before it and animates to the new one after it.
  const commit = () => {
    for (const n of currentNodes) runCleanup(n);
    rootEl.replaceChildren();
    updateRouteHead(metadata, url.pathname);
    if (nodes) {
      // Set before inserting: a component that throws as it connects reports into it.
      currentRegion = region;
      currentRoute = match.route;
      rootEl.appendChild(nodes[nodes.length - 1]); // outermost node
      for (const n of nodes) runMount(n); // run onMount for page + every layout
      currentNodes = nodes;
      clearError({ phase: "route" }); // a good render dismisses a prior error overlay
      clearChunkReloadFlag(); // a successful render means the reload (if any) recovered
      if (spa) landScroll(url, isPop, entry);
      else if (!isPop && isBrowser) scrollToTarget(url);
      if (isBrowser) focusRouteContent(rootEl);
    } else {
      rootEl.innerHTML = "<h1>404 — Not Found</h1>";
      currentNodes = [];
      currentRegion = null;
    }
  };
  // Never on the first paint: there is no previous page to transition from.
  await swapView(commit, committed);
  committed = true;
  } finally {
    loading?.cancel();
  }
}

// Development factory refresh deliberately bypasses navigation: no guard,
// loader request, history mutation, route-state change or heading focus jump.
// Only the edited page or layout is rebuilt. Its `$state` slots carry over when
// the declarations still match (see `registerHotRoute`), outer layouts keep their
// nodes and state, and an edited layout receives the existing inner route view as
// `children`, so the page and its components move into it without remounting.
// The nodes a route view occupies in the document: the element itself, or the nodes a
// fragment root held (see `buildScopedView`).
const viewNodes = (node) => (node?.nodeType === 11 ? node.__afwNodes ?? [] : node ? [node] : []);

// A route view to pass on as a layout's `children`: a fragment root is empty once
// inserted, so it is refilled with the nodes it held.
function asChildren(node) {
  if (node?.nodeType !== 11) return node;
  const frag = document.createDocumentFragment();
  frag.append(...viewNodes(node));
  return frag;
}

export async function refreshHotRoute(factory, data = null) {
  const index = currentNodes.findIndex(node => node.__afwHotFactory === factory);
  if (!rootEl || index < 0) return;
  const seq = navSeq;
  const previous = currentNodes[index];
  const match = matchRoute(state.pathname.value) ||
    (routes.notFound ? { entry: routes.notFound, route: state.pathname.value, params: {} } : null);
  if (!match) return;
  const query = Object.fromEntries(state.searchParams.value);
  const inner = index > 0 ? currentNodes[index - 1] : null;
  const innerFirst = viewNodes(inner)[0];
  const innerParent = innerFirst?.parentNode;
  const innerNext = viewNodes(inner).at(-1)?.nextSibling;
  let node;
  try {
    const [pageModule, ...layoutModules] = await resolveAll(
      [match.entry, ...layoutChain(match.route)],
      resolveModule,
    );
    if (seq !== navSeq || currentNodes[index] !== previous) return;
    const focusedId = rootEl.contains(document.activeElement) ? document.activeElement.id : null;
    const scroll = [window.scrollX, window.scrollY];
    const props = { params: match.params, query };
    if (inner) props.children = asChildren(inner);
    // `data` is the edited module's route data; the modules imported above are the
    // originals. currentNodes runs page → innermost layout → root, the chain root first.
    const namespace = module => typeof module === "function" ? { default: module } : module;
    const fresh = module => (data ? { ...namespace(module), ...data } : namespace(module));
    const page = index === 0 ? fresh(pageModule) : namespace(pageModule);
    const layouts = layoutModules.map((module, i) => (index === layoutModules.length - i ? fresh(module) : namespace(module)));
    // An edited page may have new headings: publish them before the view rebuilds.
    setRouteToc(page);
    const old = viewNodes(previous);
    if (old.length === 0) throw new Error("the refreshed view has no nodes in the document to replace");
    // Components the rebuilt view renders get new elements, which connect on insert;
    // carry their state across. A layout's page is moved, not rebuilt.
    const carried = collectHotState(old, inner ? viewNodes(inner) : []);
    withHotCarry(carried, () => {
      node = buildScopedView(() => factory(props, previous));
      old[0].parentNode.insertBefore(node, old[0]);
    });
    for (const n of old) n.remove();
    runCleanup(previous);
    currentNodes = currentNodes.map((current, i) => (i === index ? node : current));
    runMount(node);
    const metadata = await resolveMetadataModules([...layouts, page], { params: match.params, query });
    if (seq === navSeq) updateRouteHead(metadata, state.pathname.value);
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
    window.scrollTo(...scroll);
    clearError({ phase: "route" });
  } catch (error) {
    // A failed layout build may already hold the inner view; put it back.
    if (innerParent && innerFirst.parentNode !== innerParent) {
      for (const n of viewNodes(inner)) innerParent.insertBefore(n, innerNext ?? null);
    }
    if (node && !node.isConnected) runCleanup(node);
    reportError(error, { phase: "route", path: state.pathname.value });
  }
}

/** Move keyboard/screen-reader focus into the newly rendered route after SPA nav. */
function focusRouteContent(container) {
  const target = container.querySelector("h1") || container.querySelector("main");
  if (!target) return;
  // Headings and main landmarks are not normally in the tab order. A programmatic
  // tabindex lets focus land there without adding another Tab stop.
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

/**
 * Bootstrap the application: register routes, wire history, and render the page
 * for the current URL.
 *
 * @param {Object} opts
 * @param {Object} opts.pages  `{ path: module }` route map (from the dev server).
 * @param {Element} [opts.target]  the app root (defaults to `#app`).
 * @param {Function} [opts.guard]  optional `(to, tools) => …` route guard.
 * @param {"spa"|"mpa"} [opts.nav]  navigation mode (default "spa"); "mpa" disables
 *   client-side link interception so every navigation is a full page load.
 * @param {string[]} [opts.loaders]  route patterns that have a server loader
 *   (docs/DATA.md) — navigation fetches `<path>/__data.json` for these.
 */
export function mountApp({ pages, target, guard: g, i18n, nav, loaders, viewTransitions: vt = false } = {}) {
  rootEl = target || (isBrowser ? document.getElementById("app") : null);
  navMode = nav === "mpa" ? "mpa" : "spa";
  viewTransitions = Boolean(vt) && navMode === "spa";
  committed = false;
  if (isBrowser && navMode === "spa") manageScroll();
  if (i18n) configureI18n(i18n);
  if (pages) registerRoutes(pages);
  if (loaders) registerLoaderRoutes(loaders);
  guard = g || null;
  setRouteDataRefresher(refreshRouteData);
  setRouteErrorHandler(showRouteError);
  prefetched.clear(); // a fresh app starts with nothing warmed
  // In MPA mode the browser owns navigation (full loads push real history entries),
  // so there is no client-side history to react to — only wire popstate for SPA.
  if (isBrowser && navMode === "spa") {
    window.addEventListener("popstate", () =>
      navigate(
        window.location.pathname + window.location.search + window.location.hash,
        false,
        true,
      ),
    );
  }
  // Hydrate the first paint when the server stamped `data-afw-hydrate` on the root,
  // left rendered markup in it, and rendered it for this URL; otherwise this is a
  // plain CSR mount (build into #app), replacing any markup rendered for another path.
  const hydrate = !!(
    isBrowser &&
    rootEl &&
    rootEl.firstChild &&
    renderedForPath(rootEl, window.location.pathname)
  );
  if (isBrowser) prepareRouteHead(hydrate);
  // The flag is seeded `true` from the sentinel at module load (so eagerly-defined
  // framework components adopt on upgrade — see hydrate.js). If this mount is NOT
  // hydrating after all (no sentinel, or an empty root), clear it now so the CSR build
  // below — and every later navigation — builds fresh. The hydrate path clears it itself
  // (via `endHydration` in `navigate`'s `finally`) once first paint is adopted.
  if (!hydrate) endHydration();
  return navigate(
    window.location.pathname + window.location.search + window.location.hash,
    true,
    true,
    hydrate,
  );
}

// `<Link>` is a pure JSX component (packages/afw/components/Link.jsx), compiled by
// the app's pipeline like any UI component — it lives there, not as a hand-written
// Custom Element here. It imports `navigate` from this module.
