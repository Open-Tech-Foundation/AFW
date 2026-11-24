// Feature detection for the platform features the components are built on. Each check
// runs in the browser only (from `onMount`/handlers), never during server rendering, and
// answers once: support cannot change during a page's life.
//
// Native wins wherever it exists; every `false` here selects one of the small fallbacks
// in this folder (no polyfill packages).

const cache = new Map();

function once(name, probe) {
  if (!cache.has(name)) {
    let ok = false;
    try {
      ok = Boolean(probe());
    } catch {
      ok = false;
    }
    cache.set(name, ok);
  }
  return cache.get(name);
}

/** CSS anchor positioning (`position-area`, implicit anchors from invokers). */
export const supportsAnchor = () => once("anchor", () => CSS.supports("position-area: block-end"));

/** Invoker commands (`commandfor` + `command` on a button). */
export const supportsInvokers = () => once("invokers", () => "commandForElement" in HTMLButtonElement.prototype);

/** Interest invokers (`interestfor`: open on hover, focus and long-press). */
export const supportsInterest = () => once("interest", () => "interestForElement" in HTMLButtonElement.prototype);

/** Native `focusgroup` (arrow-key navigation and inferred roles). */
export const supportsFocusGroup = () => once("focusgroup", () => "focusGroup" in HTMLElement.prototype);

/** `popover="hint"`: the property reports "manual" where the value is unknown. */
export const supportsHint = () =>
  once("hint", () => {
    const probe = document.createElement("div");
    probe.popover = "hint";
    return probe.popover === "hint";
  });

/** `<dialog closedby>` (light dismiss for a modal). */
export const supportsClosedBy = () => once("closedby", () => "closedBy" in HTMLDialogElement.prototype);

/** `document.ariaNotify()` (announce without a live region). */
export const supportsAriaNotify = () => once("arianotify", () => typeof document.ariaNotify === "function");

/** `<input type="checkbox" switch>`. */
export const supportsSwitch = () => once("switch", () => "switch" in HTMLInputElement.prototype);

/** Forget cached answers (tests stub a feature, then re-detect). */
export function resetSupport() {
  cache.clear();
}
