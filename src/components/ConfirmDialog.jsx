import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.jsx";

export default function ConfirmDialog({
  busyLabel = "",
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  error = "",
  isBusy = false,
  message,
  onCancel,
  onConfirm,
  open,
  title = "Are you sure?",
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isBusy) {
          onCancel?.();
        }
      }}
    >
      <DialogContent>
        <DialogHeader className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 space-y-0 pr-6">
          <div className="dialog-icon" aria-hidden="true">
            <AlertTriangle size={22} />
          </div>
          <div className="grid gap-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </div>
        </DialogHeader>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button
            disabled={isBusy}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <Button disabled={isBusy} onClick={onConfirm} type="button" variant="destructive">
            {isBusy ? busyLabel || confirmLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
