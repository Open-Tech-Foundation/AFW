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
// Server code — API routes, middleware, loaders — runs on Node, in the dev server
// and in the built `dist/server/index.js`, so it can use any npm package, native
// addons included.

import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FRAMEWORK_IMPORT, ROUTES_ID, SERVER_ID, SERVER_MODULE_FILE, SOURCE_FILTER, discoverServerModules, serverExports,
  serverFunctionStub,
  chooseTarget, compileModule, discoverServerFiles, hasServerFiles, resolveAppRoot, resolveCompiler,
  prerender, routesModule, serverModule, stampHydrateSentinel, startCompilerServer, usesServerEntry,
  validateOptions,
} from "@opentf/afw-build";
import { sendWebResponse, toWebRequest } from "@opentf/afw/server/adapters/node";
import { afwcPath } from "@opentf/afw-compiler/node";

import { nodeHost } from "./host.js";

const VIRTUAL_PREFIX = `\0${ROUTES_ID}:`;
const SERVER_PREFIX = `\0${SERVER_ID}:`;
// The built server's entry: starts the Node server around `@afw/server`.
const NODE_SERVER_ID = "@afw/node-server";
const ROUTE_FILE = /(?:^|\/)(?:(?:page|layout|404|loading|error)\.(?:mdx|md|jsx|tsx)|loader\.(?:js|ts)|routeGuard\.(?:js|ts))$/;
const SERVER_FILE = /(?:^|\/)(?:route\.(?:jsx?|tsx?)|_middleware\.(?:jsx?|tsx?)|loader\.(?:js|ts)|page\.(?:mdx|md|jsx|tsx)|[^/]+\.server\.(?:[cm]?js|[cm]?ts))$/;
// The dev server's fallback: nothing on the app's server answered, so Vite serves it.
const PASS_HEADER = "x-afw-vite-pass";
const pass = () => new Response(null, { status: 404, headers: { [PASS_HEADER]: "1" } });
// AFW's own packages ship ES modules and JSX sources the compiler must see, so the
// dependency optimizer leaves them alone.
// A file inside one of AFW's packages in an installed app.
export const AFW_PACKAGE_PATH = /[\\/]node_modules[\\/]@opentf[\\/]/;
const OWN_PACKAGES = ["@opentf/afw", "@opentf/afw-docs", "@opentf/afw-form", "@opentf/afw-i18n", "@opentf/afw-test"];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The project's AFW source packages: dependencies that declare `@opentf/afw` (as a peer
 * or a dependency), such as component libraries publishing JSX. Like AFW's own
 * packages, they must go through the compiler: never pre-bundled, never loaded from
 * node_modules as they are by Node or Vitest.
 */
export async function afwSourcePackages(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies })
    .filter((name) => !name.startsWith("@opentf/"));
  const found = [];
  for (const name of names) {
    // The package's own manifest, from the nearest node_modules up from the project.
    for (let dir = root; ; dir = nodeHost.path.dirname(dir)) {
      try {
        const dep = JSON.parse(await readFile(join(dir, "node_modules", name, "package.json"), "utf8"));
        if (dep.peerDependencies?.["@opentf/afw"] || dep.dependencies?.["@opentf/afw"]) found.push(name);
        break;
      } catch {
        if (nodeHost.path.dirname(dir) === dir) break;
      }
    }
  }
  return found;
}

