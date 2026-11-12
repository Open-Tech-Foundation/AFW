// Route loaders — the server half of data fetching (docs/DATA.md, SPEC §8). A
// loader is a `loader.{js,ts}` file sibling to a `page.*` (the data analogue of
// a `route.*` API endpoint): a *plain server module* whose default export (or
// named `loader` export, the Phase B compiler convention) returns the page's
// JSON-serializable data:
//
//   export default async function loader({ params, query, request, locale, locals }) {
//     return db.todos.list();
//   }
//
// `createLoaderRegistry` turns a discovered `{ absFilePath: namespace }` map into
// a matcher + runner shared by every consumer: SSG prerender (build time, no
// `request`), the SSR server (per request), the dev server, and the
// `<path>/__data.json` HTTP endpoint SPA navigation fetches from (`handle`).
//
// A `layout.loader.{js,ts}` beside a `layout.*` loads data for every page beneath
// that layout. A page's loaders — each layout loader from the root down, then the
// page's own — run in parallel, and their results merge into one object (layout
// data first, the page's on top), so one `router.data` and one `__data.json`
// request serve the whole chain.
//
// Matching duplicates the `[param]` / `[...rest]` compile/decode approach of the
// API handler (api.js) — like api.js itself mirrors the page router — so params
// behave identically across pages, endpoints, and loaders.

import { DATA_FILE } from "../runtime/route-data.js";
import { compareRoutes, compileRoute, decodeParams, normalizePath as normalize, stripAppDir } from "../runtime/route-match.js";

/** The page route a `.../app/<...>/loader.{js,ts}` file feeds (folder = URL):
 *  `app/todos/loader.js` → `/todos`, `app/loader.js` → `/`. */
export function loaderRouteFromPath(filePath, appDir) {
  const r = stripAppDir(filePath, appDir).replace(/\/(?:layout\.)?loader\.(js|ts)$/, "");
  return r === "" ? "/" : r;
}

/** Is this a `layout.loader.{js,ts}` file? */
export const isLayoutLoaderFile = (filePath) => /(?:^|\/)layout\.loader\.(js|ts)$/.test(filePath);

/** Does the layout at `folder` (a route like "/dashboard") wrap the page at `route`? */
export const layoutWraps = (folder, route) =>
  folder === "/" || route === folder || route.startsWith(`${folder}/`);

/**
 * The page routes that have loader data: those with their own `loader.*`, and every
 * page beneath a `layout.loader.*`. The client router fetches `__data.json` for these.
 */
export function loaderPageRoutes({ pages = [], pageLoaders = [], layoutLoaders = [] }) {
  const out = new Set(pageLoaders);
  for (const page of pages) if (layoutLoaders.some((folder) => layoutWraps(folder, page))) out.add(page);
  return [...out].sort();
}

/**
 * Merge a page's loader results: layout data outermost first, the page's own on top.
 * A single result passes through unchanged (any JSON value); a chain must be objects.
 */
function mergeLoaderData(results) {
  const defined = results.filter((r) => r.value !== undefined);
  if (defined.length <= 1) return defined[0]?.value;
  for (const { value, route, layout } of defined) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      const kind = layout ? `layout loader ${route}` : `loader ${route}`;
      throw new TypeError(`${kind} returned ${Array.isArray(value) ? "an array" : String(value === null ? null : typeof value)}; loaders that share a page must return objects so their data can merge`);
    }
  }
  return Object.assign({}, ...defined.map((r) => r.value));
}

/**
 * Signal "this page does not exist for these params" from inside a loader — the
 * SSR server responds 404 (rendering the 404 page), the data endpoint returns a
 * 404 the client maps to `undefined`, and SSG records the path as failed.
 */
export function notFound(message = "Not Found") {
  const e = new Error(message);
  e.name = "NotFoundError";
  // A marker property, not a class: the loader bundle and the server bundle are
  // separate module graphs (each bundles its own copy of this file), so an
  // `instanceof` check would fail across the boundary.
  e.afwNotFound = true;
  throw e;
}

/** Was `e` thrown by {@link notFound}? (Property check — see the note there.) */
export function isNotFound(e) {
  return e?.afwNotFound === true;
}

/**
 * Serialize loader data for embedding: the inline `#__afw_data` script and the
 * static `__data.json` file must carry identical bytes. `<` is escaped so the
 * payload can never close the inline `<script>` (same rule as the island-props
 * collector in ssg-runtime.js). `undefined` (no data) serializes to `""` — the
 * toolchain skips injection entirely.
 */
export function serializeRouteData(value) {
  const json = JSON.stringify(value);
  return json === undefined ? "" : json.replace(/</g, "\\u003c");
}

/**
 * Build the loader registry from a discovered `{ absFilePath: namespace }` map.
 *
 * @param {Record<string, object>} loaderModules  each module's default (or `loader`)
 *        export is the loader function.
 * @param {{ appDir?: string, i18n?: { locales?: string[], defaultLocale?: string } }} [options]
 *        `appDir` pins exact route derivation; `i18n` lets `match` strip a leading
 *        non-default locale prefix (`/fr/todos` matches the `/todos` loader with
 *        `locale: "fr"` in the context).
 * @returns {{ routes: string[],
 *             match: (pathname: string) => object | null,
 *             load: (m: object, ctx?: object) => Promise<unknown>,
 *             loadSerialized: (m: object, ctx?: object) => Promise<{ data: unknown, json: string }>,
 *             handle: (request: Request, extras?: { locals?: object }) => Promise<Response | null> }}
 */
