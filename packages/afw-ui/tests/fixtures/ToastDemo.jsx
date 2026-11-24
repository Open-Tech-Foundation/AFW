import { Toaster } from "../../components/Toast.jsx";
import { Dialog, DialogContent, DialogTitle } from "../../components/Dialog.jsx";

export function Page() {
  return (
    <div>
      <button data-testid="origin">Save</button>
      <Toaster label="Notifications" />
      <Dialog>
        <DialogContent data-testid="modal"><DialogTitle>Modal</DialogTitle></DialogContent>
      </Dialog>
    </div>
  );
}
