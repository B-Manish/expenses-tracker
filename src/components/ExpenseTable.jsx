import { CalendarDays, Edit3, ReceiptText, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDisplayDateTime } from "../utils/dateUtils.js";
import AmountText from "./AmountText.jsx";
import CategoryBadge from "./CategoryBadge.jsx";
import { Badge } from "./ui/badge.jsx";
import { Button } from "./ui/button.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table.jsx";

function TypeBadge({ type }) {
  return (
    <Badge className={type === "INCOME" ? "type-badge income" : "type-badge expense"} variant="secondary">
      {type === "INCOME" ? "Income" : "Expense"}
    </Badge>
  );
}

function SourceBadge({ source }) {
  const isSms = source === "SMS";

  return (
    <Badge className={isSms ? "source-badge sms" : "source-badge manual"} variant="secondary">
      {isSms ? "SMS captured" : "Manual"}
    </Badge>
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
      <Button
        asChild
        aria-label={`Edit ${transaction.title}`}
        size="icon"
        title={`Edit ${transaction.title}`}
        variant="outline"
      >
        <Link to={`/expenses/${transaction.id}/edit`}>
          <Edit3 size={16} aria-hidden="true" />
        </Link>
      </Button>
      <Button
        aria-label={`Delete ${transaction.title}`}
        className="danger-icon-button"
        onClick={() => onDeleteRequest(transaction)}
        size="icon"
        title={`Delete ${transaction.title}`}
        type="button"
        variant="outline"
      >
        <Trash2 size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

export default function ExpenseTable({ items = [], onDeleteRequest }) {
  return (
    <div className="transactions-view">
      <div className="table-scroll desktop-transactions" role="region" aria-label="Transactions table">
        <Table className="transactions-table">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Transaction</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Source</TableHead>
              <TableHead scope="col">Category</TableHead>
              <TableHead scope="col">Payment</TableHead>
              <TableHead scope="col">Date & time</TableHead>
              <TableHead scope="col">Amount</TableHead>
              <TableHead scope="col">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>
                  <div className="table-title-cell">
                    <strong>{transaction.title}</strong>
                    {transaction.merchant ? <span>{transaction.merchant}</span> : null}
                  </div>
                </TableCell>
                <TableCell><TypeBadge type={transaction.type} /></TableCell>
                <TableCell><SourceBadge source={transaction.source} /></TableCell>
                <TableCell><CategoryLabel transaction={transaction} /></TableCell>
                <TableCell>{transaction.paymentMethodName || "Not set"}</TableCell>
                <TableCell>{formatDisplayDateTime(transaction.transactionDate, transaction.transactionTime)}</TableCell>
                <TableCell>
                  <AmountText amountPaise={transaction.amountPaise} type={transaction.type} />
                </TableCell>
                <TableCell>
                  <TransactionActions onDeleteRequest={onDeleteRequest} transaction={transaction} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
                {transaction.merchant ? <span>{transaction.merchant}</span> : null}
              </div>
            </div>

            <dl className="transaction-meta">
              <div>
                <dt>Category</dt>
                <dd><CategoryLabel transaction={transaction} /></dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd><SourceBadge source={transaction.source} /></dd>
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
