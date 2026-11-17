// `resource()` — the client-side async-data primitive (SPEC §7.4, docs/DATA.md).
// Components are strictly synchronous (SPEC §5.5), so async data lives *next to*
// the view: a resource wraps a fetcher in signals and the view renders its
// reactive `loading` / `error` / `data` states:
//
//   const users = resource(() => fetch("/api/users").then((r) => r.json()));
//   // in JSX: {users.loading ? <Spinner /> : users.data.map(...)}
//
// With a reactive source, the fetch re-runs whenever the source changes, and a
// `null`/`false` source pauses it (conditional fetching):
//
//   const user = resource(() => router.params.id, (id, { signal }) =>
//     fetch(`/api/users/${id}`, { signal }).then((r) => r.json()));
//
// Staleness: each run bumps a token and aborts the previous run's AbortController
// (passed to the fetcher as `{ signal }`), so an out-of-order resolution can never
// overwrite newer data — even for fetchers that ignore the signal.
//
// Caching: a server function fetcher (`resource(() => ({ id }), getTodo)`) or a `key`
// option puts the result in the query cache (query-cache.js). Every user of the key
// shares one request and shows the same data; a remount shows the cached data at once
// and revalidates it (or skips the request while it is younger than `staleTime`).
//
// Server (SSG/SSR): no effect is created and nothing is fetched — `loading` stays
// `true` (or `false` for a source that starts paused), so the prerendered HTML shows
// the branch the client's first paint renders, keeping hydration adoption aligned.

import { getCurrentInstance } from "../core/context.js";
import { reportError } from "../core/errors.js";
import { batch, effect, signal, untracked } from "../core/signals.js";
import { endpointOf, registerResource, unregisterResource, withTracking } from "./invalidate.js";
import { buildingPending, closestPending } from "./pending-scope.js";
import { DEFAULT_GC_TIME, callKey, customKey, fetchShared, isFresh, peek, subscribe, viewOf } from "./query-cache.js";
import { revalidateEvents, watch } from "./revalidate.js";

// Test override: the DOM suites run in esdev's `--dom` realm (a `document`
// always exists), so server behavior is opted into explicitly.
let serverOverride = null;

/** Force server (true) / client (false) behavior for new resources — tests only. */
export function __setResourceServer(v) {
  serverOverride = v;
}

const isServer = () => serverOverride ?? typeof document === "undefined";

const paused = (value) => value == null || value === false;

/**
 * Create a resource. Two call shapes:
 *
 *   resource(fetcher, options?)          — fetch once (and on refetch())
 *   resource(source, fetcher, options?)  — re-fetch when the reactive `source`
 *                                          changes; `null`/`false` pauses
 *
 * A server function as the fetcher (`resource(() => ({ id }), getTodo)`, or
 * `resource(listTodos)` for one without input) is cached by its endpoint and input; a
 * `key` option caches any other fetcher. A cached resource shows the entry's data at
 * once, shares requests with every other user of the key, and follows their updates.
 *
 * @param {Function} source  reactive source read inside the tracking effect; its
 *        value is passed to the fetcher.
 * @param {Function} fetcher  `(sourceValue, { signal }) => data | Promise<data>`.
 * @param {{ initial?: unknown, invalidatedBy?: Function[], errors?: "inline",
 *           key?: unknown, staleTime?: number, gcTime?: number, timeout?: number,
 *           revalidateOn?: "focus" | "online" | Array<"focus" | "online"> }} [options]
 *        `initial` seeds `data` before the first resolution. `invalidatedBy` names
 *        server functions whose `invalidate()` refetches this resource, beyond those
 *        its fetcher calls as it starts (which are recorded automatically).
 *        `errors: "inline"` keeps failures on `error` only, even under `<Pending>`.
 *        `key` (a value, or a function of the source value) caches the fetcher's result.
 *        `staleTime` (ms, default 0): how long cached data answers without a request.
 *        `gcTime` (ms, default 5 minutes): how long an unused cache entry is kept.
 *        `timeout` (ms): abort a run that takes longer, with a TimeoutError.
 *        `revalidateOn` ("focus" | "online" | both): refetch when the tab becomes
 *        visible again or the browser reconnects, once the data is older than staleTime.
 * @returns {{ data: unknown, loading: boolean, error: unknown,
 *             refetch: () => Promise<unknown> | undefined }}  reactive getters —
 *        read them inside bindings/effects to subscribe. `refetch()` resolves with the
 *        new data and rejects when the fetch fails.
 */
