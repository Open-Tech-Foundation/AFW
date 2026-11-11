/** What a transition function returns for one run. */
export type TransitionResult =
  /** Keyframes describing *entering* (hidden → shown), played with the Web Animations API. Leaving plays them in reverse. */
  | { keyframes: Keyframe[]; duration?: number; delay?: number; easing?: string }
  /** A running animation (a Web Animation, a Motion animation): the element leaves when `finished` settles. */
  | { finished: PromiseLike<unknown> }
  /** Any thenable, such as a GSAP tween. */
  | PromiseLike<unknown>
  | null
  | undefined;

/**
 * An enter/exit transition for the `transition`, `in` and `out` props. Called with the
 * element each time it enters or leaves. Set `initial` to also play when the
 * surrounding conditional or list first renders.
 */
export interface Transition {
  (element: Element, context: { direction: "in" | "out" }): TransitionResult;
  initial?: boolean;
}

export interface TransitionOptions {
  /** Milliseconds. Default 200. */
  duration?: number;
  /** Milliseconds before the animation starts. Default 0. */
  delay?: number;
  /** Any CSS easing. Default `"ease-out"` (leaving plays it in reverse). */
  easing?: string;
  /** Also play when the surrounding conditional or list first renders. Default false. */
  initial?: boolean;
}

/** Fade opacity in and out. */
export function fade(options?: TransitionOptions): Transition;
/** Scale up from `start` (default 0.95) while fading from `opacity` (default 0). */
export function scale(options?: TransitionOptions & { start?: number; opacity?: number }): Transition;
/** Move in from an offset in pixels (default `{ x: 0, y: 8 }`) while fading from `opacity` (default 0). */
export function fly(options?: TransitionOptions & { x?: number; y?: number; opacity?: number }): Transition;
/** Grow from zero height (or width with `axis: "x"`), including padding, margin and border. */
export function slide(options?: TransitionOptions & { axis?: "x" | "y" }): Transition;

/** Compiler-emitted: attach a transition prop to an element. */
export function setTransition(element: Element, kind: "both" | "in" | "out", spec: Transition | null | undefined): void;
