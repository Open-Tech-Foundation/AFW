// Server functions at build time (docs/SERVER_FUNCTIONS.md), shared by every toolchain:
// find the app's `*.server.{js,ts}` modules, give each `query()` / `action()` export a
// stable endpoint under its folder, and generate the browser stub that calls it.
//
// Endpoints are computed here and nowhere else: the browser stub and the server's
// endpoint table both come from `serverFunctionEndpoint`, so they cannot disagree.

/** A server module's file name. */
export const SERVER_MODULE_FILE = /\.server\.(?:[cm]?js|[cm]?ts)$/;

// FNV-1a, 64-bit: a stable, short id that does not reveal the file path.
function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

const relativeTo = (root, file) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : null);

/**
 * The endpoint of export `name` of the server module `file` under the app at `root`:
 * `<folder>/__fn/<id>`, so the folder's `_middleware` governs it.
 */
export function serverFunctionEndpoint(root, file, name) {
  const rel = relativeTo(root, file);
  if (rel === null) throw new Error(`${file}: server modules must be inside the app directory (${root})`);
  const folder = rel.includes("/") ? `/${rel.slice(0, rel.lastIndexOf("/"))}` : "";
  return `${folder}/__fn/${fnv1a64(`${rel}#${name}`)}`;
}

/** Every `*.server` module under `dir`, sorted, skipping dot folders, node_modules and `exclude`. */
export async function discoverServerModules(host, dir, { exclude = [] } = {}) {
  const skip = new Set(exclude);
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
      if ([...skip].some((name) => childRel === name || childRel.startsWith(`${name}/`))) continue;
      const childAbs = host.path.join(abs, entry.name);
      if (entry.isDir) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") await visit(childAbs, childRel);
      } else if (entry.isFile && SERVER_MODULE_FILE.test(entry.name)) {
        found.push(childAbs);
      }
    }
  }
  await visit(dir, "");
  return found.sort();
}

/**
 * The exports of a server module, from the compiler (`afwc serve`'s `server-exports`):
 * `[{ name, kind: "query" | "action" | null }]`. Rejects with the compiler's diagnostic
 * for shapes it cannot read statically.
 */
export async function serverExports(compiler, file, source) {
  const out = await compiler.compile(file, source, false, "server-exports");
  return JSON.parse(typeof out === "string" ? out : out.code).exports;
}

/**
 * The browser module that replaces a server module: one fetch stub per server function.
 * Plain exports are left out, so importing a server-only helper from browser code fails
 * the build instead of shipping it.
 */
export function serverFunctionStub(root, file, exports) {
  const lines = [`import { serverFunction } from "@opentf/afw";`];
  for (const { name, kind } of exports) {
    if (!kind) continue;
    const endpoint = JSON.stringify(serverFunctionEndpoint(root, file, name));
    lines.push(name === "default"
      ? `export default serverFunction(${endpoint}, ${JSON.stringify(kind)});`
      : `export const ${name} = serverFunction(${endpoint}, ${JSON.stringify(kind)});`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The server side: for each server module, its import and the endpoint table entries.
 * `listExports(file)` returns the module's exports (see `serverExports`).
 *
 * @returns {Promise<{ imports: string, table: string, files: string[] }>}
 */
export async function serverFunctionTable(host, root, { exclude = [], listExports }) {
  const files = await discoverServerModules(host, root, { exclude });
  const imports = [];
  const entries = [];
  for (const [i, file] of files.entries()) {
    const exports = await listExports(file);
    const fns = exports.filter((e) => e.kind);
    if (!fns.length) continue;
    imports.push(`import * as sf${i} from ${JSON.stringify(file)};`);
    for (const { name } of fns) {
      entries.push(`  [${JSON.stringify(serverFunctionEndpoint(root, file, name))}]: sf${i}[${JSON.stringify(name)}],`);
    }
  }
  return { imports: imports.join("\n"), table: entries.join("\n"), files };
}
