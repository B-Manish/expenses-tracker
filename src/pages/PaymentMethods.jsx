import { CreditCard, Edit3, PlusCircle, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ApiError, api } from "../services/api.js";
import {
  getErrorMessage,
  getFirstValidationError,
  validatePaymentMethodForm,
} from "../utils/validation.js";

const EMPTY_PAYMENT_METHOD_FORM = {
  name: "",
};

function buildPaymentMethodPayload(values) {
  return {
    name: values.name.trim(),
  };
}

export default function PaymentMethods() {
  const navigate = useNavigate();
  const [state, setState] = useState({
    data: null,
    error: "",
    status: "loading",
  });
  const [formState, setFormState] = useState({
    editingId: null,
    errors: {},
    message: "",
    status: "idle",
    values: EMPTY_PAYMENT_METHOD_FORM,
  });
  const [deleteState, setDeleteState] = useState({
    error: "",
    method: null,
    status: "idle",
  });
  const [notice, setNotice] = useState("");

  const handleAuthError = useCallback((error) => {
    if (error instanceof ApiError && error.status === 401) {
      navigate("/login", {
        replace: true,
        state: { notice: "Please log in again to manage payment methods." },
      });
      return true;
    }

    return false;
  }, [navigate]);

  const loadPaymentMethods = useCallback(async (options = {}) => {
    if (!options.silent) {
      setState((current) => ({
        ...current,
        error: "",
        status: "loading",
      }));
    }

    try {
      const data = await api.getPaymentMethods();

      setState({
        data,
        error: "",
        status: "ready",
      });
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }

      setState({
        data: null,
        error: getErrorMessage(error),
        status: "error",
      });
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  const isSubmitting = formState.status === "submitting";
  const items = state.data?.items || [];

  function resetForm(message = "") {
    setFormState({
      editingId: null,
      errors: {},
      message,
      status: "idle",
      values: EMPTY_PAYMENT_METHOD_FORM,
    });
  }

  function updateName(value) {
    setFormState((current) => ({
      ...current,
      errors: {
        ...current.errors,
        name: "",
      },
      message: "",
      values: {
        name: value,
      },
    }));
  }

  function startEdit(method) {
    setNotice("");
    setFormState({
      editingId: method.id,
      errors: {},
      message: "",
      status: "idle",
      values: {
        name: method.name || "",
      },
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validatePaymentMethodForm(formState.values);

    if (!validation.isValid) {
      setFormState((current) => ({
        ...current,
        errors: validation.errors,
        message: getFirstValidationError(validation.errors),
      }));
      return;
    }

    setFormState((current) => ({
      ...current,
      errors: {},
      message: "",
      status: "submitting",
    }));

    try {
      const payload = buildPaymentMethodPayload(formState.values);

      if (formState.editingId) {
        await api.updatePaymentMethod(formState.editingId, payload);
        setNotice("Payment method updated.");
      } else {
        await api.createPaymentMethod(payload);
        setNotice("Payment method added.");
      }

      resetForm();
      await loadPaymentMethods({ silent: true });
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }

      setFormState((current) => ({
        ...current,
        message: getErrorMessage(error),
        status: "idle",
      }));
    }
  }

  async function confirmDelete() {
    const method = deleteState.method;

    if (!method) {
      return;
    }

    setDeleteState((current) => ({
      ...current,
      error: "",
      status: "submitting",
    }));

    try {
      await api.deletePaymentMethod(method.id);
      setDeleteState({
        error: "",
        method: null,
        status: "idle",
      });
      setNotice("Payment method deleted.");
      await loadPaymentMethods({ silent: true });

      if (formState.editingId === method.id) {
        resetForm();
      }
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }

      setDeleteState((current) => ({
        ...current,
        error: getErrorMessage(error),
        status: "idle",
      }));
    }
  }

  if (state.status === "loading") {
    return <LoadingState title="Loading payment methods" message="Fetching payment options." />;
  }

  if (state.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          title="Payment methods unavailable"
          message={state.error}
          actionLabel="Reload"
          onRetry={loadPaymentMethods}
        />
      </section>
    );
  }

  return (
    <section className="page-section narrow-section" aria-labelledby="payment-methods-title">
      <PageHeader
        eyebrow="Setup"
        title="Payment methods"
        titleId="payment-methods-title"
        description="Keep cards, cash, UPI, and other payment labels consistent."
      />

      {notice ? (
        <p className="success-message" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </p>
      ) : null}

      <section className="panel" aria-labelledby="payment-method-form-title">
        <div className="panel-header">
          <div>
            <h2 id="payment-method-form-title">
              {formState.editingId ? "Edit custom payment method" : "Add custom payment method"}
            </h2>
            <p>Default payment methods stay read-only; custom unused methods can be removed.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Name</span>
            <input
              autoComplete="off"
              disabled={isSubmitting}
              maxLength={80}
              onChange={(event) => updateName(event.target.value)}
              placeholder="PhonePe"
              required
              type="text"
              value={formState.values.name}
            />
            {formState.errors.name ? <span className="field-error">{formState.errors.name}</span> : null}
          </label>

          {formState.message ? <p className="form-error" role="alert">{formState.message}</p> : null}

          <div className="form-actions">
            {formState.editingId ? (
              <button
                className="button secondary-button"
                disabled={isSubmitting}
                onClick={() => resetForm()}
                type="button"
              >
                <X size={18} aria-hidden="true" />
                Cancel edit
              </button>
            ) : null}
            <button className="button primary-button" disabled={isSubmitting} type="submit">
              {formState.editingId ? <Save size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
              {isSubmitting ? "Saving" : formState.editingId ? "Save method" : "Add method"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        {items.length ? (
          <ul className="item-list">
            {items.map((method) => (
              <li className="list-row" key={method.id}>
                <div className="list-icon" aria-hidden="true">
                  <CreditCard size={18} />
                </div>
                <div className="list-content">
                  <strong>{method.name}</strong>
                  <span>{method.isDefault ? "Default method" : "Custom method"}</span>
                </div>
                <div className="row-actions">
                  {method.isDefault ? (
                    <span className="default-pill">Default</span>
                  ) : (
                    <>
                      <button
                        aria-label={`Edit ${method.name}`}
                        className="icon-button"
                        onClick={() => startEdit(method)}
                        title={`Edit ${method.name}`}
                        type="button"
                      >
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      <button
                        aria-label={`Delete ${method.name}`}
                        className="icon-button danger-icon-button"
                        onClick={() => setDeleteState({
                          error: "",
                          method,
                          status: "idle",
                        })}
                        title={`Delete ${method.name}`}
                        type="button"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No payment methods"
            message="Create a custom payment method for manual tracking."
            action={<CreditCard size={22} aria-hidden="true" />}
          />
        )}
      </section>

      <ConfirmDialog
        confirmLabel="Delete payment method"
        error={deleteState.error}
        isBusy={deleteState.status === "submitting"}
        message={deleteState.method ? `Delete "${deleteState.method.name}"? Used payment methods cannot be deleted.` : ""}
        onCancel={() => setDeleteState({
          error: "",
          method: null,
          status: "idle",
        })}
        onConfirm={confirmDelete}
        open={Boolean(deleteState.method)}
        title="Delete payment method"
      />
    </section>
  );
}
