// Route-pattern matching shared by the page router, API routes, route loaders and
// middleware scopes, so `[param]` / `[...rest]` folders behave identically in each.
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

/** Regex source for a route with `[param]` / `[...rest]` segments. Named groups
 *  become params; literal parts are regex-escaped (`v1.0` must not match `v1X0`). */
function patternSource(route) {
  return route
    .split(PARAM_SPLIT)
    .map((part) => {
      if (part.startsWith("[...")) return `(?<${part.slice(4, -1)}>.+)`;
      if (part.startsWith("[")) return `(?<${part.slice(1, -1)}>[^/]+)`;
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  if (scope === "/") return /^\//;
  return new RegExp(`^${patternSource(scope)}(?:/.*)?$`);
}

// Segment kinds, most specific first.
const segmentKind = (seg) => (seg.startsWith("[...") ? 2 : seg.startsWith("[") ? 1 : 0);

/**
 * Sort comparator: more specific routes first. Compares segment kinds left to
 * right (static < `[param]` < `[...rest]`); with equal kinds the route with more
 * segments is more specific; the final tie-break is lexical, for a deterministic order.
 */
export function compareRoutes(a, b) {
  const sa = a.split("/").filter(Boolean);
  const sb = b.split("/").filter(Boolean);
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
