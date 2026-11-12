// Route groups — folders in parentheses, `(guides)` — organize pages without being
// part of the URL. Every docs plugin that turns a folder into a URL drops them here,
// matching the framework router.

/** Is `name` a route-group folder? */
export const isGroupSegment = (name) => /^\(.+\)$/.test(name);

/** Append folder `name` to URL `route`, unless it is a route group. */
export const childRoute = (route, name) => (isGroupSegment(name) ? route : `${route}/${name}`);
