export interface Resource<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  /**
   * Re-run the fetcher with the current source value, ignoring `staleTime`. Resolves
   * with the new data (undefined if a newer run superseded it) and rejects when the
   * fetch fails; the failure also shows on `error`. Returns undefined while paused.
   */
  refetch(): Promise<T | undefined> | undefined;
}
export interface ResourceOptions<T> {
  /** Seeds `data` before the first resolution. */
  initial?: T;
  /** Server functions whose `invalidate()` refetches this resource, beyond those its fetcher calls as it starts. */
  invalidatedBy?: Array<(...args: any[]) => unknown>;
  /**
   * `"inline"` keeps failures on `error` only. By default, a resource a `<Pending>`
   * waits on sends a first-load failure to the nearest `<ErrorBoundary>` and reports
   * a failed refetch.
   */
  errors?: "inline";
  /**
   * Cache the result under this key (or the key this function returns for the source
   * value): every resource with the key shares one request and shows the same data. A
   * server function fetcher is cached by its endpoint and input without one.
   */
  key?: unknown | ((value: any) => unknown);
  /** Milliseconds cached data answers without a request. Default 0: always revalidate. */
  staleTime?: number;
  /** Milliseconds an unused cache entry is kept. Default 5 minutes. */
  gcTime?: number;
  /** Abort a run that takes longer than this many milliseconds; `error` is a TimeoutError. */
  timeout?: number;
  /**
   * Refetch when the tab becomes visible again (`"focus"`) or the browser reconnects
   * (`"online"`), once the data is older than `staleTime`. Off by default.
   */
  revalidateOn?: "focus" | "online" | Array<"focus" | "online">;
}
/** A server function without input: `resource(listTodos)`. */
export function resource<T>(fetcher: (input: undefined, options?: { signal?: AbortSignal }) => Promise<T>, options?: ResourceOptions<T>): Resource<T>;
export function resource<T>(fetcher: (value: true, context: { signal: AbortSignal | undefined }) => T | Promise<T>, options?: ResourceOptions<T>): Resource<T>;
export function resource<S, T>(source: () => S, fetcher: (value: NonNullable<Exclude<S, false>>, context: { signal: AbortSignal | undefined }) => T | Promise<T>, options?: ResourceOptions<T>): Resource<T>;
export function __setResourceServer(value: boolean | null): void;
