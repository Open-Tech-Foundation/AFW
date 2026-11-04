# @opentf/create-afw

## [Unreleased]

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
