import { formatCurrencyFromPaise } from "../utils/currency.js";

export default function AmountText({
  amountPaise,
  className = "",
  showSign = true,
  type = "EXPENSE",
}) {
  if (amountPaise === null || amountPaise === undefined) {
    return <span className={["amount", "text-muted-foreground", className].filter(Boolean).join(" ")}>Amount unavailable</span>;
  }

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
