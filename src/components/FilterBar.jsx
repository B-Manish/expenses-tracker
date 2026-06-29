import { RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCategoryLabel } from "../utils/categories.js";
import { isAmountInput } from "../utils/currency.js";
import { formatDateRange, getMonthRangeInKolkata, isValidDateInput } from "../utils/dateUtils.js";
import { LIMIT_OPTIONS, SORT_OPTIONS } from "../utils/transactionOptions.js";
import SelectControl from "./SelectControl.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

const UNCATEGORIZED_OPTION = "__uncategorized__";

function categoryLabel(category, includeType) {
  return formatCategoryLabel(category, { includeType });
}

function validateDraft(draft) {
  if (draft.from && !isValidDateInput(draft.from)) {
    return "Enter a valid from date.";
  }

  if (draft.to && !isValidDateInput(draft.to)) {
    return "Enter a valid to date.";
  }

  if (draft.from && draft.to && draft.from > draft.to) {
    return "From date must be before or equal to to date.";
  }

  if (draft.minAmount && !isAmountInput(draft.minAmount)) {
    return "Enter a valid minimum amount.";
  }

  if (draft.maxAmount && !isAmountInput(draft.maxAmount)) {
    return "Enter a valid maximum amount.";
  }

  if (draft.minAmount && draft.maxAmount && Number(draft.minAmount) > Number(draft.maxAmount)) {
    return "Minimum amount must be less than or equal to maximum.";
  }

  return "";
}

function findByName(items, name) {
  const match = items.find((item) => (item.name || "").trim().toLowerCase() === name);

  return match ? String(match.id) : null;
}

function findFoodCategory(categories) {
  const match = categories.find(
    (category) =>
      category.type === "EXPENSE" &&
      !category.parentId &&
      (category.name || "").trim().toLowerCase() === "food",
  );

  return match ? String(match.id) : null;
}

// Quick filters that resolve to combinations of the base filters. Each chip
// toggles a single dimension so compatible chips combine; unavailable chips
// (no matching category/method) are omitted.
function buildChips(filters, categories, paymentMethods) {
  const thisMonth = getMonthRangeInKolkata(0);
  const lastMonth = getMonthRangeInKolkata(-1);
  const upiId = findByName(paymentMethods, "upi");
  const cashId = findByName(paymentMethods, "cash");
  const foodId = findFoodCategory(categories);
  const selectedCategory = categories.find((category) => String(category.id) === filters.categoryId);

  function dateChip(key, label, range) {
    const active = filters.from === range.from && filters.to === range.to;

    return {
      key,
      label,
      active,
      next: active ? { from: "", to: "" } : { from: range.from, to: range.to },
    };
  }

  function methodChip(key, label, id) {
    if (!id) {
      return null;
    }

    const active = filters.paymentMethodId === id;

    return {
      key,
      label,
      active,
      next: { paymentMethodId: active ? "" : id },
    };
  }

  const incomeActive = filters.type === "INCOME";
  const uncategorizedActive = filters.uncategorized === "true";
  const foodActive = !uncategorizedActive && Boolean(foodId) && filters.categoryId === foodId;

  return [
    dateChip("this-month", "This month", thisMonth),
    dateChip("last-month", "Last month", lastMonth),
    methodChip("upi", "UPI", upiId),
    methodChip("cash", "Cash", cashId),
    {
      key: "sms",
      label: "SMS only",
      active: filters.source === "SMS",
      next: { source: filters.source === "SMS" ? "ALL" : "SMS" },
    },
    {
      key: "income",
      label: "Income only",
      active: incomeActive,
      next: incomeActive
        ? { type: "ALL" }
        : {
            type: "INCOME",
            categoryId:
              selectedCategory && selectedCategory.type !== "INCOME" ? "" : filters.categoryId,
          },
    },
    foodId
      ? {
          key: "food",
          label: "Food",
          active: foodActive,
          next: foodActive
            ? { categoryId: "" }
            : {
                categoryId: foodId,
                uncategorized: "",
                type: filters.type === "INCOME" ? "ALL" : filters.type,
              },
        }
      : null,
    {
      key: "uncategorized",
      label: "Uncategorized",
      active: uncategorizedActive,
      next: uncategorizedActive
        ? { uncategorized: "" }
        : { uncategorized: "true", categoryId: "" },
    },
  ].filter(Boolean);
}

