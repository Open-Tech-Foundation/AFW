// `defineRoute` — the default export of a folder's `_config.js`, which sets how the
// pages in that folder and below it render. It returns its argument: the build reads
// `render` and `data` from the source (they must be string literals) and runs `paths`
// at build time inside the server bundle. Neutral core: no runtime or Node imports.

/**
 * @param {import("./route.d.ts").RouteConfig} config
 * @returns {import("./route.d.ts").RouteConfig}
 */
export function defineRoute(config) {
  return config;
}
