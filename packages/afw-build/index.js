// `@opentf/afw-build` — the toolchain-neutral half of AFW's build: the compiler
// client, compile-target rules, compiler resolution and file-convention routing.
// Toolchain integrations (`@opentf/esdev-plugin-afw`, `@opentf/vite-plugin-afw`)
// pass a host object (host.js) and wire these into their own plugin APIs.

export { assertHost } from "./host.js";
export { compileError, closeCompilers, startCompilerServer } from "./compiler-client.js";
export {
  FRAMEWORK_IMPORT, MODES, SOURCE_FILTER, TARGETS,
  chooseTarget, compileModule, errorStub, isRouteModule, usesServerEntry, validateOptions,
} from "./compile.js";
export { ensureCompiler, findUp, resolveCompiler } from "./resolve-compiler.js";
export {
  ROUTES_ID,
  discoverLoaders, discoverPages, findGuard, isUnpublishedPage, isUnpublishedSource,
  resolveAppRoot, routeKey, routesModule,
} from "./routes.js";
export { SERVER_ID, discoverServerFiles, hasServerFiles, serverConflicts, serverModule } from "./server.js";
export {
  DATA_FILE, alternateLinks, escapeXml, i18nSettings, injectBeforeBody, injectHead, injectHydrationData,
  injectMarkup, injectRouteData, localizePath, modulepreloadTags, renderDocument, renderNotFound, splitLocale,
  stampHydrateSentinel, stampRenderedPath, withHtmlLang,
} from "./document.js";
export { prerender, robotsTxt, sitemapXml } from "./prerender.js";
