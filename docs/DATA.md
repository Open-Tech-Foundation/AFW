# Data Fetching

Route loaders (server data for pages) and `resource()` (client-side async data) —
the runtime/toolchain half of the data-fetching story (SPEC §7.4, §8.7). The
compiler half (co-located `export loader`, server functions, actions via the
Server IR — ARCHITECTURE §4.4) is Phase B and builds on the contracts fixed here.

## 1. Model

Two primitives, one per side of the network:

- **Route loaders** — a server-only `loader.{js,ts}` file sibling to a `page.*`
  runs before the page renders (SSG build, SSR request, or SPA navigation) and
  its JSON result reaches the page as the reactive `router.data`.
- **`resource()`** — a client-side primitive (`@opentf/afw`) wrapping a fetcher
  in signals: `{ data, loading, error, refetch }`, with abort + staleness
  handling. For data the page can fetch *after* paint, or that changes with
  client state.

Rule of thumb: content the server should render (SEO, first paint) → loader;
per-user/interactive data → `resource()`.

## 2. Route loaders

### File convention

```
app/todos/page.jsx        → the page
app/todos/loader.js       → its loader (folder = URL, like route.{js,ts})
app/items/[id]/loader.ts  → dynamic params, same [param]/[...rest] rules
```

Strictly `js|ts` (loaders are plain server modules, never JSX). A `loader.*`
without a sibling `page.*` — including one placed next to a `route.*` endpoint —
is a build error (`detectLoaderConflicts`, afw-cli shared.js).

### Signature

```js
export default async function loader({ params, query, request, locale, locals }) {
  return db.todos.list();   // any JSON-serializable value
}
```

`query` holds one value per name; a repeated name keeps its last value. Under a
request server, `new URL(request.url).searchParams.getAll(name)` reads every value.

A named `loader` export is also accepted — the spelling Phase B's co-located
form will compile to. An app-owned server passes the live Fetch `Request`;
`request` is `undefined` at SSG prerender. `locals` is the per-request bag stamped
by `_middleware.*` (docs/MIDDLEWARE.md) — empty (`{}`) at SSG prerender, where
no middleware runs. `getStaticPaths` stays on the page module — a dynamic route
with a loader still needs it to prerender.

### Where it runs (D2: a separate server bundle)

Loaders bundle like API routes — plain server ESM, no DOM transform, npm/node
imports external (`buildLoaderBundle`/`emitLoaderBundle` → `dist/server/loaders.js`)
— NOT into the SSG server bundle, so DB drivers stay external and a loader edit
never rebuilds the SSG graph. Consequence: the loader bundle is a separate module
graph from the render bundle, so:

- the **caller** (serve/prerender) runs the loader and passes the result into
  `renderRoute(path, params, search, { data })` as a plain value;
- cross-bundle error checks are **property-based** (`e.afwNotFound === true`
  via `isNotFound`), never `instanceof`.

The registry (`createLoaderRegistry`, `@opentf/afw/server`) owns matching
(`[param]`/`[...rest]`, percent-decoding, trailing slashes, i18n locale-prefix
stripping), running (`load`/`loadSerialized`), and the HTTP endpoint (`handle`).

### The wire format (D3/D4)

- **First paint** (SSR and prerendered pages): the data is inlined as
  `<script type="application/json" id="__afw_data">…</script>` — a sibling of,
  and independent from, the `__afw_h` island-props payload. `<` is escaped to
  `<` (`serializeRouteData`) so the payload cannot close the script. The
  client router reads it once at hydration (`readInlineRouteData`).
- **SPA navigation**: the router fetches `GET <path>/__data.json` (+ the query
  string). Under `--ssg`, the *same* URL is written as a literal file next to
  each page's `index.html` (per locale), so a plain static host serves it with
  no server. `__data.json` is a **reserved filename**.
- **Endpoint contract**: 200 = the raw loader JSON (no envelope — byte-identical
  to the static file; an `undefined` result is written as `null` so a 200 always
  parses), `content-type: application/json`, `cache-control: no-store` under
  serve/dev (static hosts set their own caching). 404 = no loader or
  `notFound()`. 5xx = the loader threw. GET/HEAD only (405 otherwise). A data
  URL that matches no loader returns 404 — the suffix never falls through to
  SSR (a catch-all page would otherwise swallow it) or to static assets.

### The client (D5)

`mountApp({ loaders: ["/todos", "/items/[id]"] })` — the toolchain bakes the
loader route *patterns* into the entry; `matchRoute` returns the same pattern
string, so membership is a Set lookup. In `navigate()`:

