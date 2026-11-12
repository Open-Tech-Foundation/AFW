// Per-route rendering: each folder's `_config.{js,ts}` declares how its pages render
// (`server`, `static`, `client`), and the nearest one up the folder tree wins. The app
// default is the root `_config.js`, else the plugin's `mode` shorthand. Resolution needs
// only the files: the compiler reads each config without running it (`route-config`), so
// the result can decide what each bundle contains before any bundle exists.

/** A folder's config file. One per folder; `.js` and `.ts` side by side is an error. */
export const CONFIG_FILE = /^_config\.(js|ts)$/;

/** The render strategies. */
export const RENDERS = ["server", "static", "client"];

/** The plugin's `mode` shorthand, as the app default it stands for. */
export const RENDER_OF_MODE = { spa: "client", ssg: "static", ssr: "server" };

const PAGE = /^page\.(mdx|md|[jt]sx)$/;

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
 * `readRouteConfigs` returns. `mode` is the plugin option as the app passed it
 * (`undefined` when it did not).
 *
 * Returns `{ defaultRender, routes, policyOf, warnings }`:
 * - `routes`: one entry per page, sorted by route — `{ route, folder, file, render, data,
 *   from }`, where `from` is the config file that decided `render` (or `mode` / the default).
 * - `policyOf(folder)`: the same resolution for any folder (a layout's, say).
 * - `warnings`: config files that govern no page.
 * Throws on a conflict the app must fix: a root `render` and a `mode` together, `paths`
 * outside a static folder, `data` outside a client folder.
 */
export function resolveRoutePolicies({ root, pages, configs, mode }) {
  const rootConfig = configs.get("");
  if (rootConfig?.render && mode !== undefined) {
    throw new Error(
      `The app default is set twice: render "${rootConfig.render}" in ${rootConfig.file} and mode "${mode}" in the plugin options. ` +
      `Set it in one place (the root _config.js).`,
    );
  }
  if (mode !== undefined && !RENDER_OF_MODE[mode]) throw new Error(`Unknown AFW rendering mode: ${mode} (expected spa, ssg, or ssr)`);
  const defaultRender = rootConfig?.render ?? RENDER_OF_MODE[mode ?? "spa"];
  const defaultFrom = rootConfig?.render ? rootConfig.file : mode !== undefined ? `mode: "${mode}"` : "default";

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
  for (const abs of pages) {
    const rel = relative(root, abs);
    if (!PAGE.test(rel.split("/").pop())) continue;
    const folder = folderOf(rel);
    routes.push({ route: folderRoute(folder), folder, file: abs, ...policyOf(folder) });
  }
  routes.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : a.folder < b.folder ? -1 : 1));

  const warnings = [];
  for (const [folder, c] of configs) {
    if (!routes.some((r) => r.folder === folder || r.folder.startsWith(folder ? `${folder}/` : ""))) {
      warnings.push(`${c.file} governs no page: there is no page.* in its folder or below it.`);
    }
  }
  return { defaultRender, routes, policyOf, warnings };
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
