/**
 * A lazy component's loader: `const Chart: Lazy<typeof ChartComponent> = () => import("./Chart.jsx")`.
 * The annotation is optional: TypeScript infers the loader's type, and JSX takes the
 * props from the component it loads. Calling it preloads the component.
 */
export type Lazy<C> = () => Promise<{ default: C } | C>;
/** Compiler-emitted: the loader, callable to preload, with the placeholder's `tag`. */
export function lazyComponent<L extends () => Promise<unknown>>(loader: L, tag: string): L & { readonly tag: string };
