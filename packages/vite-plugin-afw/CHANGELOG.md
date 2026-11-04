# @opentf/vite-plugin-afw

## [Unreleased]

## [0.2.0] - 2026-11-04

### Fixed

- Vitest compiles AFW's packages in installed apps. The test-mode inline rule matched
  `@opentf/*` package names only, but Vitest checks resolved paths under
  `node_modules`, so a test importing `@opentf/afw` failed with "Unknown file
  extension .jsx". (Inside the AFW repository the packages are workspace symlinks
  outside `node_modules`, which hid it.)

## [0.1.0] - 2026-11-03

### Added

- New package: AFW for Vite, the Node half of AFW's two official workflows. Compiles
  components, pages and Markdown through the shared `@opentf/afw-build` core, generates
  `@afw/routes` (reloaded when route files are added or removed), refreshes components,
  pages and layouts in place during development, reports compile errors through Vite's
  overlay, and leaves drafts and refresh code out of release builds.
- Server routes on Node. In development, API routes, `_middleware` and loaders run
  inside Vite's dev server and pick up edits and new files without a restart; module
  and asset requests never reach the app's middleware. `vite build` on an app with
  server files also emits `dist/server/index.js`, a Node server (`node
  dist/server/index.js`, `PORT`/`HOST`) that serves `dist/client` behind the app's
  middleware, and `dist/server/app.js` for custom servers. The `server` option
  (`"auto"`, `true`, `false`) controls the server build.
- Rendering modes. `mode: "ssr"` builds a hydrating client and a Node server that
  renders each page request (loaders run with the request and middleware `locals`;
  unknown pages render the 404 page with status 404). `mode: "ssg"` prerenders every
  route at build time: a static site in `dist/`, or `dist/client` beside the Node
  server when the app has server routes. A failed page fails the build. `baseUrl`
  feeds canonical links and `sitemap.xml`. The dev server renders pages on the client
  in every mode, as esdev's does.
- SSG builds let other plugins take part through their `api`: `afwPrerenderData()`
  supplies the site URL and per-page last-updated times, `afwFinish()` post-processes
  the prerendered site (used by `@opentf/afw-docs/vite`).
- `vite preview` of an `ssg` build serves each prerendered page at its clean URL
  (`/docs/intro`, not only `/docs/intro/`) and `404.html` with status 404 for unknown
  pages. Vite's preview served the home page's HTML for both, which the client then
  rebuilt over.
- Vitest support. In Vitest (mode `test`), modules compile for the test's DOM
  environment: client rendering, no refresh code, framework imports unchanged, and
  AFW packages inlined so the JSX they ship is compiled. Pair it with
  `@opentf/afw-test/vitest`.
- Type declarations: the plugin's options (`index.d.ts`), the Node server runtime
  (`server.d.ts`), and `@opentf/vite-plugin-afw/client` for app code, which types the
  `@afw/routes` module and Markdown page imports (add it to `compilerOptions.types`).
- The generated server modules resolve the plugin's own dependencies
  (`@opentf/afw-build`) from the plugin. Under a strict layout such as pnpm's, an app
  could not resolve them and SSG and SSR builds failed.
- `.tsx` modules have their TypeScript types stripped after compiling. They were
  left in the output, so a typed `.tsx` component failed to parse.
