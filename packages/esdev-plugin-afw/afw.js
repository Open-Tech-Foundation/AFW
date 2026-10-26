import { createAfwPlugin } from "./plugin.js";
import { createAfwRoutes } from "./routes.js";

// The default package entry is the plugin a starter lists in esdev.json.
// Named compiler/routes factories remain available for custom build drivers.
export function createAfwAppPlugin({ appDir = "app", exclude = [], routes = true, failOnError = true, ...options } = {}) {
  if (typeof routes !== "boolean") throw new Error("AFW plugin routes must be a boolean");
  const compiler = createAfwPlugin({ ...options, failOnError });
  if (!routes) return compiler;
  const routing = createAfwRoutes({ appDir, exclude });
  return {
    ...compiler,
    resolve: {
      filter: { id: /^(?:@afw\/routes|@opentf\/afw(?:\/runtime)?)$/ },
      handler(source, importer, ctx) {
        return source === "@afw/routes"
          ? routing.resolve.handler(source, importer)
          : compiler.resolve.handler(source, importer, ctx);
      },
    },
    load: routing.load,
  };
}

export default createAfwAppPlugin;
