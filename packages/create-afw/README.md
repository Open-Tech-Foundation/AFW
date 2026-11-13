# @opentf/create-afw

Create an [AFW](https://afw.opentechf.org) app on **Vite and Node**:

```sh
npm create @opentf/afw@latest
```

The prompts ask for a project name and a template, then only what that template needs
(arrow keys and Enter). The dependencies are installed and the command to start the
dev server is shown. Nothing is started for you.

| Prompt | Asked for | Choices |
| --- | --- | --- |
| Template | every project | `app`, `docs`, `library` |
| Rendering | `app` | `client` (in the browser), `server` (per request, hydrated), `static` (prerendered), `mixed` (server, with a static page and a client section); written to `app/_config.js` |
| Server | `app`, for `client` and `static` | API routes, middleware, loaders and server functions on Node: yes or no |
| Styling | `app`, `library` | CSS, or Tailwind CSS |
| Blog | `docs` | Posts with RSS and Atom feeds: yes or no (default) |
| Language | every project | TypeScript (default), JavaScript |

Or pass the choices:

```sh
npm create @opentf/afw@latest my-app -- --template app --render static --server --tailwind
npm create @opentf/afw@latest my-docs -- --template docs-js --blog
```

| Option | Values |
| --- | --- |
| `-t`, `--template` | `app`, `docs`, `library`; add `-ts` or `-js` for the language (`app-js`) |
| `-r`, `--render` | `client` (default), `server`, `static`, `mixed` — `app` only |
| `--server`, `--no-server` | Add a Node server, or not (default) — `app` only; `server` and `mixed` always have one |
| `-s`, `--styling` | `css` (default) or `tailwind`; `--tailwind` for short — `app` and `library` |
| `--blog`, `--no-blog` | Add a blog, or not (default) — `docs` only |
| `-l`, `--language` | `ts` (default) or `js` |
| `--overwrite` | Remove the files in a non-empty target directory first |
| `--no-install` | Skip installing dependencies |
| `--no-interactive` | Never ask; use defaults for anything not given (also the default without a terminal) |

| Template | What you get |
| --- | --- |
| `app` | File-based pages and a component test; with a server, an API route, middleware, a loader and server functions |
| `docs` | An [`@opentf/afw-docs`](https://afw.opentechf.org/packages/afw-docs) site: MDX docs, prerendered, with search, `sitemap.xml` and `llms.txt`; with `--blog`, a blog with RSS/Atom feeds |
| `library` | Components published as JSX source (`index.js` and `src/`), `@opentf/afw` as a peer dependency, a preview app and a test |

- A non-empty target directory: choose to cancel, remove its files, or ignore them.
- A folder name that is not a valid package name: you are asked for one (`My App` → `my-app`).
- Apps and docs sites have `dev`, `build` and `test` (Vitest) scripts, and either `start`
  (the built Node server) or `preview`. A library has `dev` (its preview) and `test`.
  TypeScript projects add `typecheck`.
- New projects depend on the current AFW release from the npm registry.

For the esdev + ES-Runtime workflow, use `esdev create` instead.

## License

MIT
