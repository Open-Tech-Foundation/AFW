// The HTML document, shared by every toolchain's server rendering: the shell helpers
// that place rendered markup, head tags and data payloads into the app's
// `index.html`, and `renderDocument`, which renders one URL into a complete document.
// Static generation (prerender.js) and per-request SSR both go through it, so a
// prerendered page and a server-rendered one are byte-for-byte the same document.
//
// Pure string work: nothing here touches a file system or the AFW runtime directly.
// `render` is the server render API (`renderRoute`, `renderHead` from
// `@opentf/afw/server`), passed in by the caller.

/** Inject `snippet` just before `</body>` (or append when there is none). */
export function injectBeforeBody(html, snippet) {
  // Function replacer so `$` in `snippet` is literal (String.replace treats `$1`,
  // `$&`, … in a string replacement as back-references — e.g. a "$189.00" price).
  return html.includes("</body>") ? html.replace("</body>", () => `${snippet}</body>`) : html + snippet;
}

/** Inject pre-rendered markup into the shell's empty `#app` container. */
export function injectMarkup(shellHtml, markup) {
  // Function replacer: `markup` may contain `$` (currency, etc.) — keep it literal.
  return shellHtml.replace(/(<div id="app"[^>]*>)\s*(<\/div>)/, (_m, open, close) => `${open}${markup}${close}`);
}

/**
 * Embed the island hydration payload (`renderRoute().hydration`) as a
 * `<script type="application/json" id="__afw_h">` the client reads at upgrade so
 * components resume from rich JS props (compiler-driven data hydration). Placed before
 * `</body>`; a deferred module bundle runs after parse, so the payload is always in the
 * DOM first. `json` is already `<`-escaped by the server collector, so it can't break out
 * of the script. No-op for an empty payload. Uses a function replacer so `$` in the JSON
 * stays literal.
 */
export function injectHydrationData(shellHtml, json) {
  if (!json) return shellHtml;
  return injectBeforeBody(shellHtml, `<script type="application/json" id="__afw_h">${json}</script>`);
}

/** The reserved per-route data filename/URL suffix (mirrors the runtime's
 *  `DATA_FILE` in `@opentf/afw` runtime/route-data.js). */
export const DATA_FILE = "__data.json";

/**
 * Embed a route loader's data (docs/DATA.md) as a `<script type="application/json"
 * id="__afw_data">` the client router reads on first paint (instead of fetching
 * `<path>/__data.json`). A separate script from the island payload above — the two
 * channels have independent shapes and readers. `json` comes `<`-escaped from
 * `serializeRouteData`; no-op for an empty payload (route without a loader, or an
 * undefined loader result).
 */
export function injectRouteData(shellHtml, json) {
  if (!json) return shellHtml;
  return injectBeforeBody(shellHtml, `<script type="application/json" id="__afw_data">${json}</script>`);
}

/**
 * Stamp the `data-afw-hydrate` sentinel onto the shell's `#app` container, telling
 * the client to *adopt* the server-rendered DOM on first paint instead of rebuilding
 * it (`runtime/router.js` `mountApp`). Used when the client bundle was built for the
 * hydrate target and there is server markup to adopt (SSR, and SSG pre-render).
 * Idempotent — a no-op if the sentinel is already present.
 */
export function stampHydrateSentinel(shellHtml) {
  return shellHtml.replace(/<div id="app"([^>]*)>/, (m, attrs) =>
    /\bdata-afw-hydrate\b/.test(attrs) ? m : `<div id="app"${attrs} data-afw-hydrate>`,
  );
}

/**
 * Record the route a prerendered page was rendered for on its hydrate sentinel
 * (`data-afw-hydrate="/docs/x"`), so the client adopts the markup only at that URL
 * and builds the requested route when a host serves this file for another path.
 * A no-op when the shell carries no sentinel (a CSR-only shell).
 */
