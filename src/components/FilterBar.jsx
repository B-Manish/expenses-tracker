import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCategoryLabel } from "../utils/categories.js";
import { isValidDateInput } from "../utils/dateUtils.js";
import { LIMIT_OPTIONS, SORT_OPTIONS } from "../utils/transactionOptions.js";

function categoryLabel(category, includeType) {
  return formatCategoryLabel(category, { includeType });
}

function validateDateRange(draft) {
  if (draft.from && !isValidDateInput(draft.from)) {
    return "Enter a valid from date.";
  }

  if (draft.to && !isValidDateInput(draft.to)) {
    return "Enter a valid to date.";
  }

  if (draft.from && draft.to && draft.from > draft.to) {
    return "From date must be before or equal to to date.";
  }

  return "";
}

export default function FilterBar({
  categories = [],
  filters,
  isLoading = false,
  onApply,
  onClear,
  paymentMethods = [],
}) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState("");

  const visibleCategories = useMemo(() => {
    if (draft.type === "EXPENSE" || draft.type === "INCOME") {
      return categories.filter((category) => category.type === draft.type);
    }

    return categories;
  }, [categories, draft.type]);

  function updateDraft(field, value) {
    setDraft((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "type" && value !== "ALL") {
        const selectedCategory = categories.find((category) => String(category.id) === current.categoryId);

        if (selectedCategory && selectedCategory.type !== value) {
          next.categoryId = "";
        }
      }

      return next;
    });
    setError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    const dateError = validateDateRange(draft);

    if (dateError) {
      setError(dateError);
      return;
    }

    onApply({
      ...draft,
      offset: "0",
      search: draft.search.trim(),
    });
  }

  return (
    <form className="filter-bar panel" onSubmit={handleSubmit}>
      <div className="filter-grid">
        <label className="form-field search-field">
          <span>Search</span>
          <input
            disabled={isLoading}
            maxLength={120}
            onChange={(event) => updateDraft("search", event.target.value)}
            placeholder="Title, merchant, notes"
            type="search"
            value={draft.search}
          />
        </label>

        <label className="form-field">
          <span>Type</span>
          <select disabled={isLoading} onChange={(event) => updateDraft("type", event.target.value)} value={draft.type}>
            <option value="ALL">All</option>
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
        </label>

        <label className="form-field">
          <span>Category</span>
          <select
            disabled={isLoading || visibleCategories.length === 0}
            onChange={(event) => updateDraft("categoryId", event.target.value)}
            value={draft.categoryId}
          >
            <option value="">All categories</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {categoryLabel(category, draft.type === "ALL")}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Payment</span>
          <select
            disabled={isLoading || paymentMethods.length === 0}
            onChange={(event) => updateDraft("paymentMethodId", event.target.value)}
            value={draft.paymentMethodId}
          >
            <option value="">All methods</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>From</span>
          <input
            disabled={isLoading}
            onChange={(event) => updateDraft("from", event.target.value)}
            type="date"
            value={draft.from}
          />
        </label>

        <label className="form-field">
          <span>To</span>
          <input
            disabled={isLoading}
            onChange={(event) => updateDraft("to", event.target.value)}
            type="date"
            value={draft.to}
          />
        </label>

        <label className="form-field">
          <span>Sort</span>
          <select disabled={isLoading} onChange={(event) => updateDraft("sort", event.target.value)} value={draft.sort}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Rows</span>
          <select disabled={isLoading} onChange={(event) => updateDraft("limit", event.target.value)} value={draft.limit}>
            {LIMIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="filter-actions">
        <button className="button primary-button" disabled={isLoading} type="submit">
          <Search size={18} aria-hidden="true" />
          Apply filters
        </button>
        <button className="button secondary-button" disabled={isLoading} onClick={onClear} type="button">
          <RotateCcw size={18} aria-hidden="true" />
          Clear
        </button>
      </div>
    </form>
  );
}
