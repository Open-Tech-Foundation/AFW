# {{name}}

A documentation site built with [AFW](https://afw.opentechf.org) and `@opentf/afw-docs` on esdev and ES-Runtime.

| Command | What it does |
| --- | --- |
| `{{pm}} run dev` | Start the dev server |
| `{{pm}} run build` | Build for production |
| `{{pm}} run preview` | Preview the production build |
| `{{pm}} run test` | Run the tests with esdev |
| `{{pm}} run typecheck` | Check types |

- Docs pages live in `app/docs/`; `app/docs/_meta.js` orders the sidebar.
- `{{pm}} run build` prerenders every page and writes the search index, `sitemap.xml` and `llms.txt`.
- Set your site's URL in `afw.config.js`.
