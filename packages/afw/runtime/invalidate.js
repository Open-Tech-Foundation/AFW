// `invalidate()` — refetch the data server functions produced (docs/SERVER_FUNCTIONS.md
// §3.8). After an action changes data, the views that show it refetch:
//
//   const todos = resource(() => listTodos({ done: false }));
//   await addTodo({ title });
//   invalidate(listTodos);             // every live resource that called listTodos
//   invalidate(getTodo, { id: 1 });    // only those that called getTodo({ id: 1 })
//   invalidate();                      // every live resource, and the page's loader data
//
// A resource records the server function calls its fetcher makes while it starts (the
// synchronous part, which is where `() => listTodos(args)` calls them). A fetcher that
// calls one after an `await` names it with `resource(fn, { invalidatedBy: [...] })`.
//
// Cached entries (query-cache.js) are marked stale too, so a view that is not on
// screen fetches again when it next mounts instead of showing the old data.
//
// Browser only: on the server nothing is live, and `invalidate()` resolves at once.

import { callKey, dropEntries, endpointOfKey, markStale, peek } from "./query-cache.js";

const byEndpoint = new Map(); // endpoint → Set of live resource entries
const byKey = new Map(); // call key → Set of live resource entries
// endpoint → resources that name it in `invalidatedBy`: they cannot know the input, so
// any call of it refetches them.
const byNamed = new Map();
const live = new Set(); // every live resource entry
let tracking = null; // what a starting fetcher calls: { endpoints, keys, staleTime }
let refreshRoute = null; // the router's loader-data reload, once an app is mounted

/**
 * Record a server function call by the fetcher that is starting (the browser stub).
 * Returns the starting resource's `staleTime`, or undefined outside a resource.
 */
export function trackServerCall(endpoint, key) {
  if (!tracking) return undefined;
  tracking.endpoints.add(endpoint);
  if (key) tracking.keys.add(key);
  return tracking.staleTime;
}

/**
 * Run `start` and return its result with the server function calls it made: their
 * `endpoints` and call `keys`. `staleTime` is what those calls may serve from cache.
 */
export function withTracking(start, { staleTime = 0 } = {}) {
  const previous = tracking;
  const deps = { endpoints: new Set(), keys: new Set(), staleTime };
  tracking = deps;
  try {
    return { result: start(), endpoints: deps.endpoints, keys: deps.keys };
  } finally {
    tracking = previous;
  }
}

/** The endpoint of a browser stub (or an endpoint string), else null. */
export function endpointOf(fn) {
  if (typeof fn === "string") return fn;
  return typeof fn === "function" && typeof fn.endpoint === "string" ? fn.endpoint : null;
}

function add(map, k, entry) {
  let set = map.get(k);
  if (!set) map.set(k, (set = new Set()));
  set.add(entry);
}

function remove(map, k, entry) {
  const set = map.get(k);
  set?.delete(entry);
  if (set?.size === 0) map.delete(k);
}

/**
 * A live resource `entry` (`{ refetch }`) now depends on `endpoints` and call `keys`,
 * plus the `named` endpoints of its `invalidatedBy`.
 */
export function registerResource(entry, endpoints, keys = new Set(), named = []) {
  unregisterResource(entry);
  entry.endpoints = new Set([...endpoints, ...named]);
  entry.keys = keys;
  entry.named = named;
  live.add(entry);
  for (const endpoint of entry.endpoints) add(byEndpoint, endpoint, entry);
  for (const key of keys) add(byKey, key, entry);
  for (const endpoint of named) add(byNamed, endpoint, entry);
}

/** A resource stopped (paused or disposed). */
export function unregisterResource(entry) {
  live.delete(entry);
  for (const endpoint of entry.endpoints ?? []) remove(byEndpoint, endpoint, entry);
  for (const key of entry.keys ?? []) remove(byKey, key, entry);
  for (const endpoint of entry.named ?? []) remove(byNamed, endpoint, entry);
  entry.endpoints = undefined;
  entry.keys = undefined;
  entry.named = undefined;
}

/**
 * The server function calls live resources show, `[endpoint, input]`, at most `max`
 * (an action sends them so it can refresh them in its response).
 */
export function liveCalls(max) {
  const calls = [];
  for (const key of byKey.keys()) {
    const call = peek(key)?.call;
    if (call) calls.push(call);
    if (calls.length >= max) break;
  }
  return calls;
}

/**
 * The cached data for `key` changed outside a fetch (`setQueryData`, an optimistic
 * overlay, an action's refresh): resources whose fetcher made that call re-run it
 * against the cache. Resources that show the entry directly already heard the write.
 */
export function cacheChanged(key) {
  for (const entry of [...(byKey.get(key) ?? [])]) entry.fromCache?.(key);
}

