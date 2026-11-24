// Tooltip — a short hint shown while the trigger is hovered or focused.
//
//   <Tooltip content="Bold (Ctrl+B)"><button aria-label="Bold">B</button></Tooltip>
//
// Wraps one focusable trigger (a button or link). The hint is a `popover="hint"`, so it
// closes other hints but never an open menu, light-dismisses, and closes on Esc.
//
// Native: the trigger gets `interestfor`, so the browser opens the hint on hover, focus
// and long-press, with the delays in `interest-delay`. Fallback (no interest invokers, or
// a trigger that cannot take `interestfor`): pointer hover after `delay` ms, keyboard
// focus at once; it stays open while the pointer is over the hint (WCAG 1.4.13), and
// closes on leave, blur and Esc.
//
// Accessibility, wired on mount (before any interaction, for browse-mode readers):
// - the hint repeats the trigger's name → nothing (it would be read twice)
// - the trigger has no name → `aria-labelledby` the hint
// - otherwise → `aria-describedby` the hint
// Existing author ARIA always wins. A hint is for content the user can afford to miss;
// anything they need belongs in the page or a <Popover> toggletip.

import { tether } from "../internal/position.js";
import { supportsInterest } from "../internal/support.js";

const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]";
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** A trigger's accessible name, roughly as the browser computes it for these elements. */
export function accessibleName(el) {
  const ids = el.getAttribute("aria-labelledby");
  if (ids) {
    return norm(ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
  }
  if (el.hasAttribute("aria-label")) return norm(el.getAttribute("aria-label"));
  return norm(nameFromContent(el)) || norm(el.getAttribute("title"));
}

// Text and image `alt` of the subtree, skipping `aria-hidden` content.
function nameFromContent(node) {
  let out = "";
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out += n.data;
    else if (n.nodeType === 1 && n.getAttribute("aria-hidden") !== "true") {
      out += ` ${n.tagName === "IMG" ? n.getAttribute("alt") ?? "" : nameFromContent(n)} `;
    }
  }
  return out;
}

export function Tooltip({ content, placement = "top", delay = 400, children }) {
  const tipId = $id();
  const anchor = $ref();
  const tip = $ref();

  onMount(() => {
    const trigger = anchor.querySelector(FOCUSABLE) ?? anchor.firstElementChild;
    if (!trigger) return;
    const cleanups = [tether(tip, trigger, placement)];

    const name = accessibleName(trigger);
    const hint = norm(tip.textContent);
    if (!name) {
      if (!trigger.hasAttribute("aria-labelledby")) trigger.setAttribute("aria-labelledby", tipId);
    } else if (name !== hint && !trigger.hasAttribute("aria-describedby")) {
      trigger.setAttribute("aria-describedby", tipId);
    }
    if (name === hint) tip.removeAttribute("role"); // nothing to expose separately

    const canInterest = trigger.tagName === "BUTTON" || trigger.tagName === "A";
    if (supportsInterest() && canInterest) {
      trigger.setAttribute("interestfor", tipId);
      return () => cleanups.forEach((c) => c?.());
    }

    let showTimer = 0;
    let hideTimer = 0;
    const open = () => {
      clearTimeout(hideTimer);
      if (tip.matches(":popover-open")) return;
      try {
        tip.showPopover({ source: trigger });
      } catch {
        tip.showPopover();
      }
    };
    const close = () => {
      clearTimeout(showTimer);
      if (tip.matches(":popover-open")) tip.hidePopover();
    };
    const closeSoon = () => {
      clearTimeout(showTimer);
      hideTimer = setTimeout(close, 100); // time to move onto the hint
    };
    const onEnter = () => {
      clearTimeout(hideTimer);
      showTimer = setTimeout(open, delay);
    };
    const onFocus = () => {
      if (trigger.matches(":focus-visible")) open();
    };
    const onKey = (event) => {
      if (event.key === "Escape" && tip.matches(":popover-open")) {
        event.preventDefault();
        close();
      }
    };
    trigger.addEventListener("pointerenter", onEnter);
    trigger.addEventListener("pointerleave", closeSoon);
    trigger.addEventListener("focus", onFocus);
    trigger.addEventListener("blur", close);
    tip.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    tip.addEventListener("pointerleave", closeSoon);
    document.addEventListener("keydown", onKey);
    cleanups.push(() => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      trigger.removeEventListener("pointerenter", onEnter);
      trigger.removeEventListener("pointerleave", closeSoon);
      trigger.removeEventListener("focus", onFocus);
      trigger.removeEventListener("blur", close);
      document.removeEventListener("keydown", onKey);
    });
    return () => cleanups.forEach((c) => c?.());
  });

  return (
    <span ref={anchor} class="afw-ui-tooltip-anchor">
      {children}
      <span ref={tip} id={tipId} popover="hint" role="tooltip" class="afw-ui-tooltip" data-placement={placement}>
        {content}
      </span>
    </span>
  );
}
