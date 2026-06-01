import { Edit3, PlusCircle, Save, Tags, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  validateCategoryForm,
} from "../utils/validation.js";

const EMPTY_CATEGORY_FORM = {
  color: "#64748b",
  icon: "circle",
  name: "",
  parentId: "",
  type: "EXPENSE",
};

function categoryToFormValues(category) {
  return {
    color: category.color || "",
    icon: category.icon || "",
    name: category.name || "",
    parentId: category.parentId ? String(category.parentId) : "",
    type: category.type || "EXPENSE",
  };
}

function buildCategoryPayload(values) {
  const color = values.color.trim();
  const icon = values.icon.trim();

  return {
    color: color || null,
    icon: icon || null,
    name: values.name.trim(),
    parentId: values.parentId ? Number(values.parentId) : null,
    type: values.type,
  };
}

function buildCategoryTree(items) {
  const topLevel = items
    .filter((category) => !category.parentId)
    .map((category) => ({
      ...category,
      subcategories: [],
    }));
  const byId = new Map(topLevel.map((category) => [category.id, category]));
  const orphanSubcategories = [];

  for (const category of items) {
    if (!category.parentId) {
      continue;
    }

    const parent = byId.get(category.parentId);

    if (parent) {
      parent.subcategories.push(category);
    } else {
      orphanSubcategories.push({
        ...category,
        subcategories: [],
      });
    }
  }

  return [...topLevel, ...orphanSubcategories];
}

function groupCategories(items) {
  return {
    expense: buildCategoryTree(items.filter((category) => category.type === "EXPENSE")),
    income: buildCategoryTree(items.filter((category) => category.type === "INCOME")),
  };
}