/**
 * After an action refreshed `endpoints` and sent `freshKeys` back: everything else those
 * endpoints cached is stale, and live resources the response did not cover refetch, as
 * do the `stale` targets (`{ endpoint, key }`) it could not run.
 */
export async function settleRefresh(endpoints, freshKeys, stale) {
  const eps = new Set(endpoints);
  const targets = stale.map(({ endpoint, key }) => ({ endpoint, key }));
  markStale((key, entry) => {
    if (freshKeys.has(key)) return false;
    if (targets.some((target) => hits(target, key, entry))) return true;
    const endpoint = endpointOfKey(key);
    return (endpoint && eps.has(endpoint)) || [...eps].some((ep) => entry.deps?.endpoints.has(ep));
  });
  const resources = new Set();
  for (const ep of eps) {
    for (const entry of byEndpoint.get(ep) ?? []) {
      const own = [...(entry.keys ?? [])].filter((k) => endpointOfKey(k) === ep);
      if (own.length === 0 || own.some((k) => !freshKeys.has(k))) resources.add(entry);
    }
  }
  for (const { endpoint, key } of targets) {
    const found = key ? [...(byKey.get(key) ?? []), ...(byNamed.get(endpoint) ?? [])] : byEndpoint.get(endpoint) ?? [];
    for (const entry of found) resources.add(entry);
  }
  await Promise.all([...resources].map((entry) => entry.refetch()));
}

/** The router's hook for reloading the current page's loader data (`mountApp`). */
export function setRouteDataRefresher(fn) {
  refreshRoute = fn;
}

/**
 * Split `invalidate()`'s arguments into targets: a server function alone means all of
 * its calls; a value right after one narrows it to the call with that input.
 */
function targetsOf(args) {
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const endpoint = endpointOf(args[i]);
    if (!endpoint) throw new TypeError("invalidate() takes server functions imported from a .server module, each optionally followed by its input");
    if (i + 1 < args.length && typeof args[i + 1] !== "function") {
      targets.push({ endpoint, key: callKey(endpoint, args[++i]) });
    } else {
      targets.push({ endpoint, key: null });
    }
  }
  return targets;
}

/** Does a cached entry depend on a target? Its own key, or what its fetcher called. */
function hits(target, key, entry) {
  if (target.key) return key === target.key || !!entry.deps?.keys.has(target.key);
  return endpointOfKey(key) === target.endpoint || !!entry.deps?.endpoints.has(target.endpoint);
}

/**
 * Refetch the live resources that called the given server functions (as imported from a
 * `.server` module), each optionally followed by its input to target one call. With no
 * arguments: every live resource, and the current page's loader data. Resolves when the
 * refetches settle; a failed refetch shows on its resource, it does not reject here.
 */
export async function invalidate(...args) {
  if (typeof document === "undefined") return;
  if (args.length === 0) {
    markStale();
    await Promise.all([...[...live].map((entry) => entry.refetch()), refreshRoute?.()]);
    return;
  }
  const targets = targetsOf(args);
  markStale((key, entry) => targets.some((target) => hits(target, key, entry)));
  const resources = new Set();
  for (const { endpoint, key } of targets) {
    const found = key ? [...(byKey.get(key) ?? []), ...(byNamed.get(endpoint) ?? [])] : byEndpoint.get(endpoint) ?? [];
    for (const entry of found) resources.add(entry);
  }
  await Promise.all([...resources].map((entry) => entry.refetch()));
}

/**
 * Forget cached query data: every entry, or those of the given server functions (each
 * optionally followed by one input, as for `invalidate()`). Call it when the data stops
 * being the viewer's, such as on logout: unlike `invalidate()`, which keeps showing stale
 * data while it refetches, nothing is left to show on a remount.
 *
 * - Removed entries take their requests in flight with them; those write nothing.
 * - Live resources that showed a removed entry, or whose fetcher called a removed call
 *   (with no arguments: every live resource whose data came from the cache), go back to
 *   their initial state, with `loading` and no data, and fetch again.
 * - Resources that never used the cache (a plain `fetch` fetcher) are left alone.
 */
export function clearQueryCache(...args) {
  const targets = args.length ? targetsOf(args) : null;
  const dropped = new Set(dropEntries(targets ? (key, entry) => targets.some((target) => hits(target, key, entry)) : undefined));
  if (typeof document === "undefined") return;
  const resources = new Set();
  for (const entry of live) {
    const following = entry.following?.();
    if (following && dropped.has(following)) resources.add(entry);
    else if (!targets && entry.keys?.size) resources.add(entry);
  }
  for (const { endpoint, key } of targets ?? []) {
    const found = key ? [...(byKey.get(key) ?? []), ...(byNamed.get(endpoint) ?? [])] : byEndpoint.get(endpoint) ?? [];
    for (const entry of found) resources.add(entry);
  }
  for (const entry of resources) entry.reset?.();
}
