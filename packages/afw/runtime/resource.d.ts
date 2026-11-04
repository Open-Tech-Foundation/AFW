export interface Resource<T> {
  readonly data: T | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  refetch(): Promise<T | undefined> | undefined;
}
export interface ResourceOptions<T> {
  /** Seeds `data` before the first resolution. */
  initial?: T;
  /** Server functions whose `invalidate()` refetches this resource, beyond those its fetcher calls as it starts. */
  invalidatedBy?: Array<(...args: any[]) => unknown>;
}
export function resource<T>(fetcher: (value: true, context: { signal: AbortSignal | undefined }) => T | Promise<T>, options?: ResourceOptions<T>): Resource<T>;
export function resource<S, T>(source: () => S, fetcher: (value: NonNullable<Exclude<S, false>>, context: { signal: AbortSignal | undefined }) => T | Promise<T>, options?: ResourceOptions<T>): Resource<T>;
export function __setResourceServer(value: boolean | null): void;
