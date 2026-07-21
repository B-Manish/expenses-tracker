import { Edit3, PiggyBank, PlusCircle, Save, Target, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SelectControl from "../components/SelectControl.jsx";
import { Badge } from "../components/ui/badge.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { ApiError, api } from "../services/api.js";
import { useAuth } from "../services/auth.js";
import { formatCategoryLabel } from "../utils/categories.js";
import { formatCurrencyFromPaise, paiseToRupeesInputValue } from "../utils/currency.js";
import {
  getErrorMessage,
  getFirstValidationError,
  validateBudgetForm,
} from "../utils/validation.js";

const EMPTY_FORM = {
  amount: "",
  categoryId: "",
  period: "MONTHLY",
  isActive: true,
};
const STATUS_META = {
  under: { label: "On track", variant: "success" },
  near: { label: "Near limit", variant: "warning" },
  over: { label: "Over budget", variant: "destructive" },
};

function budgetToFormValues(budget) {
  return {
    amount: paiseToRupeesInputValue(budget?.amountPaise),
    categoryId: budget?.categoryId ? String(budget.categoryId) : "",
    period: budget?.period || "MONTHLY",
    isActive: budget?.isActive ?? true,
  };
}

function buildPayload(values) {
  return {
    amount: values.amount.trim(),
    categoryId: Number(values.categoryId),
    period: "MONTHLY",
    isActive: Boolean(values.isActive),
  };
}

function statusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.under;

  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function BudgetProgress({ budget }) {
  const width = `${Math.min(budget.percentUsed, 100)}%`;

  return (
    <div className="budget-progress">
      <div className="comparison-track" aria-hidden="true">
        <span className={`comparison-fill budget-fill ${budget.status}`} style={{ width }} />
      </div>
      <div className="budget-progress-meta">
        <span>{formatCurrencyFromPaise(budget.spentPaise)} spent</span>
        <span>{budget.percentUsed}% of {formatCurrencyFromPaise(budget.amountPaise)}</span>
      </div>
    </div>
  );
}

export default function Budgets() {
  const navigate = useNavigate();
  const { markUnauthenticated } = useAuth();
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
    budget: null,
    error: "",
    status: "idle",
  });
  const [notice, setNotice] = useState("");

  const handleAuthError = useCallback((error) => {
    if (error instanceof ApiError && error.status === 401) {
      markUnauthenticated();
      navigate("/login", {
        replace: true,
        state: { notice: "Please log in again to manage budgets." },
      });
      return true;
    }

    return false;
  }, [markUnauthenticated, navigate]);

  const loadPageData = useCallback(async (options = {}) => {
    if (!options.silent) {
      setState((current) => ({
        ...current,
        error: "",
        status: "loading",
      }));
    }

    try {
      const [budgets, categories] = await Promise.all([
        api.getBudgets(),
        api.getCategories({ type: "EXPENSE" }),
      ]);

      setState({
        categories: categories?.items || [],
        data: budgets,
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
  const summary = state.data?.summary || null;
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

  function startEdit(budget) {
    setNotice("");
    setFormState({
      editingId: budget.id,
      errors: {},
      message: "",
      status: "idle",
      values: budgetToFormValues(budget),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateBudgetForm(formState.values, {
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
        await api.updateBudget(formState.editingId, payload);
        setNotice("Budget updated.");
      } else {
        await api.createBudget(payload);
        setNotice("Budget added.");
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
    const budget = deleteState.budget;

    if (!budget) {
      return;
    }

    setDeleteState((current) => ({
      ...current,
      error: "",
      status: "submitting",
    }));

    try {
      const result = await api.deleteBudget(budget.id);
      setDeleteState({
        budget: null,
        error: "",
        status: "idle",
      });
      setNotice(result?.deleted ? "Budget deleted." : "Budget deactivated.");
      await loadPageData({ silent: true });

      if (formState.editingId === budget.id) {
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
    return <LoadingState title="Loading budgets" />;
  }

  if (state.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          actionLabel="Reload"
          message={state.error}
          onRetry={loadPageData}
          title="Budgets unavailable"
        />
      </section>
    );
  }

  return (
    <section className="page-section" aria-labelledby="budgets-title">
      <PageHeader
        eyebrow="Monthly limits"
        title="Budgets"
        titleId="budgets-title"
        description="Set monthly spending limits per expense category and track progress this month."
      />

      {notice ? (
        <p className="success-message" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </p>
      ) : null}

      <div className="summary-grid recurring-summary-grid">
        <section className="summary-card neutral">
          <div className="summary-card-header">
            <p>Budgeted this month</p>
            <span className="summary-card-icon" aria-hidden="true">
              <Target size={18} />
            </span>
          </div>
          <strong>{formatCurrencyFromPaise(summary?.totalBudgetedPaise || 0)}</strong>
          <span className="summary-card-detail">
            {summary?.activeCount || 0} active budget{(summary?.activeCount || 0) === 1 ? "" : "s"}
          </span>
        </section>
        <section className="summary-card expense">
          <div className="summary-card-header">
            <p>Spent against budgets</p>
            <span className="summary-card-icon" aria-hidden="true">
              <PiggyBank size={18} />
            </span>
          </div>
          <strong>{formatCurrencyFromPaise(summary?.totalSpentPaise || 0)}</strong>
          <span className="summary-card-detail">
            {summary?.overCount || 0} over - {summary?.nearCount || 0} near limit
          </span>
        </section>
        <section className="summary-card balance">
          <div className="summary-card-header">
            <p>Remaining</p>
            <span className="summary-card-icon" aria-hidden="true">
              <Target size={18} />
            </span>
          </div>
          <strong>{formatCurrencyFromPaise(summary?.totalRemainingPaise || 0)}</strong>
          <span className="summary-card-detail">Across active budgets</span>
        </section>
      </div>

      <section className="panel" aria-labelledby="budget-form-title">
        <div className="panel-header">
          <div>
            <h2 id="budget-form-title">
              {formState.editingId ? "Edit budget" : "Add budget"}
            </h2>
            <p>Spend includes transactions and active recurring expenses this month.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-form-grid">
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
              <span>Monthly limit</span>
              <Input
                autoComplete="off"
                disabled={isSubmitting}
                inputMode="decimal"
                onChange={(event) => updateFormField("amount", event.target.value)}
                placeholder="5000"
                required
                type="text"
                value={formState.values.amount}
              />
              {formState.errors.amount ? <span className="field-error">{formState.errors.amount}</span> : null}
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
              {isSubmitting ? "Saving" : formState.editingId ? "Save budget" : "Add budget"}
            </Button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="budget-list-title">
        <div className="panel-header">
          <div>
            <h2 id="budget-list-title">Category budgets</h2>
            <p>{items.length} saved budget{items.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        {items.length ? (
          <ul className="item-list">
            {items.map((budget) => (
              <li className={budget.isActive ? "budget-row" : "budget-row inactive-row"} key={budget.id}>
                <div className="budget-row-main">
                  <div className="list-content">
                    <strong>{budget.categoryName || "Uncategorized"}</strong>
                    <span>
                      {formatCurrencyFromPaise(budget.amountPaise)} / month
                      {budget.isActive ? "" : " - inactive"}
                    </span>
                  </div>
                  <div className="budget-row-status">
                    {statusBadge(budget.status)}
                    <span className={budget.remainingPaise < 0 ? "amount expense-text" : "amount"}>
                      {formatCurrencyFromPaise(budget.remainingPaise)} left
                    </span>
                  </div>
                  <div className="row-actions">
                    <Button
                      aria-label={`Edit ${budget.categoryName} budget`}
                      onClick={() => startEdit(budget)}
                      size="icon"
                      title={`Edit ${budget.categoryName} budget`}
                      type="button"
                      variant="outline"
                    >
                      <Edit3 size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`${budget.isActive ? "Deactivate" : "Delete"} ${budget.categoryName} budget`}
                      className="danger-icon-button"
                      onClick={() => setDeleteState({
                        budget,
                        error: "",
                        status: "idle",
                      })}
                      size="icon"
                      title={`${budget.isActive ? "Deactivate" : "Delete"} ${budget.categoryName} budget`}
                      type="button"
                      variant="outline"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <BudgetProgress budget={budget} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            action={<Target size={22} aria-hidden="true" />}
            message="Set a monthly limit for an expense category to track spending against it."
            title="No budgets yet"
          />
        )}
      </section>

      <ConfirmDialog
        busyLabel={deleteState.budget?.isActive ? "Deactivating" : "Deleting"}
        confirmLabel={deleteState.budget?.isActive ? "Deactivate" : "Delete"}
        error={deleteState.error}
        isBusy={deleteState.status === "submitting"}
        message={
          deleteState.budget
            ? deleteState.budget.isActive
              ? `Deactivate the ${deleteState.budget.categoryName} budget? It will stop tracking progress.`
              : `Delete the ${deleteState.budget.categoryName} budget? This cannot be undone.`
            : ""
        }
        onCancel={() => setDeleteState({
          budget: null,
          error: "",
          status: "idle",
        })}
        onConfirm={confirmDeactivate}
        open={Boolean(deleteState.budget)}
        title={deleteState.budget?.isActive ? "Deactivate budget" : "Delete budget"}
      />
    </section>
  );
}