export function stampRenderedPath(shellHtml, path) {
  const value = String(path).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return shellHtml.replace(/(<div id="app"[^>]*?\sdata-afw-hydrate)(?:="[^"]*")?/, (_m, attr) => `${attr}="${value}"`);
}

/**
 * Inject per-route `<head>` tags before `</head>`, dropping the shell's default
 * `<title>` when the route supplies its own (so each page gets a unique,
 * non-duplicated title). Shared by SSG pre-render and the SSR server.
 */
export function injectHead(shellHtml, headHtml) {
  if (!headHtml) return shellHtml;
  let out = stripRouteHead(shellHtml);
  if (/<title[\s>]/i.test(headHtml)) out = out.replace(/<title>[\s\S]*?<\/title>\s*/i, "");
  // Function replacer so `$` in `headHtml` (e.g. a price in a meta description) is literal.
  return out.replace(/<\/head>/i, () => `${headHtml}\n</head>`);
}

const ROUTE_HEAD_TAG = /<(meta|link)\b[^>]*>\s*|<script\b([^>]*)>[\s\S]*?<\/script>\s*/gi;

/** The attribute `name`'s value in an opening tag, lower-cased; "" if absent. */
function attrOf(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return (m ? (m[1] ?? m[2] ?? m[3]) : "").toLowerCase();
}

/**
 * Remove the shell's route-owned SEO tags (description, robots, `og:`/`twitter:`/`article:`,
 * canonical, JSON-LD, anything marked `data-afw-head`) so the page's own head replaces them.
 * This is the set the client's `updateRouteHead` (runtime/head.js) removes on navigation,
 * so a prerendered page and a client-navigated one end up with the same head.
 */
function stripRouteHead(shellHtml) {
  const head = shellHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!head) return shellHtml;
  const inner = head[1].replace(ROUTE_HEAD_TAG, (tag, el) => {
    if (/\sdata-afw-head\b/i.test(tag)) return "";
    if (el?.toLowerCase() === "meta") {
      const name = attrOf(tag, "name");
      const property = attrOf(tag, "property");
      if (name === "description" || name === "robots" || name.startsWith("twitter:")) return "";
      if (property.startsWith("og:") || property.startsWith("article:")) return "";
    } else if (el?.toLowerCase() === "link") {
      if (attrOf(tag, "rel") === "canonical") return "";
    } else if (attrOf(tag, "type") === "application/ld+json") return "";
    return tag;
  });
  const start = head.index + head[0].indexOf(">") + 1;
  return shellHtml.slice(0, start) + inner + shellHtml.slice(start + head[1].length);
}

