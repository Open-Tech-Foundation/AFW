# @opentf/vite-plugin-afw

AFW for Vite. This is the **Vite + Node** workflow, one of AFW's two official ones:

| Workflow | Use it when |
| --- | --- |
| **Vite + Node** (this package) | Your server code needs the Node ecosystem: ORMs, database drivers, native addons such as `sharp`, existing Node hosting |
| esdev + ES-Runtime (`@opentf/esdev-plugin-afw`) | You want the single-binary, capability-secured ES-Runtime toolchain |

Both compile the same components and routes through the same core
(`@opentf/afw-build`), so an app's `app/` folder works in either.

## Install

```bash
npm install @opentf/afw
npm install -D vite @opentf/vite-plugin-afw
```

## Configure

```js
// vite.config.js
import afw from "@opentf/vite-plugin-afw";

export default {
  plugins: [afw({ mode: "spa" })],
};
```

```js
// entry.js, loaded from index.html
import { mountApp } from "@opentf/afw";
import { guard, loaderRoutes, pages } from "@afw/routes";

mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
```

Then `vite` for development and `vite build` for production.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `mode` | `"spa"` | `spa`, `ssg` or `ssr`: how pages render in release builds |
| `appDir` | `"app"` | The routes folder. A bare name is found beside the importing entry |
| `exclude` | `[]` | Folders under `appDir` that hold no routes |
| `routes` | `true` | `false` drops the `@afw/routes` module |
| `target` | — | Force one compiler backend (`csr`, `ssg`, `hydrate`) |

## What it does

- Compiles `.jsx`, `.tsx`, `.md` and `.mdx` through the AFW compiler, including those
  shipped by AFW packages such as `@opentf/afw-docs`.
- Generates `@afw/routes` from `app/`: pages (lazy, code-split), loader route patterns
  and the route guard. Adding or removing a route file reloads the route table.
- Development: components, pages and layouts refresh in place, keeping their state
  when its shape is unchanged. Compile errors show in Vite's overlay with their
  position and code frame. Draft and scheduled Markdown pages are served.
- Production: release builds carry no refresh code and leave drafts out.

## Compiler binary

The prebuilt `afwc` binary comes from `@opentf/afw-compiler`. Set `AFWC_BIN` to use
another build.

## License

MIT
