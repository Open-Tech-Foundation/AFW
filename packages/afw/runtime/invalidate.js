// `invalidate()` — refetch the data server functions produced (docs/SERVER_FUNCTIONS.md
// §3.8). After an action changes data, the views that show it refetch:
//
//   const todos = resource(() => listTodos({ done: false }));
//   await addTodo({ title });
//   invalidate(listTodos); // every live resource that called listTodos refetches
//   invalidate();          // every live resource, and the current page's loader data
//
// A resource records the server functions its fetcher calls while it starts (the
// synchronous part, which is where `() => listTodos(args)` calls them). A fetcher
// that calls one after an `await` names it with `resource(fn, { invalidatedBy: [...] })`.
//
// Browser only: on the server nothing is live, and `invalidate()` resolves at once.

const byEndpoint = new Map(); // endpoint → Set of live resource entries
const live = new Set(); // every live resource entry
let tracking = null; // endpoints called while a fetcher starts
let refreshRoute = null; // the router's loader-data reload, once an app is mounted

/** Record a server function call by the fetcher that is starting (the browser stub). */
export function trackServerCall(endpoint) {
  tracking?.add(endpoint);
}

/** Run `start` and return its result with the server function endpoints it called. */
export function withTracking(start) {
  const previous = tracking;
  const endpoints = new Set();
  tracking = endpoints;
  try {
    return { result: start(), endpoints };
  } finally {
    tracking = previous;
  }
}

/** The endpoint of a browser stub (or an endpoint string), else null. */
export function endpointOf(fn) {
  if (typeof fn === "string") return fn;
  return typeof fn === "function" && typeof fn.endpoint === "string" ? fn.endpoint : null;
}

/** A live resource `entry` (`{ refetch }`) now depends on `endpoints`. */
export function registerResource(entry, endpoints) {
  unregisterResource(entry);
  entry.endpoints = endpoints;
  live.add(entry);
  for (const endpoint of endpoints) {
    let set = byEndpoint.get(endpoint);
    if (!set) byEndpoint.set(endpoint, (set = new Set()));
    set.add(entry);
  }
}

/** A resource stopped (paused or disposed). */
export function unregisterResource(entry) {
  live.delete(entry);
  for (const endpoint of entry.endpoints ?? []) {
    const set = byEndpoint.get(endpoint);
    set?.delete(entry);
    if (set?.size === 0) byEndpoint.delete(endpoint);
  }
  entry.endpoints = undefined;
}

/** The router's hook for reloading the current page's loader data (`mountApp`). */
export function setRouteDataRefresher(fn) {
  refreshRoute = fn;
}

/**
 * Refetch the live resources that called any of `fns` (server functions, as imported
 * from a `.server` module). With no arguments: every live resource, and the current
 * page's loader data. Resolves when the refetches settle.
 */
export async function invalidate(...fns) {
  if (typeof document === "undefined") return;
  if (fns.length === 0) {
    await Promise.all([...[...live].map((entry) => entry.refetch()), refreshRoute?.()]);
    return;
  }
  const targets = new Set();
  for (const fn of fns) {
    const endpoint = endpointOf(fn);
    if (!endpoint) throw new TypeError("invalidate() takes server functions imported from a .server module");
    for (const entry of byEndpoint.get(endpoint) ?? []) targets.add(entry);
  }
  await Promise.all([...targets].map((entry) => entry.refetch()));
}
