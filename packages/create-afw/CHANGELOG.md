# @opentf/create-afw

## [Unreleased]

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
