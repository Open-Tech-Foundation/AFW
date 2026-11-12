/// <reference path="./macros.d.ts" />
import type { Transition } from "./runtime/transition.js";
/** Type-only JSX entry for the AFW compiler (`jsx: "preserve"`). */
export namespace JSX {
  type Element = Node;
  interface ElementChildrenAttribute { children: unknown }

  /** A lazy component's loader, `() => import("./Chart.jsx")`, used as a JSX tag. */
  type LazyLoader = () => Promise<unknown>;
  type LazyTarget<L> = L extends () => Promise<infer M> ? (M extends { default: infer C } ? C : M) : never;
  type PropsOf<C> = C extends (props: infer P, ...rest: any[]) => unknown ? P
    : C extends new (props: infer P, ...rest: any[]) => unknown ? P
    : {};
  /** What a tag can be: an element name, a component (function or class), or a lazy loader. */
  type ElementType = string | ((props: any, ...rest: any[]) => unknown) | (new (props: any, ...rest: any[]) => unknown) | LazyLoader;
  /** A lazy loader's props are the props of the component it loads. */
  type LibraryManagedAttributes<C, P> = C extends LazyLoader ? PropsOf<LazyTarget<C>> : P;
  interface IntrinsicAttributes { key?: string | number }

  type Handler<E, T extends Event> = (event: T & { currentTarget: E }) => void;
  type Events<E> = {
    [K in keyof GlobalEventHandlersEventMap as `on${K}`]?: Handler<E, GlobalEventHandlersEventMap[K]>;
  } & {
    [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<K>}`]?: Handler<E, GlobalEventHandlersEventMap[K]>;
  };
  type Common<E> = Events<E> & {
    children?: unknown;
    class?: string | Record<string, unknown> | unknown[];
    className?: string;
    style?: string | Record<string, string | number | undefined>;
    /** A signal holding the element, or a `$ref()` variable (typed as the element itself). */
    ref?: { value: E | null | undefined } | E;
    tabindex?: number;
    autofocus?: boolean;
    readonly?: boolean;
    contenteditable?: boolean | "true" | "false" | "plaintext-only";
    spellcheck?: boolean;
    for?: string;
    role?: string;
    [attribute: `data-${string}`]: unknown;
    [attribute: `aria-${string}`]: string | number | boolean | undefined;
  };
  type Properties<E> = {
    [K in keyof E as E[K] extends Function ? never : K extends `on${string}` | keyof Common<E> ? never : K]?: E[K];
  };
  /**
   * Enter/exit transitions on an element that a conditional or list adds and removes:
   * `transition` for both directions, or `in` / `out` for one each.
   */
  type Transitions = {
    transition?: Transition | null | false;
    in?: Transition | null | false;
    out?: Transition | null | false;
  };
  type HTML = { [K in keyof HTMLElementTagNameMap]: Properties<HTMLElementTagNameMap[K]> & Common<HTMLElementTagNameMap[K]> & Transitions };
  type SVG = { [K in Exclude<keyof SVGElementTagNameMap, keyof HTML>]: Common<SVGElementTagNameMap[K]> & { [attribute: string]: unknown } };
  type IntrinsicElements = HTML & SVG & {
    [tag: `${string}-${string}`]: Common<HTMLElement> & { [attribute: string]: unknown };
  };
}
