# {{name}}

An [AFW](https://afw.opentechf.org) app on esdev and ES-Runtime: pages prerendered to static HTML, with a server on ES-Runtime.

| Command | What it does |
| --- | --- |
| `{{pm}} run dev` | Start the dev server |
| `{{pm}} run build` | Build for production |
| `{{pm}} run start` | Run the built server on ES-Runtime (`PORT`) |
| `{{pm}} run test` | Run the tests with esdev |

- Pages live in `app/`: `app/about/page.md` is served at `/about`.
- `app/_config.js` sets how pages render (`server`, `static` or `client`); a folder's own `_config.js` changes it for that folder.
- Component tests live in `tests/ui/`, server tests (API routes, loaders) in `tests/server/`.
- On the server: API routes (`app/api/hello/route.js`), middleware (`app/_middleware.js`), a loader (`app/todos/loader.js`) and server functions (`app/todos/todos.server.js`), which components call like async functions.
