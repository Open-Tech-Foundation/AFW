// Announce a message to screen readers without moving focus.
//
// Native: `document.ariaNotify()`. Fallback: a visually hidden live region per priority,
// created on first use. The text is cleared, then set on the next frame, so repeating
// the same message is announced again.

import { supportsAriaNotify } from "./support.js";

const regions = {};

function region(priority) {
  if (regions[priority]?.isConnected) return regions[priority];
  const el = document.createElement("div");
  el.setAttribute("aria-live", priority === "high" ? "assertive" : "polite");
  el.setAttribute("aria-atomic", "true");
  el.setAttribute("data-afw-ui-announcer", priority);
  el.style.cssText =
    "position:absolute;inline-size:1px;block-size:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
  document.body.append(el);
  regions[priority] = el;
  return el;
}

/** Announce `text`. `priority` is "normal" (polite) or "high" (interrupts). */
export function announce(text, { priority = "normal" } = {}) {
  if (!text) return;
  if (supportsAriaNotify()) {
    document.ariaNotify(text, { priority });
    return;
  }
  const el = region(priority);
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = text;
  });
}
