import { ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ExpenseTable from "../components/ExpenseTable.jsx";
import FilterBar from "../components/FilterBar.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SavedViews from "../components/SavedViews.jsx";
import { Button } from "../components/ui/button.jsx";
import { ApiError, api } from "../services/api.js";
import { isAmountInput } from "../utils/currency.js";
import { isValidDateInput } from "../utils/dateUtils.js";
import { LIMIT_OPTIONS, SORT_OPTIONS } from "../utils/transactionOptions.js";
import { getErrorMessage } from "../utils/validation.js";

const DEFAULT_FILTERS = Object.freeze({
  categoryId: "",
  from: "",
  limit: "10",
  maxAmount: "",
  minAmount: "",
  offset: "0",
  paymentMethodId: "",
  search: "",
  source: "ALL",
  sort: "transaction_date_desc",
  to: "",
  type: "ALL",
  uncategorized: "",
});

const VALID_TYPES = new Set(["ALL", "EXPENSE", "INCOME"]);
const VALID_SOURCES = new Set(["ALL", "MANUAL", "SMS"]);
const VALID_SORTS = new Set(SORT_OPTIONS.map((option) => option.value));
const VALID_LIMITS = new Set(LIMIT_OPTIONS.map((option) => option.value));
const FILTER_COUNT_KEYS = [
  "categoryId",
  "from",
  "maxAmount",
  "minAmount",
  "paymentMethodId",
  "search",
  "source",
  "to",
  "type",
  "uncategorized",
];

function isPositiveId(value) {
  return /^\d+$/.test(value || "") && Number(value) > 0;
}

function normalizeOffset(value) {
  if (!/^\d+$/.test(value || "")) {
    return DEFAULT_FILTERS.offset;
  }

  return String(Number(value));
}

function readFilters(searchParams) {
  const type = searchParams.get("type") || DEFAULT_FILTERS.type;
  const sort = searchParams.get("sort") || DEFAULT_FILTERS.sort;
  const limit = searchParams.get("limit") || DEFAULT_FILTERS.limit;
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const paymentMethodId = searchParams.get("paymentMethodId") || "";
  const validFrom = from && isValidDateInput(from) ? from : "";
  const validTo = to && isValidDateInput(to) ? to : "";
  const hasValidRange = !(validFrom && validTo && validFrom > validTo);
  const rawMin = searchParams.get("minAmount") || "";
  const rawMax = searchParams.get("maxAmount") || "";
  const validMin = isAmountInput(rawMin) ? rawMin : "";
  const validMax = isAmountInput(rawMax) ? rawMax : "";
  const hasValidAmountRange = !(validMin && validMax && Number(validMin) > Number(validMax));
  const uncategorized = searchParams.get("uncategorized") === "true";

  return {
    categoryId: !uncategorized && isPositiveId(categoryId) ? categoryId : "",
    from: hasValidRange ? validFrom : "",
    limit: VALID_LIMITS.has(limit) ? limit : DEFAULT_FILTERS.limit,
    maxAmount: hasValidAmountRange ? validMax : "",
    minAmount: hasValidAmountRange ? validMin : "",
    offset: normalizeOffset(searchParams.get("offset") || DEFAULT_FILTERS.offset),
    paymentMethodId: isPositiveId(paymentMethodId) ? paymentMethodId : "",
    search: (searchParams.get("search") || "").slice(0, 120),
    source: VALID_SOURCES.has(searchParams.get("source"))
      ? searchParams.get("source")
      : DEFAULT_FILTERS.source,
    sort: VALID_SORTS.has(sort) ? sort : DEFAULT_FILTERS.sort,
    to: hasValidRange ? validTo : "",
    type: VALID_TYPES.has(type) ? type : DEFAULT_FILTERS.type,
    uncategorized: uncategorized ? "true" : "",
  };
}

function writeFiltersToParams(filters) {
  const params = new URLSearchParams();

  for (const [key, defaultValue] of Object.entries(DEFAULT_FILTERS)) {
    const value = filters[key];

    if (value && value !== defaultValue) {
      params.set(key, value);
    }
  }

  return params;
}

function toApiQuery(filters) {
  return {
    categoryId: filters.uncategorized === "true" ? "" : filters.categoryId,
    from: filters.from,
    limit: filters.limit,
    maxAmount: filters.maxAmount,
    minAmount: filters.minAmount,
    offset: filters.offset,
    paymentMethodId: filters.paymentMethodId,
    search: filters.search,
    source: filters.source,
    sort: filters.sort,
    to: filters.to,
    type: filters.type,
    uncategorized: filters.uncategorized,
  };
}

function hasActiveFilters(filters) {
  return FILTER_COUNT_KEYS.some((key) => filters[key] !== DEFAULT_FILTERS[key]);
}

function getRangeText(total, offset, limit, itemCount) {
  if (total === 0) {
    return "0 transactions";
  }

  const start = offset + 1;
  const end = Math.min(offset + itemCount, total);

  return `${start}-${end} of ${total}`;
}

export default function Expenses() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(queryKey)), [queryKey]);
  const [referenceState, setReferenceState] = useState({
    categories: [],
    error: "",
    paymentMethods: [],
    status: "loading",
  });
  const [transactionState, setTransactionState] = useState({
    data: null,
    error: "",
    status: "loading",
  });
  const [deleteState, setDeleteState] = useState({
    error: "",
    status: "idle",
    transaction: null,
  });
  const [notice, setNotice] = useState(location.state?.notice || "");

  const activeFilterCount = useMemo(
    () => FILTER_COUNT_KEYS.filter((key) => filters[key] !== DEFAULT_FILTERS[key]).length,
    [filters],
  );

  const handleAuthError = useCallback((error, noticeMessage) => {
    if (error instanceof ApiError && error.status === 401) {
      navigate("/login", {
        replace: true,
        state: { notice: noticeMessage },
      });
      return true;
    }

    return false;
  }, [navigate]);

  const loadReferences = useCallback(async () => {
    setReferenceState((current) => ({
      ...current,
      error: "",
      status: "loading",
    }));

    try {
      const [categories, paymentMethods] = await Promise.all([
        api.getCategories(),
        api.getPaymentMethods(),
      ]);

      setReferenceState({
        categories: categories?.items || [],
        error: "",
        paymentMethods: paymentMethods?.items || [],
        status: "ready",
      });
    } catch (error) {
      if (handleAuthError(error, "Please log in again to view transactions.")) {
        return;
      }

      setReferenceState({
        categories: [],
        error: getErrorMessage(error),
        paymentMethods: [],
        status: "error",
      });
    }
  }, [handleAuthError]);

  const loadTransactions = useCallback(async () => {
    setTransactionState((current) => ({
      ...current,
      error: "",
      status: "loading",
    }));

    try {
      const data = await api.getExpenses(toApiQuery(filters));

      setTransactionState({
        data,
        error: "",
        status: "ready",
      });
    } catch (error) {
      if (handleAuthError(error, "Please log in again to view transactions.")) {
        return;
      }

      setTransactionState({
        data: null,
        error: getErrorMessage(error),
        status: "error",
      });
    }
  }, [filters, handleAuthError]);

  useEffect(() => {
    let isCurrent = true;

    Promise.all([
      api.getCategories(),
      api.getPaymentMethods(),
    ])
      .then(([categories, paymentMethods]) => {
        if (isCurrent) {
          setReferenceState({
            categories: categories?.items || [],
            error: "",
            paymentMethods: paymentMethods?.items || [],
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        if (handleAuthError(error, "Please log in again to view transactions.")) {
          return;
        }

        setReferenceState({
          categories: [],
          error: getErrorMessage(error),
          paymentMethods: [],
          status: "error",
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [handleAuthError]);

  useEffect(() => {
    let isCurrent = true;

    setTransactionState((current) => ({
      ...current,
      error: "",
      status: "loading",
    }));

    api.getExpenses(toApiQuery(filters))
      .then((data) => {
        if (isCurrent) {
          setTransactionState({
            data,
            error: "",
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        if (handleAuthError(error, "Please log in again to view transactions.")) {
          return;
        }

        setTransactionState({
          data: null,
          error: getErrorMessage(error),
          status: "error",
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [filters, handleAuthError]);

  function updateFilters(nextFilters, options = {}) {
    const params = writeFiltersToParams({
      ...DEFAULT_FILTERS,
      ...nextFilters,
    });

    setSearchParams(params, {
      replace: options.replace ?? false,
    });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  function changePage(nextOffset) {
    updateFilters({
      ...filters,
      offset: String(Math.max(0, nextOffset)),
    });
  }

  async function confirmDelete() {
    const transaction = deleteState.transaction;

    if (!transaction) {
      return;
    }

    setDeleteState((current) => ({
      ...current,
      error: "",
      status: "submitting",
    }));

    try {
      await api.deleteExpense(transaction.id);
      setDeleteState({
        error: "",
        status: "idle",
        transaction: null,
      });
      setNotice("Transaction deleted.");

      const items = transactionState.data?.items || [];
      const offset = Number(filters.offset);
      const limit = Number(filters.limit);

      if (items.length === 1 && offset > 0) {
        changePage(Math.max(0, offset - limit));
      } else {
        loadTransactions();
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

  const items = transactionState.data?.items || [];
  const total = transactionState.data?.total ?? 0;
  const limit = Number(filters.limit);
  const offset = Number(filters.offset);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(totalPages, Math.floor(offset / limit) + 1);
  const isLoading = transactionState.status === "loading" || referenceState.status === "loading";
  const isDeleteOpen = Boolean(deleteState.transaction);
  const hasFilters = hasActiveFilters(filters);

  return (
    <section className="page-section" aria-labelledby="expenses-title">
      <PageHeader
        eyebrow="Transactions"
        title="Expenses and income"
        titleId="expenses-title"
        description="Search, filter, edit, and keep your ledger tidy."
        actions={(
          <Button asChild>
            <Link to="/expenses/new">
              <PlusCircle size={18} aria-hidden="true" />
              Add transaction
            </Link>
          </Button>
        )}
      />

      {notice ? (
        <p className="success-message" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>Dismiss</button>
        </p>
      ) : null}

      <SavedViews
        canApplyDefault={!hasActiveFilters(filters)}
        currentFilters={filters}
        onApply={updateFilters}
        onAuthError={handleAuthError}
      />

      {referenceState.status === "error" ? (
        <ErrorState
          actionLabel="Reload filters"
          message={referenceState.error}
          onRetry={loadReferences}
          title="Filters unavailable"
        />
      ) : (
        <FilterBar
          categories={referenceState.categories}
          filters={filters}
          isLoading={isLoading}
          key={queryKey || "default-filters"}
          onApply={updateFilters}
          onClear={clearFilters}
          paymentMethods={referenceState.paymentMethods}
        />
      )}

      <section className="panel transactions-panel" aria-labelledby="transactions-title">
        <div className="panel-header transactions-header">
          <div>
            <h2 id="transactions-title">All transactions</h2>
            <p>
              {getRangeText(total, offset, limit, items.length)}
              {activeFilterCount ? ` with ${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        </div>

        {transactionState.status === "loading" ? (
          <LoadingState title="Loading transactions" message="Fetching matching records." />
        ) : null}

        {transactionState.status === "error" ? (
          <ErrorState
            actionLabel="Reload"
            message={transactionState.error}
            onRetry={loadTransactions}
            title="Transactions unavailable"
          />
        ) : null}

        {transactionState.status === "ready" && items.length ? (
          <>
            <ExpenseTable
              items={items}
              onDeleteRequest={(transaction) => setDeleteState({
                error: "",
                status: "idle",
                transaction,
              })}
            />

            <div className="pagination-bar" aria-label="Pagination">
              <Button
                disabled={offset <= 0}
                onClick={() => changePage(offset - limit)}
                type="button"
                variant="outline"
              >
                <ChevronLeft size={18} aria-hidden="true" />
                Previous
              </Button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                disabled={offset + limit >= total}
                onClick={() => changePage(offset + limit)}
                type="button"
                variant="outline"
              >
                Next
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
            </div>
          </>
        ) : null}

        {transactionState.status === "ready" && !items.length ? (
          <EmptyState
            action={
              hasFilters ? (
                <Button onClick={clearFilters} type="button" variant="outline">
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/expenses/new">
                    <PlusCircle size={18} aria-hidden="true" />
                    Add transaction
                  </Link>
                </Button>
              )
            }
            message={hasFilters ? "Try widening the date range or clearing filters." : "Add your first expense or income entry."}
            title={hasFilters ? "No matching transactions" : "No transactions yet"}
          />
        ) : null}
      </section>

      <ConfirmDialog
        confirmLabel="Delete transaction"
        error={deleteState.error}
        isBusy={deleteState.status === "submitting"}
        message={deleteState.transaction ? `Delete "${deleteState.transaction.title}"? This cannot be undone.` : ""}
        onCancel={() => setDeleteState({
          error: "",
          status: "idle",
          transaction: null,
        })}
        onConfirm={confirmDelete}
        open={isDeleteOpen}
        title="Delete transaction"
      />
    </section>
  );
}
