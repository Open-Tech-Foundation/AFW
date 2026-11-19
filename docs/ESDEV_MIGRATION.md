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

## esdev 0.28.0 (verified 2026-11-18, with esrun 0.48.0)

Checks run:

| Check | Result |
| --- | --- |
| `tsr typecheck`, `tsr test`, `tsr test-e2e`, `tsr check-web`, `tsr site-build` | Pass |
| `esdev create` from the registry (`@opentf/create-afw` 0.7.0) and from `packages/create-afw` (`--from`): `app` in every render mode, with and without a server, CSS and Tailwind, JS and TS; `library` CSS/JS and Tailwind/TS; `docs` with and without blog; pnpm | Each scaffold's `build`, `test` and `typecheck` pass; each server build's `start` serves `/` |
| `scripts/verify-server-functions.mjs` (`tsr test-e2e-esdev-fns`) | A server function or loader edit keeps the page and refetches its data in place |

Fixed in 0.28, each checked here:

| Issue (seen in 0.27) | How it was checked |
| --- | --- |
| A server-target restart reloaded every page, even with the browser build unchanged | `tsr test-e2e-esdev-fns` asserts the page survives a server function and a loader edit (`esdev:server-update`, D219) |
| `esdev start` said "ready" after a failed build and answered 404 | A scaffold with a syntax error: "the build failed; fix it and save", the page answers 500 with the error, then 200 once fixed |
| Tailwind resolved a package stylesheet's nested `@import` from the project root | Both `docs` scaffolds build under pnpm |
| `esdev preview` sent `.xml` as `application/octet-stream` | `blog/rss.xml` and `sitemap.xml` are `application/xml` |

Breaking in esrun 0.48: a network grant names an address (`--allow-listen=0.0.0.0:3000`,
D221) and has no wildcards. The starters already grant an address; their README says a
different `PORT` needs the same port in `--allow-listen`.

## esdev 0.29.0 (verified 2026-11-19, with esrun 0.49.0)

Breaking: every `esdev.json` key is camelCase (ES-Runtime D232). A target's `outdir` is
`outDir`; esdev refuses the old spelling, so a starter still writing it failed its first
build. Every `esdev.json` here and every starter writes `outDir`; `@opentf/create-afw`
needs esdev 0.29 (`engines.esdev`).

Checks run:

| Check | Result |
| --- | --- |
| `tsr verify-templates` (all 32 combinations of `app`, `docs` and `library`) | Every combination passes. 2 of about 56 `esdev start` runs failed at random (item 9), each on a combination that passed in the other run |
| `tsr test`, `tsr site-build` | Pass |

The open items found on 0.28, on 0.29:

| # | Issue (0.28) | On 0.29 | Done here |
| --- | --- | --- | --- |
| 1 | `esdev test` on a cold cache sometimes failed to load a dependency it pre-bundled | Fixed | No failure in the 32-combination run |
| 2 | A CSS `@import` with `layer()` was left unresolved (404) | Fixed: bundled, with the layer declared where the import stood | `@opentf/afw-docs/theme` keeps its `layer(afw-docs)` import |
| 3 | A dependency linked from outside the project was refused | Fixed for a package with its own install (D234). Not for a workspace member whose dependencies are links into the workspace's pnpm store: `module "@opentf/syntax-highlighter" resolves outside the project root` (D234 leaves it to monorepo support) | Still open for this repository: `tsr verify-templates`, the afw-docs tests and `benchmarks/docs-scale` go on copying packages into `node_modules` |
| 4 | Under the default grant, `runtime:fs` stopped at the project root | Fixed: the default reaches the whole filesystem (D233) | `verify-templates.mjs` and `docs-scale/run.mjs` work in `~/.cache` directly, no longer copying themselves there |
| 5 | `esdev create --help` listed templates that no longer exist | Fixed: it points at `--list` | — |
| 6 | A server-target restart refused requests in between | Not re-measured | — |
| 7 | `esdev start` walked directories `.gitignore` excludes | Fixed: only directories the root `.gitignore` does not name are watched | — |
| 8 | `esdev start` once stopped picking up edits | Not reproduced | — |
| 9 | New on 0.29: `esdev start --port=<n>` in a server starter sometimes exits at once: `cannot start the app on port <n>: Address already in use (os error 98)`, with nothing else on that port | Open, unconfirmed: `app-mixed-yes-css-js` then `app-server-yes-css-js`, once each; 8 cold starts of the same scaffold by hand all started | Report only with a repro |

