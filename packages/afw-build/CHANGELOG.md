# @opentf/afw-build

## [Unreleased]

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
