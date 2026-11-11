export class PendingElement extends HTMLElement {
  fallback: unknown;
  refreshing: unknown;
  refetch: "keep" | "fallback";
  error: ((error: unknown, retry: () => void) => unknown) | null;
  delay: number;
  __track(handle: unknown): void;
  __untrack(handle: unknown): void;
  __built(): void;
  __fail(error: unknown, handle: unknown): void;
}
/** JSX props consumed by the compiler-generated custom-element host. */
export const Pending: {
  new(props: {
    /** Shown until every resource inside has loaded once. */
    fallback?: unknown;
    /** Shown beside the content while a resource inside refetches. */
    refreshing?: unknown;
    /** `"keep"` (default): the content stays during a refetch. `"fallback"`: show the fallback again. */
    refetch?: "keep" | "fallback";
    /**
     * Show a failed first load here: `(error, retry) => view`. `retry` refetches what failed.
     * Without it, the failure goes to the nearest `<ErrorBoundary>` or `error.jsx`.
     */
    error?: (error: unknown, retry: () => void) => unknown;
    /** Milliseconds to wait before showing `fallback` or `refreshing`; a faster load shows neither. Default 0. */
    delay?: number;
    children?: unknown;
  }): PendingElement;
  prototype: PendingElement;
};