const cleanId = (id) => id.replace(/[?#].*$/, "");
// Imports the generated server modules make on the plugin's behalf. They are the
// plugin's dependencies, not the app's, so they resolve from here: under a strict
// layout (pnpm) the app cannot see them.
const PLUGIN_IMPORT = /^@opentf\/(?:afw-build|vite-plugin-afw)(?:\/|$)/;
const PLUGIN_FILE = fileURLToPath(import.meta.url);
// Sources whose compiled output is plain JavaScript (`.tsx` compiles to TypeScript).
const JS_SOURCE_FILTER = /\.(mdx|md|jsx)$/;

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
 *           routes?: boolean, server?: boolean | "auto", target?: "csr" | "ssg" | "hydrate",
 *           i18n?: { locales: string[], defaultLocale?: string } }} [options]
 *   `mode` — how pages render in release builds (as in the esdev plugin).
 *   `appDir` — the routes folder; a leaf name anchors beside the importing entry.
 *   `exclude` — folders under `appDir` that hold no routes. `routes: false` drops the
 *   `@afw/routes` module. `server` — build `dist/server` (default `"auto"`: when the
 *   app has API routes, middleware or loaders). `target` forces one compiler backend.
 *   `i18n` — locale prefixes the server's middleware, loaders and pages strip.
 *   `baseUrl` — the site's absolute URL, for canonical links and `sitemap.xml`.
 */
