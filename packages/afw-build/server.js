// The server half of file-based routing, shared by every toolchain: discover API
// routes (`route.*`), middleware (`_middleware.*`) and loaders (`loader.*`) under
// `app/`, check how they sit beside pages, and generate the `@afw/server` module that
// composes them into one Fetch handler:
//
//   import { createHandler, createPageRenderer } from "@afw/server";
//   const handle = createHandler({
//     files: serveBuiltFile,                          // optional: built assets
//     renderPage: createPageRenderer({ shell }),      // optional: server-rendered pages
//     fallback: () => new Response("Not Found", { status: 404 }),
//   });
//   const response = await handle(request);
//   // middleware → API routes → loader data → files → page render → fallback

import { discoverPages, loaderPageRoutes, routeKey } from "./routes.js";
import { serverFunctionTable } from "./server-functions.js";

/** The specifier a server entry imports. */
export const SERVER_ID = "@afw/server";

const ROUTE_FILE = /^route\.(jsx?|tsx?)$/;
const MIDDLEWARE_FILE = /^_middleware\.(jsx?|tsx?)$/;
const LOADER_FILE = /^loader\.(js|ts)$/;
const LAYOUT_LOADER_FILE = /^layout\.loader\.(js|ts)$/;
const PAGE_FILE = /^page\.(mdx|md|jsx|tsx)$/;
const LAYOUT_FILE = /^layout\.(mdx|md|jsx|tsx)$/;

async function walk(host, dir, exclude, visitFile) {
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
      } else if (isFile) {
        visitFile(entry.name, childAbs, rel);
      }
    }
  }
  await visit(dir, "");
}

/**
 * Server files under `dir`, as sorted absolute paths, plus each folder's page (for
 * the conflict checks).
 *
 * @returns {Promise<{ routes: string[], middleware: string[], loaders: string[], pages: Map<string, string> }>}
 */
export async function discoverServerFiles(host, dir, { exclude = [] } = {}) {
  const routes = [], middleware = [], loaders = [], layoutLoaders = [];
  const pages = new Map(); // folder (relative, "" for the root) → page file
  const layouts = new Set(); // folders with a layout.*
  await walk(host, dir, new Set(exclude), (name, abs, folder) => {
    if (ROUTE_FILE.test(name)) routes.push(abs);
    else if (MIDDLEWARE_FILE.test(name)) middleware.push(abs);
    else if (LOADER_FILE.test(name)) loaders.push(abs);
    else if (LAYOUT_LOADER_FILE.test(name)) layoutLoaders.push(abs);
    else if (PAGE_FILE.test(name)) pages.set(folder, abs);
    else if (LAYOUT_FILE.test(name)) layouts.add(folder);
  });
  return { routes: routes.sort(), middleware: middleware.sort(), loaders: loaders.sort(), layoutLoaders: layoutLoaders.sort(), pages, layouts };
}

/** Whether the app has anything for a server to run. */
export function hasServerFiles({ routes, middleware, loaders, layoutLoaders = [] }) {
  return routes.length + middleware.length + loaders.length + layoutLoaders.length > 0;
}

/** Is `segment` a route group, `(name)` (a folder that is not part of the URL)? */
const isGroupSegment = (segment) => /^\(.+\)$/.test(segment);

/** The URL a folder answers (`dashboard` → `/dashboard`, `(app)/x` → `/x`, "" → `/`). */
export const folderUrl = (folder) => `/${folder.split("/").filter((s) => s && !isGroupSegment(s)).join("/")}`;

/** Is `folder` the group folder `group`, or inside it? (Relative folders, "" = root.) */
const within = (group, folder) => group === "" || folder === group || folder.startsWith(`${group}/`);

const folderOf = (host, dir, file) => {
  const parent = host.path.dirname(file);
  return parent === dir ? "" : parent.slice(dir.length + 1);
};

/**
 * Layout mistakes the server cannot route around: a page and an API route in the
 * same folder (both answer one URL), and a loader with no page beside it.
 *
 * @returns {string[]} one message per problem; empty when the layout is sound.
 */
