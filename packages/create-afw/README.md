# @opentf/create-afw

Create an [AFW](https://afw.opentechf.org) app on **Vite and Node**:

```sh
npm create @opentf/afw my-app
```

Answer the prompts, or pass the choices:

```sh
npm create @opentf/afw my-app -- --template=fullstack --language=ts
```

| Option | Values |
| --- | --- |
| `--template` | `spa` (default), `fullstack`, `ssr`, `ssg` |
| `--language` | `ts` (default), `js` (`--ts` / `--js` also work) |
| `--yes`, `-y` | Use the defaults instead of asking |

| Template | What you get |
| --- | --- |
| `spa` | Single-page app, rendered in the browser |
| `fullstack` | SPA plus API routes, middleware and loaders on a Node server |
| `ssr` | Server-rendered pages on a Node server, hydrated in the browser |
| `ssg` | Every page prerendered to static HTML at build time |

Every project comes with `dev`, `build` and `test` (Vitest) scripts, and either
`start` (the built Node server) or `preview`. TypeScript projects add `typecheck`.

For the esdev + ES-Runtime workflow, use `esdev create` instead.

## License

MIT
