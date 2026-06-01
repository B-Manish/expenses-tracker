import { CalendarDays, Edit3, ReceiptText, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDisplayDateTime } from "../utils/dateUtils.js";
import AmountText from "./AmountText.jsx";
import CategoryBadge from "./CategoryBadge.jsx";

function TypeBadge({ type }) {
  return (
    <span className={type === "INCOME" ? "type-badge income" : "type-badge expense"}>
      {type === "INCOME" ? "Income" : "Expense"}
    </span>
  );
}

function CategoryLabel({ transaction }) {
  return (
    <CategoryBadge
      color={transaction.category?.color || "#64748b"}
      label={transaction.categoryName || "Uncategorized"}
    />
  );
}

function TransactionActions({ onDeleteRequest, transaction }) {
  return (
    <div className="row-actions">
      <Link
        aria-label={`Edit ${transaction.title}`}
        className="icon-button"
        title={`Edit ${transaction.title}`}
        to={`/expenses/${transaction.id}/edit`}
      >
        <Edit3 size={16} aria-hidden="true" />
      </Link>
      <button
        aria-label={`Delete ${transaction.title}`}
        className="icon-button danger-icon-button"
        onClick={() => onDeleteRequest(transaction)}
        title={`Delete ${transaction.title}`}
        type="button"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ExpenseTable({ items = [], onDeleteRequest }) {
  return (
    <div className="transactions-view">
      <div className="table-scroll desktop-transactions" role="region" aria-label="Transactions table">
        <table className="transactions-table">
          <thead>
            <tr>
              <th scope="col">Transaction</th>
              <th scope="col">Type</th>
              <th scope="col">Category</th>
              <th scope="col">Payment</th>
              <th scope="col">Date & time</th>
              <th scope="col">Amount</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((transaction) => (
              <tr key={transaction.id}>
                <td>
                  <div className="table-title-cell">
                    <strong>{transaction.title}</strong>
                    <span>{transaction.merchant || "No merchant/source"}</span>
                  </div>
                </td>
                <td><TypeBadge type={transaction.type} /></td>
                <td><CategoryLabel transaction={transaction} /></td>
                <td>{transaction.paymentMethodName || "Not set"}</td>
                <td>{formatDisplayDateTime(transaction.transactionDate, transaction.transactionTime)}</td>
                <td>
                  <AmountText amountPaise={transaction.amountPaise} type={transaction.type} />
                </td>
                <td>
                  <TransactionActions onDeleteRequest={onDeleteRequest} transaction={transaction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mobile-transaction-list">
        {items.map((transaction) => (
          <li className="transaction-card" key={transaction.id}>
            <div className="transaction-card-main">
              <div className="list-icon" aria-hidden="true">
                <ReceiptText size={18} />
              </div>
              <div>
                <div className="transaction-card-title">
                  <strong>{transaction.title}</strong>
                  <TypeBadge type={transaction.type} />
                </div>
                <span>{transaction.merchant || "No merchant/source"}</span>
              </div>
            </div>

            <dl className="transaction-meta">
              <div>
                <dt>Category</dt>
                <dd><CategoryLabel transaction={transaction} /></dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{transaction.paymentMethodName || "Not set"}</dd>
              </div>
              <div>
                <dt>Date & time</dt>
                <dd>
                  <CalendarDays size={15} aria-hidden="true" />
                  {formatDisplayDateTime(transaction.transactionDate, transaction.transactionTime)}
                </dd>
              </div>
            </dl>

            <div className="transaction-card-footer">
              <AmountText amountPaise={transaction.amountPaise} type={transaction.type} />
              <TransactionActions onDeleteRequest={onDeleteRequest} transaction={transaction} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
