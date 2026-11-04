# Server functions — plan

Status: **proposed** (November 2026). Closes the "client/server boundary" open question
(ARCHITECTURE §7) for the first version, and fills the `Query` / `Action` placeholders of
the Server IR (ARCHITECTURE §4.4, `crates/afw_ir/src/server.rs`).

## 1. Goal

- Call server code from components as a typed async function: no hand-written API route,
  no `fetch`, no URL.
- Same contracts as the rest of the server: a Fetch handler, folder-scoped middleware,
  `context.locals`, `notFound()`, thrown `Response`s.
- Works in both workflows (esdev + ES-Runtime, Vite + Node) from one core in
  `@opentf/afw-build` and `@opentf/afw/server`.
- Secure by default: nothing is callable unless declared, cross-site calls are refused,
  input is validated before the function runs.

## 2. What it looks like

```js
// app/todos/todos.server.js — runs only on the server
import { action, query } from "@opentf/afw/server";
import * as v from "valibot"; // any Standard Schema library: zod, valibot, arktype…

export const listTodos = query(async ({ done }, { locals }) => {
  return db.todos.list({ owner: locals.user.id, done });
});

export const addTodo = action(v.object({ title: v.string() }), async ({ title }, { locals }) => {
  return db.todos.insert({ owner: locals.user.id, title });
});

const db = connect(process.env.DATABASE_URL); // not exported: never reachable from the client
```

```jsx
// app/todos/page.jsx — runs in the browser
import { resource } from "@opentf/afw";
import { addTodo, listTodos } from "./todos.server.js";

export default function Todos() {
  let title = $state("");
  const todos = resource(() => listTodos({ done: false }));
  async function save() {
    await addTodo({ title });
    title = "";
    todos.refetch();
  }
  return (
    <section>
      <ul>{(todos.data ?? []).map((t) => <li>{t.title}</li>)}</ul>
      <input value={title} oninput={(e) => (title = e.target.value)} />
      <button onclick={save}>Add</button>
    </section>
  );
}
```

## 3. Decisions

### 3.1 Authoring: `*.server.{js,ts}` files with `query()` / `action()` — recommended

| Option | Used by | For AFW |
| --- | --- | --- |
| **File convention + wrappers** (`todos.server.js`, `query()`, `action()`) | SvelteKit remote functions (`.remote.ts`) | ✅ Matches AFW's file conventions (`route.js`, `loader.js`, `_middleware.js`); the boundary is visible in the file name; no directive parsing; same in both toolchains |
| `"use server"` directive in any module | Next.js, SolidStart, React Router (RSC mode) | ❌ The boundary hides inside ordinary code; needs full-program analysis to split closures safely |
| Builder in any module (`createServerFn()`) | TanStack Start | 🟡 Explicit, but the client build must strip server code from arbitrary modules |

- Only exports wrapped in `query()` or `action()` become endpoints. Other exports of a
  `.server` module are server-only helpers: importing one from client code is a build
  error, never a silent RPC.
- `query` — reads. Idempotent, may be called with `GET`, safe to retry and to cache.
- `action` — writes. `POST` only, never retried automatically.
- A `.server` module may sit anywhere under `app/`; it is not a route.

### 3.2 Wire protocol

- Endpoint: `<folder>/__fn/<id>`, where `<folder>` is the module's folder under `app/`
  (`app/admin/users.server.js` → `/admin/__fn/<id>`).
  - Folder-scoped `_middleware` applies exactly as for pages and `__data.json`: a guard on
    `app/admin` also guards every function in `app/admin`. This is the main security
    property, and it falls out of the existing middleware runner.
- `<id>`: a stable hash of the module's path relative to `app/` and the export name. It
  does not reveal file paths and stays the same across builds of unchanged code.
- `query`: `GET` with the encoded arguments in `?a=`, or `POST` when they are too large.
  `action`: `POST`.
- Body and result encoding: JSON extended with `Date`, `Map`, `Set`, `BigInt`, `URL`,
  `undefined` and `RegExp` (a small tagged encoding, `<`-escaped as `serializeRouteData`
  does). **Open decision** — see §8.
- Responses: `200` with the encoded result; `400` with validation issues; `404` for
  `notFound()`; a thrown `Response` (redirect, custom status) passes through; any other
  error is `500` with a generic message and the error logged server-side.

### 3.3 Context

Functions receive `(input, context)`, the same context API routes get:

- `request`, `url`, `locals` (from middleware), `env` and `ctx` (Workers bindings), and the
  cookie helpers.
- No `params` or `query`: a function is called with its own arguments, not a page URL.

### 3.4 Validation

