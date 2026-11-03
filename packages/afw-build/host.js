// The host interface: everything `@opentf/afw-build` needs from the platform it runs
// on. This package never imports `runtime:*` or `node:*`; each toolchain integration
// (`@opentf/esdev-plugin-afw` on ES-Runtime, `@opentf/vite-plugin-afw` on Node)
// supplies one of these objects, so the build logic is written once.
//
// Paths are absolute and `/`-separated in everything the host returns.

/**
 * @typedef {object} DirEntry
 * @property {string} name
 * @property {boolean} isFile
 * @property {boolean} isDir
 * @property {boolean} [isSymlink]
 */

/**
 * @typedef {object} ChildProcess
 * @property {WritableStream<Uint8Array>} stdin
 * @property {ReadableStream<Uint8Array>} stdout
 * @property {() => void} kill
 * @property {() => void} [ref]  Keep the parent process alive (a compile is in flight).
 * @property {() => void} [unref]  Let the parent exit while the child idles.
 */

/**
 * @typedef {object} BuildHost
 * @property {(path: string) => Promise<string>} readText  Read a UTF-8 file.
 * @property {(path: string) => Promise<DirEntry[]>} readDir  List a directory.
 * @property {(path: string, text: string) => Promise<void>} writeText
 *   Write a UTF-8 file, creating missing parent directories.
 * @property {(path: string) => Promise<"file" | "dir" | null>} kind
 *   What is at `path` (symlinks followed), or `null` when nothing is, or it is unreadable.
 * @property {(program: string, args: string[]) => Promise<ChildProcess>} spawn
 *   Start a long-lived child with piped stdin/stdout and inherited stderr.
 * @property {(program: string, args: string[], options?: { cwd?: string, inherit?: boolean }) => Promise<{ ok: boolean, code: number | null }>} run
 *   Run a command to completion. A missing program resolves `{ ok: false }`.
 * @property {() => string} cwd
 * @property {Record<string, string | undefined>} env
 * @property {{ join: (...parts: string[]) => string, dirname: (path: string) => string, resolve: (...parts: string[]) => string }} path
 */

/** The host methods every caller of a module here may need, checked up front so a
 *  missing method fails with its name instead of "undefined is not a function". */
export function assertHost(host, methods) {
  if (!host || typeof host !== "object") throw new TypeError("afw-build: a host object is required");
  for (const name of methods) {
    const value = name === "path" ? host.path : host[name];
    if (value == null) throw new TypeError(`afw-build: the host is missing \`${name}\``);
  }
  return host;
}