export function serverConflicts(host, dir, files) {
  const problems = [];
  for (const route of files.routes) {
    const folder = folderOf(host, dir, route);
    if (files.pages.has(folder)) {
      problems.push(`a page and an API route answer /${folder}: ${files.pages.get(folder)} and ${route}. Move one to another folder.`);
    }
  }
  // Route groups drop out of the URL, so files in different groups can answer the same one.
  const byUrl = new Map();
  const answers = [...[...files.pages].map(([folder, file]) => [folder, file]), ...files.routes.map((file) => [folderOf(host, dir, file), file])];
  for (const [folder, file] of answers) {
    const url = folderUrl(folder);
    const other = byUrl.get(url);
    if (other && other.folder !== folder) problems.push(`two routes answer ${url}: ${other.file} and ${file}. Move one to another path.`);
    else byUrl.set(url, { folder, file });
  }
  for (const loader of files.loaders) {
    const folder = folderOf(host, dir, loader);
    if (files.pages.has(folder)) continue;
    const beside = files.routes.some((r) => folderOf(host, dir, r) === folder);
    problems.push(
      `${loader} ${beside ? "sits next to a route.* API endpoint (endpoints take a Request; loaders feed pages)" : "has no sibling page.* to feed"}.`,
    );
  }
  for (const loader of files.layoutLoaders ?? []) {
    if (!files.layouts?.has(folderOf(host, dir, loader))) problems.push(`${loader} has no sibling layout.* to feed.`);
  }
  return problems;
}

/**
 * Generate the `@afw/server` module for the app at `root`. It exports the composed
 * pieces (`apiHandler`, `apiRoutes`, `middleware`, `loaders`) and `createHandler`,
 * whose Fetch handler runs middleware around API routes and loader data, then the
 * optional `files` and `renderPage` steps, then `fallback`. Throws on a layout conflict.
 *
 * With `pages`, the module also registers every page (compiled for the server) and
 * exports `render` (the render API static generation needs) and
 * `createPageRenderer({ shell, baseUrl })`, a `renderPage` step built on
 * `renderDocument`. `drafts: false` leaves unpublished Markdown pages out.
 * `hydrate: false` serves rendered pages without the `data-afw-hydrate` marker, for a
 * browser build that cannot adopt server DOM (one compiled with the `csr` target).
 *
 * @param {{ exclude?: string[], i18n?: { locales: string[], defaultLocale?: string } | null,
 *           pages?: boolean, drafts?: boolean, hydrate?: boolean }} [options]
 * @returns {Promise<{ code: string, files: string[] }>}
 */
