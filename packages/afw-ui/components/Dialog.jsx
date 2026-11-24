// Dialog — a modal on the native <dialog>, opened with `showModal()`.
//
//   <Dialog>
//     <DialogTrigger>Delete project</DialogTrigger>
//     <DialogContent role="alertdialog" closedby="none">
//       <DialogTitle>Delete this project?</DialogTitle>
//       <DialogDescription>Its pages and history are removed.</DialogDescription>
//       <DialogClose autofocus>Keep it</DialogClose>
//       <DialogClose value="delete">Delete</DialogClose>
//     </DialogContent>
//   </Dialog>
//
// The browser provides the modal behavior: the page goes inert, focus is contained and
// returns to the trigger, `Esc` and the back gesture close it, and it renders in the top
// layer with a `::backdrop`. So there is no role="dialog", no aria-modal and no focus
// trap here. The trigger is an invoker (`commandfor` + `command="show-modal"`), so it
// opens from the server HTML before hydration where invoker commands exist.
//
// State: uncontrolled by default (`defaultOpen`), or controlled with `open` +
// `onOpenChange(open, returnValue)`. `returnValue` is the closing button's `value`
// ("" when dismissed with Esc, light dismiss, or no value).

import { ContextProvider, createContext } from "@opentf/afw";
import { invoker } from "../internal/invoke.js";
import { supportsClosedBy } from "../internal/support.js";

const DialogContext = createContext(null);

export function Dialog({ open, defaultOpen = false, onOpenChange, children }) {
  const contentId = $id();
  const titleId = $id();
  const descriptionId = $id();
  let internal = $state(defaultOpen);

  const api = {
    contentId,
    titleId,
    descriptionId,
    isOpen: () => (open === undefined || open === null ? internal : Boolean(open)),
    setOpen: (next, returnValue = "") => {
      internal = next;
      onOpenChange?.(next, returnValue);
    },
  };

  return (
    <ContextProvider context={DialogContext} value={api}>
      {children}
    </ContextProvider>
  );
}

export function DialogTrigger({ children, ...rest }) {
  const dialog = $context(DialogContext);
  const button = $ref();
  onMount(() => invoker(button));
  return (
    <button
      {...rest}
      ref={button}
      type="button"
      class={["afw-ui-dialog-trigger", rest.class]}
      commandfor={dialog?.contentId}
      command="show-modal"
      aria-haspopup="dialog"
    >
      {children}
    </button>
  );
}

// Light dismiss where `closedby` is missing: close on a press *and* release outside the
// dialog's box (a text-selection drag that ends on the backdrop must not dismiss).
function lightDismiss(dialog) {
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  const down = (e) => (pressedOutside = outside(e));
  const up = (e) => {
    if (pressedOutside && outside(e) && dialog.getAttribute("closedby") === "any") dialog.close();
    pressedOutside = false;
  };
  dialog.addEventListener("pointerdown", down);
  dialog.addEventListener("pointerup", up);
  return () => {
    dialog.removeEventListener("pointerdown", down);
    dialog.removeEventListener("pointerup", up);
  };
}

export function DialogContent({ closedby = "closerequest", children, ...rest }) {
  const dialog = $context(DialogContext);
  const el = $ref();

  // Controlled/uncontrolled state → the element. Opening always goes through
  // `showModal()` (never `show()` or the `open` attribute), so it is a true modal.
  $effect(() => {
    if (!el || !dialog) return;
    const want = dialog.isOpen();
    if (want && !el.open) el.showModal();
    else if (!want && el.open) el.close();
  });

  onMount(() => {
    // The element → state, whatever opened or closed it (the trigger's invoker, Esc,
    // light dismiss, a close button, script).
    const sync = new MutationObserver(() => {
      if (!dialog || el.open === dialog.isOpen()) return;
      dialog.setOpen(el.open, el.open ? "" : el.returnValue);
      if (!el.open) el.returnValue = ""; // browsers differ on clearing it; never leak a stale one
    });
    sync.observe(el, { attributes: true, attributeFilter: ["open"] });

    // `closedby="none"`: only the developer closes it. Keep the guard in `cancel` too, so
    // Esc cannot close it where `closedby` is unsupported.
    const onCancel = (e) => el.getAttribute("closedby") === "none" && e.preventDefault();
    el.addEventListener("cancel", onCancel);

    const stopDismiss = supportsClosedBy() ? null : lightDismiss(el);

    // Describe the dialog by its description only when one is rendered.
    if (dialog && el.querySelector(`[id="${dialog.descriptionId}"]`)) {
      el.setAttribute("aria-describedby", dialog.descriptionId);
    }
    return () => {
      sync.disconnect();
      el.removeEventListener("cancel", onCancel);
      stopDismiss?.();
    };
  });

  return (
    <dialog
      {...rest}
      ref={el}
      id={dialog?.contentId}
      class={["afw-ui-dialog", rest.class]}
      aria-labelledby={dialog?.titleId}
      closedby={closedby}
    >
      {children}
    </dialog>
  );
}

export function DialogTitle({ children, ...rest }) {
  const dialog = $context(DialogContext);
  return (
    <h2 {...rest} id={dialog?.titleId} class={["afw-ui-dialog-title", rest.class]}>
      {children}
    </h2>
  );
}

export function DialogDescription({ children, ...rest }) {
  const dialog = $context(DialogContext);
  return (
    <p {...rest} id={dialog?.descriptionId} class={["afw-ui-dialog-description", rest.class]}>
      {children}
    </p>
  );
}

// `value` becomes the dialog's `returnValue`. `command="request-close"` fires `cancel`
// first (an unsaved-changes guard can keep it open); plain `close` does not.
export function DialogClose({ children, ...rest }) {
  const dialog = $context(DialogContext);
  const button = $ref();
  onMount(() => invoker(button));
  return (
    <button
      {...rest}
      ref={button}
      type="button"
      class={["afw-ui-dialog-close", rest.class]}
      commandfor={dialog?.contentId}
      command="close"
    >
      {children}
    </button>
  );
}
