# {{name}}

An [AFW](https://afw.opentechf.org) app on esdev and ES-Runtime: pages prerendered to static HTML, with a server on ES-Runtime.

| Command | What it does |
| --- | --- |
| `{{pm}} run dev` | Start the dev server |
| `{{pm}} run build` | Build for production |
| `{{pm}} run start` | Run the built server on ES-Runtime (`PORT`) |
| `{{pm}} run test` | Run the tests with esdev |
| `{{pm}} run typecheck` | Check types |

- Pages live in `app/`: `app/about/page.md` is served at `/about`.
- `app/_config.ts` sets how pages render (`server`, `static` or `client`); a folder's own `_config.ts` changes it for that folder.
- Component tests live in `tests/ui/`, server tests (API routes, loaders) in `tests/server/`.
- On the server: API routes (`app/api/hello/route.ts`), middleware (`app/_middleware.ts`), a loader (`app/todos/loader.ts`) and server functions (`app/todos/todos.server.ts`), which components call like async functions.
- Styled with Tailwind CSS: utility classes go straight into `class`.
