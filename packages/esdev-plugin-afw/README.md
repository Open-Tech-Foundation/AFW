<div align="center">

# @opentf/esdev-plugin-afw

***Compile AFW components and serve file-based routes in esdev***

[Docs](https://afw.opentechf.org/docs/getting-started/installation) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/esdev-plugin-afw/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> One line in `esdev.json` gives [esdev](https://esrun.opentechf.org/esdev) the
> AFW compiler: `.jsx`, `.tsx`, `.mdx` and `.md` compile on import in
> `esdev start`, `esdev build` and `esdev test`, and `app/` becomes a route map.

```json
{
  "plugins": ["@opentf/esdev-plugin-afw"],
  "build": {
    "targets": {
      "web": { "entry": "index.html", "outdir": "dist" }
    }
  }
}
```

```js
// entry.js, loaded by index.html next to an #app element
import { mountApp } from "@opentf/afw";
import { pages, guard, loaderRoutes } from "@afw/routes";

mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
```

`@afw/routes` is generated from `app/**/{page,layout,404}.{jsx,tsx,mdx,md}`, so
adding a file adds a route. CSS, Tailwind and assets go through esdev's own pipeline.

> [!NOTE]
> **Alpha.** Options can change between minor versions; see the
> [changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/esdev-plugin-afw/CHANGELOG.md).

## Install

```sh
pnpm add @opentf/afw
pnpm add -D @opentf/esdev-plugin-afw
```

Requires esdev 0.16 or newer (0.17+ for development refresh). The `afwc` compiler
comes from [`@opentf/afw-compiler`](https://www.npmjs.com/package/@opentf/afw-compiler),
installed as a dependency. `esdev create my-app --template=spa` generates a project
already configured this way.

## Rendering modes

Pass options to pick how pages are rendered:

```json
{
  "plugins": [{
    "module": "@opentf/esdev-plugin-afw",
    "options": { "mode": "ssg", "appDir": "app" }
  }]
}
```

The plugin chooses a compiler backend per module from the build's context:

| Context | `mode: "spa"` (default) | `mode: "ssg"` / `"ssr"` |
| --- | --- | --- |
| Server build, `esdev start`, or a script | `ssg` | `ssg` |
| Browser release build | `csr` | `hydrate` |
| Browser development or DOM test | `csr` | `csr` |

Server builds import framework helpers from `@opentf/afw/server`, which renders
HTML without browser Custom Elements, so a server target can point straight at
`server.js`.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `mode` | `"spa"` | `spa`, `ssg` or `ssr`; selects backends as in the table above |
| `target` | — | Force one backend: `csr`, `ssg` or `hydrate` |
| `appDir` | `"app"` | Route folder. A bare name is found next to the importing entry; a path such as `"website/app"` resolves from the working directory |
| `exclude` | `[]` | Folder names to leave out of the route map |
| `routes` | `true` | `false` turns off `@afw/routes`, for libraries |
| `failOnError` | `true` | `false` replaces a broken module with a diagnostic stub instead of failing the build |

## Development refresh

In `esdev start`, an edited component or page refreshes in place: the host, props
and named `$state` values survive, while effects and lifecycle hooks are disposed
and re-run. A compile error keeps the previous view on screen until the fix is
saved. Changes the refresh cannot apply safely, such as renamed components or
changed props, fall back to a reload. Release, server and test output contains no
refresh code.

## Source maps

Compiled modules return a version-3 source map that esdev composes into the
bundle. Statements, expressions and event callbacks keep their original JSX/TSX
positions. Markdown maps to its generated JSX for now.

## API

| Export | Purpose |
| --- | --- |
| `default` / `createAfwAppPlugin(options)` | Compiler plus `@afw/routes`: the factory `esdev.json` uses |
| `createAfwPlugin({ target, mode, failOnError })` | Compiler only, for custom pipelines and test configs |
| `createAfwRoutes({ appDir, exclude })` | Route map only |
| `afwPlugin(afwc, { target, failOnError })` | Compiler plugin for a `runtime:build` script |
| `resolveCompiler()` | Find `afwc`: `AFWC_BIN`, then the packaged binary, then a local Cargo checkout |
| `startCompilerServer(afwc, { sourceMap })` | A persistent `afwc serve` child: `{ compile, close }` |
| `closeCompilers()` | Stop every compiler child started in this process |
| `compileError(payload)` | Turn a compiler error reply into an `Error` with `.diag` |

```js
import { build } from "runtime:build";
import { afwPlugin, closeCompilers, resolveCompiler } from "@opentf/esdev-plugin-afw";

const { afwc } = await resolveCompiler();
const bundle = await build({ input: "app/page.jsx", plugins: [afwPlugin(afwc, { target: "csr" })] });
const { output } = await bundle.generate({ format: "esm" });
await bundle.close();
await closeCompilers();
```

All modules compile through one long-lived `afwc serve` process per plugin
instance, so the binary starts once per build.

## Documentation

| Doc | Purpose |
| --- | --- |
| [Installation](https://afw.opentechf.org/docs/getting-started/installation) | Creating and configuring a project |
| [Static generation](https://afw.opentechf.org/docs/deployment/static-generation) | `mode: "ssg"` with a prerender step |
| [Server rendering](https://afw.opentechf.org/docs/deployment/server) | `mode: "ssr"` with a server target |
| [esdev plugins](https://esrun.opentechf.org/esdev/plugins) | How esdev loads and orders plugins |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
