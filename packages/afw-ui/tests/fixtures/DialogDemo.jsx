// Test fixtures for <Dialog>: uncontrolled, controlled, and the close variants.
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../../components/Dialog.jsx";

export function Basic() {
  return (
    <Dialog>
      <DialogTrigger data-testid="trigger">Delete</DialogTrigger>
      <DialogContent data-testid="dialog" closedby="any">
        <DialogTitle>Delete this project?</DialogTitle>
        <DialogDescription>Its pages are removed.</DialogDescription>
        <DialogClose autofocus>Keep it</DialogClose>
        <DialogClose value="delete">Delete</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function NoDescription() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent data-testid="dialog" role="alertdialog" closedby="none">
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogClose>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

export function Controlled(props) {
  let open = $state(false);
  return (
    <div>
      <button data-testid="external" onclick={() => (open = true)}>Open from outside</button>
      <span data-testid="state">{open ? "open" : "closed"}</span>
      <Dialog open={open} onOpenChange={(next, value) => { open = next; props.log?.(next, value); }}>
        <DialogContent data-testid="dialog">
          <DialogTitle>Controlled</DialogTitle>
          <DialogClose value="ok">OK</DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// A consumer passing its own id/class must not break the wiring or the theme hook.
export function ConsumerAttrs() {
  return (
    <Dialog>
      <DialogTrigger class="mine" commandfor="elsewhere">Open</DialogTrigger>
      <DialogContent id="my-dialog" class="wide" data-testid="dialog">
        <DialogTitle>Named</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}
