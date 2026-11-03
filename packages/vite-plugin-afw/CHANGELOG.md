# @opentf/vite-plugin-afw

## [Unreleased]

### Added

- New package: AFW for Vite, the Node half of AFW's two official workflows. Compiles
  components, pages and Markdown through the shared `@opentf/afw-build` core, generates
  `@afw/routes` (reloaded when route files are added or removed), refreshes components,
  pages and layouts in place during development, reports compile errors through Vite's
  overlay, and leaves drafts and refresh code out of release builds.
