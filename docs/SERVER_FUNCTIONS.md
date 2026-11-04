# Server functions

Status: **phase 1 implemented** (November 2026) in both toolchains; phases 2–4 (§6) are
planned. §9 lists what each decision settled. User guide: the website's
[Server Functions](../website/app/docs/server-functions/page.mdx) page.

- Closes the "client/server boundary" open question (ARCHITECTURE §7) for file-convention
  server functions.
- Phase 4 fills the `Query` / `Action` placeholders of the Server IR (ARCHITECTURE §4.4,
  `crates/afw_ir/src/server.rs`); phases 1–3 do not need them.

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
import { addTodo, listTodos } from "./todos.server.js"; // fetch stubs in the browser

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

### 3.1 Authoring: `*.server.{js,ts}` files with `query()` / `action()`

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
- Body and result encoding: [`@opentf/serialize`](https://github.com/Open-Tech-Foundation/js-serialize)
  `stringify` / `parse`, behind one module (`packages/afw/core/fn-codec.js`).
  - The `{"v": …, "$refs"?: …}` envelope: plain data stays readable JSON; special types
    become `@n` tokens with their type in `$refs`.
  - Round-trips `Date`, `Map`, `Set`, `BigInt`, `URL`, `RegExp`, `Error`, typed arrays,
    `undefined`, `NaN`/`±Infinity`/`-0`, `Temporal` and cyclic references. Functions,
    symbols and class instances throw: a result like that is a `500`.
  - Untrusted input is decoded with `maxLength` (the body limit, default 1 MiB → `413`)
    and `maxDepth` (default 64 → `400`). A malformed body, or one without the envelope,
    is `400`. A `__proto__` key stays an own property.
- Responses: `200` with the encoded result; `400` with validation issues; `404` for
  `notFound()`; a thrown `Response` (redirect, custom status) passes through; any other
  error is `500` with a generic message and the error logged server-side.

### 3.3 Context

Functions receive `(input, context)`:

- `request`, `url`, `locals` (from middleware), `env` and `ctx` (Workers bindings).
  Cookies are read with the module's cookie helpers on `context.request`.
- No `params` or `query`: a function is called with its own arguments, not a page URL.

### 3.4 Validation

- `query(schema, fn)` and `action(schema, fn)` take any
  [Standard Schema](https://standardschema.dev) validator (zod, valibot, arktype…), so AFW
  depends on no validation library.
- Input is validated on the server before `fn` runs; failures answer `400` with the
  schema's issues, and the client stub rejects with a `ServerFunctionError` whose
  `issues` holds them. A direct server call throws a `ValidationError`.
- Without a schema, the function receives the decoded arguments as they are.

### 3.5 Security

- Only wrapped exports are reachable (§3.1).
- Cross-site calls are refused: `POST` requires a same-origin `Origin` (or `Sec-Fetch-Site:
  same-origin`) and a non-form content type; `GET` queries must not have side effects,
  which the `query`/`action` split states.
- Responses are `Cache-Control: no-store` (opt-in query caching is phase 3).
- Errors never leak server details to the client in production.

### 3.6 Authentication and authorization

- Middleware authenticates and gates sections: it sets `locals.user`, and a guard on
  `app/admin` refuses every function under `/admin/__fn/*`.
- Each function authorizes its own data access from `locals` (which rows this user may
  read or change). Middleware cannot know that.
- No per-function guard API: the folder middleware plus the function's own check cover
  it, the same split as pages and API routes.

### 3.7 Calling from the server

- In server builds, the `.server` module is the real module: SSR, loaders, API routes and
  other server functions call it directly, with no HTTP round trip.
- The caller passes the context: `listTodos(input, { locals })`. Input is still
  validated.
- No middleware runs for a direct call: the caller is already server code inside a
  request that middleware handled. Running every folder's middleware per call would be
  costly and is not done.

### 3.8 Client integration

- A stub is an async function with the same signature and types (TypeScript sees the real
  module, since the import path is unchanged). It takes `{ signal }` to abort.
- Failures reject with a `ServerFunctionError` (`status`, `issues`); a redirect from the
  server is reported (`redirected: true`) rather than followed.
- Works with `resource()` as-is: `resource(() => listTodos(args))` refetches when `args`
  change and aborts superseded calls.
- `afw-form`: `handleSubmit(addTodo)` works with no adapter.
- `invalidate(listTodos)` refetches every live resource that called it; `invalidate()`
  refetches every resource and the page's loader data (phase 3).
- Later (§6): single-flight mutations that return fresh query data with the action's
  response.

## 4. Toolchain work

| Piece | Where | Work |
| --- | --- | --- |
| `query`, `action`, `createServerFunctions(endpoints)` registry, encoding | `@opentf/afw/server` | Registry with `handle(request, { locals, env, ctx })` like `createLoaderRegistry`; runs validation; maps errors |
| Client stub runtime (`serverFunction(endpoint, kind)`) | `@opentf/afw` runtime | `fetch` with abort signal, encoding, `ServerFunctionError` |
| Discovery of `*.server.{js,ts}`, ids, stub module source | `@opentf/afw-build` | Neutral, against the host; export names from the compiler (below) |
| Export listing | `afwc` (oxc) | A `serve` request returning a module's export names and which are `query`/`action` calls; rejects dynamic shapes (`export *` from a `.server` module) |
| `@afw/server` handler | `@opentf/afw-build` `serverModule` | Registers function modules; `createHandler` answers `__fn` inside the middleware, before loader data |
| Vite | `@opentf/vite-plugin-afw` | Client environment: load `.server` modules as stubs. Server environment: real modules. Dev server answers `__fn` through the existing middleware path |
| esdev | `@opentf/esdev-plugin-afw` | Same client stubbing in the `load` hook (`ctx.platform === "browser"`); server targets import `createHandler` from the virtual `@afw/server`, as with `@afw/routes` |
| No server | Vite | A build with `server: false` that imports a `.server` module is an error naming the file |

## 5. Testing

What phase 1 runs:

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
| **1** ✅ | `query`/`action` in `.server` files; protocol, encoding, validation, security, middleware scoping; both toolchains in dev and production; direct server calls; docs |
| **2** | Forms: `<form action={addTodo}>` that works without JavaScript under SSR (POST → redirect back), with `afw-form` integration; redirects from actions |
| **3** | 🟡 `invalidate(query)` ✅; single-flight updates (an action returns the queries it changed) and optional query caching headers remain |
| **4** | Compiler co-location: server functions declared inside a page or component, split by the Server IR (ARCHITECTURE §4.4); revisit `"use server"` only if demand appears |

## 7. Phase 1 coverage

- Both toolchains generate the same `@afw/server`; with `mode: "ssr"` it also renders
  pages (`createPageRenderer`), on esdev as on Vite.
- Browser e2e in both: `packages/vite-plugin-afw/e2e/dev.mjs` (Vite dev server) and
  `scripts/verify-server-functions.mjs` (`esdev start` with a server target, then a
  production `esdev build`).

## 8. Not in this plan

- Streaming results (depends on streamed SSR).
- Server functions on a prerendered-only site (no server to call).
- Automatic optimistic updates.

## 9. Decisions (settled November 2026)

1. **Authoring** — `*.server.{js,ts}` modules exporting `query()` / `action()`.
2. **Encoding** — `@opentf/serialize` (split out of `@opentf/obj-diff`, with `__proto__`
   kept as an own key and opt-in input limits).
3. **Endpoints** — per folder, `<folder>/__fn/<id>`, under that folder's middleware.
4. **Location** — `.server` modules anywhere under `app/`; they may import shared code
   from outside it.
5. **Auth** — middleware authenticates and gates sections; each function authorizes its
   data; direct server calls run no extra middleware.

## 10. Prior art: the query side

| Framework | Declare | Call | Refetch |
| --- | --- | --- | --- |
| SvelteKit (remote functions, experimental) | `query(schema, fn)` in `*.remote.ts` | `await getPosts()` in markup | `getPosts().refresh()` |
| TanStack Start | `createServerFn({ method: "GET" }).validator(v).handler(fn)` | `getTodos({ data })`, usually in a route loader | router invalidation, TanStack Query keys |
| SolidStart | `query(async () => { "use server"; … }, "key")` | `createAsync(() => getTodos())` | `revalidate("key")` |
| Astro | `defineAction({ input, handler })` in `src/actions/` | `await actions.getTodos(input)` → `{ data, error }` | call again |
| Next.js | reads in Server Components; Server Actions are POST-only mutations | — | `revalidatePath`, `updateTag` |
| React Router | route `loader` | `useLoaderData()`, `useFetcher().load()` | revalidation after actions |
| Nuxt | `server/api/*.get.ts` | `useFetch("/api/…")` | `refresh()` |

What AFW takes from it:

- Schema-first signatures, as SvelteKit and Astro have (`query(schema, fn)`).
- A read/write split everywhere (query/command, GET/POST, query/action).
- Direct calls during server rendering, no HTTP round trip.
- Refetch across every live use (SvelteKit `.refresh()`, SolidStart keys): AFW's
  `resource()` covers one call site today; `invalidate(listTodos)` is phase 3.
