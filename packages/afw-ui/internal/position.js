// Tether a top-layer overlay (menu, tooltip, popover, select list) to its trigger.
//
// Native: CSS anchor positioning against the implicit anchor the invoker sets
// (`commandfor`, `interestfor`, `showPopover({ source })`), with flip fallbacks. The
// styles are inline, so tethering is behavior the headless component owns, not a theme
// concern; a theme spaces the overlay with `--afw-ui-offset`.
//
// Fallback (no anchor positioning): `position: fixed` coordinates computed on open, and
// again on scroll and resize while open — below/above (or beside) the trigger, flipping to
// the other side when it does not fit, then clamped into the viewport. Never the UA's
// centered popover placement, which detaches the overlay from its trigger.

import { supportsAnchor } from "./support.js";

/** placement → [position-area, side, align]. `start`/`end` follow the writing direction. */
const PLACEMENTS = {
  "bottom-start": ["block-end span-inline-end", "bottom", "start"],
  bottom: ["block-end", "bottom", "center"],
  "bottom-end": ["block-end span-inline-start", "bottom", "end"],
  "top-start": ["block-start span-inline-end", "top", "start"],
  top: ["block-start", "top", "center"],
  "top-end": ["block-start span-inline-start", "top", "end"],
  "right-start": ["inline-end span-block-end", "right", "start"],
  right: ["inline-end", "right", "center"],
  "left-start": ["inline-start span-block-end", "left", "start"],
  left: ["inline-start", "left", "center"],
};

const GUTTER = 8; // keep a fallback-positioned overlay this far from the viewport edge
let anchors = 0; // anchor-name suffix for an overlay without an id

function parse(placement) {
  return PLACEMENTS[placement] ?? PLACEMENTS["bottom-start"];
}

/** The offset between trigger and overlay, from `--afw-ui-offset` (px), default 4. */
function offsetOf(floating) {
  const raw = getComputedStyle(floating).getPropertyValue("--afw-ui-offset").trim();
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 4;
}

/**
 * Where to put `floating` (its size `f`) for an anchor rect `a`, in a `vw`×`vh` viewport:
 * `{ left, top, side }`. Exported for the unit tests; `side` is where it ended up.
 */
export function computePosition(a, f, { placement = "bottom-start", offset = 4, vw, vh, rtl = false } = {}) {
  let [, side, align] = parse(placement);
  if (rtl && align !== "center") align = align === "start" ? "end" : "start";
  const vertical = side === "top" || side === "bottom";

  // Flip to the opposite side when the preferred one is too small and the other fits better.
  if (vertical) {
    const below = vh - a.bottom - offset;
    const above = a.top - offset;
    if (side === "bottom" && f.height > below && above > below) side = "top";
    else if (side === "top" && f.height > above && below > above) side = "bottom";
  } else {
    const right = vw - a.right - offset;
    const left = a.left - offset;
    const wantRight = rtl ? side === "left" : side === "right";
    const physical = wantRight ? "right" : "left";
    side = physical;
    if (side === "right" && f.width > right && left > right) side = "left";
    else if (side === "left" && f.width > left && right > left) side = "right";
  }

  let left;
  let top;
  if (vertical) {
    top = side === "bottom" ? a.bottom + offset : a.top - offset - f.height;
    left = align === "start" ? a.left : align === "end" ? a.right - f.width : a.left + (a.width - f.width) / 2;
  } else {
    left = side === "right" ? a.right + offset : a.left - offset - f.width;
    top = align === "start" ? a.top : align === "end" ? a.bottom - f.height : a.top + (a.height - f.height) / 2;
  }
  const clamp = (v, size, max) => Math.max(GUTTER, Math.min(v, max - size - GUTTER));
  return { left: clamp(left, f.width, vw), top: clamp(top, f.height, vh), side };
}

/**
 * Tether `floating` (a `[popover]`) to `anchor` at `placement`. Call once on mount;
 * returns a cleanup. Re-reads `placement` from `data-placement` on each open, so a
 * component can change it reactively.
 */
export function tether(floating, anchor, placement = "bottom-start") {
  const current = () => floating.getAttribute("data-placement") || placement;

  if (supportsAnchor()) {
    // An explicit anchor pair: not every invoker sets an implicit anchor (a `commandfor`
    // trigger does not in every engine), and a missing anchor strands the overlay at 0,0.
    // Added to any anchor names the trigger already has.
    const name = `--afw-ui-anchor-${floating.id || ++anchors}`;
    const existing = getComputedStyle(anchor).getPropertyValue("anchor-name").trim();
    if (!existing.split(/\s*,\s*/).includes(name)) {
      anchor.style.setProperty("anchor-name", existing && existing !== "none" ? `${existing}, ${name}` : name);
    }
    const apply = () => {
      const s = floating.style;
      s.setProperty("position-anchor", name);
      s.setProperty("inset", "auto");
      // The gap sits on the placement's axis only: below/above → block margins, beside →
      // inline margins (flips keep the same axis).
      const side = parse(current())[1];
      const vertical = side === "top" || side === "bottom";
      s.setProperty("margin", vertical ? "var(--afw-ui-offset, 4px) 0" : "0 var(--afw-ui-offset, 4px)");
      s.setProperty("position-area", parse(current())[0]);
      s.setProperty("position-try-fallbacks", "flip-block, flip-inline, flip-block flip-inline");
    };
    apply();
    const onToggle = (event) => event.newState === "open" && apply();
    floating.addEventListener("beforetoggle", onToggle);
    return () => floating.removeEventListener("beforetoggle", onToggle);
  }

  let frame = 0;
  const place = () => {
    frame = 0;
    if (!floating.matches(":popover-open")) return;
    const a = anchor.getBoundingClientRect();
    const f = floating.getBoundingClientRect();
    const rtl = getComputedStyle(anchor).direction === "rtl";
    const pos = computePosition(a, f, {
      placement: current(),
      offset: offsetOf(floating),
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      rtl,
    });
    const s = floating.style;
    s.setProperty("position", "fixed");
    s.setProperty("inset", "auto");
    s.setProperty("margin", "0");
    s.setProperty("left", `${pos.left}px`);
    s.setProperty("top", `${pos.top}px`);
    floating.setAttribute("data-side", pos.side);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(place);
  };
  const onToggle = (event) => {
    if (event.newState === "open") {
      place();
      addEventListener("scroll", schedule, { capture: true, passive: true });
      addEventListener("resize", schedule, { passive: true });
    } else {
      removeEventListener("scroll", schedule, { capture: true });
      removeEventListener("resize", schedule);
    }
  };
  floating.addEventListener("toggle", onToggle);
  return () => {
    floating.removeEventListener("toggle", onToggle);
    removeEventListener("scroll", schedule, { capture: true });
    removeEventListener("resize", schedule);
    if (frame) cancelAnimationFrame(frame);
  };
}
