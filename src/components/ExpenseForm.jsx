import { useMemo, useRef, useState } from "react";
import { paiseToRupeesInputValue } from "../utils/currency.js";
import { getCurrentTimeInKolkata, getTodayInKolkata } from "../utils/dateUtils.js";
import { getFirstValidationError, validateTransactionForm } from "../utils/validation.js";
import CategoryChips from "./CategoryChips.jsx";
import GradientButton from "./auth/GradientButton.jsx";
import SelectControl from "./SelectControl.jsx";
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
  submitLabel = "",
}) {
  const formRef = useRef(null);
  const [values, setValues] = useState(() => buildInitialValues(initialTransaction));
  const [errors, setErrors] = useState({});
  const [formMessage, setFormMessage] = useState("");

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === values.type),
    [categories, values.type],
  );
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
      window.requestAnimationFrame(() => {
        formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setErrors({});
    await onSubmit(buildPayload(values));
  }

  return (
    <form className="transaction-form panel" noValidate onSubmit={handleSubmit} ref={formRef}>
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
            aria-describedby={errors.title ? "tx-title-error" : undefined}
            aria-invalid={errors.title ? true : undefined}
            autoComplete="off"
            disabled={isSubmitting}
            maxLength={120}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder={values.type === "INCOME" ? "Salary, refund, freelance" : "Zomato, fuel, groceries"}
            required
            type="text"
            value={values.title}
          />
          {errors.title ? <span className="field-error" id="tx-title-error">{errors.title}</span> : null}
        </label>

        <label className="form-field">
          <span>Amount</span>
          <Input
            aria-describedby={errors.amount ? "tx-amount-error" : undefined}
            aria-invalid={errors.amount ? true : undefined}
            autoComplete="off"
            disabled={isSubmitting}
            inputMode="decimal"
            onChange={(event) => updateField("amount", event.target.value)}
            placeholder="250.50"
            required
            type="text"
            value={values.amount}
          />
          {errors.amount ? <span className="field-error" id="tx-amount-error">{errors.amount}</span> : null}
        </label>

        <label className="form-field">
          <span>Date</span>
          <Input
            aria-describedby={errors.transactionDate ? "tx-date-error" : undefined}
            aria-invalid={errors.transactionDate ? true : undefined}
            aria-label="Transaction date"
            disabled={isSubmitting}
            onChange={(event) => updateField("transactionDate", event.target.value)}
            required
            type="date"
            value={values.transactionDate}
          />
          {errors.transactionDate ? <span className="field-error" id="tx-date-error">{errors.transactionDate}</span> : null}
        </label>

        <label className="form-field">
          <span>Time</span>
          <Input
            aria-describedby={errors.transactionTime ? "tx-time-error" : undefined}
            aria-invalid={errors.transactionTime ? true : undefined}
            disabled={isSubmitting}
            onChange={(event) => updateField("transactionTime", event.target.value)}
            required
            type="time"
            value={values.transactionTime}
          />
          {errors.transactionTime ? <span className="field-error" id="tx-time-error">{errors.transactionTime}</span> : null}
        </label>

        <div className="form-field wide-panel">
          <span>{values.type === "INCOME" ? "Income category" : "Expense category"}</span>
          <CategoryChips
            categories={filteredCategories}
            disabled={isSubmitting}
            onChange={(value) => updateField("categoryId", value)}
            value={values.categoryId}
          />
          {filteredCategories.length === 0 ? (
            <span className="field-hint">No {values.type.toLowerCase()} categories returned.</span>
          ) : null}
          {errors.categoryId ? <span className="field-error">{errors.categoryId}</span> : null}
        </div>

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
            aria-describedby={errors.merchant ? "tx-merchant-error" : undefined}
            aria-invalid={errors.merchant ? true : undefined}
            autoComplete="off"
            disabled={isSubmitting}
            maxLength={120}
            onChange={(event) => updateField("merchant", event.target.value)}
            placeholder={values.type === "INCOME" ? "Employer or source" : "Store or merchant"}
            type="text"
            value={values.merchant}
          />
          {errors.merchant ? <span className="field-error" id="tx-merchant-error">{errors.merchant}</span> : null}
        </label>
      </div>

      <label className="form-field">
        <span>Notes</span>
        <textarea
          aria-describedby={errors.notes ? "tx-notes-error" : undefined}
          aria-invalid={errors.notes ? true : undefined}
          disabled={isSubmitting}
          maxLength={1000}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Optional notes"
          rows={4}
          value={values.notes}
        />
        <span className="field-hint">{values.notes.length}/1000 characters</span>
        {errors.notes ? <span className="field-error" id="tx-notes-error">{errors.notes}</span> : null}
      </label>

      <div className="form-actions">
        <GradientButton disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Saving"
            : submitLabel || (values.type === "INCOME" ? "Add income" : "Add expense")}
        </GradientButton>
      </div>
    </form>
  );
}
