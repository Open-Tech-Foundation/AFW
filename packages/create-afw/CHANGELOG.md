# @opentf/create-afw

## [Unreleased]

### Added

- `docs` template: an `@opentf/afw-docs` site on Vite — MDX docs and a blog, prerendered,
  with search, feeds, `sitemap.xml` and `llms.txt`.
- `library` template: components published as JSX source, `@opentf/afw` as a peer
  dependency, a preview app (`npm run dev`) and a Vitest test.
- Tailwind CSS: a styling choice for apps and libraries (`--styling tailwind`, or
  `--tailwind`), set up with `@tailwindcss/vite`.
- Apps with a server include server functions: `app/todos/todos.server.js`, called by
  the todos page and directly by its loader; after adding a todo the page calls
  `invalidate()` to reload its data.

### Changed

- An app's rendering and its server are separate choices: `--render spa|ssr|ssg` and
  `--server` / `--no-server` (SSR always has a server), so every combination is
  available — a prerendered site with API routes, say. The prompts ask for a template
  (`app`, `docs`, `library`), then only what it needs. The old template names
  (`spa`, `fullstack`, `ssr`, `ssg`) still work as shorthands for `app`.

- The scaffolder never starts the dev server. The "Install with … and start now?"
  prompt and `--immediate` are gone: it installs the dependencies with the package
  manager that ran it, then shows the command to start the dev server and exits.
  `--no-install` skips the install; a failed install warns and lists the install step.

## [0.2.0] - 2026-11-04

### Changed

- Interactive prompts like `create-vite`'s: arrow-key selection with descriptions, a
  project-name prompt, a package-name prompt when the folder name cannot be one, a
  choice for a non-empty target (cancel, remove its files, or ignore them), and an
  offer to install dependencies and start the dev server. Ctrl+C cancels cleanly.
- Flags: `--template fullstack-ts` style names, `--overwrite`, `--immediate` and
  `--no-interactive`; `-t` and `-l` short forms. Runs without prompts when there is
  no terminal.

### Fixed

- Scaffolding no longer fails when installed from npm. 0.1.0 looked for the sibling
  workspace packages when its build-time `versions.json` was missing and crashed with
  ENOENT. AFW versions now come from `versions.json`, the workspace, or the npm
  registry, and fall back to `latest` instead of failing.

## [0.1.0] - 2026-11-03

### Added

- New package: `npm create @opentf/afw` scaffolds an AFW app on Vite and Node, the
  workflow for server code that needs the Node ecosystem. Templates: `spa`,
  `fullstack`, `ssr` and `ssg`, each in TypeScript or JavaScript, with Vitest tests
  and dev, build, test and start/preview scripts. Projects depend on the AFW versions
  released with the scaffolder. Every template is tested end to end: scaffolded,
  tested, typechecked, built with `vite build` and run.
