import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef } from "react";

export default function ConfirmDialog({
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
  const cancelButtonRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previouslyFocusedElement = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isBusy) {
        onCancel?.();
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const focusable = Array.from(focusableElements || []);

      if (!focusable.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);

      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, [isBusy, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={isBusy ? undefined : onCancel}>
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="dialog-panel"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="dialog-header">
          <div className="dialog-icon" aria-hidden="true">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h2 id="confirm-dialog-title">{title}</h2>
            <p>{message}</p>
          </div>
          <button
            aria-label="Close confirmation"
            className="icon-button"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="dialog-actions">
          <button
            className="button secondary-button"
            disabled={isBusy}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button className="button danger-button" disabled={isBusy} onClick={onConfirm} type="button">
            {isBusy ? "Deleting" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
