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

Still open, to report upstream (2026-11-18, esdev 0.28.0, esrun 0.48.0). Found by
`tsr verify-templates`: all 32 option combinations of the `app`, `docs` and `library`
starters, each scaffolded, installed, typechecked, tested, built, run in dev and in
production, with a browser pass. 29 pass; the 3 failures are items 1 and 2.

| # | Issue | Repro | Effect |
| --- | --- | --- | --- |
| 1 | `esdev test` with two or more test files on a cold cache sometimes fails to load a dependency it pre-bundled itself: `cannot resolve module "…/node_modules/.esdev/deps/<hash>/lz-string-<hash>.mjs": No such file or directory` (also `aria-query`) | Any starter with a second test file: `rm -rf node_modules/.esdev && pnpm test`. About 1 run in 10 here; 2–5 of 32 combinations per matrix run | A new project's first `pnpm test` fails at random; the next run passes. Looks like test files racing on the shared pre-bundle (this repo's `tasks.toml` already warms it to dodge the same race) |
| 2 | A CSS `@import` with a `layer()` modifier is not resolved or inlined: it is left as written, and the browser requests the bare package path | `a.css`: `@import "pkg-b/x.css" layer(lib);` imported from the page's stylesheet; `esdev build`. The same import without `layer()` is inlined | The `docs` starter's code highlighting loses `@opentf/syntax-highlighter`'s shared rules (imported by `@opentf/afw-docs/theme` with `layer(afw-docs)`), with a 404 on every page, in dev and production |
| 3 | A dependency linked from outside the project (`link:`/`file:` to a local checkout) is refused: `module "…" resolves outside the project root (modules outside the root cannot be loaded)` | A project whose `package.json` has `"@opentf/esdev-plugin-afw": "link:../afw/packages/esdev-plugin-afw"`; `esdev build` | Developing a package against an app means copying it into `node_modules` (what `tsr verify-templates` and the afw-docs tests do) |
| 4 | With esdev's default grants (everything), a script's `runtime:fs` access still stops at its project root ("escapes the filesystem root"); with `--deny-all --allow-read --allow-imports --allow-write=<dir>`, the same write outside it succeeds | `esdev script.mjs` writing to `~/.cache/x`: refused; add those flags: written | Backwards from what "grant everything" suggests, and the `runtime:fs` page does not say how the root is chosen. Tooling that works in a scratch directory copies itself there and re-runs instead (`verify-templates.mjs`, `docs-scale/run.mjs`) |
| 5 | `esdev create --help` lists template names that no longer exist: "react, api, … spa, fullstack, docs or library" | `esdev create --help` | The AFW starters are `app`, `docs` and `library` now (`esdev create --list` is right) |
| 6 | A server-target restart stops the old process before the new one listens, and nothing holds connections meanwhile | Edit a loader under `esdev start`, request during the restart | A request in that window is refused (`Failed to fetch`); `tsr test-e2e-esdev-fns` waits it out. Not re-measured on 0.28 |
| 7 | `esdev start` walks directories its root `.gitignore` excludes, and `.git` | `strace -f -e trace=openat,newfstatat esdev start` in this repository | 0.27: one playground start touched 445,392 paths, 1,496 of them real source; cold on a spinning disk, 24–67s. Not re-measured on 0.28 |
| 8 | Once, `esdev start` stopped picking up edits and served the old build until restarted | Not reproduced | Unconfirmed: report only with a repro |

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
