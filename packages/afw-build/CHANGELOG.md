# @opentf/afw-build

## [Unreleased]

### Added

- `loading.{jsx,tsx}` and `error.{jsx,tsx}` route files are discovered alongside pages,
  layouts and 404, and compile to route factories (`isRouteModule`). A Markdown
  `loading` or `error` file is an error.
- `renderDocument({ errors: "render" })` renders the route's nearest `error.jsx` with
  status 500 when a loader fails, and inlines the error marker for the client. The
  default, `"throw"`, keeps static generation reporting the path as failed.
- The generated server's `createPageRenderer` uses `errors: "render"`, so a request
  server sends a failed loader's page as its `error.jsx`.

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
