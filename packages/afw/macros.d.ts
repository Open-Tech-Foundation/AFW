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
}

export {};
