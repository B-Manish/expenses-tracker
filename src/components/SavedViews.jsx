import { Bookmark, Save, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../services/api.js";
import { getErrorMessage } from "../utils/validation.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import SelectControl from "./SelectControl.jsx";
import { Button } from "./ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.jsx";
import { Input } from "./ui/input.jsx";

const MATCH_KEYS = [
  "type",
  "source",
  "categoryId",
  "uncategorized",
  "paymentMethodId",
  "from",
  "to",
  "search",
  "minAmount",
  "maxAmount",
  "sort",
];

function asText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function viewMatchesFilters(view, filters) {
  return MATCH_KEYS.every((key) => asText(view.filters?.[key]) === asText(filters[key]));
}

const CLOSED_DIALOG = { open: false, mode: "save", viewId: null, name: "", isDefault: false, busy: false, error: "" };

export default function SavedViews({ canApplyDefault = false, currentFilters, onApply, onAuthError }) {
  const [state, setState] = useState({ items: [], status: "loading", error: "" });
  const [dialog, setDialog] = useState(CLOSED_DIALOG);
  const [deleteState, setDeleteState] = useState({ view: null, busy: false, error: "" });
  const autoAppliedRef = useRef(false);

  const handleError = useCallback((error, fallbackSetter) => {
    if (error instanceof ApiError && error.status === 401 && onAuthError) {
      onAuthError(error);
      return true;
    }

    fallbackSetter(getErrorMessage(error));
    return false;
  }, [onAuthError]);

  const load = useCallback(() => {
    setState((current) => ({ ...current, status: "loading", error: "" }));

    api.getSavedViews()
      .then((data) => setState({ items: data?.items || [], status: "ready", error: "" }))
      .catch((error) => {
        handleError(error, (message) => setState({ items: [], status: "error", error: message }));
      });
  }, [handleError]);

  // Initial state is already "loading"; only the async result updates state.
  useEffect(() => {
    let isCurrent = true;

    api.getSavedViews()
      .then((data) => {
        if (isCurrent) {
          setState({ items: data?.items || [], status: "ready", error: "" });
        }
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        handleError(error, (message) => setState({ items: [], status: "error", error: message }));
      });

    return () => {
      isCurrent = false;
    };
  }, [handleError]);

  // Apply the user's default view once, only when arriving without filters.
  useEffect(() => {
    if (state.status !== "ready" || autoAppliedRef.current) {
      return;
    }

    autoAppliedRef.current = true;

    if (!canApplyDefault) {
      return;
    }

    const defaultView = state.items.find((view) => view.isDefault);

    if (defaultView) {
      onApply({ ...defaultView.filters, offset: "0" }, { replace: true });
    }
  }, [state.status, state.items, canApplyDefault, onApply]);

  const activeView = state.items.find((view) => viewMatchesFilters(view, currentFilters)) || null;

  const viewOptions = [
    { label: state.items.length ? "Choose a saved view" : "No saved views", value: "" },
    ...state.items.map((view) => ({
      label: view.isDefault ? `${view.name} (default)` : view.name,
      value: String(view.id),
    })),
  ];

  function applyView(value) {
    const view = state.items.find((item) => String(item.id) === value);

    if (view) {
      onApply({ ...view.filters, offset: "0" });
    }
  }

  function openSaveDialog() {
    setDialog({ ...CLOSED_DIALOG, open: true, mode: "save", isDefault: false });
  }

  function openRenameDialog() {
    if (!activeView) {
      return;
    }

    setDialog({
      ...CLOSED_DIALOG,
      open: true,
      mode: "rename",
      viewId: activeView.id,
      name: activeView.name,
      isDefault: activeView.isDefault,
    });
  }

  function closeDialog() {
    if (!dialog.busy) {
      setDialog(CLOSED_DIALOG);
    }
  }

  async function submitDialog(event) {
    event.preventDefault();

    const name = dialog.name.trim();

    if (!name) {
      setDialog((current) => ({ ...current, error: "Enter a name for this view." }));
      return;
    }

    if (name.length > 80) {
      setDialog((current) => ({ ...current, error: "Name must be 80 characters or less." }));
      return;
    }

    setDialog((current) => ({ ...current, busy: true, error: "" }));

    try {
      if (dialog.mode === "rename") {
        await api.updateSavedView(dialog.viewId, { name, isDefault: dialog.isDefault });
      } else {
        await api.createSavedView({ name, isDefault: dialog.isDefault, filters: currentFilters });
      }

      setDialog(CLOSED_DIALOG);
      load();
    } catch (error) {
      const handled = handleError(error, (message) =>
        setDialog((current) => ({ ...current, busy: false, error: message })),
      );

      if (handled) {
        setDialog(CLOSED_DIALOG);
      }
    }
  }

  async function toggleDefault() {
    if (!activeView) {
      return;
    }

    try {
      await api.updateSavedView(activeView.id, { isDefault: !activeView.isDefault });
      load();
    } catch (error) {
      handleError(error, (message) => setState((current) => ({ ...current, error: message })));
    }
  }

  async function confirmDelete() {
    const view = deleteState.view;

    if (!view) {
      return;
    }

    setDeleteState((current) => ({ ...current, busy: true, error: "" }));

    try {
      await api.deleteSavedView(view.id);
      setDeleteState({ view: null, busy: false, error: "" });
      load();
    } catch (error) {
      const handled = handleError(error, (message) =>
        setDeleteState((current) => ({ ...current, busy: false, error: message })),
      );

      if (handled) {
        setDeleteState({ view: null, busy: false, error: "" });
      }
    }
  }

  return (
    <section className="saved-views" aria-label="Saved views">
      <div className="saved-views-control">
        <Bookmark size={18} aria-hidden="true" />
        <SelectControl
          disabled={state.status !== "ready" || state.items.length === 0}
          onChange={applyView}
          options={viewOptions}
          placeholder="Saved views"
          value={activeView ? String(activeView.id) : ""}
        />
      </div>

      <div className="saved-views-actions">
        <Button onClick={openSaveDialog} size="sm" type="button" variant="outline">
          <Save size={16} aria-hidden="true" />
          Save view
        </Button>
        <Button
          disabled={!activeView}
          onClick={openRenameDialog}
          size="sm"
          type="button"
          variant="outline"
        >
          Rename
        </Button>
        <Button
          aria-pressed={Boolean(activeView?.isDefault)}
          disabled={!activeView}
          onClick={toggleDefault}
          size="sm"
          type="button"
          variant={activeView?.isDefault ? "default" : "outline"}
        >
          <Star size={16} aria-hidden="true" />
          {activeView?.isDefault ? "Default" : "Set default"}
        </Button>
        <Button
          className="danger-icon-button"
          disabled={!activeView}
          onClick={() => setDeleteState({ view: activeView, busy: false, error: "" })}
          size="sm"
          type="button"
          variant="outline"
        >
          <Trash2 size={16} aria-hidden="true" />
          Delete
        </Button>
      </div>

      {state.status === "error" ? (
        <p className="field-error" role="alert">
          {state.error}{" "}
          <button className="text-link" onClick={load} type="button">Retry</button>
        </p>
      ) : null}

      <Dialog open={dialog.open} onOpenChange={(next) => (next ? null : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.mode === "rename" ? "Rename saved view" : "Save current view"}</DialogTitle>
            <DialogDescription>
              {dialog.mode === "rename"
                ? "Update the name of this saved view."
                : "Save the current filters as a reusable view."}
            </DialogDescription>
          </DialogHeader>
          <form className="settings-form" onSubmit={submitDialog}>
            <label className="form-field">
              <span>Name</span>
              <Input
                autoFocus
                disabled={dialog.busy}
                maxLength={80}
                onChange={(event) => setDialog((current) => ({ ...current, name: event.target.value, error: "" }))}
                placeholder="e.g. Food this month"
                type="text"
                value={dialog.name}
              />
            </label>
            <label className="checkbox-inline">
              <input
                checked={dialog.isDefault}
                disabled={dialog.busy}
                onChange={(event) => setDialog((current) => ({ ...current, isDefault: event.target.checked }))}
                type="checkbox"
              />
              Make this my default view
            </label>
            {dialog.error ? <p className="form-error" role="alert">{dialog.error}</p> : null}
            <DialogFooter>
              <Button disabled={dialog.busy} onClick={closeDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={dialog.busy} type="submit">
                {dialog.busy ? "Saving" : "Save view"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Delete view"
        error={deleteState.error}
        isBusy={deleteState.busy}
        message={deleteState.view ? `Delete the "${deleteState.view.name}" view? This cannot be undone.` : ""}
        onCancel={() => setDeleteState({ view: null, busy: false, error: "" })}
        onConfirm={confirmDelete}
        open={Boolean(deleteState.view)}
        title="Delete saved view"
      />
    </section>
  );
}