// Human-readable, individually removable summary of the applied filters.
function buildActivePills(filters, categories, paymentMethods) {
  const pills = [];

  if (filters.type !== "ALL") {
    pills.push({
      key: "type",
      label: `Type: ${filters.type === "INCOME" ? "Income" : "Expense"}`,
      clear: { type: "ALL" },
    });
  }

  if (filters.source !== "ALL") {
    pills.push({
      key: "source",
      label: `Source: ${filters.source === "SMS" ? "SMS" : "Manual"}`,
      clear: { source: "ALL" },
    });
  }

  if (filters.uncategorized === "true") {
    pills.push({ key: "uncategorized", label: "Uncategorized", clear: { uncategorized: "" } });
  } else if (filters.categoryId) {
    const category = categories.find((item) => String(item.id) === filters.categoryId);

    pills.push({
      key: "category",
      label: `Category: ${category ? categoryLabel(category, false) : filters.categoryId}`,
      clear: { categoryId: "" },
    });
  }

  if (filters.paymentMethodId) {
    const method = paymentMethods.find((item) => String(item.id) === filters.paymentMethodId);

    pills.push({
      key: "payment",
      label: `Payment: ${method ? method.name : filters.paymentMethodId}`,
      clear: { paymentMethodId: "" },
    });
  }

  if (filters.from || filters.to) {
    pills.push({
      key: "dates",
      label: formatDateRange(filters.from, filters.to),
      clear: { from: "", to: "" },
    });
  }

  if (filters.minAmount) {
    pills.push({ key: "min", label: `Min ₹${filters.minAmount}`, clear: { minAmount: "" } });
  }

  if (filters.maxAmount) {
    pills.push({ key: "max", label: `Max ₹${filters.maxAmount}`, clear: { maxAmount: "" } });
  }

  if (filters.search) {
    pills.push({ key: "search", label: `Search: "${filters.search}"`, clear: { search: "" } });
  }

  return pills;
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
    { label: "Uncategorized", value: UNCATEGORIZED_OPTION },
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
  const categorySelectValue = draft.uncategorized === "true" ? UNCATEGORIZED_OPTION : draft.categoryId;

  const chips = useMemo(
    () => buildChips(filters, categories, paymentMethods),
    [filters, categories, paymentMethods],
  );
  const activePills = useMemo(
    () => buildActivePills(filters, categories, paymentMethods),
    [filters, categories, paymentMethods],
  );

  function updateDraftFields(partial) {
    setDraft((current) => ({ ...current, ...partial }));
    setError("");
  }

  function updateDraft(field, value) {
    if (field === "type" && value !== "ALL") {
      const selectedCategory = categories.find(
        (category) => String(category.id) === draft.categoryId,
      );

      if (selectedCategory && selectedCategory.type !== value) {
        updateDraftFields({ type: value, categoryId: "" });
        return;
      }
    }

    updateDraftFields({ [field]: value });
  }

  function handleCategoryChange(value) {
    if (value === UNCATEGORIZED_OPTION) {
      updateDraftFields({ categoryId: "", uncategorized: "true" });
    } else {
      updateDraftFields({ categoryId: value, uncategorized: "" });
    }
  }

  function applyChip(chip) {
    onApply({ ...filters, ...chip.next, offset: "0" });
  }

  function removePill(pill) {
    onApply({ ...filters, ...pill.clear, offset: "0" });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const message = validateDraft(draft);

    if (message) {
      setError(message);
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
      <div className="quick-filters" role="group" aria-label="Quick filters">
        {chips.map((chip) => (
          <Button
            aria-pressed={chip.active}
            className="quick-filter-chip"
            disabled={isLoading}
            key={chip.key}
            onClick={() => applyChip(chip)}
            size="sm"
            type="button"
            variant={chip.active ? "default" : "outline"}
          >
            {chip.label}
          </Button>
        ))}
      </div>

      {activePills.length ? (
        <div className="active-filters" aria-label="Active filters">
          <span className="active-filters-label">Active:</span>
          {activePills.map((pill) => (
            <button
              className="filter-pill"
              disabled={isLoading}
              key={pill.key}
              onClick={() => removePill(pill)}
              type="button"
            >
              <span>{pill.label}</span>
              <X size={14} aria-hidden="true" />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <Button
            className="clear-all-button"
            disabled={isLoading}
            onClick={onClear}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear all
          </Button>
        </div>
      ) : null}

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
            disabled={isLoading}
            onChange={handleCategoryChange}
            options={categoryOptions}
            placeholder="All categories"
            value={categorySelectValue}
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
          <span>Min amount (₹)</span>
          <Input
            disabled={isLoading}
            inputMode="decimal"
            onChange={(event) => updateDraft("minAmount", event.target.value)}
            placeholder="0"
            type="text"
            value={draft.minAmount}
          />
        </label>

        <label className="form-field">
          <span>Max amount (₹)</span>
          <Input
            disabled={isLoading}
            inputMode="decimal"
            onChange={(event) => updateDraft("maxAmount", event.target.value)}
            placeholder="Any"
            type="text"
            value={draft.maxAmount}
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
