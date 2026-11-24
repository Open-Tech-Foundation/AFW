// Toast — short status messages in one named region, announced without moving focus.
//
//   // once, in the root layout:
//   <Toaster label="Notifications" />
//
//   // anywhere:
//   import { toast } from "@opentf/afw-ui";
//   toast("Project saved");
//   toast("Upload failed", { tone: "danger", title: "Report.pdf" });
//   toast("Copied", { duration: 4000 });
//
// - The region is a `popover="manual"` (it stays up while you work, and is never light
//   dismissed) with `role="region"` and a name, so assistive tech can find it again.
// - Each message is announced (`ariaNotify`, or a live region), text only.
// - Persistent by default: a toast stays until its Close button. `duration` dismisses it
//   after that many ms — paused while the pointer or focus is inside the region.
// - Closing the focused toast moves focus to the next one, or back where it came from.
// - While a modal <dialog> is open, new toasts wait: the page behind it is inert, so the
//   message would be missed. They show when the dialog closes.
// Never put the only copy of important information in a toast.

import { signal } from "@opentf/afw";
import { announce } from "../internal/announce.js";

const toasts = signal([]);
let nextId = 0;
const waiting = [];
let watchingModal = false;

const modalOpen = () => typeof document !== "undefined" && Boolean(document.querySelector("dialog:modal"));

function flushWhenModalCloses() {
  if (watchingModal) return;
  watchingModal = true;
  const onClose = () => {
    // `close` fires before `:modal` updates in some engines; check on the next task.
    setTimeout(() => {
      if (modalOpen()) return;
      document.removeEventListener("close", onClose, true);
      watchingModal = false;
      for (const t of waiting.splice(0)) show(t);
    });
  };
  document.addEventListener("close", onClose, true);
}

function show(t) {
  toasts.value = [...toasts.value, t];
  announce([t.title, t.message].filter(Boolean).join(". "), { priority: t.tone === "danger" ? "high" : "normal" });
}

/**
 * Show a toast. Returns its id (for `dismissToast`). Options: `title`, `tone`
 * ("info" | "success" | "warning" | "danger"), `duration` (ms; default: until closed).
 */
export function toast(message, { title, tone = "info", duration } = {}) {
  const t = { id: ++nextId, message, title, tone, duration };
  if (modalOpen()) {
    waiting.push(t);
    flushWhenModalCloses();
  } else show(t);
  return t.id;
}

/** Remove a toast by id. */
export function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

/** Remove every toast (tests, sign-out). */
export function clearToasts() {
  waiting.length = 0;
  toasts.value = [];
}

export function Toaster({ label = "Notifications", closeLabel = "Close" }) {
  const region = $ref();
  // The module store as a component signal, so the list below re-renders from it.
  const list = $derived(toasts.value);
  let returnFocus = null;
  let paused = false;
  const timers = new Map();

  const schedule = (t) => {
    if (!t.duration || timers.has(t.id)) return;
    timers.set(t.id, { left: t.duration, start: Date.now(), handle: setTimeout(() => dismissToast(t.id), t.duration) });
  };
  const pause = () => {
    if (paused) return;
    paused = true;
    for (const timer of timers.values()) {
      clearTimeout(timer.handle);
      timer.left -= Date.now() - timer.start;
    }
  };
  const resume = () => {
    if (!paused || region.matches(":hover") || region.contains(document.activeElement)) return;
    paused = false;
    for (const [id, timer] of timers) {
      timer.start = Date.now();
      timer.handle = setTimeout(() => dismissToast(id), Math.max(0, timer.left));
    }
  };

  // Show the region while it has toasts; time the ones with a duration.
  $effect(() => {
    const current = list;
    if (!region) return;
    for (const id of [...timers.keys()]) {
      if (!current.some((t) => t.id === id)) {
        clearTimeout(timers.get(id).handle);
        timers.delete(id);
      }
    }
    if (!paused) current.forEach(schedule);
    const shown = region.matches(":popover-open");
    if (current.length && !shown) region.showPopover();
    else if (!current.length && shown) region.hidePopover();
  });

  onMount(() => {
    // Where focus was before it entered the region: the last element focused outside it.
    const onDocFocusIn = (e) => {
      if (!region.contains(e.target)) returnFocus = e.target;
    };
    const onFocusIn = () => pause();
    document.addEventListener("focusin", onDocFocusIn, true);
    region.addEventListener("focusin", onFocusIn);
    region.addEventListener("pointerenter", pause);
    region.addEventListener("pointerleave", resume);
    region.addEventListener("focusout", () => queueMicrotask(resume));
    return () => {
      for (const timer of timers.values()) clearTimeout(timer.handle);
      document.removeEventListener("focusin", onDocFocusIn, true);
      region.removeEventListener("focusin", onFocusIn);
    };
  });

  // Close one; if it held focus, move to the next toast's Close, else back where it came from.
  const close = (id, event) => {
    const own = event.currentTarget;
    const had = own === document.activeElement || event.detail === 0;
    dismissToast(id);
    if (!had) return;
    queueMicrotask(() => {
      const next = [...region.querySelectorAll(".afw-ui-toast-close")].find((b) => b !== own && b.isConnected);
      if (next) next.focus();
      else if (returnFocus?.isConnected) returnFocus.focus();
    });
  };

  return (
    <div ref={region} popover="manual" role="region" aria-label={label} class="afw-ui-toaster">
      <ol class="afw-ui-toast-list">
        {list.map((t) => (
          <li key={t.id} class="afw-ui-toast" data-tone={t.tone}>
            <div class="afw-ui-toast-body">
              {t.title ? <p class="afw-ui-toast-title">{t.title}</p> : null}
              <p class="afw-ui-toast-message">{t.message}</p>
            </div>
            <button type="button" class="afw-ui-toast-close" aria-label={closeLabel} onclick={(e) => close(t.id, e)}>
              ×
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
