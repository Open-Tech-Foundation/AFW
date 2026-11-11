# esdev migration status

Verified on 2026-10-07 against **esdev 0.17.0** and Chromium 153. The migration
inside this repository is complete, and every upstream esdev issue found during it
is fixed in 0.17. For esdev behavior, the official docs at
[esrun.opentechf.org](https://esrun.opentechf.org/) are the reference.

## Working in this repository

- Development, builds, tests, typechecking, benchmarks and the site build run
  through `tsr` tasks that call esdev (`tasks.toml`). Bun, happy-dom and the
  retired `afw` CLI are no longer used by the framework packages.
- `@opentf/esdev-plugin-afw` compiles JSX/TSX/MDX through `afwc` and generates
  the `@afw/routes` module; esdev owns bundling, CSS, HMR transport and serving.
- `@opentf/afw-cli` is only the SSG library (`@opentf/afw-cli/ssg`): the
  prerender driver for a `then: "run"` target and the release-only
  `siteOutputPlugin` that writes search, feeds and LLM files.
- The comparison benchmarks (`benchmarks/{react,solid,svelte}`) keep their own
  Bun build scripts; AFW orchestration and aggregation run on esdev.

Checks run for this verification:

| Check | Result |
| --- | --- |
| `tsr typecheck` | Pass |
| `tsr test` (Rust + native/DOM suites, including userEvent under `--dom`) | Pass |
| `tsr test-e2e-hmr` (component refresh, compile-error recovery) | Pass |
| `tsr test-e2e-docs-hydration` | Pass: 126 checks |
| `tsr site-build` (released web 0.32.0, afw-docs 0.30.0, plugin 0.4.0, CLI 1.30.0) | Pass: 65 pages prerendered, 63 indexed, feeds and LLM files |

## Upstream esdev issues (resolved in 0.17)

| Issue | Seen in | Fix | Regression coverage here |
| --- | --- | --- | --- |
| `esdev start` panicked in Rolldown's incremental cache after a plugin transform error was fixed | 0.15, 0.16 | 0.17 | `tsr test-e2e-hmr` breaks and fixes the active page |
| Native `--dom` realm lacked an extensible `navigator` and input selection, so `userEvent.setup()`/`type()` failed | 0.14–0.16 | 0.17 ([DOM realm](https://esrun.opentechf.org/esdev/test/dom)) | The userEvent suite runs in `tsr test-afw-test` and the browser tier |
| `new URL("./file", import.meta.url)` assets were not emitted | 0.15, 0.16 | 0.17 ([files named by URL](https://esrun.opentechf.org/esdev/build/browser#files-named-by-url)) | Site [Assets guide](https://afw.opentechf.org/docs/core-concepts/assets) |
| `esdev preview` answered every missing route with `index.html` and 200, ignoring `404.html` | 0.16 | 0.17: 404 + `404.html`; `--spa` opts into the fallback ([Preview](https://esrun.opentechf.org/esdev/start/preview)) | SPA starters use `esdev preview --spa` |
| Fullstack starter needed an `HTMLElement` bootstrap | 0.16 | 0.17 template targets `server.js` (with `@opentf/afw` 0.31) | `packages/afw/server/index.test.js` loads the server entry with no DOM |
| Route chunks imported an unhashed `entry.js` in production builds | 0.14, 0.15 | 0.16 | `tsr bench -- afw`, site build |

## Upstream esdev issues (later releases)

| Issue | Seen in | Fix | Regression coverage here |
| --- | --- | --- | --- |
| `esdev test --browser` left `runtime:test` unresolved (an alias-plugin regression), so every browser test file failed to load with "Failed to fetch dynamically imported module …/setup0.js" | 0.25 | 0.26 ([release notes](https://github.com/Open-Tech-Foundation/ES-Runtime/releases/tag/esdev%400.26.0)) | `tsr test-e2e-afw-test` |

Use esdev 0.26 or newer for the browser tier (`esdev upgrade`).

## Open upstream esdev issues (esdev 0.27.0, 2026-11-11)

Found by scaffolding every AFW template with `esdev create` (spa, fullstack, docs with
and without blog, library; JS and TS; CSS and Tailwind; pnpm, plus npm for docs) and
running each project's `build`, `test`, `typecheck`, `esdev start` and `preview`/`start`
in headless Chrome.

| Issue | Effect | Workaround |
| --- | --- | --- |
| Tailwind `@import` of a package stylesheet resolves a nested `@import` from the project root, not from the importing stylesheet's package | Under pnpm (isolated `node_modules`), the `docs` template fails `esdev build` and `esdev start`: `cannot find the stylesheet "@opentf/syntax-highlighter/themes/shared.css"` (imported by `@opentf/afw-docs/theme`). npm's hoisted layout works | Add `@opentf/syntax-highlighter` as a direct dependency (this site does) |
| `esdev start` reports "ready" after a target fails to build, then answers every route with 404 | The error is only in the terminal; the browser shows a blank 404, with no overlay | Read the terminal |
| After restarting a server target, esdev sends every page `{"type":"reload"}`, even when the browser build is unchanged (intermittent) | Editing a `.server.js` function reloads the page in the esdev workflow; the Vite workflow keeps it | None; `tsr test-e2e-esdev-fns` reports it as known |
| A server-target restart stops the old process before the new one listens, and nothing holds connections meanwhile | A request in that window is refused (`Failed to fetch`) | The framework retries its own requests in development (`runtime/dev-fetch.js`) |
| `esdev preview` serves `.xml` files as `application/octet-stream` | `rss.xml`, `atom.xml` and `sitemap.xml` download instead of displaying; feed readers may reject them | Production hosts set their own types |

## Open esdev template issues (templates are baked into esdev 0.27.0)

| Template | Issue |
| --- | --- |
| `docs` | Missing the `@opentf/syntax-highlighter` dependency, so it does not build under pnpm (see above). |
| `docs` | Wires `docsNavPlugin` (and `blogPostsPlugin` with `--blog`) one by one; the afw-docs README recommends the single `afwDocsPlugin` entry (esdev 0.27+), which also adds last-updated dates. |
| `fullstack` | The `start` script grants `--allow-listen=3000`, but `server.js` listens on `PORT`: `PORT=8080 npm start` fails with "0.0.0.0:8080 is not an allowed address". |
| `fullstack` | `server.js` treats a directory under `dist/` (e.g. `/assets/`) as a file: streaming it throws "Is a directory" and the request gets no response, instead of a 404. |
| `fullstack` | No `@opentf/afw-test` dependency or `test.setup`, unlike `spa` and `library`, though it has a `test` script. |
| `library` | `peerDependencies` pins `@opentf/afw` to an exact version (`"0.37.0"`); a published library needs a range. |

## Framework follow-ups

- Fullstack (`mode: "ssr"`) under `esdev start`: the dev server renders pages and stamps
  `data-afw-hydrate`, but the dev client is a CSR build, so it rebuilds the page instead of
  adopting it, and the rebuild leaves `document.title` empty. Production adopts correctly.
  The Vite dev server renders on the client only.
- Original Markdown/MDX source maps (current maps target generated JSX).
- MDX 404 routes are rejected; use `404.jsx`/`404.tsx`.
- Benchmarks: the published tables predate the migration. Re-run all four engines
  under the same conditions before replacing them.

## Component refresh

`tsr test-e2e-hmr` drives the browser check (state, effects, refs, slots, route
refresh and reload fallbacks). Behavior and limits are described in the
[plugin README](../packages/esdev-plugin-afw/README.md#development-refresh).
