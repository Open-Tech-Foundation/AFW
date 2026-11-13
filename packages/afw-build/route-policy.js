// Per-route rendering: each folder's `_config.{js,ts}` declares how its pages render
// (`server`, `static`, `client`), and the nearest one up the folder tree wins. The app
// default is the root `_config.js`, else `client`. Resolution needs
// only the files: the compiler reads each config without running it (`route-config`), so
// the result can decide what each bundle contains before any bundle exists.

/** A folder's config file. One per folder; `.js` and `.ts` side by side is an error. */
export const CONFIG_FILE = /^_config\.(js|ts)$/;

/** The render strategies. */
export const RENDERS = ["server", "static", "client"];

const PAGE = /^page\.(mdx|md|[jt]sx)$/;
const LAYOUT = /^layout\.[jt]sx$/;

/** Folder of a `/`-separated relative path ("" for the app root). */
const folderOf = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/** The URL pattern a folder serves: route groups `(name)` are not part of it. */
export function folderRoute(folder) {
  const segments = folder.split("/").filter((s) => s && !/^\(.+\)$/.test(s));
  return `/${segments.join("/")}`;
}

/** The folders from `folder` up to the app root, nearest first. */
function ancestry(folder) {
  const out = [folder];
  for (let f = folder; f; ) {
    f = folderOf(f);
    out.push(f);
  }
  return out;
}

const relative = (root, abs) => abs.slice(root.replace(/\/+$/, "").length + 1);

/**
 * Every `_config.{js,ts}` under `root`, as a map from folder (relative, "" for the
 * root) to absolute path. Excluded subtrees, dot directories and node_modules are skipped.
 */
export async function discoverRouteConfigs(host, root, { exclude = [] } = {}) {
  const found = new Map();
  const skip = new Set(exclude);
  async function visit(abs, rel) {
    let entries;
    try {
      entries = await host.readDir(abs);
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if ([...skip].some((name) => childRel === name || childRel.startsWith(`${name}/`))) continue;
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
      } else if (isFile && CONFIG_FILE.test(entry.name)) {
        if (found.has(rel)) throw new Error(`Two config files for one folder: ${found.get(rel)} and ${childAbs}. Keep one _config.js (or _config.ts).`);
        found.set(rel, childAbs);
      }
    }
  }
  await visit(root, "");
  return found;
}

/**
 * Read each discovered config through the compiler (without running it). Returns a map
 * from folder to `{ file, render, data, paths }`. A config the compiler rejects throws
 * its diagnostic, which names the file and position.
 */
export async function readRouteConfigs(host, compiler, configs) {
  const out = new Map();
  for (const [folder, file] of configs) {
    const raw = await compiler.compile(file, await host.readText(file), false, "route-config");
    const parsed = JSON.parse(typeof raw === "string" ? raw : raw.code);
    out.set(folder, { file, render: parsed.render ?? null, data: parsed.data ?? null, paths: !!parsed.paths });
  }
  return out;
}

/**
 * Resolve every page's policy. `pages` are absolute page/layout/404/loading/error files
 * (as `discoverPages` returns); only `page.*` files are routes. `configs` is the map
 * `readRouteConfigs` returns.
 *
 * Returns `{ defaultRender, routes, policyOf, warnings }`:
 * - `routes`: one entry per page, sorted by route — `{ route, folder, file, render, data,
 *   from }`, where `from` is the config file that decided `render` ("default" without one).
 * - `policyOf(folder)`: the same resolution for any folder (a layout's, say).
 * - `warnings`: config files that govern no page.
 * Throws on a conflict the app must fix: `paths` outside a static folder, `data` outside a
 * client folder, a server or static page inside a client layout.
 */