- `query(schema, fn)` and `action(schema, fn)` take any
  [Standard Schema](https://standardschema.dev) validator (zod, valibot, arktype…), so AFW
  depends on no validation library.
- Input is validated on the server before `fn` runs; failures answer `400` with the
  schema's issues, and the client stub rejects with a `ValidationError`.
- Without a schema, the function receives the decoded arguments as they are.

### 3.5 Security

- Only wrapped exports are reachable (§3.1).
- Cross-site calls are refused: `POST` requires a same-origin `Origin` (or `Sec-Fetch-Site:
  same-origin`) and a non-form content type; `GET` queries must not have side effects,
  which the `query`/`action` split states.
- Responses are `Cache-Control: no-store` unless a query opts into caching.
- Errors never leak server details to the client in production.

### 3.6 Calling from the server

- In server builds, the `.server` module is the real module: SSR, loaders, API routes and
  other server functions call it directly, with no HTTP round trip.
- The context comes from the current request (async-local, as `renderRoute` already
  isolates requests); calling outside a request (prerender) gets a context without a
  `request`, like loaders today.

### 3.7 Client integration

- A stub is an async function with the same signature and types (TypeScript sees the real
  module, since the import path is unchanged).
- Works with `resource()` as-is: `resource(() => listTodos(args))` refetches when `args`
  change and aborts superseded calls.
- `afw-form`: `handleSubmit(addTodo)` works with no adapter.
- Later (§7): `invalidate(listTodos)` to refetch every live use, and single-flight
  mutations that return fresh query data with the action's response.

## 4. Toolchain work

| Piece | Where | Work |
| --- | --- | --- |
| `query`, `action`, `createServerFunctions(modules)` registry, encoding | `@opentf/afw/server` | Registry with `handle(request, { locals })` like `createLoaderRegistry`; runs validation; maps errors |
| Client stub runtime (`callServerFunction`) | `@opentf/afw` runtime | `fetch` with abort signal, encoding, error types |
| Discovery of `*.server.{js,ts}`, ids, stub module source | `@opentf/afw-build` | Neutral, against the host; export names from the compiler (below) |
| Export listing | `afwc` (oxc) | A `serve` request returning a module's export names and which are `query`/`action` calls; rejects dynamic shapes (`export *` from a `.server` module) |
| `@afw/server` handler | `@opentf/afw-build` `serverModule` | Registers function modules; `createHandler` answers `__fn` inside the middleware, before loader data |
| Vite | `@opentf/vite-plugin-afw` | Client environment: load `.server` modules as stubs. Server environment: real modules. Dev server answers `__fn` through the existing middleware path |
| esdev | `@opentf/esdev-plugin-afw` | Same client stubbing in the `load` hook; the server entry gets the registry from a virtual module, as with `@afw/routes` |
| Static generation | both | A prerendered site without a server cannot answer calls: building `mode: "ssg"` with no server target and a client import of a `.server` module is an error naming the import |

## 5. Testing

- Core (`afw-build`, in-memory host): discovery, ids, stub source, build errors for
  non-wrapped imports.
- Server (`@opentf/afw/server`): encoding round trips, validation with zod and valibot,
  error mapping, `Origin` checks, middleware scoping (`app/admin` guard blocks
  `/admin/__fn/*`).
- Both toolchains: a fixture app calling a query and an action in dev and in a production
  build (Vite: `dist/server`; esdev: the server entry); SSR calling the function directly.
- Browser (headless Chrome): a page uses `resource()` and an action; the action's result
  shows without a reload; a cross-site request is refused.
- Types: a strict TypeScript project type-checks calls against the real signatures.

## 6. Phases

| Phase | Scope |
| --- | --- |
| **1** | `query`/`action` in `.server` files; protocol, encoding, validation, security, middleware scoping; both toolchains in dev and production; SSR direct calls; docs |
| **2** | Forms: `<form action={addTodo}>` that works without JavaScript under SSR (POST → redirect back), with `afw-form` integration; redirects from actions |
| **3** | `invalidate(query)` and single-flight updates (an action returns the queries it changed); optional query caching headers |
| **4** | Compiler co-location: server functions declared inside a page or component, split by the Server IR (ARCHITECTURE §4.4); revisit `"use server"` only if demand appears |

## 7. Not in this plan

- Streaming results (depends on streamed SSR).
- Server functions on a prerendered-only site (no server to call).
- Automatic optimistic updates.

## 8. Open decisions

1. **Authoring model** — `*.server.{js,ts}` files with `query()`/`action()` (recommended),
   or a `"use server"` directive, or a TanStack-style builder.
2. **Encoding** — extended JSON with tagged types (recommended: small, readable in the
   network panel), or a library such as `devalue` (cyclic references, more types).
3. **Endpoint scoping** — per-folder `<folder>/__fn/<id>` so folder middleware guards it
   (recommended), or one flat `/__afw/fn/<id>` guarded only by root middleware.
4. **Where `.server` modules may live** — anywhere under `app/` (recommended), or also in
   shared folders outside it (then they need a scope for middleware).