/** Set/replace the shell's `<html lang>` for a localized page (i18n; docs/I18N.md §6). */
export function withHtmlLang(shellHtml, locale) {
  if (!locale) return shellHtml;
  if (/<html[^>]*\slang=/i.test(shellHtml)) {
    return shellHtml.replace(/(<html[^>]*\slang=)(["'])[^"']*\2/i, `$1$2${locale}$2`);
  }
  return shellHtml.replace(/<html\b/i, `<html lang="${locale}"`);
}

/** `<link rel="modulepreload">` tags for a route's chunk hrefs (`""` when there are none). */
export function modulepreloadTags(hrefs) {
  if (!hrefs || hrefs.length === 0) return "";
  return hrefs.map((h) => `<link rel="modulepreload" href="${h}">`).join("\n");
}

/** Escape text for an XML/HTML attribute or text node. */
export function escapeXml(s) {
  return String(s).replace(/[&<>'"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "'" ? "&apos;" : "&quot;",
  );
}

/** The locale settings, or `null` when i18n is off. */
export function i18nSettings(i18n) {
  if (!i18n || !Array.isArray(i18n.locales) || !i18n.locales.length) return null;
  return { locales: i18n.locales, defaultLocale: i18n.defaultLocale ?? i18n.locales[0] };
}

/** Prefix a locale-agnostic path with `locale` (bare for the default locale). */
export function localizePath(path, locale, defaultLocale) {
  if (!locale || locale === defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Split a URL path into its locale and locale-agnostic path. */
export function splitLocale(pathname, i18n) {
  const settings = i18nSettings(i18n);
  if (!settings) return { locale: null, path: pathname };
  const m = pathname.match(/^\/([^/]+)(\/.*|)$/);
  if (m && m[1] !== settings.defaultLocale && settings.locales.includes(m[1])) return { locale: m[1], path: m[2] || "/" };
  return { locale: settings.defaultLocale, path: pathname };
}

/** `rel="alternate" hreflang` links for a path across every locale, plus x-default. */
export function alternateLinks(path, i18n) {
  const settings = i18nSettings(i18n);
  if (!settings) return [];
  const links = settings.locales.map((l) => ({ rel: "alternate", hreflang: l, href: localizePath(path, l, settings.defaultLocale) }));
  links.push({ rel: "alternate", hreflang: "x-default", href: localizePath(path, settings.defaultLocale, settings.defaultLocale) });
  return links;
}

/**
 * Render one URL into a complete HTML document.
 *
 * `render` is `{ renderRoute, renderHead }` from the server bundle. `url` is the
 * request path (locale prefix included); `params` overrides the matched route's
 * params (static generation from `getStaticPaths`). With `loaders` (a
 * `createLoaderRegistry`), the route's loader runs with `loaderContext`
 * (`{ request, query, locals }`); a loader calling `notFound()` renders the 404 page.
 * `shell` is the client's `index.html`; a hydrating build marks it with
 * `stampHydrateSentinel` first. `preload` is extra head markup (modulepreload tags).
 * `modifiedTime` adds `article:modified_time` on article pages. `notFound`: what a
 * loader's `notFound()` does — `"render"` the 404 page (a request server), or
 * `"throw"` it to the caller (static generation, which reports the path as failed).
 *
 * @returns {Promise<{ status: number, html: string, dataJson: string, loaded: boolean, metadata: object } | null>}
 *   `null` when no page and no 404 page match.
 */
export async function renderDocument(render, {
  shell, url, params = null, search = "", loaders = null, loaderContext = {}, baseUrl = "", i18n = null,
  preload = "", modifiedTime = null, notFound = "render",
} = {}) {
  const { locale, path } = splitLocale(url, i18n);
  const match = loaders?.match(url);
  let data;
  let dataJson = "";
  if (match) {
    try {
      ({ data, json: dataJson } = await loaders.loadSerialized(match, { query: {}, ...loaderContext }));
    } catch (e) {
      if (e?.afwNotFound !== true || notFound === "throw") throw e;
      return renderNotFound(render, { shell, baseUrl, preload });
    }
  }
  const result = await render.renderRoute(url, params, search, { data });
  if (!result) return null;
  const { html, metadata = {}, hydration = "", status = 200 } = result;
  const alternates = alternateLinks(path, i18n);
  const meta = alternates.length ? { ...metadata, links: [...(metadata.links || []), ...alternates] } : metadata;
  let head = render.renderHead(status === 404 ? { robots: "noindex", ...meta } : meta, { path: url, baseUrl, managed: true });
  if (preload) head += `\n${preload}`;
  // Article tags only on an article: `og:type` "article", or a page with a publish
  // `date`. An index or a landing page is a website; a modified time there describes nothing.
  const published = typeof metadata?.date === "string" ? metadata.date.trim() : "";
  const article = metadata?.openGraph?.type === "article" || Boolean(published);
  if (article && modifiedTime) head += `\n<meta data-afw-head="" property="article:modified_time" content="${escapeXml(modifiedTime)}">`;
  if (published) head += `\n<meta data-afw-head="" property="article:published_time" content="${escapeXml(published)}">`;
  const document = injectRouteData(
    injectHydrationData(
      injectMarkup(injectHead(withHtmlLang(stampRenderedPath(shell, url), locale), head), html),
      hydration,
    ),
    dataJson,
  );
  return { status, html: document, dataJson, loaded: !!match, metadata };
}

/** The 404 page as a document (`noindex`), or `null` when the app has none. */
export async function renderNotFound(render, { shell, baseUrl = "", preload = "" } = {}) {
  const result = await render.renderRoute("/__afw_404__");
  if (!result) return null;
  let head = render.renderHead({ robots: "noindex", ...result.metadata }, { baseUrl, managed: true });
  if (preload) head += `\n${preload}`;
  return {
    status: 404,
    html: injectHydrationData(injectMarkup(injectHead(shell, head), result.html), result.hydration),
    dataJson: "",
    loaded: false,
    metadata: result.metadata ?? {},
  };
}