1. after the guard and route match, **before** any state write / history push /
   DOM swap, the data resolves (inline payload on hydration, endpoint fetch
   otherwise) — fetch-then-commit, like guards;
2. a navigation-sequence token discards a superseded navigation's late data;
3. a 404 (`notFound()`, or a path a static host has no file for) shows the 404
   page at the requested URL, as a full page load does; `invalidate()` getting a
   404 does the same. A failed fetch is `reportError`ed (`phase: "data"`) and the
   navigation still commits with `undefined`.

Pages read the reactive **`router.data`** (the compiler does not emit page props
yet — same reason as `router.params`).

### Error semantics

`notFound()` (`@opentf/afw/server`) → SSR renders the registered 404 page with
HTTP 404, its inline data marked `{"__afwNotFound":true}` so first paint adopts it
as the 404 page (inside the root layout, not the route's layouts); the data
endpoint 404s, and client navigation shows the 404 page; prerender records the
path as failed. Any
other throw → 500 (page and endpoint). Redirects from loaders are **out of
scope** until actions/Phase B.

### Known limits (MVP)

- Page-level only; no layout loaders.
- Query-dependent loaders need a request server — static `__data.json` files are
  rendered with an empty query.
- No streaming; the navigation waits for the data.
- `generateMetadata` does not see loader data.

## 3. `resource()`

```js
const users = resource(() => fetch("/api/users").then((r) => r.json()));
const user  = resource(() => router.params.id,
  (id, { signal }) => fetch(`/api/users/${id}`, { signal }).then((r) => r.json()),
  { initial: null });
```

Semantics (runtime/resource.js): reactive getters `{ data, loading, error,
refetch }`; one tracked read (the source) per run; each run aborts the previous
run's `AbortController` and bumps a token so out-of-order resolutions are
discarded; a rejection sets `error` and keeps the last good `data`; a `null`/
`false` source pauses fetching; effect disposal (region teardown via `scope()`)
aborts in-flight work. On the server no effect is created and `loading` stays
`true` (`false` for a source that starts paused, evaluated untracked; a source that
throws there counts as running), so SSG renders the branch the client's first paint
renders, keeping hydration adoption aligned.

* **`refetch()`.** Re-runs with `force` (ignores `staleTime`). Resolves with the data,
  `undefined` when superseded, and rejects on failure. A no-op `catch` is attached, so
  an ignored call is not an unhandled rejection.
* **Internal reloads.** `invalidate()`, `<Pending>` retries and `ErrorBoundary` resets use
  `reload()`, which never rejects: the failure is already on `error` or sent to a boundary.
* **Run outcome.** `run()` resolves `{ ok, value }`, `{ ok: false, error }` or
  `{ superseded: true }` and never rejects.

### Query cache

`runtime/query-cache.js`, used by the browser stub (`server-function.js`) and `resource()`.

* **Keys.** `callKey(endpoint, input)` is `endpoint + "\0" + encode(input)` with plain-object
  keys sorted recursively (`__proto__` kept as an own key). `customKey(key)` is the `key`
  option, encoded the same way under a `key` prefix.
* **Entries.** `{ data, hasData, updatedAt, stale, flight, listeners, users, idleSince,
  gcTime, deps }`. `deps` holds the endpoints and call keys a custom-key fetcher called.
* **Dedupe.** `fetchShared(key, start, { signal, staleTime })` answers from a fresh entry,
  joins the flight in progress, or starts one. Each caller's signal rejects only that
  caller; the flight's own controller aborts when its last caller leaves.
* **Freshness.** `isFresh` is `hasData && !stale && age < staleTime`. `markStale()` sets
  `stale` and detaches the flight, so the next read fetches again and a detached flight
  writes nothing.
* **Stub.** Query calls go through `fetchShared`. A call made while a resource starts
  uses that resource's `staleTime` (passed through `withTracking`); others use `0`.
  Actions skip the cache.
* **Resources.** A two-argument resource with a stub fetcher, `resource(stub)` (called
  with `undefined`), or one with `key` knows its key before running. It subscribes to the
  entry (`users++`, hears writes), seeds `data` from it at once and skips the request
  while fresh. A custom key wraps the fetcher in `fetchShared`.
* **GC.** No timers: `sweep()` runs at most once a second as entries are looked up and
  drops entries with no users and no flight once `idleSince + gcTime` has passed.

### Writes (runtime/mutate.js)

* **Overlays.** An entry holds `overlays`; `viewOf(e)` applies them to `data`. Listeners,
  cache hits and a flight's result all see the view. `addOverlay` returns its removal.
* **`setQueryData(fn, input, value)`.** Writes the entry (`value(current)` for a function),
  records its `call`, then `cacheChanged(key)`.
* **`optimistic(promise, fn, [input], update)`.** Adds `update` as an overlay to every
  matching entry with data, and removes it in `promise.finally`.
* **`cacheChanged(key)`.** Resources registered under the key call `fromCache`: they
  re-run the fetcher with `inner` staleTime `Infinity`, so its stub calls answer from the
  cache, without a loading state. A resource that follows the key heard the write already.

### Single-flight refresh

* **Request.** An action stub sends `liveCalls(MAX_REFRESH)` (the `call` of every key in the
  registry) as `{ input, live }` with `x-afw-live: 1`. Nothing shown: the plain input.
* **Server.** `context.refresh(...targets)` records queries (a value after one is its
  input). After the action, `runRefresh` re-runs each in scope for its inputs (given, or the
  live ones for that endpoint), at most `MAX_REFRESH`, through the query's schema.
* **Scope.** A query runs only when its folder is the action's or a parent (`inScope`); its
  middleware already ran. Otherwise it goes back in `stale`.
* **Response.** `x-afw-refresh: 1` and `{ result, refresh: { fresh, stale, endpoints } }`.
  `endpoints` lists queries refreshed without an input.
* **Client.** `applyRefresh` calls `settleRefresh` (marks `endpoints`' other entries and the
  `stale` targets stale, refetches live resources the response did not cover), then writes
  each fresh call and `cacheChanged`s it. The action resolves after those refetches.
* **Direct calls.** `define` gives handlers a no-op `refresh` when the context has none.

### Resilience

* **Retry.** `request()` in the stub retries a query whose `fetch` rejects (not an abort)
  after `retryDelays` (300 ms, 1 s). HTTP errors and actions are not retried; an abort
  during the wait rejects at once.
* **Timeout.** `timeout` combines the run's controller with `AbortSignal.timeout()` through
  `AbortSignal.any()`.
* **Revalidation.** `runtime/revalidate.js` installs one `visibilitychange` and one `online`
  listener on first use. A watching resource reloads when `now - loadedAt >= staleTime`.

### Clearing

* **`clearQueryCache(...targets)`** (invalidate.js): `dropEntries` deletes matching entries
  (all, or by `invalidate()`'s targets), detaches their flights and drops their overlays.
* **Live resources** that follow a dropped key, that registered a matching call, or (with
  no arguments) that registered any call key are `reset()`: off the entry, data back to
  `initial`, `settled` false, and re-run with `force`. Plain-fetch resources are untouched.
* **Why not `invalidate()`:** stale entries keep their data so a remount shows it while it
  revalidates, which is wrong once the data belongs to someone else (logout).

### Invalidation

* **Tracking.** `withTracking` records the endpoints and call keys a fetcher calls while
  it starts. `registerResource(entry, endpoints, keys, named)` indexes the resource by
  each, plus `named` (`invalidatedBy`) endpoints.
* **Targets.** `invalidate(fn)` targets an endpoint; `invalidate(fn, input)` one call key.
  `invalidatedBy` resources match any input of their named endpoint.
* **Cache.** Matching entries are marked stale: by key, by endpoint, or through a
  custom entry's `deps`. `invalidate()` marks every entry stale.

### `<Pending>` boundaries

`runtime/pending.js` (element) and `runtime/pending-scope.js` (registration).

* **Registration.** A resource registers with a boundary in two ways:
  * At creation in a component body: the nearest `afw-internal-pending` ancestor of the host (`closestPending`, hopping portals).
  * On a read while a boundary's children are built: the compiler brackets that build, and hydration's adoption of it, with `enterPending(el)` / `exitPending()`.
* **State.** A handle exposes `loading()` and `settled()` (has a run finished once).
  * The boundary shows `fallback` while any tracked resource is loading and never settled.
  * Otherwise it shows `refreshing` plus the content while any is loading (or the fallback with `refetch="fallback"`), and the content when none is.
* **Display.** A shadow root holds a `<slot name="fallback">`, `<slot name="refreshing">` and a default `<slot>`, swapped per state. The fallback and refreshing views sit in the light DOM in `span[slot]` wrappers (`display: contents`).
* **Errors.** A first-load failure calls `handleError(boundary, error, { retry })`; `ErrorBoundary.reset()` runs the retries after reinserting its subtree. A failed refetch is `reportError(…, { phase: "resource" })`. `errors: "inline"` opts out.
* **Server.** The SSG renderer emits `<template shadowrootmode="open">` showing the fallback slot. A server-rendered boundary changes nothing until `exitPending` reports its children adopted.
* **Lifetime.** A component's resource pushes its effect disposers onto the host's `_cleanups`, so it stops (and unregisters) when the component is torn down.

### Layout loaders

* **Files.** `layout.loader.{js,ts}` beside a `layout.*`, keyed by the layout's folder (`loaderRouteFromPath`). `serverConflicts` / `detectLoaderConflicts` reject one without a sibling layout.
* **Matching.** `createLoaderRegistry(modules, { pageRoutes })` matches every page route that has its own loader or sits beneath a layout loader (`loaderPageRoutes`; afw-build keeps a copy for the client's `loaderRoutes`). A match carries `layouts` (outermost first) and the page's `fn` (or null).
* **Running.** `load` runs the chain in parallel and merges with `Object.assign({}, ...layouts, page)`; a lone result passes through unchanged, a chain must return objects.
* **Failures.** A layout loader's error is tagged `afwLayoutRoute` (its folder). The data endpoint's 500 body carries `layout`; `fetchRouteData` and `routeErrorFrom` copy it back onto the client error.
* **Both toolchains.** `serverModule` (afw-build) passes `pageRoutes` for Vite, esdev request servers and the Vite prerender; `emitLoaderBundle` (afw-cli) does the same for the esdev SSG driver.

### Layout errors

* **Site.** `routeErrorSite(route, brokenLayout)`: a page's errors use `nearestRouteFile(errors, route)`; a broken layout's use the nearest `error.jsx` above the layout's folder (none for the root). The view renders inside the layouts strictly above the broken one.
* **Client.** `buildRouteNode` preloads the error views a build could need and catches a throwing layout; layout nodes carry `__afwLayoutRoute`, so `showRouteError` can place an unhandled error raised inside a layout. `hydrateRouteNode` adopts a server error page at the same site.
* **Server.** `renderRoute(..., { error })` with `afwLayoutRoute` renders the error view inside the layouts above, and the `__afwRouteError` marker carries `layout`.

### Route `loading.jsx` / `error.jsx`

* **Registration.** `registerRoutes` files them in `routes.loading` / `routes.errors` by folder; `nearestRouteFile` walks from the route's folder to the root.
* **Navigation.** `scheduleRouteLoading` renders the loading view inside the layouts if the navigation still waits after `LOADING_DELAY`; the commit replaces it.
* **Page build.** `buildRouteNode` builds the page inside a route `<Pending>` (fallback: the loading view, delay 0 if the navigation already showed it). A failed loader (`dataError`) or a throwing page builds the error view instead.
* **Unhandled errors.** `handleError` with no `<ErrorBoundary>` calls the router's handler (`route-errors.js`); `showRouteError` swaps the page region (`currentRegion`) for the error view when the error's element is inside it.
* **Server.** `renderDocument({ errors: "render" })` passes a loader failure to `renderRoute(..., { error })`, which renders the nearest `error.jsx` with the error's status and returns the `__afwRouteError` marker as `dataJson`. The client's hydrate path reads it and adopts the error view.

## 4. Toolchain

- The project build can call `emitLoaderBundle` from `@opentf/afw-cli/ssg` before
  prerendering. `runPrerender` runs matched loaders with an empty query and no
  request, injects their data into the HTML, and writes per-locale `__data.json`.
- An app-owned request server imports the loader bundle, runs loaders before
  `renderRoute`, and serves the data endpoint alongside API routes and pages.
- `esdev start` rebuilds and restarts configured server targets. The compiler
  plugin does not supply a loader HTTP endpoint, proxy or request server.

## 5. Phase B forward-compatibility

The compiler will later parse a co-located `export async function loader()` in
`page.jsx`, strip it from CSR/SSG/hydrate outputs (Server IR,
`crates/afw_ir/src/server.rs`), and emit a synthetic server module registered
into the **same** `loaderEntrySource` map. Everything downstream is discovery-
agnostic and stays stable: the wire format (`<path>/__data.json`, `#__afw_data`),
the runtime API (`router.data`, `registerLoaderRoutes`, `createLoaderRegistry`),
and the bundling path. Sibling `loader.{js,ts}` files remain supported. Actions
get their own endpoint namespace — `__data.json` stays GET/HEAD-only.