export async function serverModule(host, root, { exclude = [], i18n = null, pages = false, drafts = true, hydrate = true, listExports } = {}) {
  const files = await discoverServerFiles(host, root, { exclude });
  const problems = serverConflicts(host, root, files);
  if (problems.length) throw new Error(`AFW server routes:\n  ${problems.join("\n  ")}`);
  const group = (list, prefix) => ({
    imports: list.map((p, i) => `import * as ${prefix}${i} from ${JSON.stringify(p)};`).join("\n"),
    map: list.map((p, i) => `  [${JSON.stringify(p)}]: ${prefix}${i},`).join("\n"),
  });
  const r = group(files.routes, "r"), m = group(files.middleware, "m"), l = group([...files.loaders, ...files.layoutLoaders], "l");
  // Every page route, so a page beneath a layout.loader.* matches without a loader of its own.
  const pageRoutes = [...files.pages.keys()].map((folder) => (folder ? `/${folder}` : "/")).sort();
  const options = { appDir: root };
  if (i18n && Array.isArray(i18n.locales) && i18n.locales.length) {
    options.i18n = { locales: i18n.locales, defaultLocale: i18n.defaultLocale ?? i18n.locales[0] };
  }
  const pageFiles = pages ? await discoverPages(host, root, { exclude, drafts }) : [];
  // Server functions (docs/SERVER_FUNCTIONS.md): `listExports(file)` asks the compiler
  // which exports of a `.server` module are query()/action().
  const fns = listExports ? await serverFunctionTable(host, root, { exclude, listExports }) : { imports: "", table: "", files: [], endpoints: [] };
  // A middleware folder inside a route group covers what the group holds — its pages'
  // and API routes' folders, and its server functions' endpoints — not a URL prefix.
  const groupScopes = {};
  for (const file of files.middleware) {
    const folder = folderOf(host, root, file);
    if (!folder.split("/").some(isGroupSegment)) continue;
    const scopes = [...files.pages.keys(), ...files.routes.map((f) => folderOf(host, root, f))]
      .filter((f) => within(folder, f)).map((f) => `/${f}`);
    const paths = fns.endpoints.filter(([f]) => within(folder, folderOf(host, root, f))).map(([, endpoint]) => endpoint);
    groupScopes[`/${folder}`] = { scopes: [...new Set(scopes)].sort(), paths: paths.sort() };
  }
  if (Object.keys(groupScopes).length) options.groupScopes = groupScopes;
  const p = group(pageFiles, "p");
  const renderPart = pages
    ? `import { collectRoutePaths, configureI18n, registerRoutes, renderHead, renderRoute, resolveMetadata } from "@opentf/afw/server";\n` +
      `import { renderDocument, stampHydrateSentinel } from "@opentf/afw-build/document";\n` +
      (p.imports ? `${p.imports}\n` : "") +
      (options.i18n ? `configureI18n(options.i18n);\n` : "") +
      `registerRoutes({\n${pageFiles.map((f, i) => `  [${JSON.stringify(routeKey(f, root))}]: p${i},`).join("\n")}\n});\n` +
      `export const render = { renderRoute, renderHead, collectRoutePaths, resolveMetadata };\n` +
      `/** A \`renderPage\` step: server-render page requests (\`GET\`/\`HEAD\`) into \`shell\`, the client's index.html. */\n` +
      `export function createPageRenderer({ shell: html, baseUrl = "" }) {\n` +
      // Without `hydrate` (a browser build compiled for `csr`) the page is still
      // server-rendered, but not marked for adoption: the client builds it fresh.
      `  const shell = ${hydrate ? "stampHydrateSentinel(html)" : "html"};\n` +
      `  return async (request, { locals = {} } = {}) => {\n` +
      `    const method = request.method.toUpperCase();\n` +
      `    if (method !== "GET" && method !== "HEAD") return null;\n` +
      `    const url = new URL(request.url);\n` +
      `    let doc;\n` +
      `    try {\n` +
      `      doc = await renderDocument(render, {\n` +
      `        shell, url: url.pathname, search: url.search, loaders, baseUrl, i18n: options.i18n ?? null, errors: "render",\n` +
      `        loaderContext: { request, query: Object.fromEntries(url.searchParams), locals },\n` +
      `      });\n` +
      `    } catch (e) {\n` +
      `      if (e instanceof Response) return e; // a loader redirected or refused (throw new Response)\n` +
      `      throw e;\n` +
      `    }\n` +
      `    if (!doc) return null;\n` +
      `    return new Response(method === "HEAD" ? null : doc.html, {\n` +
      `      status: doc.status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },\n` +
      `    });\n` +
      `  };\n` +
      `}\n`
    : "";
  const code =
    `import { createApiHandler, createFetchHandler, createLoaderRegistry, createMiddleware, createServerFunctions } from "@opentf/afw/server";\n` +
    [r.imports, m.imports, l.imports, fns.imports].filter(Boolean).join("\n") + "\n" +
    `const options = ${JSON.stringify(options)};\n` +
    `const routeModules = {\n${r.map}\n};\n` +
    `const middlewareModules = {\n${m.map}\n};\n` +
    `const loaderModules = {\n${l.map}\n};\n` +
    `export const apiHandler = createApiHandler(routeModules, middlewareModules, options);\n` +
    `export const apiRoutes = createApiHandler(routeModules, {}, options);\n` +
    `export const middleware = createMiddleware(middlewareModules, options);\n` +
    `export const loaders = createLoaderRegistry(loaderModules, { ...options, pageRoutes: ${JSON.stringify(pageRoutes)} });\n` +
    `export const serverFunctions = createServerFunctions({\n${fns.table}\n});\n` +
    `export const loaderRoutes = ${JSON.stringify(loaderPageRoutes({
      pages: pageRoutes,
      pageLoaders: loaderRoutePatterns(host, root, files.loaders),
      layoutLoaders: loaderRoutePatterns(host, root, files.layoutLoaders),
    }))};\n` +
    renderPart +
    `/**\n` +
    ` * A Fetch handler. Inside the middleware: API routes, loader data (\`<path>/__data.json\`),\n` +
    ` * then \`files(request)\` and \`renderPage(request, { locals })\` when given (each may\n` +
    ` * return null to pass). Then \`fallback\`.\n` +
    ` */\n` +
    `export function createHandler({ files, renderPage, fallback } = {}) {\n` +
    `  const terminal = async (request, env, ctx, init) => {\n` +
    `    const locals = init?.locals ?? {};\n` +
    `    return (await apiRoutes(request, env, ctx, init)) ??\n` +
    `      (await serverFunctions.handle(request, { locals, env, ctx })) ??\n` +
    `      (await loaders.handle(request, { locals })) ??\n` +
    `      (files ? await files(request) : null) ??\n` +
    `      (renderPage ? await renderPage(request, { locals }) : null);\n` +
    `  };\n` +
    `  return createFetchHandler(terminal, { middleware, fallback });\n` +
    `}\n`;
  return { code, files: [...files.routes, ...files.middleware, ...files.loaders, ...files.layoutLoaders, ...pageFiles, ...fns.files] };
}

function loaderRoutePatterns(host, root, loaders) {
  return loaders.map((file) => {
    const folder = folderOf(host, root, file);
    return folder ? `/${folder}` : "/";
  }).sort();
}
