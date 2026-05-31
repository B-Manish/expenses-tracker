import { parseRupeesToPaiseInput } from "./currency.js";
import { isValidDateInput } from "./dateUtils.js";

export function getErrorMessage(error, fallback = "Something went wrong.") {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  return fallback;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.trim().length === 0) {
    return "Password is required.";
  }

  return null;
}

export function validateNewPassword(password) {
  if (typeof password !== "string" || password.trim().length === 0) {
    return "New password is required.";
  }

  if (password.trim().length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (password.length > 200) {
    return "Password must be 200 characters or less.";
  }

  return null;
}

export function validatePasswordConfirmation(password, confirmPassword) {
  const passwordError = validateNewPassword(password);

  if (passwordError) {
    return passwordError;
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
}

export function validateResetCode(code) {
  if (typeof code !== "string" || code.trim().length === 0) {
    return "Verification code is required.";
  }

  if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
    return "Enter the 6-digit verification code.";
  }

  return null;
}

const SUPPORTED_THEMES = ["system", "light", "dark"];
const SUPPORTED_WEEK_START_DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const CATEGORY_TYPES = ["EXPENSE", "INCOME"];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ICON_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function findById(items, id) {
  if (!id) {
    return null;
  }

  const numericId = Number(id);

  return items.find((item) => Number(item.id) === numericId) || null;
}

export function validateTransactionForm(values, options = {}) {
  const categories = options.categories || [];
  const paymentMethods = options.paymentMethods || [];
  const errors = {};
  const type = values.type;

  if (type !== "EXPENSE" && type !== "INCOME") {
    errors.type = "Choose expense or income.";
  }

  const title = values.title?.trim() || "";

  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length > 120) {
    errors.title = "Title must be 120 characters or less.";
  }

  const amountResult = parseRupeesToPaiseInput(values.amount || "");

  if (!amountResult.ok) {
    errors.amount = amountResult.message;
  }

  if (!isValidDateInput(values.transactionDate || "")) {
    errors.transactionDate = "Enter a valid date.";
  }

  const category = findById(categories, values.categoryId);

  if (values.categoryId && !category) {
    errors.categoryId = "Choose a valid category.";
  } else if (category && category.type !== type) {
    errors.categoryId = "Category type must match the transaction type.";
  }

  const paymentMethod = findById(paymentMethods, values.paymentMethodId);

  if (values.paymentMethodId && !paymentMethod) {
    errors.paymentMethodId = "Choose a valid payment method.";
  }

  const merchant = values.merchant?.trim() || "";

  if (merchant.length > 120) {
    errors.merchant = "Merchant/source must be 120 characters or less.";
  }

  const notes = values.notes?.trim() || "";

  if (notes.length > 1000) {
    errors.notes = "Notes must be 1000 characters or less.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validateSettingsForm(values) {
  const errors = {};

  if (values.currency !== "INR") {
    errors.currency = "Only INR is supported in the MVP.";
  }

  if (!SUPPORTED_THEMES.includes(values.theme)) {
    errors.theme = "Choose system, light, or dark.";
  }

  if (!SUPPORTED_WEEK_START_DAYS.includes(values.weekStartDay)) {
    errors.weekStartDay = "Choose a supported week start day.";
  }

  if (values.timezone !== "Asia/Kolkata") {
    errors.timezone = "Only Asia/Kolkata is supported in the MVP.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validateCategoryForm(values) {
  const errors = {};
  const name = values.name?.trim() || "";
  const color = values.color?.trim() || "";
  const icon = values.icon?.trim() || "";

  if (!name) {
    errors.name = "Category name is required.";
  } else if (name.length > 80) {
    errors.name = "Category name must be 80 characters or less.";
  }

  if (!CATEGORY_TYPES.includes(values.type)) {
    errors.type = "Choose expense or income.";
  }

  if (color && !HEX_COLOR_PATTERN.test(color)) {
    errors.color = "Color must be a hex value like #64748b.";
  }

  if (icon.length > 64) {
    errors.icon = "Icon must be 64 characters or less.";
  } else if (icon && !ICON_PATTERN.test(icon)) {
    errors.icon = "Icon must use lowercase letters, numbers, and hyphens.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validateRecurringExpenseForm(values, options = {}) {
  const categories = options.categories || [];
  const errors = {};
  const title = values.title?.trim() || "";

  if (!title) {
    errors.title = "Name is required.";
  } else if (title.length > 120) {
    errors.title = "Name must be 120 characters or less.";
  }

  const amountResult = parseRupeesToPaiseInput(values.amount || "");

  if (!amountResult.ok) {
    errors.amount = amountResult.message;
  }

  const billingDay = Number(values.billingDay);

  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 31) {
    errors.billingDay = "Billing day must be between 1 and 31.";
  }

  const category = findById(categories, values.categoryId);

  if (!values.categoryId) {
    errors.categoryId = "Choose a category.";
  } else if (!category) {
    errors.categoryId = "Choose a valid category.";
  } else if (category.type !== "EXPENSE") {
    errors.categoryId = "Choose an expense category.";
  }

  if (values.frequency !== "MONTHLY") {
    errors.frequency = "Only monthly recurring expenses are supported.";
  }

  const notes = values.notes?.trim() || "";

  if (notes.length > 1000) {
    errors.notes = "Notes must be 1000 characters or less.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function validatePaymentMethodForm(values) {
  const errors = {};
  const name = values.name?.trim() || "";

  if (!name) {
    errors.name = "Payment method name is required.";
  } else if (name.length > 80) {
    errors.name = "Payment method name must be 80 characters or less.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function getFirstValidationError(errors) {
  const firstKey = Object.keys(errors || {})[0];

  return firstKey ? errors[firstKey] : "";
}
