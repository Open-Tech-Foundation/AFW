# @opentf/afw-build

## [Unreleased]

## [0.5.0] - 2026-11-13

### Changed

- `chooseTarget` picks the hydrate target for a dev server's browser build in `mode: "ssr"`,
  whose pages the dev server renders first; `spa` and `ssg` dev stay on CSR. A new `test`
  flag keeps test runs on CSR.

### Added

- Route policies: `discoverRouteConfigs`, `readRouteConfigs` (through the compiler's
  `route-config` request) and `resolveRoutePolicies` resolve each page's render policy from
  the nearest `_config.{js,ts}` up its folder tree, then the root config or the `mode`
  shorthand. Errors for a default set in two places, two config files in one folder,
  `paths` outside a static folder and `data` outside a client folder; a warning for a
  config that governs no page. `formatRouteTable` and `routeManifest` report the result.
  - A server or static page inside a layout whose folder renders `client` is an error, and
    `paths` must sit beside the dynamic page it lists.
  - `clientRouteFiles`, `routeRenders` and `staticPathConfigs` feed the generated modules.
- `routesModule({ clientFiles })` marks browser-rendered entries with `clientRoute`;
  `serverModule({ clientFiles, renders, staticPaths })` leaves them out of the server bundle,
  registers `_config.js` `paths`, labels page responses with `x-afw-render`, and its
  `createPageRenderer({ readStatic })` serves a static route's prerendered HTML inside the
  middleware chain.
- `prerender({ routes })` prerenders only those route patterns (a server app's static
  routes), without a 404 page, sitemap or robots.txt.
- `chooseTarget({ devRenders })`: a dev server that renders pages first (Vite, static
  pages included) gets the hydrate target in its browser build for any non-SPA app.
- `compilerTarget(target, hot)`: the backend token for a target, with `hot` selecting
  `csr-hot` or `hydrate-hot`. `compileModule` uses it, so `hot` now applies to the hydrate
  target too.

### Fixed

- `routesModule` marks client entries inline instead of importing `clientRoute` from
  `@opentf/afw`. Under esdev that import loaded a second copy of the runtime, whose
  `afw-link` registration sent the dev server into a reload loop.

## [0.4.0] - 2026-11-12

### Added

- `loading.{jsx,tsx}` and `error.{jsx,tsx}` route files are discovered alongside pages,
  layouts and 404, and compile to route factories (`isRouteModule`). A Markdown
  `loading` or `error` file is an error.
- `renderDocument({ errors: "render" })` renders the route's nearest `error.jsx` with
  status 500 when a loader fails, and inlines the error marker for the client. The
  default, `"throw"`, keeps static generation reporting the path as failed.
- The generated server's `createPageRenderer` uses `errors: "render"`, so a request
  server sends a failed loader's page as its `error.jsx`.
- `layout.loader.{js,ts}` files are discovered (`discoverLoaders(host, dir, { layout: true })`),
  imported into the server module, and checked to sit beside a `layout.*`. The loader
  registry gets every page route (`pageRoutes`), and `loaderRoutes` (client and server)
  lists every page beneath a layout loader (`loaderPageRoutes`).
- Route groups:
  - Pages or API routes in different groups that answer the same URL are a build error,
    in the server module and the client routes module.
  - Each middleware folder inside a group gets its scope in `options.groupScopes`: the
    folders of the group's pages and API routes, and its server functions' endpoints.
  - Server function endpoints drop group folders from their URL; the hash still uses
    the full path.
- `serverModule({ hydrate: false })` renders pages without the `data-afw-hydrate`
  marker, for a dev loop whose browser build cannot adopt server DOM.

### Fixed

- When a page's own `<title>` replaces the shell's, the shell's title is kept as
  `<meta name="afw-shell-title">`, so the client can fall back to it on a later page
  without a title.

## [0.3.0] - 2026-11-05

### Added

- `createPageRenderer` returns a `Response` a page's loader throws (a redirect, a 403)
  as the page's response.

## [0.2.0] - 2026-11-04

### Added

- Server functions at build time: `discoverServerModules` finds `*.server.{js,ts}`
  modules under `app/`; `serverFunctionEndpoint` gives each `query()` / `action()`
  export a stable endpoint under its folder (`/todos/__fn/<id>`, the id hiding the
  path); `serverFunctionStub` generates the browser module (one fetch stub per server
  function, server-only helpers left out); `serverExports` asks the compiler which
  exports are server functions. `serverModule({ listExports })` registers them in
  `@afw/server`, answered inside the middleware before loader data.

### Changed

- `createPageRenderer({ shell })` in a generated `@afw/server` stamps the hydrate marker
  on the shell itself, so a server can pass the client's `index.html` as it is.

## [0.1.0] - 2026-11-03

### Added

- New package: the toolchain-neutral core of the AFW build, shared by the esdev and
  Vite workflows. It holds the `afwc serve` client, compiler target selection, compiler
  resolution and file-based route discovery with `@afw/routes` generation. Everything
  platform-specific comes from a host object, and a test keeps the package free of
  `runtime:*` and `node:*` imports.
- `serverModule` generates `@afw/server`: every API route, middleware and loader under
  `app/`, composed into one Fetch handler (`createHandler({ fallback })`) that runs
  middleware around API routes, then loader data, then the fallback. Layout mistakes
  (a page and an API route in one folder, a loader with no page) fail with a message.
- `renderDocument`: renders one URL into a complete HTML document (markup, head,
  hydration props, loader data, `lang` and hreflang alternates), shared by static
  generation and per-request SSR. The shell helpers (`injectMarkup`, `injectHead`,
  `stampHydrateSentinel` and the rest) move here from `@opentf/afw-cli`.
- `prerender`: static generation against the host — every route and locale,
  `__data.json` files, `404.html`, `sitemap.xml` and `robots.txt`.
- `serverModule({ pages: true })` also registers every page and exports `render` and
  `createPageRenderer`; `createHandler` takes `files` and `renderPage` steps.
- Hosts provide `writeText`.
- The compiler child keeps its parent process alive only while a compile is in flight,
  on hosts that offer `ref`/`unref` (Node). A build or test that never closes the
  compiler still exits.
