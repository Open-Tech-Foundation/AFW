// The server half of file-based routing, shared by every toolchain: discover API
// routes (`route.*`), middleware (`_middleware.*`) and loaders (`loader.*`) under
// `app/`, check how they sit beside pages, and generate the `@afw/server` module that
// composes them into one Fetch handler:
//
//   import { createHandler } from "@afw/server";
//   const handle = createHandler({ fallback: (request) => serveStaticOrShell(request) });
//   const response = await handle(request);   // middleware → API → loader data → fallback

/** The specifier a server entry imports. */
export const SERVER_ID = "@afw/server";

const ROUTE_FILE = /^route\.(jsx?|tsx?)$/;
const MIDDLEWARE_FILE = /^_middleware\.(jsx?|tsx?)$/;
const LOADER_FILE = /^loader\.(js|ts)$/;
const PAGE_FILE = /^page\.(mdx|md|jsx|tsx)$/;

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
  const routes = [], middleware = [], loaders = [];
  const pages = new Map(); // folder (relative, "" for the root) → page file
  await walk(host, dir, new Set(exclude), (name, abs, folder) => {
    if (ROUTE_FILE.test(name)) routes.push(abs);
    else if (MIDDLEWARE_FILE.test(name)) middleware.push(abs);
    else if (LOADER_FILE.test(name)) loaders.push(abs);
    else if (PAGE_FILE.test(name)) pages.set(folder, abs);
  });
  return { routes: routes.sort(), middleware: middleware.sort(), loaders: loaders.sort(), pages };
}

/** Whether the app has anything for a server to run. */
export function hasServerFiles({ routes, middleware, loaders }) {
  return routes.length + middleware.length + loaders.length > 0;
}

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
  for (const loader of files.loaders) {
    const folder = folderOf(host, dir, loader);
    if (files.pages.has(folder)) continue;
    const beside = files.routes.some((r) => folderOf(host, dir, r) === folder);
    problems.push(
      `${loader} ${beside ? "sits next to a route.* API endpoint (endpoints take a Request; loaders feed pages)" : "has no sibling page.* to feed"}.`,
    );
  }
  return problems;
}

/**
 * Generate the `@afw/server` module for the app at `root`. It exports the composed
 * pieces (`apiHandler`, `apiRoutes`, `middleware`, `loaders`) and `createHandler`,
 * whose Fetch handler runs middleware around API routes, then loader data, then the
 * `fallback` — static files, the app shell or a rendered page, as the host decides.
 * Throws on a layout conflict.
 *
 * @param {{ exclude?: string[], i18n?: { locales: string[], defaultLocale?: string } | null }} [options]
 * @returns {Promise<{ code: string, files: string[] }>}
 */
export async function serverModule(host, root, { exclude = [], i18n = null } = {}) {
  const files = await discoverServerFiles(host, root, { exclude });
  const problems = serverConflicts(host, root, files);
  if (problems.length) throw new Error(`AFW server routes:\n  ${problems.join("\n  ")}`);
  const group = (list, prefix) => ({
    imports: list.map((p, i) => `import * as ${prefix}${i} from ${JSON.stringify(p)};`).join("\n"),
    map: list.map((p, i) => `  [${JSON.stringify(p)}]: ${prefix}${i},`).join("\n"),
  });
  const r = group(files.routes, "r"), m = group(files.middleware, "m"), l = group(files.loaders, "l");
  const options = { appDir: root };
  if (i18n && Array.isArray(i18n.locales) && i18n.locales.length) {
    options.i18n = { locales: i18n.locales, defaultLocale: i18n.defaultLocale ?? i18n.locales[0] };
  }
  const code =
    `import { createApiHandler, createFetchHandler, createLoaderRegistry, createMiddleware } from "@opentf/afw/server";\n` +
    [r.imports, m.imports, l.imports].filter(Boolean).join("\n") + "\n" +
    `const options = ${JSON.stringify(options)};\n` +
    `const routeModules = {\n${r.map}\n};\n` +
    `const middlewareModules = {\n${m.map}\n};\n` +
    `const loaderModules = {\n${l.map}\n};\n` +
    `export const apiHandler = createApiHandler(routeModules, middlewareModules, options);\n` +
    `export const apiRoutes = createApiHandler(routeModules, {}, options);\n` +
    `export const middleware = createMiddleware(middlewareModules, options);\n` +
    `export const loaders = createLoaderRegistry(loaderModules, options);\n` +
    `export const loaderRoutes = ${JSON.stringify(loaderRoutePatterns(host, root, files.loaders))};\n` +
    `// API routes, then loader data (\`<path>/__data.json\`), sharing middleware's locals.\n` +
    `async function routes(request, env, ctx, init) {\n` +
    `  return (await apiRoutes(request, env, ctx, init)) ?? (await loaders.handle(request, { locals: init?.locals ?? {} }));\n` +
    `}\n` +
    `/** A Fetch handler: middleware around API routes and loader data, then \`fallback\`. */\n` +
    `export function createHandler({ fallback } = {}) {\n` +
    `  return createFetchHandler(routes, { middleware, fallback });\n` +
    `}\n`;
  return { code, files: [...files.routes, ...files.middleware, ...files.loaders] };
}

function loaderRoutePatterns(host, root, loaders) {
  return loaders.map((file) => {
    const folder = folderOf(host, root, file);
    return folder ? `/${folder}` : "/";
  }).sort();
}
