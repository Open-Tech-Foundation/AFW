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
// Server (SSG/SSR): no effect is created and nothing is fetched — `loading` stays
// `true`, so the prerendered HTML shows the loading branch. That is exactly what
// the client's first paint renders before its own fetch resolves, keeping
// hydration adoption aligned.

import { getCurrentInstance } from "../core/context.js";
import { reportError } from "../core/errors.js";
import { batch, effect, signal, untracked } from "../core/signals.js";
import { endpointOf, registerResource, unregisterResource, withTracking } from "./invalidate.js";
import { buildingPending, closestPending } from "./pending-scope.js";

// Test override: the DOM suites run in esdev's `--dom` realm (a `document`
// always exists), so server behavior is opted into explicitly.
let serverOverride = null;

/** Force server (true) / client (false) behavior for new resources — tests only. */
export function __setResourceServer(v) {
  serverOverride = v;
}

const isServer = () => serverOverride ?? typeof document === "undefined";

/**
 * Create a resource. Two call shapes:
 *
 *   resource(fetcher, options?)          — fetch once (and on refetch())
 *   resource(source, fetcher, options?)  — re-fetch when the reactive `source`
 *                                          changes; `null`/`false` pauses
 *
 * @param {Function} source  reactive source read inside the tracking effect; its
 *        value is passed to the fetcher.
 * @param {Function} fetcher  `(sourceValue, { signal }) => data | Promise<data>`.
 * @param {{ initial?: unknown, invalidatedBy?: Function[], errors?: "inline" }} [options]
 *        `initial` seeds `data` before the first resolution. `invalidatedBy` names
 *        server functions whose `invalidate()` refetches this resource, beyond those
 *        its fetcher calls as it starts (which are recorded automatically).
 *        `errors: "inline"` keeps failures on `error` only, even under `<Pending>`.
 * @returns {{ data: unknown, loading: boolean, error: unknown,
 *             refetch: () => Promise<unknown> | undefined }}  reactive getters —
 *        read them inside bindings/effects to subscribe.
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
  const loading = signal(true); // a fetch is intended; the server leaves it true
  // Has a run succeeded at least once? A `<Pending>` shows its fallback while a
  // resource it waits on is loading and has never loaded, so retrying a failed first
  // load shows the fallback again.
  const settled = signal(false);
  let token = 0;
  let controller = null;
  // This resource in the `invalidate()` registry (runtime/invalidate.js).
  const entry = { refetch: () => refetch() };
  const named = (options.invalidatedBy ?? []).map(endpointOf).filter(Boolean);

  function run(value) {
    controller?.abort();
    // Captured per-run: by the time a superseded run's promise settles, the
    // module-level `controller` already belongs to a newer run.
    const c = (controller = typeof AbortController !== "undefined" ? new AbortController() : null);
    const t = ++token;
    batch(() => {
      loading.value = true;
      error.value = undefined;
    });
    // The async IIFE starts the fetcher *synchronously* (no wasted microtask)
    // while converting a synchronous throw into a rejection.
    // Started under tracking: the server functions the fetcher calls register it.
    const { result, endpoints } = withTracking(() => (async () => fetcher(value, { signal: c?.signal }))());
    for (const endpoint of named) endpoints.add(endpoint);
    registerResource(entry, endpoints);
    return result
      .then(
        (v) => {
          if (t !== token) return; // superseded — a newer run owns the signals
          batch(() => {
            data.value = v;
            loading.value = false;
            settled.value = true;
          });
          return v;
        },
        (e) => {
          if (t !== token) return;
          // Keep the last good `data` (stale-while-error); only `error` flips.
          const first = !settled.value;
          batch(() => {
            error.value = e;
            loading.value = false;
          });
          failed(e, first);
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
    refetch: () => (disposed ? undefined : refetch()),
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
    const disposeTracking = effect(() => () => {
      disposed = true;
      for (const boundary of boundaries) boundary.__untrack(handle);
      boundaries.clear();
    });
    const disposeFetching = effect(() => {
      const value = src(); // the effect's ONLY tracked read
      if (value == null || value === false) {
        // Paused: cancel anything in flight and settle as "not loading".
        untracked(() => {
          token++;
          controller?.abort();
          controller = null;
          loading.value = false;
        });
        unregisterResource(entry);
        return;
      }
      untracked(() => run(value));
      // Before a re-run (source changed) and on scope dispose: invalidate + abort,
      // so a torn-down region's fetch can neither land nor leak a connection.
      return () => {
        token++;
        controller?.abort();
        unregisterResource(entry);
      };
    });
    // A component body runs outside any scope; its host tears down `_cleanups` on
    // disconnect. Stop with it, so an unmounted component's fetch is aborted and a
    // boundary stops waiting on it.
    if (host && Array.isArray(host._cleanups)) host._cleanups.push(disposeTracking, disposeFetching);
  }

  function refetch() {
    const value = untracked(src);
    if (value == null || value === false) return undefined;
    return run(value);
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
    /** Re-run the fetcher with the current source value (no-op while paused). */
    refetch,
  };
}
