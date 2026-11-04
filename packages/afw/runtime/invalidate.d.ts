/**
 * Refetch the live resources that called any of `fns` (server functions imported from a
 * `.server` module). With no arguments: every live resource, and the current page's
 * loader data. Browser only; resolves at once on the server.
 */
export function invalidate(...fns: Array<(...args: any[]) => unknown>): Promise<void>;
