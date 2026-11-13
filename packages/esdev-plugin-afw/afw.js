import { createAfwPlugin, lazyCompiler } from "./plugin.js";
import { createAfwRoutes } from "./routes.js";
import { SERVER_LOAD_FILTER, SERVER_RESOLVE_IDS, createAfwServer } from "./server.js";
import { createAppShape, devRenders } from "./policy.js";
import { esdevHost } from "./host.js";
import { resolveAppRoot } from "@opentf/afw-build";

// The default package entry is the plugin a starter lists in esdev.json.
// Named compiler/routes factories remain available for custom build drivers.
export function createAfwAppPlugin({ appDir = "app", exclude = [], routes = true, failOnError = true, ...options } = {}) {
  if (typeof routes !== "boolean") throw new Error("AFW plugin routes must be a boolean");
  const getCompiler = lazyCompiler();
  if (!routes) return createAfwPlugin({ ...options, failOnError, getCompiler });
  // Each folder's `_config.js` decides how its pages render. One shape per app root and
  // build, shared by every hook below.
  const shapes = createAppShape({ exclude, getCompiler });
  const shapeOfRoot = (root, ctx) => shapes.of(root, ctx?.command);
  const shapeOfModule = async (id, ctx) => {
    const shape = await shapeOfRoot(await resolveAppRoot(esdevHost, appDir, id.split("?")[0]), ctx);
    return { app: shape.app, devRenders: devRenders(shape) };
  };
  const compiler = createAfwPlugin({ ...options, failOnError, getCompiler, shapeOf: shapeOfModule });
  const routing = createAfwRoutes({ appDir, exclude, shapeOf: shapeOfRoot });
  const server = createAfwServer({ appDir, exclude, getCompiler, shapeOf: shapeOfRoot });
  return {
    ...compiler,
    // A new build reads the route policies again.
    start: {
      handler() {
        shapes.reset();
      },
    },
    resolve: {
      filter: { id: /^(?:@afw\/routes|@afw\/server|@opentf\/afw-build\/document|@opentf\/afw(?:\/runtime)?)$/ },
      handler(source, importer, ctx) {
        if (source === "@afw/routes") return routing.resolve.handler(source, importer);
        if (SERVER_RESOLVE_IDS.includes(source)) return server.resolve(source, importer, ctx);
        return compiler.resolve.handler(source, importer, ctx);
      },
    },
    load: {
      // One filter for the route table, the server module and `.server` modules.
      filter: { id: new RegExp(`${routing.load.filter.id.source}|${SERVER_LOAD_FILTER.source}`) },
      handler(id, ctx) {
        return id.startsWith("@afw/routes:") ? routing.load.handler(id, ctx) : server.load(id, ctx);
      },
    },
  };
}

export default createAfwAppPlugin;
