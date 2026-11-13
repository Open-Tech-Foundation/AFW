// Per-route render policies for esdev (each folder's `_config.js`), resolved once per
// app root and build, and shared by the plugin's hooks: the route table marks client
// entries, `@afw/server` leaves them out and labels responses, and the compiler picks
// each module's target from the app's shape.
//
// The shape's `mode` is `ssr` when any route renders per request, else `ssg` when any is
// static, else `spa` — the same rule as the Vite plugin.

import {
  clientRouteFiles, discoverPages, discoverRouteConfigs, discoverServerFiles, discoverServerModules, formatRouteTable,
  hasServerFiles, readRouteConfigs, resolveRoutePolicies, routeRenders, staticPathConfigs,
} from "@opentf/afw-build";

import { esdevHost } from "./host.js";

/**
 * A cache of each app root's shape. `mode` is the plugin option as the project gave it
 * (`undefined` when it did not); `getCompiler()` returns the `afwc serve` client.
 */
export function createAppShape({ exclude = [], mode, getCompiler }) {
  const cache = new Map();
  const printed = new Set();

  async function compute(root, command) {
    const files = await discoverPages(esdevHost, root, { exclude, drafts: command === "start" });
    const configs = await readRouteConfigs(esdevHost, await getCompiler(), await discoverRouteConfigs(esdevHost, root, { exclude }));
    const resolved = resolveRoutePolicies({ root, pages: files, configs, mode });
    const strategies = new Set(resolved.routes.map((r) => r.render));
    if (strategies.size === 0) strategies.add(resolved.defaultRender);
    const renders = routeRenders(resolved);
    const hasServer = hasServerFiles(await discoverServerFiles(esdevHost, root, { exclude })) ||
      (await discoverServerModules(esdevHost, root, { exclude })).length > 0;
    return {
      root, resolved, hasServer,
      mode: strategies.has("server") ? "ssr" : strategies.has("static") ? "ssg" : "spa",
      clientFiles: clientRouteFiles(resolved, root, files),
      renders,
      staticPaths: staticPathConfigs(resolved, configs),
      configFiles: [...configs.values()].map((c) => c.file),
    };
  }

  return {
    /** The shape of the app at `root` for this build (`command`: "build", "start", "test"). */
    of(root, command) {
      const key = `${command ?? ""}\0${root}`;
      if (!cache.has(key)) {
        cache.set(key, compute(root, command).then((shape) => {
          // A release build reports what each route resolved to, once per app.
          if (command === "build" && shape.resolved.routes.length && !printed.has(root)) {
            printed.add(root);
            for (const warning of shape.resolved.warnings) console.warn(`⚠ ${warning}`);
            console.log(`AFW routes\n${formatRouteTable(shape.resolved.routes, root)}\n`);
          }
          return shape;
        }, (error) => {
          cache.delete(key);
          throw error;
        }));
      }
      return cache.get(key);
    },
    /** Forget every shape: a new build reads the configs again. */
    reset() {
      cache.clear();
    },
  };
}

/**
 * Whether this build's browser code adopts server-rendered pages in development: the
 * app renders pages first (not an SPA) and has a server to do it (`dev.run`), which a
 * static site without server files does not.
 */
export const devRenders = (shape) => shape.mode === "ssr" || (shape.mode === "ssg" && shape.hasServer);
