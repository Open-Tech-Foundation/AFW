# Full-stack benchmark

**What it measures:** how fast a full-stack app builds and how fast its dev server is —
the same app, written the way each framework writes it, at three sizes.

- **Build:** peak memory (summed over the process tree) and wall time of a production
  build, framework caches cleared, median of three runs.
- **Dev start:** from launching the dev server to the home page rendered in Chrome
  (caches cleared), median of three.
- **Edit to browser:** after editing a component, until the new text shows in Chrome,
  and whether the page reloaded to get there, median of three.

## The app

One spec, implemented in each framework's own conventions (`apps/<framework>/`):

| Part | What it has |
| --- | --- |
| Layout | Nav links and a cart badge (client state shared across components) |
| Home `/` | A counter (client state) and five featured products from a loader |
| Products `/products/[id]` | Rendered on the server from `data/products.json` (50 products); unknown id → 404; an add-to-cart button updating the badge |
| API | `GET /api/products`, `POST /api/cart` |
| Middleware | `/account` redirects to `/` without a `user` cookie |
| Docs `/docs/<slug>` | 10 MDX pages (headings, lists, a GFM table and a code block each) |
| Generated `/pages/p<i>` | K route pages, each with a card and its own interactive component |
| Styling | Tailwind CSS 4 |

`generate.mjs` writes the shared input — the data, the docs and the K generated pages —
in each framework's file conventions, so the build grows with the app: K = 10, 100 and
1,000.

## Contenders

| | Version | Build | Production server | Dev |
| --- | --- | --- | --- | --- |
| **AFW on esdev** | `@opentf/afw` 0.35, `esdev-plugin-afw` 0.7, esdev 0.26 | `esdev build --minify` | `esdev dist/server.js` (the generated `@afw/server`) | `esdev start` |
| **AFW on Vite + Node** | `@opentf/afw` 0.35, `vite-plugin-afw` 0.3, Vite 8.3 | `vite build` | `node dist/server/index.js` | `vite` |
| **Next.js** | 16.4, App Router, Turbopack | `next build` | `next start` | `next dev` |
| **TanStack Start** | 1.169, Nitro 3 (node-server) | `vite build` | `node .output/server/index.mjs` | `vite` |
| **SolidStart** | 2.2, Solid 1.9, Nitro 3 (node-server) | `vite build` | `node .output/server/index.mjs` | `vite` |
| **SvelteKit** | 3.1, Svelte 5.57, `@sveltejs/adapter-node` 6, mdsvex | `vite build` | `node build/index.js` | `vite dev` |
| **Astro** | 7.4, React islands, `@astrojs/node` | `astro build` | `node dist/server/entry.mjs` | `astro dev` |

Both AFW workflows build the same `apps/afw/` folder.

**Not included: Bun.** Bun's full-stack model (`Bun.serve` with HTML imports) is a
browser-rendered app plus API routes — no server rendering and no file-based routing,
so its pages would not contain the server-rendered content the others serve. A Bun app
matching them would be hand-written SSR, measuring that code rather than Bun.

## Parity

Before any number counts, each built app's production server must pass
[`parity.mjs`](./parity.mjs): every route answers with the same content (the home page's
heading, counter and featured products; a product's name and price; a 404 for an unknown
product; the 50 products from the API and a count from the cart; the redirect without
the cookie and the page with it; a docs page with its table; the K-th generated page),
and the CSS the home page links has the Tailwind classes it uses. A failing tool records
its failures instead of numbers.

## Not equal work, by design

Each framework builds the app its own way, which is what is being compared:

- **Next.js** prerenders the routes that need no request at build time (home, docs,
  generated pages) and renders `/products/[id]` per request. The others in `ssr` mode
  render every page per request. That is part of Next's build cost.
- **Astro** ships JavaScript only for the islands (`client:load`); the others hydrate
  the whole page.
- **SolidStart** loads its data with `query()` server functions (`"use server"`), and
  renders the MDX docs through `solid-mdx`, as SolidStart's MDX template does — Solid
  cannot render MDX's plain tag names without it.
- **SvelteKit** loads its data in `+page.server.js`, and renders the docs with mdsvex,
  its usual Markdown preprocessor (`.md` routes); mdsvex highlights the code blocks
  with Prism at build time.
- **TanStack Start** needed its Tailwind sources pinned (`@source` in
  `src/styles.css`): with automatic detection its client and server builds generated
  different stylesheets, and the page linked a file the build never emitted (a 404).

## Running

Run on a solid-state disk (see [Where to run](../README.md#where-to-run)); the harness
keeps its working copies in `~/.cache/afw-fullstack-bench` by default.

```bash
node benchmarks/fullstack/run.mjs                        # every tool, K = 10, 100, 1000, three runs
node benchmarks/fullstack/run.mjs --only=astro --sizes=10 --runs=1
node benchmarks/fullstack/run.mjs --work=/path/on/an/ssd
```

- Each tool's working copy is installed once (`npm install`); each size regenerates the
  pages, does one discarded warm-up build, then the measured runs.
- Results go to `results/<date>.json`; a rerun with `--only` replaces just those tools.
- `node benchmarks/fullstack/report.mjs` turns the results into the site's tables: it
  merges every results file, each tool from the newest file that measured it.
- Chrome comes from `CHROME_BIN`, else `/usr/bin/chromium`. `measure.py` is the SSG
  benchmark's process-tree sampler.
