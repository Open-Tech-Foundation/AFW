# @opentf/esdev-plugin-afw

## [Unreleased]

## [0.9.0] - 2026-11-12

### Fixed

- Under `esdev start`, server-rendered pages (`mode: "ssr"`) are no longer marked for
  hydration. The dev browser build is CSR, which cannot adopt server DOM, so it
  rebuilt the page after a failed adoption attempt; it now builds it directly.

## [0.8.0] - 2026-11-11

### Fixed

- A `.tsx` module's compiled output is reported as `ts`, not `js`. afwc lowers the
  JSX and keeps the TypeScript, so calling it `js` made the first type annotation or
  `as` cast in a page a parse error in both browser and server builds; the bundler
  now strips the types.

### Changed

- Compiled modules are no longer marked `moduleSideEffects: true`.
  - Components register on first use (see `@opentf/afw-compiler`), so the bundler's own
    side-effect analysis is correct and unused components are dropped.
  - Safe with an older `@opentf/afw-compiler`: its module-level `customElements.define`
    is itself a side effect the bundler keeps, so nothing is dropped (and nothing
    shrinks) until the compiler is updated too.

## [0.7.1] - 2026-11-05

_Dependency updates._

## [0.7.0] - 2026-11-04

### Added

- Server functions (`query()` / `action()` in `*.server.{js,ts}` under `app/`): browser
  builds load the module as fetch stubs, server builds keep the real module.
  Importing a server-only helper into browser code fails the build.
- A virtual `@afw/server` module for server targets, the same one the Vite plugin
  generates: `createHandler({ files, fallback })` runs the app's middleware around API
  routes, server functions and loader data. Exports `apiRoutes`, `middleware`,
  `loaders` and `serverFunctions` too.
- `createAfwServer` and `lazyCompiler` for custom build drivers; `createAfwPlugin`
  takes `getCompiler` to share one `afwc serve` child.
- With `mode: "ssr"`, `@afw/server` also registers every page and exports
  `createPageRenderer({ shell })`: pass it as `createHandler({ renderPage })` and the
  server renders pages per request, with loader data and server functions in the same
  handler.

## [0.6.0] - 2026-11-03

### Changed

- The compiler client, target rules, compiler resolution and route discovery now come
  from `@opentf/afw-build`, the core shared with the Vite workflow. This package keeps
  its exports and behaviour and supplies the ES-Runtime host (`host.js`). Discovered
  routes are listed in sorted order instead of file-system order.

### Added

- `esdevHost`: the ES-Runtime host for `@opentf/afw-build`, for esdev build steps
  that use the shared core (the `@opentf/afw-cli` prerender does).

## [0.5.0] - 2026-10-30


### Changed

- The development refresh section of the README lists what now refreshes in place
  (metadata, headings, `$expose` methods, components beside helper exports) and what
  still reloads.
- Package metadata: the npm description matches the README, `homepage` points at
  https://afw.opentechf.org/docs/configuration instead of the GitHub README, and the keywords are refreshed.
- Project renamed **OTF Web → AFW — App Framework for the Web**. All package,
  binary and crate names move with it (no compatibility aliases): `@opentf/web*` →
  `@opentf/afw*`, `esdev-plugin-web` → `esdev-plugin-afw`, the `otfw`/`otfwc`
  binaries → `afw`/`afwc` (crate `otfw_cli` → `afw_cli`), `web.opentechf.org` →
  `afw.opentechf.org`, and the repo → `Open-Tech-Foundation/afw`.
- Rewrote the README: overview, install, configuration, API tables and links to the guides.
- The published package includes the MIT `LICENSE` file, copied from the repository root by a new `build` script that the release workflow runs before publishing.

### Changed

- Development refresh of a page or layout keeps its `$state` and leaves outer
  layouts and the inner page in place (with the matching `@opentf/web` and
  `@opentf/web-compiler`). The README describes the new behavior.

### Added

- Draft and scheduled Markdown pages (frontmatter `draft: true`, or a `date` later than
  now) are left out of the route table in production builds, so their text reaches no
  bundle. `esdev start` keeps them. `isUnpublishedPage(path)` exposes the rule.

### Fixed

- In a server build, a plain JS module that imports `@opentf/afw` resolves to the
  DOM-free `@opentf/afw/server` entry again. The resolver still matched the pre-rename
  `@opentf/web` name, so such modules got the browser runtime.

## [0.4.0] - 2026-10-06

### Changed

- Requires esdev `>=0.16.0`, which fixes production route chunks importing an
  unhashed `entry.js`.

### Fixed

- Resolve framework imports in shared JavaScript/TypeScript modules to the DOM-free server entry for server targets; browser and explicit CSR/hydration targets keep the browser entry.

## [0.3.0] - 2026-10-03

### Added

- Export discovered loader route patterns as `loaderRoutes` from `@otfw/routes`, without bundling server loader modules in the browser.

- Request component/page refresh output for hot browser CSR builds through esdev's
  existing HMR API. Release, server and test output stays free of refresh code.
- Local-package Chromium regressions cover compatible state, cleanup, refs,
  slotted/co-located children, route refresh and reload fallbacks.

### Changed

- Require esdev `>=0.15.0` for the compiler package resolver used by bundled
  prerender entries and isolated package installations.

### Fixed

- Route discovery rejects unsupported Markdown/MDX 404 files with a clear error
  instead of registering them as homepage routes.

## [0.2.0] - 2026-10-01

### Added

- Compiler transforms now return source maps to esdev for original JSX/TSX
  expressions, statements, and callbacks. Esdev handles final bundle composition.
- Optional mapped compiler-service responses, preserving plain JavaScript service
  callers and compatibility with binaries that predate source-map output.
- Source-map tests cover CSR/SSG/hydrate, Unicode columns, inline CLI maps, and
  esdev remapping an error in a dynamically imported bundle to the original JSX.

- Default `createWebPlugin` factory combines JSX compilation and `@otfw/routes`
  for native esdev starter configs without an explicit export name.
- `mode: "spa" | "ssg" | "ssr"` chooses CSR, server rendering, or hydration
  using esdev's command/platform hook context. Explicit compiler targets remain
  supported. The default starter factory fails on compiler errors.
- Standalone starter integration verifies published package files, browser and
  server build targets, and execution of a stateful server-rendered route.

- Initial release: OTF Web plugins for esdev's `runtime:build` bundler.
- **`otfwPlugin` / `createOtfwPlugin`** — compile `.jsx`/`.tsx` (and
  `.mdx`/`.md`) through the `otfwc` IR compiler (csr/ssg/hydrate targets,
  diagnostic stubs unless `failOnError`, per-module `onResult` reporting).
  The project-plugin factory resolves the compiler lazily. In esdev 0.14+,
  top-level project plugins also compile unbundled test and script imports;
  JSX tests need no precompile step.
- **Compiler service** — `resolveCompiler` (OTFWC_BIN, packaged prebuilt,
  Cargo workspace fallback; fully injectable), one persistent `otfwc serve`
  child per plugin instance (`startCompilerServer`, `closeCompilers`), and
  structured diagnostics (`compileError`).
- **`createOtfwRoutes`** — Next.js-style file conventions as a virtual
  `@otfw/routes` module (`{ pages, guard }`) crawled from `app/` with the
  runtime `Glob`.
