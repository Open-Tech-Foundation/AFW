# {{name}}

A component library for [AFW](https://afw.opentechf.org), published as JSX source.

| Command | What it does |
| --- | --- |
| `{{pm}} run dev` | Preview the components (`app/page.jsx`) |
| `{{pm}} run test` | Run the tests with esdev |
| `{{pm}} publish` | Publish `index.js` and `src/` |

- Export each component from `index.js`.
- Apps install it next to `@opentf/afw` (a peer dependency); their AFW plugin compiles it, with Vite or esdev.
