# {{name}}

A component library for [AFW](https://afw.opentechf.org), published as JSX source.

| Command | What it does |
| --- | --- |
| `{{pm}} run dev` | Preview the components (`app/page.tsx`) |
| `{{pm}} run test` | Run the tests with esdev |
| `{{pm}} run typecheck` | Check types |
| `{{pm}} publish` | Publish `index.ts` and `src/` |

- Export each component from `index.ts`.
- Apps install it next to `@opentf/afw` (a peer dependency); their AFW plugin compiles it, with Vite or esdev.
