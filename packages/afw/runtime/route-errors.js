// Where an error with no enclosing <ErrorBoundary> goes: the router installs a
// handler that shows the page's nearest `error.jsx`. Kept apart from
// error-boundary.js, which defines a Custom Element and so cannot load on the
// server, where router.js also runs.

let handler = null;

/** Install (or, with `null`, remove) the handler for errors no boundary caught. */
export function setRouteErrorHandler(fn) {
  handler = fn;
}

/** The installed handler, or null. */
export function routeErrorHandler() {
  return handler;
}
