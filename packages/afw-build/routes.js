// File-convention routing shared by every toolchain: crawl `app/` for page, layout,
// 404 and loader files and generate the `@afw/routes` module an entry imports:
//
//   import { mountApp } from "@opentf/afw";
//   import { guard, pages, loaderRoutes } from "@afw/routes";
//
// Route keys keep their `/app/...` shape because the runtime's `routeFromPath`
// anchors on it; layouts compose by path (`layout.jsx` wraps its directory).

/** The specifier entries import. */
export const ROUTES_ID = "@afw/routes";

const PAGE_FILE = /^(page|layout|404|loading|error)\.(mdx|md|jsx|tsx)$/;
const LOADER_FILE = /^loader\.(js|ts)$/;
const LAYOUT_LOADER_FILE = /^layout\.loader\.(js|ts)$/;

/**
 * Whether Markdown source is unpublished: frontmatter `draft: true`, or a `date`
 * later than `now` (scheduled). Production builds leave such pages out of the route
 * table, so their text never reaches a bundle; dev servers keep them. The same rule
 * as `@opentf/afw-docs` publish.js, which drives the post list, feeds and docs nav.
 */
export function isUnpublishedSource(source, now = Date.now()) {
  const block = source.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!block) return false;
  const field = (key) => {
    const m = block.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`, "m"));
    return m ? m[1].replace(/^(["'])(.*)\1$/, "$2") : null;
  };
  if (field("draft") === "true") return true;
  const date = field("date");
  if (!date) return false;
  const at = new Date(date).getTime();
  return !Number.isNaN(at) && at > now;
}

/** {@link isUnpublishedSource} for a file; non-Markdown and unreadable files are published. */
export async function isUnpublishedPage(host, path, now = Date.now()) {
  if (!/\.(mdx|md)$/.test(path)) return false;
  let source;
  try {
    source = await host.readText(path);
  } catch {
    return false;
  }
  return isUnpublishedSource(source, now);
}

/**
 * Every file under `dir` whose name matches `pattern`, as `/`-separated paths
 * relative to `dir`, sorted. Dot directories and `node_modules` are skipped, and
 * so are excluded subtrees (`exclude` holds paths relative to `dir`).
 */
async function walk(host, dir, pattern, exclude) {
  const found = [];
  async function visit(abs, rel) {
    let entries;
    try {
      entries = await host.readDir(abs);
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if ([...exclude].some((name) => childRel === name || childRel.startsWith(`${name}/`))) continue;
      const childAbs = host.path.join(abs, entry.name);
      let isDir = entry.isDir;
      let isFile = entry.isFile;
      if (entry.isSymlink) {
        const kind = await host.kind(childAbs);
        isDir = kind === "dir";
        isFile = kind === "file";
      }
      if (isDir) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        await visit(childAbs, childRel);
      } else if (isFile && pattern.test(entry.name)) {
        found.push(childRel);
      }
    }
  }
  await visit(dir, "");
  return found.sort();
}

/**
 * Page, layout, 404, loading and error files under `dir`, as absolute paths. A
 * Markdown 404, loading or error file is an error (each is a component the router
 * renders with props). Without `drafts`, unpublished Markdown pages are left out.
 */
export async function discoverPages(host, dir, { exclude = [], drafts = true } = {}) {
  const out = [];
  for (const rel of await walk(host, dir, PAGE_FILE, new Set(exclude))) {
    const abs = host.path.join(dir, rel);
    if (/(^|\/)404\.(mdx|md)$/.test(rel)) {
      throw new Error(`Unsupported Markdown 404 route: ${abs}. Use 404.jsx or 404.tsx instead.`);
    }
    const special = /(?:^|\/)(loading|error)\.(?:mdx|md)$/.exec(rel);
    if (special) {
      throw new Error(`Unsupported Markdown ${special[1]} file: ${abs}. Use ${special[1]}.jsx or ${special[1]}.tsx instead.`);
    }
    if (!drafts && (await isUnpublishedPage(host, abs))) continue;
    out.push(abs);
  }
  return out;
}

/** Loader files under `dir` as `[route, absPath]` pairs, sorted by route. A route
 *  with both `loader.js` and `loader.ts` is an error. `{ layout: true }` finds
 *  `layout.loader.{js,ts}` files instead, keyed by their layout's folder. */
export async function discoverLoaders(host, dir, { exclude = [], layout = false } = {}) {
  const routes = new Map();
  for (const rel of await walk(host, dir, layout ? LAYOUT_LOADER_FILE : LOADER_FILE, new Set(exclude))) {
    const pattern = rel.replace(/(^|\/)(?:layout\.)?loader\.(js|ts)$/, "") || "/";
    const route = pattern.startsWith("/") ? pattern : `/${pattern}`;
    const abs = host.path.join(dir, rel);
    if (routes.has(route)) throw new Error(`Conflicting ${layout ? "layout " : ""}loaders for ${route}: ${routes.get(route)} and ${abs}`);
    routes.set(route, abs);
  }
  return [...routes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Does the layout at `folder` wrap the page at `route`? (Mirrors `@opentf/afw/server`.) */
const layoutWraps = (folder, route) => folder === "/" || route === folder || route.startsWith(`${folder}/`);

/**
 * The page routes with loader data — their own `loader.*`, or any page beneath a
 * `layout.loader.*` — which the client router fetches `__data.json` for. Mirrors
 * `loaderPageRoutes` in `@opentf/afw/server`, which this package does not import.
 */
export function loaderPageRoutes({ pages = [], pageLoaders = [], layoutLoaders = [] }) {
  const out = new Set(pageLoaders);
  for (const page of pages) if (layoutLoaders.some((folder) => layoutWraps(folder, page))) out.add(page);
  return [...out].sort();
}

/** The route a `page.*` file serves: its folder (`/` for the app root). */
const pageRoute = (file, root) => routeKey(file, root).replace(/^\/app/, "").replace(/\/page\.[^/]+$/, "") || "/";

function stripAppPrefix(filePath, appDir) {
  if (appDir) {
    const base = appDir.replace(/\/+$/, "");
    if (filePath.startsWith(base + "/")) return filePath.slice(base.length);
  }
  return filePath.replace(/^.*\/app(?=\/)/, "");
}

/** The route-table key for a route file — keeps `/app` so `routeFromPath` resolves it. */
export function routeKey(filePath, appDir) {
  return `/app${stripAppPrefix(filePath, appDir)}`;
}

/** The optional `app/routeGuard.{js,ts}`, or null. */
export async function findGuard(host, appDir) {
  for (const name of ["routeGuard.js", "routeGuard.ts"]) {
    const path = host.path.join(appDir, name);
    if ((await host.kind(path)) === "file") return path;
  }
  return null;
}

/**
 * The app directory for an entry. A leaf `appDir` ("app") anchors at the importing
 * entry's site root — the nearest ancestor holding that folder — so one option value
 * serves every app in a repository. A nested path ("website/app") resolves against
 * the working directory.
 */
export async function resolveAppRoot(host, appDir, importer) {
  if (appDir.includes("/") || !importer) return host.path.resolve(host.cwd(), appDir);
  let dir = host.path.dirname(importer);
  for (;;) {
    if ((await host.kind(host.path.join(dir, appDir))) === "dir") return host.path.join(dir, appDir);
    const up = host.path.dirname(dir);
    if (up === dir) return host.path.resolve(host.cwd(), appDir);
    dir = up;
  }
}

/**
 * Generate the `@afw/routes` module for the app at `root`: lazy page imports, the
 * loader route patterns (never the loader modules — they are server-only), and the
 * optional route guard. `files` lists every file the module was derived from, so a
 * toolchain can rebuild it when one changes.
 *
 * @returns {Promise<{ code: string, files: string[] }>}
 */
export async function routesModule(host, root, { exclude = [], drafts = true } = {}) {
  const pages = await discoverPages(host, root, { exclude, drafts });
  const loaders = await discoverLoaders(host, root, { exclude });
  const layoutLoaders = await discoverLoaders(host, root, { exclude, layout: true });
  const guard = await findGuard(host, root);
  // Route groups drop out of the URL: two groups holding the same page path collide.
  const byUrl = new Map();
  for (const file of pages.filter((p) => /\/page\.[^/]+$/.test(p))) {
    const route = pageRoute(file, root);
    const url = `/${route.split("/").filter((s) => s && !/^\(.+\)$/.test(s)).join("/")}`;
    if (byUrl.has(url)) throw new Error(`Two pages answer ${url}: ${byUrl.get(url)} and ${file}. Move one to another path.`);
    byUrl.set(url, file);
  }
  const loaderRoutes = loaderPageRoutes({
    pages: pages.filter((p) => /\/page\.[^/]+$/.test(p)).map((p) => pageRoute(p, root)),
    pageLoaders: loaders.map(([route]) => route),
    layoutLoaders: layoutLoaders.map(([route]) => route),
  });
  const map = pages
    .map((p) => `  [${JSON.stringify(routeKey(p, root))}]: () => import(${JSON.stringify(p)}),`)
    .join("\n");
  const code =
    `export const pages = {\n${map}\n};\n` +
    `export const loaderRoutes = ${JSON.stringify(loaderRoutes)};\n` +
    (guard ? `export { default as guard } from ${JSON.stringify(guard)};\n` : `export const guard = undefined;\n`);
  const loaderFiles = [...loaders, ...layoutLoaders].map(([, file]) => file);
  return { code, files: [...pages, ...loaderFiles, ...(guard ? [guard] : [])] };
}
