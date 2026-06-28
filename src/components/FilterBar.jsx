import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCategoryLabel } from "../utils/categories.js";
import { isValidDateInput } from "../utils/dateUtils.js";
import { LIMIT_OPTIONS, SORT_OPTIONS } from "../utils/transactionOptions.js";
import SelectControl from "./SelectControl.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

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
  const typeOptions = [
    { label: "All", value: "ALL" },
    { label: "Expense", value: "EXPENSE" },
    { label: "Income", value: "INCOME" },
  ];
  const sourceOptions = [
    { label: "All sources", value: "ALL" },
    { label: "Manually added", value: "MANUAL" },
    { label: "Captured from SMS", value: "SMS" },
  ];
  const categoryOptions = useMemo(() => [
    { label: "All categories", value: "" },
    ...visibleCategories.map((category) => ({
      label: categoryLabel(category, draft.type === "ALL"),
      value: String(category.id),
    })),
  ], [draft.type, visibleCategories]);
  const paymentMethodOptions = useMemo(() => [
    { label: "All methods", value: "" },
    ...paymentMethods.map((method) => ({
      label: method.name,
      value: String(method.id),
    })),
  ], [paymentMethods]);

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
          <Input
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
          <SelectControl
            disabled={isLoading}
            onChange={(value) => updateDraft("type", value)}
            options={typeOptions}
            value={draft.type}
          />
        </label>

        <label className="form-field">
          <span>Transaction source (Manual / SMS)</span>
          <SelectControl
            disabled={isLoading}
            onChange={(value) => updateDraft("source", value)}
            options={sourceOptions}
            value={draft.source}
          />
        </label>

        <label className="form-field">
          <span>Category</span>
          <SelectControl
            disabled={isLoading || visibleCategories.length === 0}
            onChange={(value) => updateDraft("categoryId", value)}
            options={categoryOptions}
            placeholder="All categories"
            value={draft.categoryId}
          />
        </label>

        <label className="form-field">
          <span>Payment</span>
          <SelectControl
            disabled={isLoading || paymentMethods.length === 0}
            onChange={(value) => updateDraft("paymentMethodId", value)}
            options={paymentMethodOptions}
            placeholder="All methods"
            value={draft.paymentMethodId}
          />
        </label>

        <label className="form-field">
          <span>From</span>
          <Input
            disabled={isLoading}
            onChange={(event) => updateDraft("from", event.target.value)}
            type="date"
            value={draft.from}
          />
        </label>

        <label className="form-field">
          <span>To</span>
          <Input
            disabled={isLoading}
            onChange={(event) => updateDraft("to", event.target.value)}
            type="date"
            value={draft.to}
          />
        </label>

        <label className="form-field">
          <span>Sort</span>
          <SelectControl
            disabled={isLoading}
            onChange={(value) => updateDraft("sort", value)}
            options={SORT_OPTIONS}
            value={draft.sort}
          />
        </label>

        <label className="form-field">
          <span>Rows</span>
          <SelectControl
            disabled={isLoading}
            onChange={(value) => updateDraft("limit", value)}
            options={LIMIT_OPTIONS}
            value={draft.limit}
          />
        </label>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="filter-actions">
        <Button disabled={isLoading} type="submit">
          <Search size={18} aria-hidden="true" />
          Apply filters
        </Button>
        <Button disabled={isLoading} onClick={onClear} type="button" variant="outline">
          <RotateCcw size={18} aria-hidden="true" />
          Clear
        </Button>
      </div>
    </form>
  );
}
