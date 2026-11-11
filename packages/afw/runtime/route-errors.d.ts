/** Install (or, with `null`, remove) the handler for errors no `<ErrorBoundary>` caught. */
export function setRouteErrorHandler(fn: ((el: Element, error: unknown, context: {}) => void) | null): void;
export function routeErrorHandler(): ((el: Element, error: unknown, context: {}) => void) | null;
