// Host primitives for the docs build hooks, shared by both AFW workflows.
//
// The build modules here use no platform modules (`runtime:*`, `node:*`). Each entry point
// installs the host for its platform before anything runs: `@opentf/afw-docs/build`
// the ES-Runtime host (esdev), `@opentf/afw-docs/vite` the Node host (Vite). A
// process builds with one toolchain, so one installed host serves every module.

let current = null;

/** Install the platform host (hosts/esdev.js or hosts/node.js). */
export function useHost(host) {
  current = host;
}

function host() {
  if (!current) {
    throw new Error("@opentf/afw-docs: no build host. Import @opentf/afw-docs/build (esdev) or @opentf/afw-docs/vite (Vite).");
  }
  return current;
}

/** Whether `path` exists — false rather than throwing when it is out of reach. */
export async function exists(path) {
  try {
    return Boolean(await host().kind(path));
  } catch {
    return false;
  }
}

export const readText = (path) => host().readText(path);

export const writeText = (path, text) => host().writeText(path, text);

/** Directory entries (`{ name, isFile, isDir }`), or `[]` when the directory is missing. */
export async function readEntries(dir) {
  try {
    return await host().readDir(dir);
  } catch {
    return [];
  }
}

/** Entry names only — the `readdirSync(dir)` shape. */
export async function readNames(dir) {
  return (await readEntries(dir)).map((e) => e.name);
}

/**
 * Run a command and return its trimmed stdout, or null if it failed. Git is the main
 * caller, and a repo-less checkout must degrade to "no last-updated", never throw.
 */
export async function runOut(program, args, cwd) {
  try {
    return await host().output(program, args, { cwd });
  } catch {
    return null;
  }
}

/** Run a command; resolves `{ ok, stdout, stderr }` (stdout and stderr as text). */
export const run = (program, args, options) => host().exec(program, args, options);

export const join = (...parts) => host().path.join(...parts);
export const dirname = (path) => host().path.dirname(path);
export const relative = (from, to) => host().path.relative(from, to);
export const resolve = (...parts) => host().path.resolve(...parts);
/** A `file:` URL for importing a module by path. */
export const toFileUrl = (path) => host().path.toFileUrl(path);
export const cwd = () => host().cwd();
/** The `afwc` compiler binary (for the search indexer). */
export const afwcPath = () => host().afwcPath();