export function createLoaderRegistry(loaderModules = {}, { appDir, i18n, pageRoutes = [] } = {}) {
  const pageFns = new Map(); // page route → its loader
  const layouts = []; // { route: layout folder, fn }
  for (const file in loaderModules) {
    const ns = loaderModules[file];
    const fn = ns.default ?? ns.loader;
    if (typeof fn !== "function") continue; // a loader file without a loader export is inert
    const route = loaderRouteFromPath(file, appDir);
    if (isLayoutLoaderFile(file)) layouts.push({ route, fn });
    else pageFns.set(route, fn);
  }
  // Outermost layout first: the order their data merges in.
  layouts.sort((a, b) => a.route.split("/").length - b.route.split("/").length || (a.route < b.route ? -1 : 1));
  const pages = loaderPageRoutes({ pages: pageRoutes, pageLoaders: [...pageFns.keys()], layoutLoaders: layouts.map((l) => l.route) });
  const entries = pages.map((route) => ({
    route,
    pattern: compileRoute(route),
    fn: pageFns.get(route) ?? null,
    layouts: layouts.filter((l) => layoutWraps(l.route, route)),
  }));
  // Most specific first, segment by segment — the same ranking as pages and API routes.
  entries.sort((a, b) => compareRoutes(a.route, b.route));

  const i18nOn = !!(i18n && Array.isArray(i18n.locales) && i18n.locales.length);
  const defaultLocale = i18nOn ? (i18n.defaultLocale ?? i18n.locales[0]) : null;
  const nonDefault = i18nOn ? new Set(i18n.locales.filter((l) => l !== defaultLocale)) : null;

  /** Match a *page* pathname (no `__data.json` suffix) → `{ route, params, locale }` or null. */
  function match(pathname) {
    let path = normalize(pathname);
    let locale = defaultLocale;
    if (nonDefault) {
      const m = path.match(/^\/([^/]+)(\/.*|)$/);
      if (m && nonDefault.has(m[1])) {
        locale = m[1];
        path = m[2] || "/";
      }
    }
    for (const e of entries) {
      const m = path.match(e.pattern);
      if (!m) continue;
      return { route: e.route, params: decodeParams(e.route, m.groups), locale, fn: e.fn, layouts: e.layouts };
    }
    return null;
  }

  /** Run a matched loader. `request` is the live Request under serve/dev and
   *  `undefined` at SSG prerender; `locals` is the per-request bag pipeline
   *  middleware stamped (middleware.js) — empty at prerender, where none runs. */
  async function load(m, { request, query = {}, locals = {} } = {}) {
    const context = { params: m.params, query, request, locale: m.locale, locals };
    const chain = m.layouts ?? [];
    if (!chain.length) return m.fn ? m.fn(context) : undefined;
    // Every loader at once; a failing layout loader is tagged with its folder, so the
    // error view above that layout can replace it (`afwLayoutRoute`).
    const runs = chain.map(async (layout) => {
      try {
        return { value: await layout.fn(context), route: layout.route, layout: true };
      } catch (error) {
        if (error && typeof error === "object" && !(error instanceof Response)) error.afwLayoutRoute ??= layout.route;
        throw error;
      }
    });
    if (m.fn) runs.push(Promise.resolve(m.fn(context)).then((value) => ({ value, route: m.route, layout: false })));
    return mergeLoaderData(await Promise.all(runs));
  }

  /** {@link load}, plus the serialized form — escaping lives in one place. */
  async function loadSerialized(m, ctx) {
    const data = await load(m, ctx);
    return { data, json: serializeRouteData(data) };
  }

  /**
   * The `<path>/__data.json` HTTP endpoint (docs/DATA.md): a `Response` for any
   * data URL — including 404 on a miss, so the reserved suffix never falls
   * through to SSR — or `null` for every other path.
   */
  async function handle(request, { locals } = {}) {
    const url = new URL(request.url);
    const pathname = normalize(url.pathname);
    let pagePath = null;
    if (pathname === `/${DATA_FILE}`) pagePath = "/";
    else if (pathname.endsWith(`/${DATA_FILE}`)) {
      pagePath = pathname.slice(0, -(DATA_FILE.length + 1)) || "/";
    }
    if (pagePath === null) return null;

    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    const m = match(pagePath);
    if (!m) return new Response("null", { status: 404, headers });
    try {
      const { json } = await loadSerialized(m, {
        request,
        query: Object.fromEntries(url.searchParams),
        locals,
      });
      // `json || "null"` — an undefined loader result still yields valid JSON
      // (the client maps a 404 to undefined; a 200 must parse).
      return new Response(method === "HEAD" ? null : json || "null", { status: 200, headers });
    } catch (e) {
      if (isNotFound(e)) return new Response("null", { status: 404, headers });
      if (e instanceof Response) {
        // A redirect is answered as data the router follows: fetch() would follow a
        // real 3xx to an HTML page. Any other thrown Response (401, 403…) passes through.
        const location = e.status >= 300 && e.status < 400 ? e.headers.get("location") : null;
        if (location) return new Response("null", { status: 200, headers: { ...headers, "x-afw-redirect": location } });
        return e;
      }
      console.error(`✗ loader ${pagePath}:`, e?.stack ?? e);
      // `layout`: which layout's loader failed, so the client shows the error view above it.
      const body = e?.afwLayoutRoute ? { error: "Internal Server Error", layout: e.afwLayoutRoute } : { error: "Internal Server Error" };
      return Response.json(body, { status: 500 });
    }
  }

  return { routes: entries.map((e) => e.route), match, load, loadSerialized, handle };
}
