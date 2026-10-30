# Framework Roadmap

## Phase 1: MVP (Complete)
* [x] Basic JSX to DOM transformation.
* [x] Web Component wrapping.
* [x] Signal-based reactivity.
* [x] File-based routing.
* [x] Compiler-driven lifecycle hooks (onMount/onCleanup).

## Phase 2: Refinement (In Progress)
* [x] Formalized naming conventions (standard .jsx).
* [x] Compiler enforcement.
* [x] Children/Slot support (Light DOM).
* [x] Tailwind CSS v4 integration.
* [x] Fragment support (<>...</>).

## Phase 3: Advanced Features
* [ ] Conditional rendering helper.
* [ ] List rendering helper (keyed reconcile).
* [ ] Shadow DOM support for style isolation.
* [x] Server-Side Rendering (SSR) / Static Site Generation (SSG). Streaming is tracked below.

## API Routes — see [docs/API.md](API.md)
* [x] Phase A: file-based `app/api/**` `Request→Response` handlers, method exports, `[param]`/`[...rest]`, nested `_middleware`, runtime handlers and API-bundle emission (`dist/server/api.js`); native esdev fullstack orchestration remains to be verified, Node/Fetch adapters.
* [ ] Phase B (compiler): typed server functions / loaders + actions via the Server IR, splitting the client/server boundary.

## Data Fetching — see [docs/DATA.md](DATA.md)
* [x] Phase A.5 (runtime/toolchain): route loaders (`loader.{js,ts}` → `router.data`; inline payload + `<path>/__data.json` across dev/serve/SSG/SPA-nav) and the client-side `resource()` primitive.
* [ ] Phase B (compiler): co-located `export loader` stripped by the compiler, queries/actions — same wire format and runtime API.

## Internationalization (i18n) — see [docs/I18N.md](I18N.md)
* [x] Phase 1 (runtime): locale path-prefix routing, ICU messages (`t()`), `Intl` formatters, per-locale SSG/SSR. `@opentf/afw-i18n`.
* [ ] Phase 2 (compiler): `afwc` message extraction, key validation, tree-shaking, per-locale inlining.

## Diagnostics & source maps
* [x] Located compile diagnostics: every compiler failure (syntax, `$state` mutation, callback `ref`, no-component) carries `file:line:column` and a code frame, rendered in the terminal and pushed to the dev overlay as structured fields.
* [x] JSX/TSX source maps from `afwc`: original statements, expressions and callbacks carry mappings; the esdev plugin returns them for bundler composition. Compiler-generated helpers remain unmapped.
* [ ] Original Markdown/MDX source maps: current maps target the generated `?afw-jsx` intermediate. The Markdown front end still needs to supply the preceding mapping.
* [x] Native esdev starters (spa, fullstack, docs, library) verified on esdev 0.16. Open upstream issues: [ESDEV_MIGRATION.md](ESDEV_MIGRATION.md).

## Streaming (for future review)
* [ ] Streamed SSR. Today `renderRoute()` returns one complete HTML string and loaders block rendering.
* [ ] Evaluate [Declarative Partial Updates](https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md) (`<?start>`/`<?marker>` placeholders filled by `<template for>`) for out-of-order streaming. A WICG proposal shipping in one browser so far; the hydration walk would need to adopt content the parser moves into place.

## Known issues
Open items carried over from the 2026-10 site and HMR audits.
* [x] SSG omits spread attributes and multi-node (fragment) roots. Both now render on the server.
* [ ] Hydration: a view with spread props still falls back to a clean client build instead of adopting the server DOM.
* [x] `@opentf/afw-docs` `Tabs`: add tab/tabpanel roles, selection state and arrow-key navigation.
* [x] `@opentf/afw-docs` `BlogLayout`: show "Last updated" only when the update is later than publication, not merely different.
* [x] Portal guide's custom overlay demo lacks modal semantics, focus containment, Escape handling and focus restoration.
* [x] Homepage render-pipeline tour pauses while hovered.
* [x] Component refresh: page/layout edits keep route-tree state and leave unaffected layers and children in place.
* [ ] Component refresh: mixed-export and `$expose` modules still reload. Re-check with `tsr test-e2e-hmr`.
