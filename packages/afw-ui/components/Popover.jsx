// Popover — a non-modal panel tethered to its trigger, on the native `popover`.
//
//   <Popover>
//     <PopoverTrigger>Filters</PopoverTrigger>
//     <PopoverContent placement="bottom-start" aria-label="Filters">…</PopoverContent>
//   </Popover>
//
// `popover="auto"` gives light dismiss (click outside, Esc), one open at a time, and focus
// returning to the trigger on Esc. The trigger is an invoker (`command="toggle-popover"`),
// which also makes it the popover's implicit anchor and keeps clicking it from counting as
// an outside click. The page stays interactive: for a blocking panel use <Dialog>.
//
// The trigger reports `aria-expanded`, kept in sync from the popover's `toggle` event
// (the popover is the source of truth: Esc, light dismiss or script can close it).
// Content is a plain container; give it a name (`aria-label`/`aria-labelledby`) and a
// `role` when it is more than plain content.

import { ContextProvider, createContext } from "@opentf/afw";
import { invoker } from "../internal/invoke.js";
import { tether } from "../internal/position.js";

const PopoverContext = createContext(null);

export function Popover({ open, defaultOpen = false, onOpenChange, children }) {
  const contentId = $id();
  const triggerId = $id();
  let internal = $state(defaultOpen);
  const api = {
    contentId,
    triggerId,
    isOpen: () => (open === undefined || open === null ? internal : Boolean(open)),
    setOpen: (next) => {
      internal = next;
      onOpenChange?.(next);
    },
  };
  return (
    <ContextProvider context={PopoverContext} value={api}>
      {children}
    </ContextProvider>
  );
}

export function PopoverTrigger({ children, ...rest }) {
  const popover = $context(PopoverContext);
  const button = $ref();
  onMount(() => invoker(button));
  return (
    <button
      {...rest}
      ref={button}
      id={popover?.triggerId}
      type="button"
      class={["afw-ui-popover-trigger", rest.class]}
      commandfor={popover?.contentId}
      command="toggle-popover"
      aria-expanded={popover?.isOpen() ? "true" : "false"}
    >
      {children}
    </button>
  );
}

export function PopoverContent({ placement = "bottom-start", mode = "auto", children, ...rest }) {
  const popover = $context(PopoverContext);
  const el = $ref();

  $effect(() => {
    if (!el || !popover) return;
    const want = popover.isOpen();
    const shown = el.matches(":popover-open");
    if (want && !shown) {
      const trigger = document.getElementById(popover.triggerId);
      try {
        el.showPopover(trigger ? { source: trigger } : undefined);
      } catch {
        el.showPopover();
      }
    } else if (!want && shown) el.hidePopover();
  });

  onMount(() => {
    const trigger = document.getElementById(popover?.triggerId);
    const stopTether = trigger ? tether(el, trigger, placement) : null;
    const onToggle = (event) => {
      const next = event.newState === "open";
      if (popover && next !== popover.isOpen()) popover.setOpen(next);
    };
    el.addEventListener("toggle", onToggle);
    return () => {
      stopTether?.();
      el.removeEventListener("toggle", onToggle);
    };
  });

  return (
    <div
      {...rest}
      ref={el}
      id={popover?.contentId}
      popover={mode}
      class={["afw-ui-popover", rest.class]}
      data-placement={placement}
    >
      {children}
    </div>
  );
}

export function PopoverClose({ children, ...rest }) {
  const popover = $context(PopoverContext);
  const button = $ref();
  onMount(() => invoker(button));
  return (
    <button
      {...rest}
      ref={button}
      type="button"
      class={["afw-ui-popover-close", rest.class]}
      commandfor={popover?.contentId}
      command="hide-popover"
    >
      {children}
    </button>
  );
}
