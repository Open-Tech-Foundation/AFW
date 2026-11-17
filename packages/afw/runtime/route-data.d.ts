/** The data-endpoint URL for a page path: `"/"` → `/__data.json`,
 *  `"/todos"` → `/todos/__data.json`, preserving the query string. */
export function dataUrlFor(pathname: any, search?: string): string;
/**
 * Fetch a route's loader data. 200 → the parsed JSON; 404 → a `RouteNotFound`
 * (`notFound()`, or a path with no page); a redirect → a `RouteRedirect`; anything
 * else throws (the router reports it and commits the navigation with no data).
 */
export function fetchRouteData(pathname: any, search?: string): Promise<any>;
/** The loader data inlined by the server for the current document, or `undefined`. */
export function readInlineRouteData(): any;
/** Reset the cached inline payload (tests only — a fresh document between cases). */
export function __resetInlineRouteData(): void;
/** The reserved per-route data filename/URL suffix (`/todos` → `/todos/__data.json`). */
export const DATA_FILE: "__data.json";
/** The header the data endpoint sets when a loader redirected. */
export const REDIRECT_HEADER: "x-afw-redirect";
/** Returned by `fetchRouteData` in place of data when the route redirects. */
export class RouteRedirect {
  constructor(location: string, options?: { reload?: boolean });
  redirect: string;
  /** A full page load is needed (the server redirected the data request itself). */
  reload: boolean;
}
/** Returned by `fetchRouteData` when the route has no data: the loader called `notFound()`. */
export class RouteNotFound {}
/** The inline-data payload marking a server-rendered 404 page (a loader's `notFound()`). */
export const NOT_FOUND_PAYLOAD: string;
/** Does the inline data mark a server-rendered 404 page? */
export function isNotFoundPayload(data: unknown): boolean;
