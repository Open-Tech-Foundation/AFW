// `@opentf/vite-plugin-afw` — AFW for Vite: the Node half of AFW's two official
// workflows (the other is esdev + ES-Runtime, `@opentf/esdev-plugin-afw`). Both wire
// the same core, `@opentf/afw-build`, into their toolchain's plugin API.
//
//   // vite.config.js
//   import afw from "@opentf/vite-plugin-afw";
//   export default { plugins: [afw({ mode: "spa" })] };
//
//   // entry.js
//   import { mountApp } from "@opentf/afw";
//   import { guard, pages, loaderRoutes } from "@afw/routes";
//   mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
//
// Server code runs on Node, so server routes, loaders and SSR can use any npm
// package, native addons included.

import { fileURLToPath } from "node:url";

import {
  FRAMEWORK_IMPORT, ROUTES_ID, SOURCE_FILTER,
  chooseTarget, compileModule, resolveAppRoot, resolveCompiler, routesModule, startCompilerServer,
  usesServerEntry, validateOptions,
} from "@opentf/afw-build";
import { afwcPath } from "@opentf/afw-compiler/node";

import { nodeHost } from "./host.js";

const VIRTUAL_PREFIX = `\0${ROUTES_ID}:`;
const ROUTE_FILE = /(?:^|\/)(?:(?:page|layout|404)\.(?:mdx|md|jsx|tsx)|loader\.(?:js|ts)|routeGuard\.(?:js|ts))$/;
// AFW's own packages ship ES modules and JSX sources the compiler must see, so the
// dependency optimizer leaves them alone.
const OWN_PACKAGES = ["@opentf/afw", "@opentf/afw-docs", "@opentf/afw-form", "@opentf/afw-i18n", "@opentf/afw-test"];

const cleanId = (id) => id.replace(/[?#].*$/, "");

// The compiler's hot output accepts updates through the runtime (`registerHotRoute`,
// `registerHotModule` call `import.meta.hot.accept()`). Vite decides which modules
// are update boundaries by finding a literal `import.meta.hot.accept(` in the source,
// so instrumented modules state it here too; the runtime still invalidates when an
// edit cannot be applied in place.
const HOT_REGISTRATION = /\bregisterHot(?:Route|Module)\(import\.meta\.hot\b/;
const viteHot = (code) => (HOT_REGISTRATION.test(code) ? `${code}\nif (import.meta.hot) import.meta.hot.accept();\n` : code);
const slash = (p) => p.replaceAll("\\", "/");

/**
 * @param {{ mode?: "spa" | "ssg" | "ssr", appDir?: string, exclude?: string[],
 *           routes?: boolean, target?: "csr" | "ssg" | "hydrate" }} [options]
 *   `mode` — how pages render in release builds (as in the esdev plugin).
 *   `appDir` — the routes folder; a leaf name anchors beside the importing entry.
 *   `exclude` — folders under `appDir` that hold no routes. `routes: false` drops the
 *   `@afw/routes` module. `target` forces one compiler backend (tests, custom builds).
 */
export default function afw({ mode = "spa", appDir = "app", exclude = [], routes = true, target } = {}) {
  validateOptions({ mode, target });

  let command = "serve";
  let server = null; // the afwc client, started on the first compiled module
  let serverPromise = null;
  const appRoots = new Set(); // resolved app dirs, for route-file watching

  function compiler() {
    serverPromise ??= resolveCompiler(nodeHost, {
      cliDir: slash(fileURLToPath(new URL(".", import.meta.url))),
      resolvePackagedCompiler: afwcPath,
    }).then(({ afwc }) => (server = startCompilerServer(afwc, { sourceMap: true, spawn: nodeHost.spawn })));
    return serverPromise;
  }

  async function closeCompiler() {
    const s = server ?? (serverPromise ? await serverPromise.catch(() => null) : null);
    server = null;
    serverPromise = null;
    await s?.close();
  }

  const isServer = (ctx, options) => ctx.environment?.config?.consumer === "server" || !!options?.ssr;

  return {
    name: "afw",
    enforce: "pre",

    config() {
      // The compiler owns these extensions; Vite's own JSX/TS transform must not
      // re-read the compiled output as JSX. Vite 8 transforms with Oxc, Vite 7 with esbuild.
      const transformer = this?.meta?.rolldownVersion ? "oxc" : "esbuild";
      return {
        [transformer]: { exclude: [SOURCE_FILTER] },
        optimizeDeps: { exclude: [...OWN_PACKAGES] },
        ssr: { noExternal: [/^@opentf\/afw/] },
      };
    },

    configResolved(config) {
      command = config.command;
    },

    configureServer(devServer) {
      devServer.httpServer?.once("close", closeCompiler);
      // A new or deleted route file changes the route table, not just one module.
      const refresh = (file) => {
        const path = slash(file);
        if (!ROUTE_FILE.test(path) || ![...appRoots].some((root) => path.startsWith(`${root}/`))) return;
        for (const env of Object.values(devServer.environments ?? { client: devServer })) {
          const graph = env.moduleGraph;
          for (const root of appRoots) {
            const mod = graph?.getModuleById?.(VIRTUAL_PREFIX + root);
            if (mod) graph.invalidateModule(mod);
          }
        }
        devServer.ws.send({ type: "full-reload" });
      };
      devServer.watcher.on("add", refresh);
      devServer.watcher.on("unlink", refresh);
    },

    async closeBundle() {
      if (command === "build") await closeCompiler();
    },

    async resolveId(source, importer, options) {
      if (routes && source === ROUTES_ID) {
        const root = await resolveAppRoot(nodeHost, appDir, importer ? slash(cleanId(importer)) : undefined);
        appRoots.add(root);
        return VIRTUAL_PREFIX + root;
      }
      if (FRAMEWORK_IMPORT.test(source) && usesServerEntry({ target, server: isServer(this, options) })) {
        return this.resolve("@opentf/afw/server", importer, { skipSelf: true });
      }
      return null;
    },

    async load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;
      const root = id.slice(VIRTUAL_PREFIX.length);
      // Drafts and scheduled pages are routes in the dev server only.
      const { code, files } = await routesModule(nodeHost, root, { exclude, drafts: command === "serve" });
      for (const file of files) this.addWatchFile(file);
      return { code, map: null };
    },

    async transform(code, id, options) {
      const file = cleanId(id);
      if (!SOURCE_FILTER.test(file) || file.startsWith("\0")) return null;
      const serverBuild = isServer(this, options);
      const moduleTarget = chooseTarget({ mode, target, server: serverBuild, dev: command === "serve" && !serverBuild });
      const client = await compiler();
      try {
        const out = await compileModule(client, code, file, {
          target: moduleTarget,
          hot: command === "serve" && !serverBuild,
          failOnError: true,
        });
        return { code: viteHot(out.code), map: out.map, moduleType: "js", moduleSideEffects: true };
      } catch (e) {
        // Report through Vite, so the dev overlay and build output show the
        // compiler's position and code frame.
        const diag = e?.diag ?? {};
        this.error({
          message: diag.message ?? e?.message ?? String(e),
          id: file,
          loc: diag.line ? { file: diag.file ?? file, line: diag.line, column: Math.max(0, (diag.column ?? 1) - 1) } : undefined,
          frame: diag.frame,
        });
      }
    },
  };
}
