# @opentf/create-afw

## [Unreleased]

## [0.1.0] - 2026-11-03

### Added

- New package: `npm create @opentf/afw` scaffolds an AFW app on Vite and Node, the
  workflow for server code that needs the Node ecosystem. Templates: `spa`,
  `fullstack`, `ssr` and `ssg`, each in TypeScript or JavaScript, with Vitest tests
  and dev, build, test and start/preview scripts. Projects depend on the AFW versions
  released with the scaffolder. Every template is tested end to end: scaffolded,
  tested, typechecked, built with `vite build` and run.
