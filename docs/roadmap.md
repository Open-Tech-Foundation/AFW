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
* [x] Phase B.1: typed server functions (`query`/`action` in `*.server.{js,ts}`), validated with Standard Schema, under folder middleware, encoded with `@opentf/serialize`; both toolchains, dev and production — see [docs/SERVER_FUNCTIONS.md](SERVER_FUNCTIONS.md).
* [ ] Phase B.2: forms that submit to an action without JavaScript; redirects from actions.
* [x] Phase B.3a: `invalidate(query)` / `invalidate()` refetch live resources and the page's loader data.
* [ ] Phase B.3b: single-flight updates; opt-in query caching.
* [ ] Phase B.4: compiler co-location of server functions via the Server IR.

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

## Toolchains — esdev + ES-Runtime and Vite + Node
Both workflows compile the same `app/` through `@opentf/afw-build` (ARCHITECTURE.md §8).
* [x] Shared core: compiler client, targets, routes, `@afw/server`, HTML document, prerender.
* [x] Vite: dev with in-place refresh, SPA/SSR/SSG builds, server routes on Node in dev and `dist/server`.
* [x] Vitest support (`@opentf/afw-test/vitest`, happy-dom and jsdom).
* [x] `npm create @opentf/afw` starters (spa, fullstack, ssr, ssg; TS or JS).
* [x] `@opentf/afw-docs/vite`: navigation, posts, last-updated, search index, feeds, `llms.txt`.
* [x] Native addons in server routes (tested with `sharp` in dev and production).
* [ ] Vite prerender: `<link rel="modulepreload">` hints per route (esdev's prerender emits them).
* [ ] Server-rendered pages in the dev server (both workflows render pages on the client in dev).
* [ ] `@opentf/afw-docs/vite` finishing steps under `mode: "ssr"` (today: `ssg` only).
* [ ] `afw-cli`'s server entry (`apiEntrySource`, `serverEntrySource`) on `afw-build`'s `serverModule`.

## Streaming (for future review)
* [ ] Streamed SSR. Today `renderRoute()` returns one complete HTML string and loaders block rendering.
* [ ] Evaluate [Declarative Partial Updates](https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md) (`<?start>`/`<?marker>` placeholders filled by `<template for>`) for out-of-order streaming. A WICG proposal shipping in one browser so far; the hydration walk would need to adopt content the parser moves into place.

## Everyday gaps — tracked on the site at /docs/roadmap
Features React, Vue, Svelte and Solid developers expect, built in or from their ecosystems (surveyed 2026-11).
* [x] Enter/exit transitions for conditionals and lists (`transition`/`in`/`out`, `@opentf/afw/transition`).
* [ ] List reorder animation (`flip`) and an out-in mode.
* [x] Async pending boundaries over `resource()`: `<Pending>` (fallback, `refreshing`, `refetch`, `delay`; first-load failures to `<ErrorBoundary>`).
* [ ] `resource.data` typed as present inside `<Pending>`.
* [ ] Component-level `lazy()` outside routes.
* [x] Per-route `loading.jsx` / `error.jsx` (nearest file; navigation delay; loader, page and unhandled errors; SSR status 500) and `<Pending error>` for sections.
* [x] Layout errors: a broken layout shows the `error.jsx` above it (build, unhandled component errors, failed layout loader; SSR status 500).
* [x] Layout loaders: `layout.loader.{js,ts}`, merged into `router.data` (layouts first, page on top), run in parallel, one `__data.json`.
* [x] Route groups `(name)/` (layouts, middleware scoped to the group, loaders, error files; URL collisions are build errors) and optional segments `[[param]]` / `[[...rest]]`.
* [ ] Layout loaders that rerun only when their params change; root-layout errors.
* [ ] Typed routes (`<Link href>`, `navigate()`, `params`) and schema-validated search params.
* [x] Scroll restoration saved per history entry, applied after async page data loads (retries while the page grows).
* [x] View transitions on client navigation (`mountApp({ viewTransitions: true })`).
* [ ] `PUBLIC_*` env vars in both toolchains (SPEC.md §env and docs/API.md §7 disagree today).
* [ ] ESLint plugin for macro misuse; editor tooling; devtools; image optimization.
* [ ] Ecosystem bridges: signals adapters for TanStack Query/Table/Virtual; guides for web-component UI kits, Auth.js/Better Auth, realtime (WebSocket/SSE), Storybook, PWA; persisted/cross-tab state helper.

## Known issues
Open items carried over from the 2026-10 site and HMR audits.
* [x] SSG omits spread attributes and multi-node (fragment) roots. Both now render on the server.
* [x] Hydration: views with spread props adopt the server DOM instead of rebuilding on the client.
* [x] `@opentf/afw-docs` `Tabs`: add tab/tabpanel roles, selection state and arrow-key navigation.
* [x] `@opentf/afw-docs` `BlogLayout`: show "Last updated" only when the update is later than publication, not merely different.
* [x] Portal guide's custom overlay demo lacks modal semantics, focus containment, Escape handling and focus restoration.
* [x] Homepage render-pipeline tour pauses while hovered.
* [x] Component refresh: page/layout edits keep route-tree state and leave unaffected layers and children in place.
* [x] Component refresh: modules with other exports, `$expose` components and pages with `metadata`/`toc` (every MDX page) refresh in place; only an edit to those exports or the exposed names reloads.