export function resolveRoutePolicies({ root, pages, configs }) {
  const rootConfig = configs.get("");
  const defaultRender = rootConfig?.render ?? "client";
  const defaultFrom = rootConfig?.render ? rootConfig.file : "default";

  function policyOf(folder) {
    let render = null, from = null, data = null;
    for (const f of ancestry(folder)) {
      const c = configs.get(f);
      if (!c) continue;
      if (!render && c.render) { render = c.render; from = c.file; }
      if (!data && c.data) data = c.data;
    }
    return { render: render ?? defaultRender, from: from ?? defaultFrom, data: (render ?? defaultRender) === "client" ? data ?? "server" : null };
  }

  // A key only means something under the strategy it belongs to.
  for (const [folder, c] of configs) {
    const { render } = policyOf(folder);
    if (c.paths && render !== "static") {
      throw new Error(`${c.file}: \`paths\` lists the pages a static route builds, but this folder renders "${render}". Remove it, or set render: "static".`);
    }
    if (c.data && render !== "client") {
      throw new Error(`${c.file}: \`data\` applies to client routes, but this folder renders "${render}". Remove it, or set render: "client".`);
    }
  }

  const routes = [];
  const layoutFolders = pages.map((abs) => relative(root, abs)).filter((rel) => LAYOUT.test(rel.split("/").pop())).map(folderOf);
  for (const abs of pages) {
    const rel = relative(root, abs);
    if (!PAGE.test(rel.split("/").pop())) continue;
    const folder = folderOf(rel);
    const policy = policyOf(folder);
    // The server cannot render inside a layout it never loads.
    if (policy.render !== "client") {
      const client = ancestry(folder).find((f) => layoutFolders.includes(f) && policyOf(f).render === "client");
      if (client !== undefined) {
        throw new Error(
          `${abs} renders "${policy.render}", but the layout in app/${client ? `${client}/` : ""} renders "client": ` +
          `the server cannot render a page inside a layout that renders in the browser. Make this folder "client" too, or move the page out of it.`,
        );
      }
    }
    routes.push({ route: folderRoute(folder), folder, file: abs, ...policy });
  }
  routes.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : a.folder < b.folder ? -1 : 1));

  // `paths` lists the pages of the dynamic route in its own folder; it is not inherited.
  for (const [folder, c] of configs) {
    if (!c.paths) continue;
    const own = routes.find((r) => r.folder === folder);
    if (!own || !own.route.includes("[")) {
      throw new Error(`${c.file}: \`paths\` lists the pages of a dynamic route, but this folder has no dynamic page (like [slug]/page.jsx). Move it to that page's folder.`);
    }
  }

  const warnings = [];
  for (const [folder, c] of configs) {
    if (!routes.some((r) => r.folder === folder || r.folder.startsWith(folder ? `${folder}/` : ""))) {
      warnings.push(`${c.file} governs no page: there is no page.* in its folder or below it.`);
    }
  }
  return { defaultRender, routes, policyOf, warnings };
}

/**
 * The route files (from `discoverPages`: pages, layouts, 404, loading and error files)
 * that render in the browser: those in a folder whose policy is `client`. The generated
 * route tables mark them with `clientRoute`, and the server bundle leaves them out.
 */
export function clientRouteFiles({ policyOf }, root, files) {
  return new Set(files.filter((abs) => policyOf(folderOf(relative(root, abs))).render === "client"));
}

/**
 * How the app renders overall: `server` when any route renders per request, else `static`
 * when any is built, else `client` (the default, also for an app without pages).
 */
export function appRender({ defaultRender, routes }) {
  const strategies = new Set(routes.map((r) => r.render));
  if (strategies.size === 0) strategies.add(defaultRender);
  return strategies.has("server") ? "server" : strategies.has("static") ? "static" : "client";
}

/** The configs that declare `paths`, as `[routePattern, configFile]` for the server module. */
export function staticPathConfigs({ routes }, configs) {
  return routes.filter((r) => configs.get(r.folder)?.paths).map((r) => [r.folder ? `/${r.folder}` : "/", configs.get(r.folder).file]);
}

/** Each route's strategy keyed by its route-table pattern (`/`, `/(legal)/privacy`), for the server module. */
export function routeRenders({ routes }) {
  return Object.fromEntries(routes.map((r) => [r.folder ? `/${r.folder}` : "/", r.render]));
}

/** The resolved policies as the build prints them: route, render, and the file that decided it. */
export function formatRouteTable(routes, root = "") {
  const from = (f) => (root && f.startsWith(`${root}/`) ? `app/${f.slice(root.length + 1)}` : f);
  const rows = [["Route", "Render", "From"], ...routes.map((r) => [r.route, r.render + (r.data === "client" ? " (data: client)" : ""), from(r.from)])];
  const widths = [0, 1].map((i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => `${row[0].padEnd(widths[0])}  ${row[1].padEnd(widths[1])}  ${row[2]}`).join("\n");
}

/** The route manifest written beside the build (`routes.json`): what each route resolved to. */
export function routeManifest({ defaultRender, routes }, root = "") {
  const rel = (f) => (root && f.startsWith(`${root}/`) ? `app/${f.slice(root.length + 1)}` : f);
  return {
    version: 1,
    default: defaultRender,
    routes: routes.map((r) => ({ route: r.route, render: r.render, ...(r.data ? { data: r.data } : {}), page: rel(r.file), from: rel(r.from) })),
  };
}
