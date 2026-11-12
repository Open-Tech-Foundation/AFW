// Route-pattern matching shared by the page router, API routes, route loaders and
// middleware scopes, so `[param]` / `[...rest]` folders behave identically in each.
//
// A route is its *folder path*, which decides layouts, loaders and error files:
// `/(app)/dashboard`. Its *URL* drops route-group segments — folders in parentheses —
// so that page answers `/dashboard` (`urlOf`). `[[param]]` and `[[...rest]]` are
// optional segments: the URL matches with or without them.
//
// Precedence is by specificity, segment by segment: a static segment beats a
// `[param]`, which beats a `[...rest]`. So `/blog/new` wins over `/blog/[slug]` and
// `/api/[id]` wins over `/api/[...rest]`, whatever order the files were discovered in
// and whatever the params are called.

/**
 * Strip the app-directory prefix from a route/middleware file path. When the caller
 * knows the app dir, the exact prefix is removed — unambiguous even for an
 * `app/app/...` folder. Without it, fall back to the last complete `/app` path
 * segment; the lookahead keeps folders that merely *start* with "app"
 * (`/appointments`, `/apps`) intact.
 */
export function stripAppDir(filePath, appDir) {
  if (appDir) {
    const base = appDir.replace(/\/+$/, "");
    if (filePath.startsWith(base + "/")) return filePath.slice(base.length);
  }
  return filePath.replace(/^.*\/app(?=\/)/, "");
}

/** Drop a trailing slash, except for the root "/". */
export const normalizePath = (p) => (p || "/").replace(/(.)\/+$/, "$1");

const PARAM_SPLIT = /(\[\.\.\.[^\]]+\]|\[[^\]]+\])/;
const OPTIONAL = /^\[\[(\.\.\.)?([^\]]+)\]\]$/;

/** Is `segment` a route group, `(name)`: a folder that is not part of the URL? */
export const isGroupSegment = (segment) => /^\(.+\)$/.test(segment);

/** Does the folder route contain a route group? */
export const hasGroup = (route) => (route ?? "").split("/").some(isGroupSegment);

/** The URL pattern of a folder route: its group segments dropped (`/(app)/x` → `/x`). */
export function urlOf(route) {
  const url = (route ?? "/").split("/").filter((s) => s && !isGroupSegment(s)).join("/");
  return `/${url}`;
}

/**
 * Folder routes that answer the same URL — two route groups holding the same path
 * (`/(a)/about` and `/(b)/about`). Returns `[url, first, second]` triples.
 */
export function urlCollisions(routes) {
  const seen = new Map();
  const out = [];
  for (const route of routes) {
    const url = urlOf(route);
    if (seen.has(url) && seen.get(url) !== route) out.push([url, seen.get(url), route]);
    else seen.set(url, route);
  }
  return out;
}

/** Regex source for one URL segment with `[param]` / `[...rest]` parts. Named groups
 *  become params; literal parts are regex-escaped (`v1.0` must not match `v1X0`). */
function segmentSource(segment) {
  return segment
    .split(PARAM_SPLIT)
    .map((part) => {
      if (part.startsWith("[...")) return `(?<${part.slice(4, -1)}>.+)`;
      if (part.startsWith("[")) return `(?<${part.slice(1, -1)}>[^/]+)`;
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
}

/** Regex source for a route's URL; an optional segment carries its own leading slash. */
function patternSource(route) {
  return urlOf(route)
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const optional = segment.match(OPTIONAL);
      if (optional) return `(?:/(?<${optional[2]}>${optional[1] ? ".+" : "[^/]+"}))?`;
      return `/${segmentSource(segment)}`;
    })
    .join("");
}

/** A full-path matcher for `route`; the optional trailing slash is tolerated. */
export function compileRoute(route) {
  return new RegExp(`^${patternSource(route)}/?$`);
}

/**
 * A scope matcher for a middleware folder route: the folder itself and anything
 * nested under it. `/users/[id]` covers `/users/7` and `/users/7/edit`; `/` covers
 * every path.
 */
export function compileScope(scope) {
  const source = patternSource(scope);
  if (source === "") return /^\//;
  return new RegExp(`^${source}(?:/.*)?$`);
}

/**
 * The matcher for a middleware folder. A folder inside a route group cannot be a URL
 * prefix — `/(app)` is `/`, which would cover every page — so it covers exactly what
 * the group holds: `group.scopes` (the folders of its pages and API routes, each with
 * everything nested under it) and `group.paths` (exact URLs, its server functions).
 * Without that list it falls back to the URL prefix. Returns `{ test(path) }`.
 */
export function scopeMatcher(scope, group = null) {
  if (!hasGroup(scope) || !group) return compileScope(scope);
  const scopes = (group.scopes ?? []).map(compileScope);
  const paths = new Set(group.paths ?? []);
  return { test: (path) => paths.has(path) || scopes.some((m) => m.test(path)) };
}

// Segment kinds, most specific first: static, `[param]`, `[[param]]`, `[...rest]`, `[[...rest]]`.
const segmentKind = (seg) => {
  const optional = seg.match(OPTIONAL);
  if (optional) return optional[1] ? 4 : 2;
  return seg.startsWith("[...") ? 3 : seg.startsWith("[") ? 1 : 0;
};

/**
 * Sort comparator: more specific routes first, by URL (groups dropped). Compares
 * segment kinds left to right (static < `[param]` < `[[param]]` < `[...rest]` <
 * `[[...rest]]`); with equal kinds the route with more segments is more specific; the
 * final tie-break is lexical, for a deterministic order.
 */
export function compareRoutes(a, b) {
  const sa = urlOf(a).split("/").filter(Boolean);
  const sb = urlOf(b).split("/").filter(Boolean);
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const d = segmentKind(sa[i]) - segmentKind(sb[i]);
    if (d !== 0) return d;
  }
  if (sa.length !== sb.length) return sb.length - sa.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Percent-decode a match's named groups into params: catch-all segments are split
 * first (so an encoded `%2F` never adds a segment) and arrive as an array. Returns
 * `null` on malformed percent-encoding when `strict`, else keeps the raw text.
 */
export function decodeParams(route, groups, { strict = false } = {}) {
  const params = { ...(groups || {}) };
  for (const k in params) {
    if (params[k] === undefined) continue; // an optional segment that is absent
    const decode = (s) => {
      try {
        return decodeURIComponent(s);
      } catch (e) {
        if (strict) throw e;
        return s;
      }
    };
    try {
      params[k] = route.includes(`[...${k}]`) ? params[k].split("/").map(decode) : decode(params[k]);
    } catch {
      return null;
    }
  }
  return params;
}

/**
 * Mark a route-table entry (page, layout, loading or error file) as rendered in the
 * browser — its folder's `_config.js` says `render: "client"`. The generated route tables
 * wrap these entries: the client's keeps the lazy import, the server's has none (the module
 * never enters the server bundle). A server render stops at the first such entry and
 * leaves its region empty; the client builds it there.
 */
export function clientRoute(load) {
  const entry = load ?? (() => {
    throw new Error("This route renders in the browser: its module is not part of the server bundle.");
  });
  entry.__afwClient = true;
  return entry;
}

/** Whether a route-table entry renders in the browser (see {@link clientRoute}). */
export const isClientRoute = (entry) => entry?.__afwClient === true;
