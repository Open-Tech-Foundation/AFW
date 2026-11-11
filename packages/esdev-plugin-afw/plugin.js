// `runtime:build` plugins for AFW: compile `.jsx`/`.tsx` (and `.mdx`/`.md`
// sources that lower to JSX) through the `afwc` IR compiler.
//
// Pass the returned objects in a driver's `plugins` array:
//
//   import { build } from "runtime:build";
//   import { afwPlugin } from "@opentf/esdev-plugin-afw";
//
//   const bundle = await build({
//     input: "app/page.jsx",
//     plugins: [afwPlugin(afwc, { target: "csr" })],
//   });
//
// `afwc` is the compiler binary path — see `resolveCompiler()` in
// `./compiler.js`. One persistent `afwc serve` child serves every module of
// every build in the process (see `startCompilerServer`).

import {
  FRAMEWORK_IMPORT, SOURCE_FILTER, chooseTarget, compileModule as compileWith, usesServerEntry, validateOptions,
} from "@opentf/afw-build";

import { resolveCompiler, startCompilerServer } from "./compiler.js";

// The project has one plugin list. Its rendering mode is an option; the host
// supplies the command/platform for each hook, including unbundled imports.
function renderingTarget(mode, ctx) {
  return chooseTarget({
    mode,
    server: ctx?.platform === "server",
    dev: ctx?.command === "test" || ctx?.command === "start",
  });
}

/**
 * Project-plugin factory for `esdev.json`:
 *
 *   { "plugins": [{ "module": "@opentf/esdev-plugin-afw",
 *                   "export": "createAfwPlugin",
 *                   "options": { "target": "csr" } }] }
 *
 * Deliberately synchronous: it only builds the plugin object — the compiler
 * resolves lazily on the first transformed module (same one-process
 * `afwc serve` child as `afwPlugin`). An async factory would depend on the
 * host awaiting it; this shape works either way.
 */
export function createAfwPlugin({ target, mode = "spa", failOnError = false, onResult, quiet, getCompiler } = {}) {
  validateOptions({ mode, target });
  const getServer = getCompiler ?? lazyCompiler();
  return {
    name: "afw",
    resolve: serverImports(target),
    transform: {
      // Same host-side filter as `afwPlugin` below.
      filter: { id: SOURCE_FILTER },
      async handler(code, id, ctx) {
        // A preceding transform may already have lowered this JSX to JS.
        if (ctx?.type === "js" && /\.[jt]sx$/.test(id)) return null;
        const server = await getServer();
        return compileModule(server, code, id, {
          target: target ?? renderingTarget(mode, ctx),
          failOnError, onResult, quiet, ctx,
        });
      },
    },
  };
}

/** A getter for one `afwc serve` child, started on first use. */
export function lazyCompiler() {
  let serverPromise = null;
  return () => (serverPromise ??= resolveCompiler().then(({ afwc }) => startCompilerServer(afwc, { sourceMap: true })));
}

// Plain JS shared modules do not pass through the JSX compiler. Resolve their
// framework imports to the same DOM-free entry as compiled server components.
function serverImports(target) {
  return {
    filter: { id: FRAMEWORK_IMPORT },
    async handler(source, importer, ctx) {
      if (!usesServerEntry({ target, server: ctx?.platform === "server" })) return null;
      return ctx.resolve("@opentf/afw/server", importer);
    },
  };
}

// esdev's transform result: afwc has already lowered the JSX, so the result is no
// longer JSX — saying so keeps the bundler from parsing a `.jsx` id as JSX a second
// time. A `.tsx` source keeps its TypeScript (afwc lowers JSX, not types), so it is
// `ts`, which the bundler strips; called `js`, its first annotation is a parse
// error. No side-effect flag: a compiled component registers on the first read of
// its `.tag`, so the bundler's own analysis is right and drops unused components.
async function compileModule(server, code, id, { target, failOnError, onResult, quiet, ctx }) {
  const { code: out, map } = await compileWith(server, code, id, {
    target, hot: !!ctx?.hot, failOnError, onResult, quiet,
    error: ctx?.error ? (message) => ctx.error(message) : undefined,
  });
  return { code: out, ...(map ? { map } : {}), type: moduleType(id) };
}

/** What a compiled module is: TypeScript for a `.tsx` source, JavaScript otherwise. */
export function moduleType(id) {
  return /\.tsx$/i.test(id.split("?")[0]) ? "ts" : "js";
}

/**
 * Bundler plugin: compile `.jsx`/`.tsx` through the `afwc` IR compiler. Page /
 * layout / 404 / loading / error modules become factories; everything else a Custom Element. On a
 * compile error it emits a diagnostic stub (so one bad route doesn't sink the
 * build) unless `failOnError` is set (production builds should fail loudly).
 * `onResult(id, diagnosticOrNull)` is called per module so the driver can push
 * compile diagnostics to an error overlay and clear them once fixed. The
 * diagnostic is the compiler's structured one
 * (`{ file, message, line, column, frame, note }`). `quiet()` takes back a
 * live progress line before the diagnostic is printed; drivers without one
 * leave the default no-op.
 *
 * Compilation runs through one persistent `afwc serve` process per plugin instance
 * (see `startCompilerServer`). `target` picks the codegen backend: `"csr"` (the live
 * DOM build), `"ssg"` (HTML-string renderers), or `"hydrate"` (the dual module — a
 * CSR build factory plus an adopt factory for first-paint hydration).
 */
export function afwPlugin(afwc, { failOnError = false, onResult, target = "csr", quiet = () => {} } = {}) {
  const server = startCompilerServer(afwc, { sourceMap: true });
  return {
    // The compiler child is not torn down from a hook — the bundler validates hook
    // names strictly, and there is nothing to tear down per build anyway: one child
    // serves every build, and it exits on the EOF its stdin gets when we do.
    name: "afw",
    resolve: serverImports(target),
    transform: {
      // Matched on the Rust side, so a module the compiler has no business seeing
      // never costs a crossing into this isolate.
      filter: { id: SOURCE_FILTER },
      async handler(code, id, ctx) {
        return compileModule(server, code, id, { target, failOnError, onResult, quiet, ctx });
      },
    },
  };
}
