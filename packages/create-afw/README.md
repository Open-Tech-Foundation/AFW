# @opentf/create-afw

Create an [AFW](https://afw.opentechf.org) app on **Vite and Node**:

```sh
npm create @opentf/afw@latest
```

The prompts ask for a project name, a template and a language (arrow keys and Enter),
and offer to install dependencies and start the dev server.

Or pass the choices:

```sh
npm create @opentf/afw@latest my-app -- --template fullstack-ts
```

| Option | Values |
| --- | --- |
| `-t`, `--template` | `spa`, `fullstack`, `ssr`, `ssg`; add `-ts` or `-js` for the language (`fullstack-js`) |
| `-l`, `--language` | `ts` (default) or `js` |
| `--overwrite` | Remove the files in a non-empty target directory first |
| `-i`, `--immediate` | Install dependencies and start the dev server |
| `--no-interactive` | Never ask; use defaults for anything not given (also the default without a terminal) |

| Template | What you get |
| --- | --- |
| `spa` | Single-page app, rendered in the browser |
| `fullstack` | SPA plus API routes, middleware and loaders on a Node server |
| `ssr` | Server-rendered pages on a Node server, hydrated in the browser |
| `ssg` | Every page prerendered to static HTML at build time |

- A non-empty target directory: choose to cancel, remove its files, or ignore them.
- A folder name that is not a valid package name: you are asked for one (`My App` → `my-app`).
- Every project has `dev`, `build` and `test` (Vitest) scripts, and either `start` (the
  built Node server) or `preview`. TypeScript projects add `typecheck`.
- New projects depend on the current AFW release from the npm registry.

For the esdev + ES-Runtime workflow, use `esdev create` instead.

## License

MIT
