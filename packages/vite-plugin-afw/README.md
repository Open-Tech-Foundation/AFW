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

## Rendering modes

| `mode` | Development | `vite build` |
| --- | --- | --- |
| `spa` | Client-rendered | Client bundle; with server routes, also the Node server |
| `ssr` | Client-rendered | Hydrating client plus a Node server that renders each page request |
| `ssg` | Client-rendered | Every route prerendered to HTML. A static site in `dist/`, or `dist/client` beside the Node server when the app has server routes |

Server-rendered and prerendered pages are marked for hydration, so the client adopts
the server's DOM instead of rebuilding it. Loader data is inlined into the page.
Dynamic routes are prerendered from their `getStaticPaths`. Set `baseUrl` for
canonical links and `sitemap.xml`.

## Server routes

API routes (`route.js`), middleware (`_middleware.js`), loaders (`loader.js`) and
[server functions](https://afw.opentechf.org/docs/server-functions) (`*.server.js`) run
on Node, so they can use any npm package, native addons included:

```js
// app/api/thumbnail/route.js
import sharp from "sharp";

export async function POST(request) {
  const image = await sharp(Buffer.from(await request.arrayBuffer())).resize(200).webp().toBuffer();
  return new Response(image, { headers: { "content-type": "image/webp" } });
}
```

- **Development:** `vite` runs them inside the dev server. Edits and new files apply
  without a restart.
- **Production:** when the app has server files, `vite build` writes `dist/client` and
  `dist/server`. Start it with `node dist/server/index.js` (`PORT`, `HOST`). It serves
  the client behind your middleware, answers API routes and loader data, and returns
  the app shell for page navigations. For your own server, import `createHandler` from
  `dist/server/app.js`; it is a standard Fetch handler.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `mode` | `"spa"` | `spa`, `ssg` or `ssr`: how pages render in release builds |
| `appDir` | `"app"` | The routes folder. A bare name is found beside the importing entry |
| `exclude` | `[]` | Folders under `appDir` that hold no routes |
| `routes` | `true` | `false` drops the `@afw/routes` module |
| `server` | `"auto"` | Build `dist/server`: `"auto"` when the app has server files or server functions, or `true`/`false` |
| `i18n` | — | `{ locales, defaultLocale }`: locale prefixes for server routes and rendered pages |
| `baseUrl` | `""` | The site's absolute URL, for canonical links and `sitemap.xml` |
| `target` | — | Force one compiler backend (`csr`, `ssg`, `hydrate`) |

## What it does

- Compiles `.jsx`, `.tsx`, `.md` and `.mdx` through the AFW compiler, including those
  shipped by AFW packages such as `@opentf/afw-docs` and by component libraries: any
  dependency that declares `@opentf/afw` is kept out of pre-bundling, bundled into
  server builds and inlined for Vitest.
- Works with Tailwind CSS 4: add `tailwindcss()` from `@tailwindcss/vite` after `afw()`.
- Exposes `PUBLIC_*` environment variables as `import.meta.env.PUBLIC_*` (sets Vite's
  `envPrefix` to `PUBLIC_` unless you set your own), matching the esdev workflow.
- Replaces `*.server.js` modules with fetch stubs in browser code; the server answers
  them under their folder's middleware.
- Generates `@afw/routes` from `app/`: pages (lazy, code-split), loader route patterns
  and the route guard. Adding or removing a route file reloads the route table.
- Development: with `mode: "ssr"` the dev server renders pages on the server and the
  client adopts them, as in production. Components, pages and layouts refresh in place,
  keeping their state when its shape is unchanged. Compile errors show in Vite's overlay with their
  position and code frame. Draft and scheduled Markdown pages are served.
- Production: release builds carry no refresh code and leave drafts out.

## Testing with Vitest

Vitest picks up the plugin from `vite.config.js`. Add a DOM environment and the
`@opentf/afw-test` setup file:

```js
export default {
  plugins: [afw()],
  test: { environment: "happy-dom", setupFiles: ["@opentf/afw-test/vitest"] },
};
```

Under Vitest, modules compile for the client DOM with no refresh code. See
`@opentf/afw-test` for `render`, queries and `userEvent`.

## Compiler binary

The prebuilt `afwc` binary comes from `@opentf/afw-compiler`. Set `AFWC_BIN` to use
another build.

## License

MIT
