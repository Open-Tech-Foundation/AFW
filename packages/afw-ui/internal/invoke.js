// Our fallback for invoker commands. Triggers are rendered with `commandfor` + `command`,
// so in supporting browsers they work from the server HTML before any script runs, and
// the browser gives the popover its implicit anchor and light-dismiss relationship. Where
// the API is missing, the same click runs the command here.

import { supportsInvokers } from "./support.js";

/** Open a popover anchored to `source` (the implicit anchor and light-dismiss owner). */
export function showPopoverFrom(popover, source) {
  if (popover.matches(":popover-open")) return;
  try {
    popover.showPopover({ source });
  } catch {
    popover.showPopover(); // an engine without the `source` option
  }
}

/** Run `command` (an invoker command name) on `target`, as the browser would for `source`. */
export function runCommand(command, target, source) {
  switch (command) {
    case "show-modal":
      if (!target.open) target.showModal();
      break;
    case "close":
      // The button's `value` becomes the dialog's `returnValue`, as with a native invoker.
      if (target.open) source?.value ? target.close(source.value) : target.close();
      break;
    case "request-close":
      if (!target.open) break;
      if (typeof target.requestClose === "function") target.requestClose();
      else if (target.dispatchEvent(new Event("cancel", { cancelable: true }))) target.close();
      break;
    case "show-popover":
      showPopoverFrom(target, source);
      break;
    case "hide-popover":
      if (target.matches(":popover-open")) target.hidePopover();
      break;
    case "toggle-popover":
      if (target.matches(":popover-open")) target.hidePopover();
      else showPopoverFrom(target, source);
      break;
  }
}

/**
 * Make `button`'s `commandfor`/`command` work where invoker commands are missing.
 * Returns a cleanup. A no-op (beyond the listener) where the browser supports them.
 */
export function invoker(button) {
  const onClick = (event) => {
    if (supportsInvokers() || event.defaultPrevented) return;
    const target = button.getRootNode().getElementById?.(button.getAttribute("commandfor"));
    const command = button.getAttribute("command");
    if (!target || !command) return;
    // An engine that runs commands without exposing the API would run this one too.
    event.preventDefault();
    runCommand(command, target, button);
  };
  button.addEventListener("click", onClick);
  return () => button.removeEventListener("click", onClick);
}
