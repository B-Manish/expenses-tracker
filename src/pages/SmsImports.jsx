import { CheckCircle2, ChevronLeft, ChevronRight, Edit3, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AmountText from "../components/AmountText.jsx";
import CategoryBadge from "../components/CategoryBadge.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Badge } from "../components/ui/badge.jsx";
import { Button } from "../components/ui/button.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.jsx";
import { ApiError, api } from "../services/api.js";
import { useAuth } from "../services/auth.js";
import { formatDisplayDateTime } from "../utils/dateUtils.js";
import { getErrorMessage } from "../utils/validation.js";

const PAGE_SIZE = 10;
const STATUS_TABS = [
  { value: "needs_review", label: "Needs review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "all", label: "All" },
];
const VALID_STATUSES = new Set(STATUS_TABS.map((tab) => tab.value));

const CONFIDENCE_VARIANT = {
  HIGH: "success",
  MEDIUM: "warning",
  LOW: "destructive",
};
const CONFIDENCE_LABEL = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function ConfidenceBadge({ confidence }) {
  return (
    <Badge variant={CONFIDENCE_VARIANT[confidence] || "secondary"}>
      {CONFIDENCE_LABEL[confidence] || "Unknown"}
    </Badge>
  );
}

function StatusBadge({ status }) {
  if (status === "CONFIRMED") {
    return <Badge variant="success">Reviewed</Badge>;
  }

  if (status === "PENDING") {
    return <Badge variant="warning">Needs review</Badge>;
  }

  return <Badge variant="secondary">{status}</Badge>;
}

function ImportActions({ confirmingId, item, onConfirm, onDeleteRequest }) {
  return (
    <div className="row-actions">
      {item.status !== "CONFIRMED" ? (
        <Button
          aria-label={`Confirm ${item.title}`}
          disabled={confirmingId === item.id}
          onClick={() => onConfirm(item)}
          size="icon"
          title="Confirm"
          type="button"
          variant="outline"
        >
          <CheckCircle2 size={16} aria-hidden="true" />
        </Button>
      ) : null}
      {item.transactionId ? (
        <Button
          asChild
          aria-label={`Edit ${item.title}`}
          size="icon"
          title="Edit"
          variant="outline"
        >
          <Link to={`/expenses/${item.transactionId}/edit`}>
            <Edit3 size={16} aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      {item.transactionId ? (
        <Button
          aria-label={`Delete ${item.title}`}
          className="danger-icon-button"
          onClick={() => onDeleteRequest(item)}
          size="icon"
          title="Delete"
          type="button"
          variant="outline"
        >
          <Trash2 size={16} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export default function SmsImports() {
  const navigate = useNavigate();
  const { markUnauthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const status = VALID_STATUSES.has(searchParams.get("status"))
    ? searchParams.get("status")
    : "needs_review";
  const offset = useMemo(() => {
    const raw = searchParams.get("offset") || "0";
    return /^\d+$/.test(raw) ? Number(raw) : 0;
  }, [searchParams]);

  const [listState, setListState] = useState({
    data: null,
    error: "",
    status: "loading",
  });
  const [confirmingId, setConfirmingId] = useState(null);
  // Row-action failures (confirm) surface here; listState.error only covers
  // list loading, and its ErrorState replaces the whole table.
  const [actionError, setActionError] = useState("");
  const [deleteState, setDeleteState] = useState({
    error: "",
    status: "idle",
    item: null,
  });
  const [notice, setNotice] = useState("");

  const handleAuthError = useCallback(
    (error, noticeMessage) => {
      if (error instanceof ApiError && error.status === 401) {
        markUnauthenticated();
        navigate("/login", { replace: true, state: { notice: noticeMessage } });
        return true;
      }

      return false;
    },
    [markUnauthenticated, navigate],
  );

  const loadImports = useCallback(async () => {
    setListState((current) => ({ ...current, error: "", status: "loading" }));

    try {
      const data = await api.getSmsImports({
        status,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });

      setListState({ data, error: "", status: "ready" });
    } catch (error) {
      if (handleAuthError(error, "Please log in again to review SMS imports.")) {
        return;
      }

      setListState({ data: null, error: getErrorMessage(error), status: "error" });
    }
  }, [handleAuthError, offset, status]);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  function updateParams(next) {
    const params = new URLSearchParams(queryKey);

    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    setSearchParams(params);
  }

  function changeStatus(nextStatus) {
    updateParams({ status: nextStatus, offset: null });
  }

  function changePage(nextOffset) {
    updateParams({ offset: String(Math.max(0, nextOffset)) });
  }

  async function confirmImport(item) {
    setConfirmingId(item.id);
    setActionError("");

    try {
      await api.confirmSmsImport(item.id);
      setNotice("Marked as reviewed.");

      // Confirming the only row of a later page removes it from the
      // "needs review" filter; step back so the user is not stranded on an
      // empty page with no pagination controls.
      const items = listState.data?.items || [];

      if (status === "needs_review" && items.length === 1 && offset > 0) {
        changePage(offset - PAGE_SIZE);
      } else {
        await loadImports();
      }
    } catch (error) {
      if (handleAuthError(error, "Please log in again to confirm SMS imports.")) {
        return;
      }

      setActionError(getErrorMessage(error));
    } finally {
      setConfirmingId(null);
    }
  }

  async function confirmDelete() {
    const item = deleteState.item;

    if (!item?.transactionId) {
      return;
    }

    setDeleteState((current) => ({ ...current, error: "", status: "submitting" }));

    try {
      await api.deleteExpense(item.transactionId);
      setDeleteState({ error: "", status: "idle", item: null });
      setNotice("Transaction and SMS import deleted.");

      const items = listState.data?.items || [];

      if (items.length === 1 && offset > 0) {
        changePage(offset - PAGE_SIZE);
      } else {
        await loadImports();
      }
    } catch (error) {
      if (handleAuthError(error, "Please log in again to delete this transaction.")) {
        return;
      }

      setDeleteState((current) => ({
        ...current,
        error: getErrorMessage(error),
        status: "idle",
      }));
    }
  }

  const items = listState.data?.items || [];
  const total = listState.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.floor(offset / PAGE_SIZE) + 1);
  const isDeleteOpen = Boolean(deleteState.item);

  return (
    <section className="page-section" aria-labelledby="sms-imports-title">
      <PageHeader
        eyebrow="SMS Inbox"
        title="SMS Review"
        titleId="sms-imports-title"
        description="Review transactions captured from bank SMS before you trust them."
      />

      {notice ? (
        <p className="success-message" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </p>
      ) : null}

      {actionError ? (
        <p className="form-error" role="alert">{actionError}</p>
      ) : null}

      <div className="filter-tabs" role="group" aria-label="Filter by review status">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            onClick={() => changeStatus(tab.value)}
            type="button"
            variant={status === tab.value ? "default" : "outline"}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <section className="panel transactions-panel" aria-labelledby="sms-list-title">
        <div className="panel-header transactions-header">
          <div>
            <h2 id="sms-list-title">Captured messages</h2>
            <p>{total === 0 ? "0 messages" : `${total} message${total === 1 ? "" : "s"}`}</p>
          </div>
        </div>

        {listState.status === "loading" ? (
          <LoadingState centered={false} title="Loading SMS imports" />
        ) : null}

        {listState.status === "error" ? (
          <ErrorState
            actionLabel="Reload"
            message={listState.error}
            onRetry={loadImports}
            title="SMS imports unavailable"
          />
        ) : null}

        {listState.status === "ready" && items.length ? (
          <>
            <div className="table-scroll desktop-transactions" role="region" aria-label="SMS imports table">
              <Table className="transactions-table">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Date &amp; time</TableHead>
                    <TableHead scope="col">Title</TableHead>
                    <TableHead scope="col">Amount</TableHead>
                    <TableHead scope="col">Merchant</TableHead>
                    <TableHead scope="col">Category</TableHead>
                    <TableHead scope="col">Payment</TableHead>
                    <TableHead scope="col">Sender</TableHead>
                    <TableHead scope="col">Confidence</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Message</TableHead>
                    <TableHead scope="col">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {formatDisplayDateTime(item.transactionDate, item.transactionTime)}
                      </TableCell>
                      <TableCell>
                        <strong>{item.title}</strong>
                      </TableCell>
                      <TableCell>
                        {item.amountPaise === null ? (
                          <span className="text-muted-foreground">Needs review</span>
                        ) : (
                          <AmountText
                            amountPaise={item.amountPaise}
                            type={item.suggestedType}
                          />
                        )}
                      </TableCell>
                      <TableCell>{item.merchant || "—"}</TableCell>
                      <TableCell>
                        <CategoryBadge label={item.categoryName || "Uncategorized"} />
                      </TableCell>
                      <TableCell>{item.paymentMethodName || "Not set"}</TableCell>
                      <TableCell>{item.sender}</TableCell>
                      <TableCell><ConfidenceBadge confidence={item.confidence} /></TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell>
                        {item.rawMessage ? (
                          <details className="sms-raw-message">
                            <summary>View</summary>
                            <p>{item.rawMessage}</p>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">Not stored</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ImportActions
                          confirmingId={confirmingId}
                          item={item}
                          onConfirm={confirmImport}
                          onDeleteRequest={(target) => setDeleteState({ error: "", status: "idle", item: target })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="mobile-transaction-list">
              {items.map((item) => (
                <li className="transaction-card" key={item.id}>
                  <div className="transaction-card-main">
                    <div>
                      <div className="transaction-card-title">
                        <strong>{item.title}</strong>
                        <StatusBadge status={item.status} />
                      </div>
                      <span>
                        {formatDisplayDateTime(item.transactionDate, item.transactionTime)}
                        {item.merchant ? ` - ${item.merchant}` : ""}
                      </span>
                    </div>
                  </div>

                  <dl className="transaction-meta">
                    <div>
                      <dt>Category</dt>
                      <dd><CategoryBadge label={item.categoryName || "Uncategorized"} /></dd>
                    </div>
                    <div>
                      <dt>Payment</dt>
                      <dd>{item.paymentMethodName || "Not set"}</dd>
                    </div>
                    <div>
                      <dt>Confidence</dt>
                      <dd><ConfidenceBadge confidence={item.confidence} /></dd>
                    </div>
                  </dl>

                  {item.rawMessage ? (
                    <details className="sms-raw-message">
                      <summary>View original message from {item.sender}</summary>
                      <p>{item.rawMessage}</p>
                    </details>
                  ) : null}

                  <div className="transaction-card-footer">
                    {item.amountPaise === null ? (
                      <span className="text-muted-foreground">Amount needs review</span>
                    ) : (
                      <AmountText amountPaise={item.amountPaise} type={item.suggestedType} />
                    )}
                    <ImportActions
                      confirmingId={confirmingId}
                      item={item}
                      onConfirm={confirmImport}
                      onDeleteRequest={(target) => setDeleteState({ error: "", status: "idle", item: target })}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="pagination-bar" aria-label="Pagination">
              <Button
                disabled={offset <= 0}
                onClick={() => changePage(offset - PAGE_SIZE)}
                type="button"
                variant="outline"
              >
                <ChevronLeft size={18} aria-hidden="true" />
                Previous
              </Button>
              <span>Page {currentPage} of {totalPages}</span>
              <Button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => changePage(offset + PAGE_SIZE)}
                type="button"
                variant="outline"
              >
                Next
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </>
        ) : null}

        {listState.status === "ready" && !items.length ? (
          <EmptyState
            message={
              status === "needs_review"
                ? "No SMS transactions are waiting for review."
                : "No SMS transactions match this filter."
            }
            title="Nothing to review"
          />
        ) : null}
      </section>

      <ConfirmDialog
        confirmLabel="Delete transaction"
        error={deleteState.error}
        isBusy={deleteState.status === "submitting"}
        message={
          deleteState.item
            ? `Delete "${deleteState.item.title}"? This removes the transaction and its raw SMS import. This cannot be undone.`
            : ""
        }
        onCancel={() => setDeleteState({ error: "", status: "idle", item: null })}
        onConfirm={confirmDelete}
        open={isDeleteOpen}
        title="Delete SMS transaction"
      />
    </section>
  );
}
