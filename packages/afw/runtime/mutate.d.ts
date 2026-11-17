type ServerFn<I, O> = ((input: I, options?: any) => Promise<O>) & { endpoint?: string };

/**
 * Store data for one server function call: `value`, or `value(current)` for a function.
 * Every resource showing the call updates; nothing is fetched.
 */
export function setQueryData<I, O>(fn: ServerFn<I, O>, input: I, value: O | ((current: O | undefined) => O)): void;

/**
 * Show `update(data)` on every cached call of `fn` until `promise` settles, then take it
 * off: the action's refreshed data shows on success, the previous data on failure.
 * Returns `promise`'s outcome.
 */
export function optimistic<T, I, O>(promise: Promise<T>, fn: ServerFn<I, O>, update: (data: O) => O): Promise<T>;
/** Show `update(data)` on the cached call of `fn` with `input` until `promise` settles. */
export function optimistic<T, I, O>(promise: Promise<T>, fn: ServerFn<I, O>, input: I, update: (data: O) => O): Promise<T>;
