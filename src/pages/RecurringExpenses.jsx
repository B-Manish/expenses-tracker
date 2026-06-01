import { CalendarClock, Edit3, PlusCircle, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SelectControl from "../components/SelectControl.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { ApiError, api } from "../services/api.js";
import { formatCategoryLabel } from "../utils/categories.js";
import { formatCurrencyFromPaise, paiseToRupeesInputValue } from "../utils/currency.js";
import {
  getErrorMessage,
  getFirstValidationError,
  validateRecurringExpenseForm,
} from "../utils/validation.js";

const EMPTY_FORM = {
  amount: "",
  billingDay: "1",
  categoryId: "",
  frequency: "MONTHLY",
  isActive: true,
  notes: "",
  title: "",
};
const FREQUENCY_OPTIONS = [
  { label: "Monthly", value: "MONTHLY" },
];

function recurringExpenseToFormValues(expense) {
  return {
    amount: paiseToRupeesInputValue(expense?.amountPaise),
    billingDay: expense?.billingDay ? String(expense.billingDay) : "1",
    categoryId: expense?.categoryId ? String(expense.categoryId) : "",
    frequency: expense?.frequency || "MONTHLY",
    isActive: expense?.isActive ?? true,
    notes: expense?.notes || "",
    title: expense?.title || "",
  };
}

function trimOrNull(value) {
  const trimmed = value.trim();

  return trimmed || null;
}

function buildPayload(values) {
  return {
    amount: values.amount.trim(),
    billingDay: Number(values.billingDay),
    categoryId: Number(values.categoryId),
    frequency: "MONTHLY",
    isActive: Boolean(values.isActive),
    notes: trimOrNull(values.notes),
    title: values.title.trim(),
  };
}

function dueText(day) {
  return `Due on day ${day}`;
}

export default function RecurringExpenses() {
  const navigate = useNavigate();
  const [state, setState] = useState({
    categories: [],
    data: null,
    error: "",
    status: "loading",
  });
  const [formState, setFormState] = useState({
    editingId: null,
    errors: {},
    message: "",
    status: "idle",
    values: EMPTY_FORM,
  });
  const [deleteState, setDeleteState] = useState({
    error: "",
    expense: null,
    status: "idle",
  });
  const [notice, setNotice] = useState("");

  const handleAuthError = useCallback((error) => {
    if (error instanceof ApiError && error.status === 401) {
      navigate("/login", {
        replace: true,
        state: { notice: "Please log in again to manage recurring expenses." },
      });
      return true;
    }

    return false;
  }, [navigate]);

  const loadPageData = useCallback(async (options = {}) => {
    if (!options.silent) {
      setState((current) => ({
        ...current,
        error: "",
        status: "loading",
      }));
    }

    try {
      const [recurringExpenses, categories] = await Promise.all([
        api.getRecurringExpenses(),
        api.getCategories({ type: "EXPENSE" }),
      ]);

      setState({
        categories: categories?.items || [],
        data: recurringExpenses,
        error: "",
        status: "ready",
      });
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }

      setState({
        categories: [],
        data: null,
        error: getErrorMessage(error),
        status: "error",
      });
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const items = useMemo(() => state.data?.items || [], [state.data]);
  const activeTotalPaise = useMemo(
    () => items
      .filter((expense) => expense.isActive)
      .reduce((total, expense) => total + Number(expense.amountPaise || 0), 0),
    [items],
  );
  const categoryOptions = useMemo(() => [
    { label: "Choose category", value: "" },
    ...state.categories.map((category) => ({
      label: formatCategoryLabel(category),
      value: String(category.id),
    })),
  ], [state.categories]);
  const isSubmitting = formState.status === "submitting";

  function resetForm(message = "") {
    setFormState({
      editingId: null,
      errors: {},
      message,
      status: "idle",
      values: EMPTY_FORM,
    });
  }

  function updateFormField(field, value) {
    setFormState((current) => ({
      ...current,
      errors: {
        ...current.errors,
        [field]: "",
      },
      message: "",
      values: {
        ...current.values,
        [field]: value,
      },
    }));
  }

  function startEdit(expense) {
    setNotice("");
    setFormState({
      editingId: expense.id,
      errors: {},
      message: "",
      status: "idle",
      values: recurringExpenseToFormValues(expense),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateRecurringExpenseForm(formState.values, {
      categories: state.categories,
    });

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
      const payload = buildPayload(formState.values);

      if (formState.editingId) {
        await api.updateRecurringExpense(formState.editingId, payload);
        setNotice("Recurring expense updated.");
      } else {
        await api.createRecurringExpense(payload);
        setNotice("Recurring expense added.");
      }

      resetForm();
      await loadPageData({ silent: true });
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

  async function confirmDeactivate() {
    const expense = deleteState.expense;

    if (!expense) {
      return;
    }

    setDeleteState((current) => ({
      ...current,
      error: "",
      status: "submitting",
    }));

    try {
      await api.deleteRecurringExpense(expense.id);
      setDeleteState({
        error: "",
        expense: null,
        status: "idle",
      });
      setNotice("Recurring expense deactivated.");
      await loadPageData({ silent: true });

      if (formState.editingId === expense.id) {
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
    return <LoadingState title="Loading recurring expenses" message="Fetching fixed monthly expenses." />;
  }

  if (state.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          actionLabel="Reload"
          message={state.error}
          onRetry={loadPageData}
          title="Recurring expenses unavailable"
        />
      </section>
    );
  }

  return (
    <section className="page-section" aria-labelledby="recurring-expenses-title">
      <PageHeader
        eyebrow="Fixed monthly costs"
        title="Recurring expenses"
        titleId="recurring-expenses-title"
        description="Track subscriptions, rent, bills, and other predictable monthly costs."
      />

      {notice ? (
        <p className="success-message" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </p>
      ) : null}

      <div className="summary-grid recurring-summary-grid">
        <section className="summary-card expense">
          <div className="summary-card-header">
            <p>Active monthly fixed expenses</p>
            <span className="summary-card-icon" aria-hidden="true">
              <CalendarClock size={18} />
            </span>
          </div>
          <strong>{formatCurrencyFromPaise(activeTotalPaise)}</strong>
          <span className="summary-card-detail">
            {items.filter((expense) => expense.isActive).length} active of {items.length} total
          </span>
        </section>
      </div>

      <section className="panel" aria-labelledby="recurring-form-title">
        <div className="panel-header">
          <div>
            <h2 id="recurring-form-title">
              {formState.editingId ? "Edit recurring expense" : "Add recurring expense"}
            </h2>
            <p>Active monthly entries are included in dashboard totals automatically.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-form-grid">
            <label className="form-field">
              <span>Name</span>
              <Input
                autoComplete="off"
                disabled={isSubmitting}
                maxLength={120}
                onChange={(event) => updateFormField("title", event.target.value)}
                placeholder="Wi-Fi"
                required
                type="text"
                value={formState.values.title}
              />
              {formState.errors.title ? <span className="field-error">{formState.errors.title}</span> : null}
            </label>

            <label className="form-field">
              <span>Amount</span>
              <Input
                autoComplete="off"
                disabled={isSubmitting}
                inputMode="decimal"
                onChange={(event) => updateFormField("amount", event.target.value)}
                placeholder="999"
                required
                type="text"
                value={formState.values.amount}
              />
              {formState.errors.amount ? <span className="field-error">{formState.errors.amount}</span> : null}
            </label>

            <label className="form-field">
              <span>Category</span>
              <SelectControl
                disabled={isSubmitting || state.categories.length === 0}
                onChange={(value) => updateFormField("categoryId", value)}
                options={categoryOptions}
                placeholder="Choose category"
                value={formState.values.categoryId}
              />
              {state.categories.length === 0 ? <span className="field-hint">No expense categories returned.</span> : null}
              {formState.errors.categoryId ? <span className="field-error">{formState.errors.categoryId}</span> : null}
            </label>

            <label className="form-field">
              <span>Billing day</span>
              <Input
                disabled={isSubmitting}
                max="31"
                min="1"
                onChange={(event) => updateFormField("billingDay", event.target.value)}
                required
                type="number"
                value={formState.values.billingDay}
              />
              {formState.errors.billingDay ? <span className="field-error">{formState.errors.billingDay}</span> : null}
            </label>

            <label className="form-field">
              <span>Frequency</span>
              <SelectControl
                disabled={isSubmitting}
                onChange={(value) => updateFormField("frequency", value)}
                options={FREQUENCY_OPTIONS}
                value={formState.values.frequency}
              />
              {formState.errors.frequency ? <span className="field-error">{formState.errors.frequency}</span> : null}
            </label>

            <label className="form-field checkbox-field">
              <span>Status</span>
              <label className="checkbox-inline">
                <input
                  checked={formState.values.isActive}
                  disabled={isSubmitting}
                  onChange={(event) => updateFormField("isActive", event.target.checked)}
                  type="checkbox"
                />
                Active
              </label>
            </label>
          </div>

          <label className="form-field">
            <span>Notes</span>
            <textarea
              disabled={isSubmitting}
              maxLength={1000}
              onChange={(event) => updateFormField("notes", event.target.value)}
              placeholder="Optional notes"
              rows={4}
              value={formState.values.notes}
            />
            <span className="field-hint">{formState.values.notes.length}/1000 characters</span>
            {formState.errors.notes ? <span className="field-error">{formState.errors.notes}</span> : null}
          </label>

          {formState.message ? <p className="form-error" role="alert">{formState.message}</p> : null}

          <div className="form-actions">
            {formState.editingId ? (
              <Button
                disabled={isSubmitting}
                onClick={() => resetForm()}
                type="button"
                variant="outline"
              >
                <X size={18} aria-hidden="true" />
                Cancel edit
              </Button>
            ) : null}
            <Button disabled={isSubmitting} type="submit">
              {formState.editingId ? <Save size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
              {isSubmitting ? "Saving" : formState.editingId ? "Save recurring expense" : "Add recurring expense"}
            </Button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="recurring-list-title">
        <div className="panel-header">
          <div>
            <h2 id="recurring-list-title">Fixed monthly expenses</h2>
            <p>{items.length} saved recurring expense{items.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        {items.length ? (
          <ul className="item-list">
            {items.map((expense) => (
              <li className={expense.isActive ? "list-row recurring-row" : "list-row recurring-row inactive-row"} key={expense.id}>
                <div className="list-icon" aria-hidden="true">
                  <CalendarClock size={18} />
                </div>
                <div className="list-content">
                  <strong>{expense.title}</strong>
                  <span>
                    {dueText(expense.billingDay)}
                    {expense.categoryName ? ` - ${expense.categoryName}` : ""}
                    {expense.isActive ? "" : " - inactive"}
                  </span>
                </div>
                <span className="amount expense-text">{formatCurrencyFromPaise(expense.amountPaise)}</span>
                <div className="row-actions">
                  <Button
                    aria-label={`Edit ${expense.title}`}
                    onClick={() => startEdit(expense)}
                    size="icon"
                    title={`Edit ${expense.title}`}
                    type="button"
                    variant="outline"
                  >
                    <Edit3 size={16} aria-hidden="true" />
                  </Button>
                  {expense.isActive ? (
                    <Button
                      aria-label={`Deactivate ${expense.title}`}
                      className="danger-icon-button"
                      onClick={() => setDeleteState({
                        error: "",
                        expense,
                        status: "idle",
                      })}
                      size="icon"
                      title={`Deactivate ${expense.title}`}
                      type="button"
                      variant="outline"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            action={<CalendarClock size={22} aria-hidden="true" />}
            message="Add rent, subscriptions, memberships, and other fixed monthly costs once."
            title="No recurring expenses yet"
          />
        )}
      </section>

      <ConfirmDialog
        confirmLabel="Deactivate"
        error={deleteState.error}
        isBusy={deleteState.status === "submitting"}
        message={deleteState.expense ? `Deactivate "${deleteState.expense.title}"? It will stop counting in monthly totals.` : ""}
        onCancel={() => setDeleteState({
          error: "",
          expense: null,
          status: "idle",
        })}
        onConfirm={confirmDeactivate}
        open={Boolean(deleteState.expense)}
        title="Deactivate recurring expense"
      />
    </section>
  );
}
