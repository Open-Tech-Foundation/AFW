<div align="center">

# @opentf/afw-cli

***Static generation for AFW apps, run as an `esdev build` step***

[Static generation guide](https://afw.opentechf.org/docs/deployment/static-generation) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-cli/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> Your project owns its build. This package supplies the pieces a prerender step
> needs: route and loader discovery, page rendering, API and loader bundles, plus a
> release hook that writes search indexes, feeds and `llms.txt`.

```json
{
  "plugins": [
    { "module": "@opentf/esdev-plugin-afw", "options": { "mode": "ssg" } },
    { "module": "@opentf/afw-cli/ssg", "export": "siteOutputPlugin",
      "options": { "target": "web", "prerenderTarget": "site-ssg", "root": "." } }
  ],
  "build": {
    "targets": {
      "web": { "entry": "index.html", "outdir": "dist" },
      "site-ssg": { "entry": "ssg.js", "out": ".ssg/ssg.js", "then": "run" }
    }
  }
}
```

`esdev build` bundles the site, then runs `ssg.js`, which prerenders every route
into the staged output. Only when every step succeeds does the new site replace the
old one.

> [!NOTE]
> **Alpha.** The package keeps its historical name; the old `afw` executable and
> its `dev` / `build` / `serve` commands are retired in favour of `esdev`.

## Install

```sh
pnpm add -D @opentf/afw-cli @opentf/esdev-plugin-afw
pnpm add @opentf/afw
```

Requires esdev 0.16 or newer. `esdev create my-site --template=docs` generates a
project with the prerender target, `ssg.js` and the release hook already in place.

## The prerender step

`ssg.js` is a short script you own. It uses this package to:

| Step | Helpers |
| --- | --- |
| Find pages and loaders under `app/` | `discoverPages`, `discoverLoaders`, `assertNoRouteConflicts` |
| Read `afw.config.js` | `loadConfig` |
| Render each route into the shell `index.html` | `runPrerender`, `stampHydrateSentinel` |
| Bundle server code for a deploy adapter | `emitLoaderBundle`, `emitApiBundle` |
| Hand results to the release hook | `writePrerenderReport` |

Pages with dynamic segments are skipped unless they export `getStaticPaths()`.
The [static generation guide](https://afw.opentechf.org/docs/deployment/static-generation)
walks through a complete `ssg.js`.

## The release hook

`siteOutputPlugin` runs in the staging area after prerendering and before the
site is published:

| Output | Source |
| --- | --- |
| Search index | `afwc docs index` over the prerendered HTML |
| RSS / Atom feeds | The blog section, when `afw.config.js` has one |
| `llms.txt`, `llms-full.txt` | Page titles and descriptions, for LLM context |

| Option | Purpose |
| --- | --- |
| `target` | The browser build target to post-process (e.g. `"web"`) |
| `prerenderTarget` | The prerender target that must run first |
| `root` | The site's source folder, relative to the working directory |

The hook never runs under `esdev start`. If indexing fails, the build fails and the
previous deployment stays live.

## Environment

| Variable | Effect |
| --- | --- |
| `AFWC_BIN` | Use this `afwc` executable for compilation and indexing |
| `EXCLUDE_ROUTES` | Comma-separated route folders the release hook skips (the starter `ssg.js` honours it too) |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
