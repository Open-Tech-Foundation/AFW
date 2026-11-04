// `@opentf/esdev-plugin-afw` — AFW plugins for esdev's `runtime:build`
// bundler (see https://esrun.opentechf.org/api/build).
//
// esdev create starters can name this package directly in esdev.json's
// top-level plugins. Programmatic build drivers use the named factories.

export { closeCompilers, compileError, resolveCompiler, startCompilerServer } from "./compiler.js";
export { createAfwPlugin, afwPlugin, lazyCompiler } from "./plugin.js";
export { createAfwServer } from "./server.js";
export { createAfwRoutes, isUnpublishedPage } from "./routes.js";
export { default, createAfwAppPlugin } from "./afw.js";
export { esdevHost } from "./host.js";
