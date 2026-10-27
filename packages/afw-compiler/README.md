<div align="center">

# @opentf/afw-compiler

***`afwc`, the AFW compiler and docs indexer, as one native binary***

[Architecture](https://github.com/Open-Tech-Foundation/afw/blob/main/ARCHITECTURE.md) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-compiler/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> `afwc` is written in Rust. It parses JSX, TSX and MDX, derives the View,
> Reactivity, Server, Route and Metadata IRs, and generates code for the CSR,
> Hydrate and SSG backends. It also builds the search index for documentation
> sites.

```js
import { afwcPath } from "@opentf/afw-compiler";

const bin = afwcPath(); // absolute path to the afwc executable for this platform
```

You rarely need this package directly:
[`@opentf/esdev-plugin-afw`](https://www.npmjs.com/package/@opentf/esdev-plugin-afw)
and [`@opentf/afw-docs`](https://www.npmjs.com/package/@opentf/afw-docs) depend on it
and call `afwcPath()` for you.

> [!NOTE]
> **Alpha.** Compiler output is versioned together with the `@opentf/afw` runtime;
> keep both on matching releases.

## Install

```sh
pnpm add -D @opentf/afw-compiler
```

No install scripts run. The first call to `afwcPath()` decompresses the host's
binary next to its archive and reuses it afterwards.

## Platforms

| Platform | Architecture | Archive |
| --- | --- | --- |
| Linux (glibc) | x64 | `bin/linux-x64/afwc.br` |
| macOS | arm64 | `bin/darwin-arm64/afwc.br` |
| macOS | x64 | `bin/darwin-x64/afwc.br` |
| Windows | x64 | `bin/win32-x64/afwc.exe.br` |

Each binary ships Brotli-compressed (about 0.65 MB instead of 2.3 MB), and all
four ship in this one package rather than as per-platform optional dependencies.

## Commands

| Command | Purpose |
| --- | --- |
| `afwc build [--component] [--target=ssg\|hydrate] [--sourcemap] <file>` | Compile one module (CSR by default) and print the JavaScript |
| `afwc serve [--sourcemap]` | Long-lived compile server over stdin/stdout, used by the esdev plugin |
| `afwc graph <entry…>` | Print the module import graph as JSON |
| `afwc docs index <site-dir> [--out <dir>]` | Build a static search index from a built site's HTML |
| `afwc docs query <index-dir> <query>` | Query an index from the command line |

## Environment

| Variable | Effect |
| --- | --- |
| `AFWC_BIN` | Use this executable instead of the packaged one, e.g. a local `cargo build` |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
