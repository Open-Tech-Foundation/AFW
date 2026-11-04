import { createAfwPlugin, lazyCompiler } from "./plugin.js";
import { createAfwRoutes } from "./routes.js";
import { SERVER_LOAD_FILTER, createAfwServer } from "./server.js";

// The default package entry is the plugin a starter lists in esdev.json.
// Named compiler/routes factories remain available for custom build drivers.
export function createAfwAppPlugin({ appDir = "app", exclude = [], routes = true, failOnError = true, ...options } = {}) {
  if (typeof routes !== "boolean") throw new Error("AFW plugin routes must be a boolean");
  const getCompiler = lazyCompiler();
  const compiler = createAfwPlugin({ ...options, failOnError, getCompiler });
  if (!routes) return compiler;
  const routing = createAfwRoutes({ appDir, exclude });
  const server = createAfwServer({ appDir, exclude, getCompiler });
  return {
    ...compiler,
    resolve: {
      filter: { id: /^(?:@afw\/routes|@afw\/server|@opentf\/afw(?:\/runtime)?)$/ },
      handler(source, importer, ctx) {
        if (source === "@afw/routes") return routing.resolve.handler(source, importer);
        if (source === "@afw/server") return server.resolve(source, importer);
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