export function resource(source, fetcher, options = {}) {
  if (typeof fetcher !== "function") {
    options = fetcher ?? {};
    fetcher = source;
    source = null;
  }
  const src = typeof source === "function" ? source : () => true;
  const data = signal(options.initial);
  const error = signal(undefined);
  // A fetch is intended. The server settles it as the browser's first paint will: still
  // loading, unless the source starts paused (hydration adopts the same branch).
  const loading = signal(isServer() ? !startsPaused(src) : true);
  // Has a run succeeded at least once? A `<Pending>` shows its fallback while a
  // resource it waits on is loading and has never loaded, so retrying a failed first
  // load shows the fallback again.
  const settled = signal(false);
  let token = 0;
  let controller = null;
  // This resource in the `invalidate()` registry (runtime/invalidate.js). `fromCache`:
  // a call its fetcher made changed in the cache (`setQueryData`, an optimistic overlay,
  // an action's refresh), so it re-runs against the cache. A resource that shows the
  // entry itself heard the write already.
  const entry = {
    refetch: () => reload(),
    fromCache: (key) => {
      if (key === followed || disposed) return;
      const value = untracked(src);
      if (!paused(value)) run(value, { fromCache: true });
    },
  };
  const named = (options.invalidatedBy ?? []).map(endpointOf).filter(Boolean);

  // --- The query cache (query-cache.js) ---------------------------------------
  const staleTime = Math.max(0, Number(options.staleTime) || 0);
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 0;
  let loadedAt = 0; // when the shown data was fetched, for `revalidateOn`
  const gcTime = options.gcTime ?? DEFAULT_GC_TIME;
  const stub = typeof fetcher.endpoint === "string" ? fetcher.endpoint : null;
  const custom = "key" in options;
  // `resource(listTodos)`: a server function without a source takes no input.
  const input = (value) => (stub && !source ? undefined : value);
  const keyOf = (value) => {
    if (custom) return customKey(typeof options.key === "function" ? options.key(value) : options.key);
    return stub ? callKey(stub, input(value)) : null;
  };
  let followed = null; // the key this resource shows
  let unfollow = null;
  function follow(key) {
    if (key === followed) return;
    unfollow?.();
    followed = key;
    unfollow = key ? subscribe(key, onWrite, { gcTime }) : null;
  }
  // Another user of the key stored new data.
  function onWrite(value) {
    batch(() => {
      data.value = value;
      error.value = undefined;
      settled.value = true;
    });
  }
  // A cached resource's dependencies for `invalidate()`: its own call, or what the
  // fetcher behind its custom key called.
  function register(key, endpoints = new Set(), keys = new Set()) {
    if (key && stub && !custom) {
      endpoints.add(stub);
      keys.add(key);
    }
    const deps = key && custom ? peek(key)?.deps : null;
    if (deps) {
      for (const endpoint of deps.endpoints) endpoints.add(endpoint);
      for (const k of deps.keys) keys.add(k);
    }
    registerResource(entry, endpoints, keys, named);
  }

  // One run of the fetcher. Resolves with its outcome, never rejects:
  // `{ ok: true, value }`, `{ ok: false, error }`, or `{ superseded: true }`.
  function run(value, { force = false, fromCache = false } = {}) {
    controller?.abort();
    // Captured per-run: by the time a superseded run's promise settles, the
    // module-level `controller` already belongs to a newer run.
    const c = (controller = typeof AbortController !== "undefined" ? new AbortController() : null);
    // `timeout` ms: the run aborts with a TimeoutError (the resource's error).
    const runSignal = timeout && c ? AbortSignal.any([c.signal, AbortSignal.timeout(timeout)]) : c?.signal;
    const t = ++token;
    // `refetch()` and `invalidate()` always ask the server. A re-run from the cache runs
    // the fetcher again, its server function calls answering from cached data.
    const age = force || fromCache ? 0 : staleTime;
    const inner = fromCache ? Infinity : age;
    let key = null;
    let keyError = null;
    try {
      key = keyOf(value);
    } catch (e) {
      keyError = e; // a key or input the codec refuses
    }
    follow(key);
    const cached = key ? peek(key) : undefined;
    if (cached?.hasData) {
      // Show the cached data at once; a stale entry revalidates behind it.
      const shown = viewOf(cached);
      batch(() => {
        data.value = shown;
        error.value = undefined;
        settled.value = true;
        if (isFresh(cached, age)) loading.value = false;
      });
      if (isFresh(cached, age)) {
        loadedAt = cached.updatedAt;
        register(key);
        return Promise.resolve({ ok: true, value: shown });
      }
    }
    // A re-run from the cache settles within microtasks: no loading state to show.
    if (!fromCache) {
      batch(() => {
        loading.value = true;
        error.value = undefined;
      });
    }
    // The async IIFE starts the fetcher *synchronously* (no wasted microtask)
    // while converting a synchronous throw into a rejection.
    const start = (s) => (async () => fetcher(input(value), { signal: s }))();
    // Started under tracking: the server functions the fetcher calls register it.
    let tracked = null;
    const { result, endpoints, keys } = withTracking(() => {
      if (keyError) return Promise.reject(keyError);
      if (!custom) return start(runSignal);
      return fetchShared(key, start, { signal: runSignal, staleTime: age, deps: () => tracked });
    }, { staleTime: inner });
    tracked = { endpoints, keys };
    register(key, endpoints, keys);
    return result.then(
      (v) => {
        if (t !== token) return { superseded: true };
        loadedAt = Date.now();
        batch(() => {
          data.value = v;
          error.value = undefined;
          loading.value = false;
          settled.value = true;
        });
        // A custom key joined a request someone else started: register what it called.
        if (custom && endpoints.size === 0) register(key, endpoints, keys);
        return { ok: true, value: v };
      },
      (e) => {
        if (t !== token) return { superseded: true };
        // Keep the last good `data` (stale-while-error); only `error` flips.
        const first = !settled.value;
        batch(() => {
          error.value = e;
          loading.value = false;
        });
        failed(e, first);
        return { ok: false, error: e };
      },
    );
  }

  // --- `<Pending>` boundaries (pending.js) ------------------------------------
  const inline = options.errors === "inline";
  const boundaries = new Set();
  let disposed = false;
  // What a boundary sees of this resource.
  const handle = {
    loading: () => loading.value,
    settled: () => settled.value,
    refetch: () => (disposed ? undefined : reload()),
  };
  function track(boundary) {
    if (!boundary || boundaries.has(boundary)) return;
    boundaries.add(boundary);
    boundary.__track(handle);
  }
  // A first-load failure under a boundary goes to the nearest <ErrorBoundary> (through
  // the boundary, so its retry refetches). A failed refetch keeps the stale data and is
  // reported. `errors: "inline"` and resources outside any boundary only set `error`.
  function failed(e, first) {
    if (inline || boundaries.size === 0) return;
    if (first) for (const boundary of boundaries) boundary.__fail(e, handle);
    else reportError(e, { phase: "resource" });
  }

  if (!isServer()) {
    // In a component, the boundary around its host. A page or module resource
    // registers where it is read instead (`reading`), so a page resource read only
    // inside a section's <Pending> holds that section, not the page.
    const host = getCurrentInstance();
    if (host) track(closestPending(host));
    // Runs its cleanup only when the owning scope is disposed (no tracked reads).
    // `revalidateOn`: refetch on focus / reconnect once the data is older than staleTime.
    const unwatch = watch(revalidateEvents(options.revalidateOn), () => {
      if (!disposed && Date.now() - loadedAt >= staleTime) reload();
    });
    const disposeTracking = effect(() => () => {
      disposed = true;
      unwatch();
      for (const boundary of boundaries) boundary.__untrack(handle);
      boundaries.clear();
    });
    const disposeFetching = effect(() => {
      const value = src(); // the effect's ONLY tracked read
      if (paused(value)) {
        // Paused: cancel anything in flight and settle as "not loading".
        untracked(() => {
          token++;
          controller?.abort();
          controller = null;
          loading.value = false;
        });
        unregisterResource(entry);
        follow(null);
        return;
      }
      untracked(() => run(value));
      // Before a re-run (source changed) and on scope dispose: invalidate + abort,
      // so a torn-down region's fetch can neither land nor leak a connection.
      return () => {
        token++;
        controller?.abort();
        unregisterResource(entry);
        follow(null);
      };
    });
    // A component body runs outside any scope; its host tears down `_cleanups` on
    // disconnect. Stop with it, so an unmounted component's fetch is aborted and a
    // boundary stops waiting on it.
    if (host && Array.isArray(host._cleanups)) host._cleanups.push(disposeTracking, disposeFetching);
  }

  // Re-run with the current source value, bypassing `staleTime`. Paused: undefined.
  function rerun() {
    const value = untracked(src);
    return paused(value) ? undefined : run(value, { force: true });
  }
  // For `invalidate()`, `<Pending>` and error-boundary retries: never rejects, since
  // the failure already shows on `error` (or goes to a boundary).
  function reload() {
    return rerun()?.then(() => undefined);
  }
  // Public: resolves with the new data (undefined if a newer run superseded it) and
  // rejects when the fetch fails. The failure also shows on `error`, so a caller that
  // ignores the promise (`onclick={() => r.refetch()}`) is not an unhandled rejection;
  // one that awaits it still sees the rejection.
  function refetch() {
    const result = rerun()?.then((outcome) => {
      if (outcome.ok === false) throw outcome.error;
      return outcome.value;
    });
    result?.catch(() => {});
    return result;
  }

  // A read while a boundary's children are being built makes that boundary wait on
  // this resource too (a page resource passed down as props).
  const reading = () => {
    const boundary = buildingPending();
    if (boundary) track(boundary);
  };

  return {
    get data() {
      reading();
      return data.value;
    },
    get loading() {
      reading();
      return loading.value;
    },
    get error() {
      reading();
      return error.value;
    },
    /**
     * Re-run the fetcher with the current source value (no-op while paused). Resolves
     * with the new data; rejects when the fetch fails.
     */
    refetch,
  };
}

/** Is the source paused on the server? A source that throws there counts as running. */
function startsPaused(src) {
  try {
    return paused(untracked(src));
  } catch {
    return false;
  }
}
