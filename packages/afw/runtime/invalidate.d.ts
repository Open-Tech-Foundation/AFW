/**
 * Refetch the live resources that called the given server functions (imported from a
 * `.server` module). A value right after a function narrows it to the call with that
 * input: `invalidate(getTodo, { id: 1 }, listTodos)`. With no arguments: every live
 * resource, and the current page's loader data. Cached entries that are not on screen
 * are marked stale. Browser only; resolves at once on the server. A failed refetch shows
 * on its resource and does not reject.
 */
export function invalidate(...targets: unknown[]): Promise<void>;
/**
 * Forget cached query data: every entry, or the given server functions' (each optionally
 * followed by one input). For data that stops being the viewer's, such as on logout:
 * nothing is left to show on a remount, requests in flight write nothing, and live
 * resources that used the cleared data go back to loading and fetch again.
 */
export function clearQueryCache(...targets: unknown[]): void;
