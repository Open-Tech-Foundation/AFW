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
  /**
   * Props every component accepts: `key` for keyed lists, and `ref` for a `$ref()`
   * variable or a signal that receives the component's element (with anything it
   * publishes through `$expose`).
   */
  interface IntrinsicAttributes {
    key?: string | number;
    ref?: unknown;
  }

  type Handler<E, T extends Event> = (event: T & { currentTarget: E }) => void;
  type Events<E> = {
    [K in keyof GlobalEventHandlersEventMap as `on${K}`]?: Handler<E, GlobalEventHandlersEventMap[K]>;
  } & {
    [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<K>}`]?: Handler<E, GlobalEventHandlersEventMap[K]>;
  } & {
    [K in keyof GlobalEventHandlersEventMap as `on${K}:${ListenerModifiers}`]?: Handler<E, GlobalEventHandlersEventMap[K]>;
  } & {
    [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<K>}:${ListenerModifiers}`]?: Handler<E, GlobalEventHandlersEventMap[K]>;
  };
  /**
   * Listener modifiers after a `:`: `capture`, `passive`, `once` or `listen`, combined
   * with `-` (`onclick:once`, `onscroll:once-passive`). Kept as a pattern rather than
   * every combination so each element's props stay small.
   */
  type ListenerModifiers = `${"capture" | "passive" | "once" | "listen"}${string}`;
  type Common<E> = Events<E> & {
    /** Identifies a row in a keyed list, so an update moves it instead of rebuilding it. */
    key?: string | number;
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
  /** Invoker commands (`<button commandfor="dialog" command="show-modal">`). */
  type Command = "show-modal" | "close" | "request-close" | "show-popover" | "hide-popover" | "toggle-popover" | `--${string}`;
  /** Controls another element: a popover, a dialog, or an interest target. */
  type Invoker = {
    commandfor?: string;
    command?: Command;
    popovertarget?: string;
    popovertargetaction?: "toggle" | "show" | "hide";
    interestfor?: string;
  };
  /**
   * HTML attributes that have no matching DOM property in TypeScript's DOM types yet
   * (they are written as attributes, as the compiler does for any non-property name).
   */
  type Attributes = {
    button: Invoker;
    input: Invoker & { switch?: boolean };
    dialog: { closedby?: "any" | "closerequest" | "none" };
  };
  /** `popover` on any element: `auto` (light dismiss), `manual`, or `hint`. */
  type Popover = { popover?: "auto" | "manual" | "hint" | "" | boolean | null };
  type HTML = {
    [K in keyof HTMLElementTagNameMap]: Omit<Properties<HTMLElementTagNameMap[K]>, "popover"> & Common<HTMLElementTagNameMap[K]> & Transitions & Popover
      & (K extends keyof Attributes ? Attributes[K] : {});
  };
  type SVG = { [K in Exclude<keyof SVGElementTagNameMap, keyof HTML>]: Common<SVGElementTagNameMap[K]> & { [attribute: string]: unknown } };
  type IntrinsicElements = HTML & SVG & {
    [tag: `${string}-${string}`]: Common<HTMLElement> & { [attribute: string]: unknown };
  };
}