Also new in 0.29: a release build removes a `"then": "run"` step's own bundle once it has
run. The prerender step of the static starters and the website is `dist/ssg.js` now (was
`.ssg/ssg.js`, kept out of `dist/` so it would not be deployed); esdev removes it.

## esdev 0.30.0 (verified 2026-11-19, with esrun 0.49.0)

Breaking: `dev.servers` is the only key that says what `esdev start` runs (ES-Runtime
D235). `dev.run`, `dev.app`, `dev.server` and `dev.serve` are refused, and a project with
no `dev.servers` does not start.

| Project | `dev` |
| --- | --- |
| A starter app with a server (any render mode), `benchmarks/fullstack`, `tsr test-e2e-esdev-fns` | `{ "servers": { "server": { "port": 3000 } } }`: the server renders the pages and answers `/api` |
| A starter app without a server, the `docs` and `library` starters, the playground, `tsr test-e2e-hmr` | `{ "servers": { "web": { "port": 5173 } } }` |
| The website, the benchmark app | `web` on 3005 and 3010, as before |

`@opentf/create-afw` needs esdev 0.30 (`engines.esdev`).

Checks run: `tsr verify-templates`, `tsr test`, `tsr test-e2e-hmr`,
`tsr test-e2e-esdev-fns`, and `esdev start` of the playground, the benchmark app and the
website.

Item 6, a request during a server restart:

- Fixed in 0.30 for a request through esdev's proxy: it waits for the restarted server.
- A direct connection to a server's own port still sees the restart, as a production
  deploy without a draining orchestrator would.
- An AFW app with a server is the one `dev.servers` entry, and the browser talks to it
  directly, so the fix does not reach it. `tsr test-e2e-esdev-fns` goes on waiting the
  restart out.

## Starter templates

Since esdev 0.28 the AFW starters are `@opentf/create-afw`'s (`esdev/templates`, generated
from `templates.js` by `scripts/write-esdev-templates.mjs`); `esdev create` reads them from
the published package. The 0.27 template issues are resolved there:

- `docs` uses the single `afwDocsPlugin` entry and builds under pnpm.
- The server app's `start` grants an address, reads `PORT` (documented above), answers a
  directory under `dist/` with a 404, and has `@opentf/afw-test` with a test setup.
- `library` peers on `@opentf/afw` with a `^` range.

## Framework follow-ups

- Done: `esdev start` and the Vite dev server render server pages on the server
  and the client adopts them; the dev browser build is the compiler's `hydrate-hot` target.
- Done: a server-only edit (`*.server.*`, `loader.*`, `_middleware.*`, `route.*`) keeps
  the page in both workflows and refetches its data in place: esdev 0.28 sends
  `esdev:server-update`, vite-plugin-afw sends `afw:server-update`, and the runtime calls
  `invalidate()` (`runtime/hmr.js`).
- Original Markdown/MDX source maps (current maps target generated JSX).
- MDX 404 routes are rejected; use `404.jsx`/`404.tsx`.
- Benchmarks: the published tables predate the migration. Re-run all four engines
  under the same conditions before replacing them.

## Component refresh

`tsr test-e2e-hmr` drives the browser check (state, effects, refs, slots, route
refresh and reload fallbacks). Behavior and limits are described in the
[plugin README](../packages/esdev-plugin-afw/README.md#development-refresh).
