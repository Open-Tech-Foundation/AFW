// Enter and exit transitions for elements that conditionals and lists add and
// remove (`transition`, `in` and `out` props). The compiler emits one
// `setTransition(el, kind, spec)` call per prop; the regions in dom.js call the
// hooks installed here when they insert or remove a root node.
//
// A transition is a function `(el, { direction }) => result`, where `result` is:
// - a config `{ keyframes, duration, delay, easing }`, played with the Web
//   Animations API. The keyframes describe *entering* (hidden → shown); leaving
//   plays them in reverse.
// - an object with a `finished` promise (a Web Animation, a Motion animation),
//   or any thenable (a GSAP tween): the node leaves when it settles.
// - null / undefined: no animation.

import { reportError } from "../core/errors.js";
import { transitionHooks } from "./transition-hooks.js";

/** el → { enter, leave, running, leaving } */
const records = new WeakMap();

const DEFAULTS = { duration: 200, delay: 0, easing: "ease-out" };

/**
 * Attach a transition to an element. `kind` is `"both"` (`transition`), `"in"` or
 * `"out"`. A nullish `spec` leaves that direction without an animation.
 * Compiler-emitted; not part of the authoring API.
 */
export function setTransition(el, kind, spec) {
  if (!transitionHooks.enter) {
    transitionHooks.enter = enterNode;
    transitionHooks.leave = leaveNode;
  }
  if (spec != null && typeof spec !== "function") {
    reportError(new TypeError(`a \`${kind === "both" ? "transition" : kind}\` prop expects a transition function such as fade(), got ${typeof spec}`), { phase: "transition" });
    return;
  }
  let record = records.get(el);
  if (!record) records.set(el, (record = { enter: null, leave: null, running: null, leaving: null }));
  if (kind !== "out") record.enter = spec ?? null;
  if (kind !== "in") record.leave = spec ?? null;
}

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run `spec` on `el`; returns the running animation (or thenable), or null. */
function play(el, spec, direction) {
  if (reducedMotion()) return null;
  let result;
  try {
    result = spec(el, { direction });
  } catch (error) {
    reportError(error, { phase: "transition" });
    return null;
  }
  if (result == null) return null;
  if (Array.isArray(result.keyframes)) return animate(el, result, direction);
  return result;
}

/**
 * Play a `{ keyframes, duration, delay, easing }` config. Entering fills backwards
 * (hidden through a delay, then the element's own styles); leaving plays in
 * reverse and fills forwards, so the node stays hidden until it is removed.
 */
function animate(el, config, direction) {
  if (typeof el.animate !== "function") return null; // no Web Animations (test DOMs)
  const out = direction === "out";
  return el.animate(config.keyframes, {
    duration: config.duration ?? DEFAULTS.duration,
    delay: config.delay ?? DEFAULTS.delay,
    easing: config.easing ?? DEFAULTS.easing,
    direction: out ? "reverse" : "normal",
    fill: out ? "forwards" : "backwards",
  });
}

/** Resolves when `running` (an Animation, thenable or anything else) settles. */
function settled(running) {
  const done = running && typeof running === "object" && "finished" in running ? running.finished : running;
  return Promise.resolve(done).then(() => {}, () => {});
}

function enterNode(el, initial) {
  const record = records.get(el);
  if (!record) return;
  // Re-inserted while leaving (a region that re-shows the same node): stop the exit.
  if (record.leaving) {
    const leaving = record.leaving;
    record.leaving = null;
    el.inert = false;
    if (typeof leaving.cancel === "function") leaving.cancel();
  }
  const spec = record.enter;
  if (!spec || (initial && !spec.initial)) return;
  const running = play(el, spec, "in");
  record.running = running;
  if (running) settled(running).then(() => { if (record.running === running) record.running = null; });
}

function leaveNode(el) {
  const record = records.get(el);
  if (!record || !record.leave) return false;
  let running;
  // Leaving mid-enter with the same transition: reverse the enter from where it is.
  if (record.running && record.leave === record.enter && typeof record.running.reverse === "function") {
    running = record.running;
    running.reverse();
  } else {
    if (record.running && typeof record.running.cancel === "function") record.running.cancel();
    running = play(el, record.leave, "out");
  }
  record.running = null;
  if (!running) return false;
  record.leaving = running;
  el.inert = true;
  settled(running).then(() => {
    if (record.leaving !== running) return; // re-entered meanwhile
    record.leaving = null;
    el.inert = false;
    el.remove();
  });
  return true;
}

// --- Built-in transitions ----------------------------------------------------

/** Mark a transition function as playing on the region's first render too. */
function withOptions(fn, options) {
  if (options.initial) fn.initial = true;
  return fn;
}

const timing = (o) => ({ duration: o.duration, delay: o.delay, easing: o.easing });

/** Fade opacity in and out. */
export function fade(options = {}) {
  return withOptions(() => ({ keyframes: [{ opacity: 0 }, { opacity: 1 }], ...timing(options) }), options);
}

/** Scale up from `start` (default 0.95) while fading in. */
export function scale(options = {}) {
  const start = options.start ?? 0.95;
  const opacity = options.opacity ?? 0;
  return withOptions(() => ({
    keyframes: [{ transform: `scale(${start})`, opacity }, { transform: "scale(1)", opacity: 1 }],
    ...timing(options),
  }), options);
}

/** Move in from an offset (`x`, `y` in pixels; default `y: 8`) while fading in. */
export function fly(options = {}) {
  const x = options.x ?? 0;
  const y = options.y ?? 8;
  const opacity = options.opacity ?? 0;
  return withOptions(() => ({
    keyframes: [{ transform: `translate(${x}px, ${y}px)`, opacity }, { transform: "none", opacity: 1 }],
    ...timing(options),
  }), options);
}

/**
 * Grow from zero height (or width, with `axis: "x"`), including padding, margin and
 * border, the way an accordion panel opens. The element clips its content while it
 * animates.
 */
export function slide(options = {}) {
  const x = options.axis === "x";
  const size = x ? "width" : "height";
  const sides = x ? ["Left", "Right"] : ["Top", "Bottom"];
  return withOptions((el, { direction }) => {
    if (typeof el.animate !== "function") return null;
    const style = getComputedStyle(el);
    const shown = { [size]: style[size] };
    const hidden = { [size]: "0px" };
    for (const side of sides) {
      for (const prop of [`padding${side}`, `margin${side}`, `border${side}Width`]) {
        shown[prop] = style[prop];
        hidden[prop] = "0px";
      }
    }
    const previous = el.style.overflow;
    el.style.overflow = "hidden";
    const animation = animate(el, { keyframes: [hidden, shown], ...timing(options) }, direction);
    settled(animation).then(() => { if (direction === "in") el.style.overflow = previous; });
    return animation;
  }, options);
}
