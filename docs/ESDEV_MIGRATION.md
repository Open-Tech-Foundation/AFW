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

## Framework follow-ups

- Original Markdown/MDX source maps (current maps target generated JSX).
- MDX 404 routes are rejected; use `404.jsx`/`404.tsx`.
- Views with spread props render on the server but are rebuilt on the client instead of adopted (warned during builds).
- Benchmarks: the published tables predate the migration. Re-run all four engines
  under the same conditions before replacing them.

## Component refresh

`tsr test-e2e-hmr` drives the browser check (state, effects, refs, slots, route
refresh and reload fallbacks). Behavior and limits are described in the
[plugin README](../packages/esdev-plugin-afw/README.md#development-refresh).
