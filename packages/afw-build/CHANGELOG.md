# @opentf/afw-build

## [Unreleased]

### Added

- New package: the toolchain-neutral core of the AFW build, shared by the esdev and
  Vite workflows. It holds the `afwc serve` client, compiler target selection, compiler
  resolution and file-based route discovery with `@afw/routes` generation. Everything
  platform-specific comes from a host object, and a test keeps the package free of
  `runtime:*` and `node:*` imports.
- The compiler child keeps its parent process alive only while a compile is in flight,
  on hosts that offer `ref`/`unref` (Node). A build or test that never closes the
  compiler still exits.
