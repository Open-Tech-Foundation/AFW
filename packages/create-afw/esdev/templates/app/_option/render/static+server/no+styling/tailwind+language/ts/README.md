# {{name}}

An [AFW](https://afw.opentechf.org) app on esdev and ES-Runtime: pages prerendered to static HTML.

| Command | What it does |
| --- | --- |
| `{{pm}} run dev` | Start the dev server |
| `{{pm}} run build` | Build for production |
| `{{pm}} run preview` | Preview the production build |
| `{{pm}} run test` | Run the tests with esdev |
| `{{pm}} run typecheck` | Check types |

- Pages live in `app/`: `app/about/page.md` is served at `/about`.
- `app/_config.ts` sets how pages render (`server`, `static` or `client`); a folder's own `_config.ts` changes it for that folder.
- Component tests live in `tests/ui/`.
- Styled with Tailwind CSS: utility classes go straight into `class`.
