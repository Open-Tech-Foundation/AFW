// Types for AFW's compiler macros. The compiler rewrites these calls, so they are
// globals with no runtime import; this file only teaches TypeScript and editors
// their shapes. It is referenced from the package's types and its JSX types, so a
// project typed against `@opentf/afw` sees them without extra setup.

import type { Context } from "./core/context.js";

declare global {
  /** Reactive state: read and write the variable directly (`count++`). */
  function $state<T>(initial: T): T;
  function $state<T = undefined>(): T | undefined;
  /** A cached value, recomputed when the state it reads changes. */
  function $derived<T>(value: T): T;
  /** A side effect that re-runs when the state it reads changes; may return a cleanup. */
  function $effect(fn: () => void | (() => void)): void;
  /** A handle to a DOM node or component element, bound with `ref={…}`. */
  function $ref<T = any>(): T;
  /** The value of the nearest `<ContextProvider>` for `context`. */
  function $context<T>(context: Context<T>): T;
  /** Publish methods on this component's element for a parent holding its `$ref`. */
  function $expose(api: Record<string, unknown>): void;

  // Lifecycle hooks: globals too, wired to the component host by the compiler.
  // The same functions are exported from `@opentf/afw` for code that prefers an import.
  /** Run once the component is connected; a returned function runs on removal. */
  function onMount(callback: () => void | (() => void)): void;
  /** Run when the component is removed from the DOM. */
  function onCleanup(callback: () => void): void;
  /** Run when the component's host element changes size. */
  function onResize(callback: (entry: ResizeObserverEntry) => void): void;
  /** Run with the query's match state on mount and whenever it changes. */
  function onMediaQuery(query: string, callback: (matches: boolean, event: MediaQueryListEvent | undefined) => void): void;
  /** Run when the component's host element enters or leaves the viewport. */
  function onVisibilityChange(callback: (visible: boolean, entry: IntersectionObserverEntry) => void): void;
}

export {};
