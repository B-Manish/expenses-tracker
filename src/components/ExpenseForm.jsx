import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCategoryLabel } from "../utils/categories.js";
import { paiseToRupeesInputValue } from "../utils/currency.js";
import { getCurrentTimeInKolkata, getTodayInKolkata } from "../utils/dateUtils.js";
import { getFirstValidationError, validateTransactionForm } from "../utils/validation.js";
import SelectControl from "./SelectControl.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";

const TYPE_OPTIONS = [
  { label: "Expense", value: "EXPENSE" },
  { label: "Income", value: "INCOME" },
];

function buildInitialValues(transaction) {
  return {
    amount: paiseToRupeesInputValue(transaction?.amountPaise),
    categoryId: transaction?.categoryId ? String(transaction.categoryId) : "",
    merchant: transaction?.merchant || "",
    notes: transaction?.notes || "",
    paymentMethodId: transaction?.paymentMethodId ? String(transaction.paymentMethodId) : "",
    title: transaction?.title || "",
    transactionDate: transaction?.transactionDate || getTodayInKolkata(),
    transactionTime: transaction?.transactionTime || getCurrentTimeInKolkata(),
    type: transaction?.type || "EXPENSE",
  };
}

function trimOrNull(value) {
  const trimmed = value.trim();

  return trimmed || null;
}

function buildPayload(values) {
  return {
    amount: values.amount.trim(),
    categoryId: values.categoryId ? Number(values.categoryId) : null,
    merchant: trimOrNull(values.merchant),
    notes: trimOrNull(values.notes),
    paymentMethodId: values.paymentMethodId ? Number(values.paymentMethodId) : null,
    title: values.title.trim(),
    transactionDate: values.transactionDate,
    transactionTime: values.transactionTime,
    type: values.type,
  };
}

export default function ExpenseForm({
  categories = [],
  initialTransaction = null,
  isSubmitting = false,
  onSubmit,
  paymentMethods = [],
  serverError = "",
  submitLabel = "Save transaction",
}) {
  const [values, setValues] = useState(() => buildInitialValues(initialTransaction));
  const [errors, setErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === values.type),
    [categories, values.type],
  );
  const categoryOptions = useMemo(() => [
    { label: "Uncategorized", value: "" },
    ...filteredCategories.map((category) => ({
      label: formatCategoryLabel(category),
      value: String(category.id),
    })),
  ], [filteredCategories]);
  const paymentMethodOptions = useMemo(() => [
    { label: "Not set", value: "" },
    ...paymentMethods.map((method) => ({
      label: method.name,
      value: String(method.id),
    })),
  ], [paymentMethods]);

  function updateField(field, value) {
    setValues((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "type" && current.categoryId) {
        const selectedCategory = categories.find((category) => String(category.id) === current.categoryId);

        if (selectedCategory && selectedCategory.type !== value) {
          next.categoryId = "";
        }
      }

      return next;
    });
    setErrors((current) => ({
      ...current,
      [field]: "",
    }));
    setFormMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormMessage("");

    const validation = validateTransactionForm(values, {
      categories,
      paymentMethods,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      setFormMessage(getFirstValidationError(validation.errors));
      return;
    }

    setErrors({});
    await onSubmit(buildPayload(values));
  }

  return (
    <form className="transaction-form panel" noValidate onSubmit={handleSubmit}>
      {serverError ? <p className="form-error" role="alert">{serverError}</p> : null}
      {formMessage ? <p className="form-error" role="alert">{formMessage}</p> : null}

      <fieldset className="segmented-field">
        <legend>Transaction type</legend>
        <div className="segmented-control">
          {TYPE_OPTIONS.map((option) => (
            <label className={values.type === option.value ? "segment-option active" : "segment-option"} key={option.value}>
              <input
                checked={values.type === option.value}
                disabled={isSubmitting}
                name="type"
                onChange={() => updateField("type", option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
        {errors.type ? <span className="field-error">{errors.type}</span> : null}
      </fieldset>

      <div className="form-grid">
        <label className="form-field">
          <span>Title</span>
          <Input
            autoComplete="off"
            disabled={isSubmitting}
            maxLength={120}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder={values.type === "INCOME" ? "Salary, refund, freelance" : "Zomato, fuel, groceries"}
            required
            type="text"
            value={values.title}
          />
          {errors.title ? <span className="field-error">{errors.title}</span> : null}
        </label>

        <label className="form-field">
          <span>Amount</span>
          <Input
            autoComplete="off"
            disabled={isSubmitting}
            inputMode="decimal"
            onChange={(event) => updateField("amount", event.target.value)}
            placeholder="250.50"
            required
            type="text"
            value={values.amount}
          />
          {errors.amount ? <span className="field-error">{errors.amount}</span> : null}
        </label>

        <label className="form-field">
          <span>Date</span>
          <Input
            disabled={isSubmitting}
            onChange={(event) => updateField("transactionDate", event.target.value)}
            required
            type="date"
            value={values.transactionDate}
          />
          {errors.transactionDate ? <span className="field-error">{errors.transactionDate}</span> : null}
        </label>

        <label className="form-field">
          <span>Time</span>
          <Input
            disabled={isSubmitting}
            onChange={(event) => updateField("transactionTime", event.target.value)}
            required
            type="time"
            value={values.transactionTime}
          />
          {errors.transactionTime ? <span className="field-error">{errors.transactionTime}</span> : null}
        </label>

        <label className="form-field">
          <span>Category</span>
          <SelectControl
            disabled={isSubmitting || filteredCategories.length === 0}
            onChange={(value) => updateField("categoryId", value)}
            options={categoryOptions}
            placeholder="Choose category"
            value={values.categoryId}
          />
          {filteredCategories.length === 0 ? (
            <span className="field-hint">No {values.type.toLowerCase()} categories returned.</span>
          ) : null}
          {errors.categoryId ? <span className="field-error">{errors.categoryId}</span> : null}
        </label>

        <label className="form-field">
          <span>Payment method</span>
          <SelectControl
            disabled={isSubmitting || paymentMethods.length === 0}
            onChange={(value) => updateField("paymentMethodId", value)}
            options={paymentMethodOptions}
            placeholder="Choose payment method"
            value={values.paymentMethodId}
          />
          {paymentMethods.length === 0 ? <span className="field-hint">No payment methods returned.</span> : null}
          {errors.paymentMethodId ? <span className="field-error">{errors.paymentMethodId}</span> : null}
        </label>

        <label className="form-field">
          <span>Merchant/source</span>
          <Input
            autoComplete="off"
            disabled={isSubmitting}
            maxLength={120}
            onChange={(event) => updateField("merchant", event.target.value)}
            placeholder={values.type === "INCOME" ? "Employer or source" : "Store or merchant"}
            type="text"
            value={values.merchant}
          />
          {errors.merchant ? <span className="field-error">{errors.merchant}</span> : null}
        </label>
      </div>

      <label className="form-field">
        <span>Notes</span>
        <textarea
          disabled={isSubmitting}
          maxLength={1000}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Optional notes"
          rows={4}
          value={values.notes}
        />
        <span className="field-hint">{values.notes.length}/1000 characters</span>
        {errors.notes ? <span className="field-error">{errors.notes}</span> : null}
      </label>

      <div className="form-actions">
        <Button disabled={isSubmitting} type="submit">
          <Save size={18} aria-hidden="true" />
          {isSubmitting ? "Saving" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
