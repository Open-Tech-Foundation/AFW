<div align="center">

# @opentf/afw

***The AFW runtime: signals and zero-VDOM DOM bindings***

[Docs](https://afw.opentechf.org/docs) | [Reactivity](https://afw.opentechf.org/docs/core-concepts/reactivity) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> You write `.jsx` components; the AFW compiler lowers them to plain DOM code that
> imports its helpers from this package. Each component becomes a self-registering
> Custom Element, and each `{expression}` becomes one binding to one signal.

```jsx
import { onMount } from "@opentf/afw";

export default function Clock() {
  let now = $state(null);

  onMount(() => {
    now = new Date();
    const id = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(id);
  });

  return <time>{now ? now.toLocaleTimeString() : "Loading clock…"}</time>;
}
```

Every second, one text node changes; nothing else on the page is touched.
Returning a function from `onMount` registers its cleanup.

> [!NOTE]
> **Alpha.** The API can change between minor versions; see the
> [changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw/CHANGELOG.md).

## Install

```sh
pnpm add @opentf/afw
pnpm add -D @opentf/esdev-plugin-afw
```

Components compile through [`@opentf/esdev-plugin-afw`](https://www.npmjs.com/package/@opentf/esdev-plugin-afw)
on [esdev](https://esrun.opentechf.org/esdev) 0.17 or newer. To start from a
working app instead, run `esdev create my-app --template=spa`.

## What's inside

| Area | Contents |
| --- | --- |
| **Reactivity** | A signal / computed / effect core, written from scratch |
| **DOM bindings** | `bindText`, `bindAttr`, `bindList`, `bindChild`, `setProp`, `spread`, `clsx`: the targets the compiler emits |
| **Components** | `Context`, `Portal`, `ErrorBoundary`, event dispatch with `emit` |
| **Routing** | `mountApp`, the reactive `router`, `<Link>`, guards, loaders, locale prefixes |
| **Server** | DOM-free SSR/SSG rendering, API routes, middleware, cookies, a Node adapter |

## Macros and hooks

Written in your components and resolved by the compiler; nothing to import for the
`$` macros.

| Macro / hook | Purpose |
| --- | --- |
| `$state(value)` | Reactive local state; assign to it like a variable |
| `$derived(expr)` | A value recomputed when its inputs change |
| `$effect(fn)` | Run side effects when their inputs change |
| `$ref()` | A reference to a rendered element or component |
| `$context(Context)` | Read the nearest provided context value |
| `$expose({ … })` | Methods a parent can call through a ref |
| `onMount`, `onCleanup` | Lifecycle of the component's host element |
| `onResize`, `onVisibilityChange`, `onMediaQuery` | Observers that clean up with the component |

## Entry points

| Import | Contents |
| --- | --- |
| `@opentf/afw` | Runtime, reactivity and `Link`: what compiled components import |
| `@opentf/afw/signals` | The reactivity core on its own |
| `@opentf/afw/runtime` | DOM helpers, `Context`, `Portal`, `ErrorBoundary` |
| `@opentf/afw/server` | DOM-free rendering, route registration, API and middleware helpers |
| `@opentf/afw/server/adapters/node` | `toNodeListener` for `node:http` servers |
| `@opentf/afw/jsx-runtime` | JSX type definitions for TypeScript |

## TypeScript

Declarations ship with the package. Keep JSX for the AFW compiler and point
`jsxImportSource` at this package:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentf/afw",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true
  }
}
```

`esdev create my-app --language=ts` generates this configuration together with the
macro declarations.

## Documentation

| Topic | Link |
| --- | --- |
| Components and JSX | [Core concepts](https://afw.opentechf.org/docs/core-concepts/components) |
| Reactivity | [Signals, derived values and effects](https://afw.opentechf.org/docs/core-concepts/reactivity) |
| Routing | [Pages, layouts, guards and API routes](https://afw.opentechf.org/docs/routing/pages-and-layouts) |
| Deployment | [Static generation, hydration and servers](https://afw.opentechf.org/docs/deployment) |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