export default function Categories() {
  const navigate = useNavigate();
  const formPanelRef = useRef(null);
  const nameInputRef = useRef(null);
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
    values: EMPTY_CATEGORY_FORM,
  });
  const [deleteState, setDeleteState] = useState({
    category: null,
    error: "",
    status: "idle",
  });
  const [notice, setNotice] = useState("");

  const handleAuthError = useCallback((error) => {
    if (error instanceof ApiError && error.status === 401) {
      navigate("/login", {
        replace: true,
        state: { notice: "Please log in again to manage categories." },
      });
      return true;
    }

    return false;
  }, [navigate]);

  const loadCategories = useCallback(async (options = {}) => {
    if (!options.silent) {
      setState((current) => ({
        ...current,
        error: "",
        status: "loading",
      }));
    }

    try {
      const data = await api.getCategories();

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
    loadCategories();
  }, [loadCategories]);

  const grouped = useMemo(() => groupCategories(state.data?.items || []), [state.data]);
  const topLevelParents = useMemo(() => (
    (state.data?.items || [])
      .filter((category) => (
        !category.parentId &&
        category.type === formState.values.type &&
        category.id !== formState.editingId
      ))
  ), [formState.editingId, formState.values.type, state.data]);
  const isSubmitting = formState.status === "submitting";

  function resetForm(message = "") {
    setFormState({
      editingId: null,
      errors: {},
      message,
      status: "idle",
      values: EMPTY_CATEGORY_FORM,
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
        ...(field === "type" ? { parentId: "" } : {}),
      },
    }));
  }

  function startEdit(category) {
    setNotice("");
    setFormState({
      editingId: category.id,
      errors: {},
      message: "",
      status: "idle",
      values: categoryToFormValues(category),
    });
    window.requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      nameInputRef.current?.focus({ preventScroll: true });
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateCategoryForm(formState.values, {
      categories: state.data?.items || [],
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
      const payload = buildCategoryPayload(formState.values);

      if (formState.editingId) {
        await api.updateCategory(formState.editingId, payload);
        setNotice("Category updated.");
      } else {
        await api.createCategory(payload);
        setNotice("Category added.");
      }

      resetForm();
      await loadCategories({ silent: true });
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
    const category = deleteState.category;

    if (!category) {
      return;
    }

    setDeleteState((current) => ({
      ...current,
      error: "",
      status: "submitting",
    }));

    try {
      await api.deleteCategory(category.id);
      setDeleteState({
        category: null,
        error: "",
        status: "idle",
      });
      setNotice("Category deleted.");
      await loadCategories({ silent: true });

      if (formState.editingId === category.id) {
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

  function renderCategoryRow(category, options = {}) {
    const isSubcategory = options.isSubcategory || false;
    const typeLabel = category.isDefault
      ? "Default category"
      : isSubcategory
        ? "Custom subcategory"
        : "Custom category";

    return (
      <div
        className={isSubcategory ? "list-row management-row subcategory-row" : "list-row management-row"}
      >
        <span
          className="category-color"
          style={{ backgroundColor: category.color || "#64748b" }}
          aria-hidden="true"
        />
        <div className="list-content">
          <strong>{category.name}</strong>
          <span>{typeLabel}</span>
        </div>
        <div className="row-actions">
          {category.isDefault ? (
            <span className="default-pill">Default</span>
          ) : (
            <>
              <button
                aria-label={`Edit ${category.name}`}
                className="icon-button"
                onClick={() => startEdit(category)}
                title={`Edit ${category.name}`}
                type="button"
              >
                <Edit3 size={16} aria-hidden="true" />
              </button>
              <button
                aria-label={`Delete ${category.name}`}
                className="icon-button danger-icon-button"
                onClick={() => setDeleteState({
                  category,
                  error: "",
                  status: "idle",
                })}
                title={`Delete ${category.name}`}
                type="button"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderCategoryList(label, items) {
    const subcategoryCount = items.reduce(
      (total, category) => total + category.subcategories.length,
      0,
    );

    return (
      <section className="panel" aria-labelledby={`${label.toLowerCase()}-categories-title`} key={label}>
        <div className="panel-header">
          <h2 id={`${label.toLowerCase()}-categories-title`}>{label}</h2>
          <p>{items.length} categories, {subcategoryCount} subcategories</p>
        </div>

        {items.length ? (
          <ul className="item-list">
            {items.map((category) => (
              <li className="category-group" key={category.id}>
                {renderCategoryRow(category)}
                {category.subcategories.length ? (
                  <ul className="subcategory-list">
                    {category.subcategories.map((subcategory) => (
                      <li key={subcategory.id}>
                        {renderCategoryRow(subcategory, {
                          isSubcategory: true,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={`No ${label.toLowerCase()} categories`}
            message="Create a custom category for this transaction type."
            action={<Tags size={22} aria-hidden="true" />}
          />
        )}
      </section>
    );
  }

  if (state.status === "loading") {
    return <LoadingState title="Loading categories" message="Fetching category options." />;
  }

  if (state.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          title="Categories unavailable"
          message={state.error}
          actionLabel="Reload"
          onRetry={loadCategories}
        />
      </section>
    );
  }

  return (
    <section className="page-section" aria-labelledby="categories-title">
      <PageHeader
        eyebrow="Setup"
        title="Categories"
        titleId="categories-title"
        description="Organize transactions with readable income and expense buckets."
      />

      {notice ? (
        <p className="success-message" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </p>
      ) : null}

      <section className="panel" aria-labelledby="category-form-title" ref={formPanelRef}>
        <div className="panel-header">
          <div>
            <h2 id="category-form-title">
              {formState.editingId ? "Edit custom category" : "Add custom category"}
            </h2>
            <p>Default categories are kept read-only so seeded app data stays predictable.</p>
            <p>Add a top-level category, or choose a parent to nest a subcategory inside it.</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                autoComplete="off"
                disabled={isSubmitting}
                maxLength={80}
                onChange={(event) => updateFormField("name", event.target.value)}
                placeholder="Subscriptions"
                ref={nameInputRef}
                required
                type="text"
                value={formState.values.name}
              />
              {formState.errors.name ? <span className="field-error">{formState.errors.name}</span> : null}
            </label>

            <label className="form-field">
              <span>Type</span>
              <select
                disabled={isSubmitting}
                onChange={(event) => updateFormField("type", event.target.value)}
                value={formState.values.type}
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </select>
              {formState.errors.type ? <span className="field-error">{formState.errors.type}</span> : null}
            </label>

            <label className="form-field">
              <span>Parent category</span>
              <select
                disabled={isSubmitting || topLevelParents.length === 0}
                onChange={(event) => updateFormField("parentId", event.target.value)}
                value={formState.values.parentId}
              >
                <option value="">None - top-level category</option>
                {topLevelParents.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">Choose a parent to create a subcategory.</span>
              {formState.errors.parentId ? <span className="field-error">{formState.errors.parentId}</span> : null}
            </label>

            <label className="form-field">
              <span>Color</span>
              <input
                autoComplete="off"
                disabled={isSubmitting}
                maxLength={7}
                onChange={(event) => updateFormField("color", event.target.value)}
                placeholder="#64748b"
                type="text"
                value={formState.values.color}
              />
              {formState.errors.color ? <span className="field-error">{formState.errors.color}</span> : null}
            </label>

            <label className="form-field">
              <span>Icon key</span>
              <input
                autoComplete="off"
                disabled={isSubmitting}
                maxLength={64}
                onChange={(event) => updateFormField("icon", event.target.value)}
                placeholder="circle"
                type="text"
                value={formState.values.icon}
              />
              <span className="field-hint">Lowercase letters, numbers, and hyphens.</span>
              {formState.errors.icon ? <span className="field-error">{formState.errors.icon}</span> : null}
            </label>
          </div>

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
              {isSubmitting ? "Saving" : formState.editingId ? "Save category" : "Add category"}
            </button>
          </div>
        </form>
      </section>

      <div className="content-grid two-column-grid">
        {[
          ["Expense", grouped.expense],
          ["Income", grouped.income],
        ].map(([label, items]) => renderCategoryList(label, items))}
      </div>

      <ConfirmDialog
        confirmLabel="Delete category"
        error={deleteState.error}
        isBusy={deleteState.status === "submitting"}
        message={deleteState.category ? `Delete "${deleteState.category.name}"? Used categories cannot be deleted.` : ""}
        onCancel={() => setDeleteState({
          category: null,
          error: "",
          status: "idle",
        })}
        onConfirm={confirmDelete}
        open={Boolean(deleteState.category)}
        title="Delete category"
      />
    </section>
  );
}
