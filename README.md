<div align="center">

# AFW

***App Framework for the Web: JSX compiled to native DOM, no virtual DOM***

[Website](https://afw.opentechf.org) | [Docs](https://afw.opentechf.org/docs) | [API](https://afw.opentechf.org/api) | [npm](https://www.npmjs.com/package/@opentf/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> A Rust compiler reads your JSX once and emits the exact DOM operations it needs.
> Every component is a standard Custom Element, and every `{expression}` is one
> binding to one signal, so a state change touches only the nodes that read it.

```jsx
export default function Counter() {
  let count = $state(0);
  const doubled = $derived(count * 2);

  return (
    <div>
      <p>{count} × 2 = {doubled}</p>
      <button onclick={() => count++}>Increment</button>
    </div>
  );
}
```

`count++` is a signal write; the compiler wires it, so there is no `.value` and
no setter. Clicking the button updates two text nodes and nothing else: there is
no re-render, no diff and no memoization to manage.

> [!NOTE]
> **Alpha.** APIs can change between minor versions while the framework hardens;
> see each package's changelog.

## Why AFW

| Need | How AFW meets it |
| --- | --- |
| ⚡ **No virtual DOM** | The compiler emits direct DOM operations; there is no reconciliation loop at runtime. |
| 🎯 **Fine-grained updates** | `$state`, `$derived` and `$effect` compile to signals; each binding re-runs only when its own inputs change. |
| 🧩 **Standard Web Components** | Every component is a native Custom Element, usable from plain HTML or any other framework. |
| 🦀 **One Rust toolchain** | A single compiler produces client rendering, hydration, static generation and server rendering from the same source. |
| 🗂️ **File-based routing** | Nested layouts, dynamic and catch-all segments, route guards, loaders and API routes under `app/`. |
| 🔋 **Batteries included** | Forms, i18n, testing and a documentation theme ship as first-party packages. |

## Compared with other frameworks

| | **AFW** | React | Solid | Svelte 5 |
| --- | --- | --- | --- | --- |
| **Authoring** | JSX + `$state` macros | JSX + hooks | JSX + signals | `.svelte` + runes |
| **Updates** | Signals → direct DOM | Virtual DOM diff | Signals → direct DOM | Signals → direct DOM |
| **Component output** | Native Custom Element | Function | Function | Function |
| **Compiler written in** | Rust | JavaScript (optional React Compiler) | JavaScript (Babel plugin) | JavaScript |
| **Maturity** | New (alpha) | Mature | Mature | Mature |

### Speed today

[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)-style
operations, median of 3 pooled runs on one machine, CPU throttled 4×, in
milliseconds; lower is better. Recorded on 2026-08-01:

| Operation | **AFW** | React | Solid | Svelte 5 |
| --- | --- | --- | --- | --- |
| create 1,000 rows | 261.2 | 274.1 | 244.3 | 257.6 |
| create 10,000 rows | 2627.8 | 3338.6 | 2542.2 | 2548.8 |
| append 1,000 to 1,000 | 295.8 | 286.2 | 270.1 | 267.5 |
| update every 10th (1k) | 91.9 | 93.9 | 108.9 | 92.5 |
| swap 2 rows (1k) | 33.0 | 246.5 | 31.2 | 31.3 |
| select row (1k) | 26.2 | 27.3 | 30.0 | 29.0 |
| remove row (1k) | 40.4 | 39.9 | 37.6 | 36.2 |
| clear 10,000 rows | 178.6 | 260.9 | 164.0 | 165.3 |

AFW is in the same range as Solid and Svelte and ahead of React on large
creates, swaps and clears; no framework wins every row, and differences under
the ~8 ms timing resolution are ties. Method, caveats and the build-cost
comparison are on the [benchmarks page](https://afw.opentechf.org/docs/benchmarks).
Reproduce with `tsr bench`.

## Get started

AFW runs on [ES-Runtime](https://esrun.opentechf.org)'s `esdev` toolchain
(0.17 or newer). Generate a project:

```sh
esdev create my-app --template=spa     # also: fullstack, docs, library
cd my-app
esdev start
```

Or add AFW to an existing esdev project:

```sh
pnpm add @opentf/afw
pnpm add -D @opentf/esdev-plugin-afw
```

```json
{ "plugins": ["@opentf/esdev-plugin-afw"] }
```

The [installation guide](https://afw.opentechf.org/docs/getting-started/installation)
covers the HTML entry, routes and TypeScript setup.

## Packages

| Package | Role |
| --- | --- |
| [`@opentf/afw`](packages/afw) | **Start here.** Runtime: signals, DOM bindings, router, `Link`, server rendering |
| [`@opentf/esdev-plugin-afw`](packages/esdev-plugin-afw) | esdev plugin: compiles `.jsx`/`.tsx`/`.mdx` and serves file-based routes |
| [`@opentf/afw-compiler`](packages/afw-compiler) | The `afwc` native binary for every platform: compilation and docs indexing |
| [`@opentf/afw-cli`](packages/afw-cli) | Static-generation library behind `esdev build` prerender steps |
| [`@opentf/afw-form`](packages/afw-form) | Path-based reactive forms with sync, async and schema validation |
| [`@opentf/afw-i18n`](packages/afw-i18n) | ICU messages, `Intl` formatters and URL-prefix locale routing |
| [`@opentf/afw-test`](packages/afw-test) | Render and query components with Testing Library in esdev's DOM |
| [`@opentf/afw-docs`](packages/afw-docs) | Documentation and blog theme: sidebar, search, TOC, callouts, feeds |

## Design

| Pillar | In one line |
| --- | --- |
| **One source, many IRs** | The compiler derives View, Reactivity, Server, Route and Metadata IRs from one AST. |
| **Many backends** | Each IR feeds CSR, Hydrate, SSG and SSR code generators; nothing is interpreted at runtime. |
| **Custom Elements as the unit** | Components register as native elements; hosts carry a stable `afw-<name>` class for styling. |
| **Signals, not re-renders** | Reactivity is a dependency graph of signals; the DOM is never rebuilt to apply a change. |
| **Toolchain, not a dev server** | Builds, dev, tests and HMR run on esdev; AFW contributes plugins, not its own CLI. |

## Repository

| Path | Contents |
| --- | --- |
| `crates/` | The Rust compiler: parsing, semantic analysis, IRs, code generation, the `afwc` binary |
| `packages/` | The published npm packages listed above |
| `website/` | The documentation site at [afw.opentechf.org](https://afw.opentechf.org): its own pnpm project on the published packages, built with `@opentf/afw-docs` |
| `playground/` | A scratch app for trying framework changes |
| `benchmarks/` | Runtime and static-build benchmark harnesses |
| `docs/` | Design notes: hydration, data loading, middleware, i18n, roadmap |

## Documentation

| Doc | Purpose |
| --- | --- |
| [afw.opentechf.org/docs](https://afw.opentechf.org/docs) | Guides: components, reactivity, routing, data, deployment |
| [afw.opentechf.org/api](https://afw.opentechf.org/api) | API reference for every package |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Compiler pipeline, IRs and backends |
| [SPEC.md](SPEC.md) | Language, runtime and output contracts |
| [docs/HYDRATION.md](docs/HYDRATION.md) | How server markup is adopted on the client |
| [docs/roadmap.md](docs/roadmap.md) | What ships today and what is planned |

## Develop

Requires esdev 0.17+, a Rust toolchain, pnpm and [tsr](https://tsr.opentechf.org).
Install once with `pnpm install` at the repository root, then:

```sh
tsr dev          # playground dev server
tsr site         # documentation site dev server
tsr test         # Rust, runtime, package and site tests
tsr test-e2e     # browser tests (Chrome + matching ChromeDriver)
tsr ci           # typecheck, test and test-e2e together
tsr bench        # runtime benchmarks against React, Solid and Svelte
```

Run tasks from the repository root: pnpm links workspace packages there, and
esdev only loads plugins from inside its working directory. The website installs
the published packages separately (`tsr site-install`); after a release, bump
the versions in `website/package.json` and reinstall. Tasks are defined in
[`tasks.toml`](tasks.toml); `tsr --list` shows all of them.

## License

MIT — see [LICENSE](LICENSE).