export default function afw({
  mode = "spa", appDir = "app", exclude = [], routes = true, server: serverBuild = "auto", target, i18n = null,
  baseUrl = "",
} = {}) {
  validateOptions({ mode, target });
  if (![true, false, "auto"].includes(serverBuild)) throw new Error(`AFW server option must be true, false or "auto"`);

  let command = "serve";
  // Under Vitest (mode "test"), modules compile for the test's DOM environment:
  // client rendering, no refresh code, framework imports left as they are.
  let testing = false;
  // Whether this build has a server to answer server functions (a prerendered site
  // built with \`server: false\` has none).
  let shipsServer = true;
  let projectRoot = nodeHost.cwd();
  let server = null; // the afwc client, started on the first compiled module
  let serverPromise = null;
  let afwcBinary; // the resolved compiler path, shared with other plugins' build steps

  // The compiler binary. Resolved on demand: under Vite's builder each environment
  // build gets its own plugin instances, so the one running \`buildApp\` may never
  // have compiled a module itself.
  async function compilerBinary() {
    afwcBinary ??= (await resolveCompiler(nodeHost, {
      cliDir: slash(fileURLToPath(new URL(".", import.meta.url))),
      resolvePackagedCompiler: afwcPath,
    })).afwc;
    return afwcBinary;
  }
  const appRoots = new Set(); // resolved app dirs, for route-file watching

  function compiler() {
    serverPromise ??= resolveCompiler(nodeHost, {
      cliDir: slash(fileURLToPath(new URL(".", import.meta.url))),
      resolvePackagedCompiler: afwcPath,
    }).then(({ afwc }) => {
      afwcBinary = afwc;
      return (server = startCompilerServer(afwc, { sourceMap: true, spawn: nodeHost.spawn }));
    });
    return serverPromise;
  }

  async function closeCompiler() {
    const s = server ?? (serverPromise ? await serverPromise.catch(() => null) : null);
    server = null;
    serverPromise = null;
    await s?.close();
  }

  const isServer = (ctx, options) => !testing && (ctx.environment?.config?.consumer === "server" || !!options?.ssr);
  // Release server bundles render pages unless the app is an SPA; the dev server
  // renders pages on the client, so its `@afw/server` carries server routes only.
  const serverPages = () => command === "build" && mode !== "spa";

  // Static generation: render every route of the built server bundle into the client.
  // Other plugins take part through their `api`: `afwPrerenderData()` supplies the site
  // URL and per-page last-updated times, `afwFinish()` post-processes the output
  // (`@opentf/afw-docs/vite`: search index, feeds, llms.txt).
  async function prerenderSite({ clientOut, serverOut, plugins }) {
    const helpers = plugins.map((p) => p.api).filter(Boolean);
    const data = await Promise.all(helpers.filter((a) => a.afwPrerenderData).map((a) => a.afwPrerenderData()));
    const siteUrl = baseUrl || data.find((d) => d?.baseUrl)?.baseUrl || "";
    const lastUpdated = Object.assign({}, ...data.map((d) => d?.lastUpdated ?? {}));
    const app = await import(pathToFileURL(join(serverOut, "app.js")).href);
    const shellHtml = stampHydrateSentinel(await readFile(join(clientOut, "index.html"), "utf8"));
    const result = await prerender(nodeHost, {
      render: app.render, shellHtml, outDir: slash(clientOut), publicDir: nodeHost.path.join(projectRoot, "public"),
      baseUrl: siteUrl, lastUpdated, i18n, loaders: app.loaders,
    });
    if (result.failed.length) throw new Error(`AFW prerender failed for ${result.failed.join(", ")}`);
    console.log(`AFW prerendered ${result.count} page(s)${result.skipped.length ? `; skipped ${result.skipped.join(", ")} (no getStaticPaths)` : ""}`);
    for (const api of helpers) {
      if (api.afwFinish) await api.afwFinish({ outDir: slash(clientOut), siteDescription: result.siteDescription, baseUrl: siteUrl, afwc: await compilerBinary() });
    }
  }
  // The app directory the server half serves. It has no importing entry, so a leaf
  // `appDir` is found from the project root.
  const serverRoot = () => resolveAppRoot(nodeHost, appDir, join(projectRoot, "index.html").replaceAll("\\", "/"));

  return {
    name: "afw",
    enforce: "pre",

    async config(userConfig, env) {
      // The compiler lowers JSX; Vite's own transform must not re-read its output as
      // JSX. Compiled `.tsx` still carries its TypeScript types, so Vite's transform
      // keeps running there to strip them. Vite 8 transforms with Oxc, Vite 7 with esbuild.
      const rolldown = !!this?.meta?.rolldownVersion;
      const rootOption = userConfig.root ?? userConfig.test?.root;
      const root = slash(rootOption ? nodeHost.path.resolve(nodeHost.cwd(), rootOption) : nodeHost.cwd());
      const libraries = await afwSourcePackages(root);
      const libraryPaths = libraries.map((name) => new RegExp(`[\\\\/]node_modules[\\\\/]${escapeRegExp(name).replace("/", "[\\\\/]")}[\\\\/]`));
      const config = {
        [rolldown ? "oxc" : "esbuild"]: { exclude: [JS_SOURCE_FILTER] },
        optimizeDeps: { exclude: [...OWN_PACKAGES, ...libraries] },
        // AFW's own server code and AFW source packages are bundled into dist/server;
        // the app's other npm dependencies stay external and load from node_modules.
        ssr: { noExternal: [/^@opentf\/afw/, /^@opentf\/vite-plugin-afw/, ...libraries] },
      };
      if (env.mode === "test") {
        // AFW packages ship JSX sources (afw-docs components); Vitest must run them
        // through the compiler rather than load them from node_modules as they are.
        // Vitest matches resolved paths as well as names, so both forms are listed:
        // in an installed app the files sit under node_modules/@opentf/.
        return { ...config, test: { server: { deps: { inline: [/^@opentf\//, AFW_PACKAGE_PATH, ...libraries, ...libraryPaths] } } } };
      }
      if (env.command !== "build") return config;
      projectRoot = slash(userConfig.root ? nodeHost.path.resolve(nodeHost.cwd(), userConfig.root) : nodeHost.cwd());
      // Whether to ship a Node server: always for server-rendered pages; otherwise
      // when asked, or ("auto") when the app has API routes, middleware or loaders.
      const appRoot = await serverRoot();
      const ship = mode === "ssr" || serverBuild === true ||
        (serverBuild === "auto" && (hasServerFiles(await discoverServerFiles(nodeHost, appRoot, { exclude })) ||
          (await discoverServerModules(nodeHost, appRoot, { exclude })).length > 0));
      shipsServer = ship;
      if (!ship && mode !== "ssg") return config;
      const outDir = nodeHost.path.resolve(projectRoot, userConfig.build?.outDir ?? "dist");
      const bundlerOptions = rolldown ? "rolldownOptions" : "rollupOptions";
      // A static site with no server keeps the client at dist/ and renders from a
      // throwaway server bundle; otherwise dist/client + dist/server (`index.js`
      // starts the Node server, `app.js` exports `createHandler`).
      const clientOut = ship ? `${outDir}/client` : outDir;
      const serverOut = ship ? `${outDir}/server` : nodeHost.path.join(projectRoot, "node_modules", ".afw-ssg");
      const input = ship ? { index: NODE_SERVER_ID, app: SERVER_ID } : { app: SERVER_ID };
      return {
        ...config,
        environments: {
          client: { build: { outDir: clientOut } },
          ssr: { build: { outDir: serverOut, emptyOutDir: true, [bundlerOptions]: { input } } },
        },
        builder: {
          async buildApp(builder) {
            await builder.build(builder.environments.client);
            await builder.build(builder.environments.ssr);
            if (mode === "ssg") await prerenderSite({ clientOut, serverOut, plugins: builder.config.plugins });
            if (!ship) await rm(serverOut, { recursive: true, force: true });
          },
        },
      };
    },

    configResolved(config) {
      command = config.command;
      testing = config.mode === "test";
      projectRoot = slash(config.root);
    },

    configureServer(devServer) {
      devServer.httpServer?.once("close", closeCompiler);
      // A new or deleted route file changes the route table, not just one module; a
      // new or deleted server file changes `@afw/server`.
      const invalidate = (prefix, roots) => {
        for (const env of Object.values(devServer.environments ?? { client: devServer })) {
          const graph = env.moduleGraph;
          for (const root of roots) {
            const mod = graph?.getModuleById?.(prefix + root);
            if (mod) graph.invalidateModule(mod);
          }
        }
      };
      const refresh = (file) => {
        const path = slash(file);
        if (SERVER_FILE.test(path)) void serverRoot().then((root) => invalidate(SERVER_PREFIX, [root]));
        if (!ROUTE_FILE.test(path) || ![...appRoots].some((root) => path.startsWith(`${root}/`))) return;
        invalidate(VIRTUAL_PREFIX, appRoots);
        devServer.ws.send({ type: "full-reload" });
      };
      devServer.watcher.on("add", refresh);
      devServer.watcher.on("unlink", refresh);
      // An edited .server module may add or remove server functions: rebuild the table.
      devServer.watcher.on("change", (file) => {
        if (SERVER_MODULE_FILE.test(slash(file))) void serverRoot().then((root) => invalidate(SERVER_PREFIX, [root]));
      });

      // Server routes run on Node inside the dev server. Installed after Vite's own
      // middlewares, so modules and assets never reach the app's `_middleware`; what
      // the app's server doesn't answer falls through to Vite (the app shell).
      return () => {
        devServer.middlewares.use(async (req, res, next) => {
          // Vite rewrites page navigations to /index.html before this point.
          const url = req.url;
          req.url = req.originalUrl ?? req.url;
          try {
            const app = await devServer.ssrLoadModule(SERVER_ID);
            const response = await app.createHandler({ fallback: pass })(await toWebRequest(req));
            if (response.headers.get(PASS_HEADER)) {
              req.url = url;
              return next();
            }
            await sendWebResponse(res, response);
          } catch (error) {
            req.url = url;
            devServer.ssrFixStacktrace?.(error);
            next(error);
          }
        });
      };
    },

    // `vite preview` of a prerendered site: Vite's preview only finds a page's
    // `index.html` with a trailing slash and answers everything else with the home
    // page. Serve `<path>/index.html` when it was prerendered, else `404.html` with 404.
    configurePreviewServer(previewServer) {
      if (mode !== "ssg") return;
      const outDir = nodeHost.path.resolve(previewServer.config.root, previewServer.config.build.outDir);
      const isFile = (file) => stat(file).then((s) => s.isFile(), () => false);
      previewServer.middlewares.use(async (req, res, next) => {
        try {
          if (!["GET", "HEAD"].includes(req.method) || !(req.headers.accept ?? "").includes("text/html")) return next();
          const url = new URL(req.url, "http://preview");
          const pathname = decodeURIComponent(url.pathname);
          const page = nodeHost.path.join(outDir, pathname, "index.html");
          if (!page.startsWith(`${outDir}/`) && page !== `${outDir}/index.html`) return next();
          if (await isFile(page)) {
            req.url = `${pathname.replace(/\/+$/, "")}/index.html${url.search}`;
            return next();
          }
          if (await isFile(nodeHost.path.join(outDir, pathname))) return next();
          const notFound = nodeHost.path.join(outDir, "404.html");
          res.statusCode = 404;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(req.method === "HEAD" ? undefined : (await isFile(notFound)) ? await readFile(notFound) : "Not Found");
        } catch (error) {
          next(error);
        }
      });
    },

    async closeBundle() {
      if (command === "build") await closeCompiler();
    },

    async resolveId(source, importer, options) {
      if (PLUGIN_IMPORT.test(source) && importer?.startsWith("\0")) {
        return this.resolve(source, PLUGIN_FILE, { skipSelf: true });
      }
      if (source === SERVER_ID) return SERVER_PREFIX + (await serverRoot()) + (serverPages() ? "?pages" : "");
      if (source === NODE_SERVER_ID) return `\0${NODE_SERVER_ID}`;
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

    async load(id, options) {
      // A .server module in browser code becomes fetch stubs (docs/SERVER_FUNCTIONS.md);
      // server builds keep the real module.
      const file = cleanId(id);
      if (SERVER_MODULE_FILE.test(file) && !file.startsWith("\0") && !isServer(this, options)) {
        const root = await serverRoot();
        if (!file.startsWith(`${root}/`)) this.error(`${file}: server modules must be inside the app directory (${root})`);
        if (!shipsServer) this.error(`${file}: a server function cannot be called from this build, which has no server (server: false)`);
        const source = await nodeHost.readText(file);
        let exports;
        try {
          exports = await serverExports(await compiler(), file, source);
        } catch (e) {
          const diag = e?.diag ?? {};
          this.error({ message: diag.message ?? e?.message ?? String(e), id: file, loc: diag.line ? { file, line: diag.line, column: Math.max(0, (diag.column ?? 1) - 1) } : undefined, frame: diag.frame });
        }
        return { code: serverFunctionStub(root, file, exports), map: null, moduleType: "js" };
      }
      if (id === `\0${NODE_SERVER_ID}`) {
        return (
          `import * as app from ${JSON.stringify(SERVER_ID)};\n` +
          `import { startServer } from "@opentf/vite-plugin-afw/server";\n` +
          `export const { createHandler } = app;\n` +
          `await startServer({ app, mode: ${JSON.stringify(mode)}, baseUrl: ${JSON.stringify(baseUrl)}, clientDir: new URL("../client/", import.meta.url) });\n`
        );
      }
      if (id.startsWith(SERVER_PREFIX)) {
        const [root, query] = id.slice(SERVER_PREFIX.length).split("?");
        const pages = query === "pages";
        const listExports = async (file) => serverExports(await compiler(), file, await nodeHost.readText(file));
        const { code, files } = await serverModule(nodeHost, root, { exclude, i18n, pages, drafts: !pages, listExports });
        for (const file of files) this.addWatchFile(file);
        return { code, map: null };
      }
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
      const moduleTarget = chooseTarget({ mode, target, server: serverBuild, dev: testing || (command === "serve" && !serverBuild) });
      const client = await compiler();
      try {
        const out = await compileModule(client, code, file, {
          target: moduleTarget,
          hot: command === "serve" && !serverBuild && !testing,
          failOnError: true,
        });
        // No side-effect flag: a compiled component registers on the first read of its
        // `.tag`, so Vite's own analysis is right and drops unused components.
        return { code: viteHot(out.code), map: out.map, moduleType: file.endsWith(".tsx") ? "ts" : "js" };
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
