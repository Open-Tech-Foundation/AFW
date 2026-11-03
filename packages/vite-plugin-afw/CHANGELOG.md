# @opentf/vite-plugin-afw

## [Unreleased]

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
