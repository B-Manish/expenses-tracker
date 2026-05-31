import { formatCurrencyFromPaise } from "../utils/currency.js";

export default function AmountText({
  amountPaise,
  className = "",
  showSign = true,
  type = "EXPENSE",
}) {
  const isIncome = type === "INCOME";
  const sign = showSign ? (isIncome ? "+" : "-") : "";
  const amountClassName = ["amount", isIncome ? "income-text" : "expense-text", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={amountClassName}>
      {sign}
      {formatCurrencyFromPaise(amountPaise)}
    </span>
  );
}
