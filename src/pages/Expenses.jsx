import { ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import CategoryChart from "../components/CategoryChart.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ExpenseTable from "../components/ExpenseTable.jsx";
import FilterBar from "../components/FilterBar.jsx";
import LoadingState from "../components/LoadingState.jsx";
import MonthStrip from "../components/MonthStrip.jsx";
import PageHeader from "../components/PageHeader.jsx";
import SavedViews from "../components/SavedViews.jsx";
import { Button } from "../components/ui/button.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.jsx";
import { ApiError, api } from "../services/api.js";
import { useAuth } from "../services/auth.js";
import { formatCurrencyFromPaise, isAmountInput } from "../utils/currency.js";
import { formatDateRange, isValidDateInput } from "../utils/dateUtils.js";
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
  const { markUnauthenticated } = useAuth();
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
  const [statsState, setStatsState] = useState({
    data: null,
    error: "",
    status: "loading",
  });
  // Bumped after mutations so the stats circle and category chart refetch.
  const [statsVersion, setStatsVersion] = useState(0);
  // Survives tab switches (which unmount SavedViews) so the default saved
  // view is auto-applied at most once per page visit.
  const savedViewAutoApplyRef = useRef(false);

  // Consume the one-shot success notice so refresh/back does not resurrect it.
  useEffect(() => {
    if (location.state?.notice) {
      navigate(location.pathname + location.search, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const activeFilterCount = useMemo(
    () => FILTER_COUNT_KEYS.filter((key) => filters[key] !== DEFAULT_FILTERS[key]).length,
    [filters],
  );

  const handleAuthError = useCallback((error, noticeMessage) => {
    if (error instanceof ApiError && error.status === 401) {
      markUnauthenticated();
      navigate("/login", {
        replace: true,
        state: { notice: noticeMessage },
      });
      return true;
    }

    return false;
  }, [markUnauthenticated, navigate]);

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

  // Feeds the spend circle and the Categories tab. Non-blocking: the page
  // still renders if stats fail, but failures show an error instead of
  // masquerading as "no spending". statsVersion forces a refetch after
  // mutations (e.g. deleting a transaction).
  useEffect(() => {
    let isCurrent = true;

    api.getStats({ from: filters.from, to: filters.to })
      .then((data) => {
        if (isCurrent) {
          setStatsState({ data, error: "", status: "ready" });
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setStatsState({ data: null, error: getErrorMessage(error), status: "error" });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [filters.from, filters.to, statsVersion]);

  // A stale offset (bookmark, back button) past the filtered total renders an
  // empty page with live matches; clamp back to the last real page.
  useEffect(() => {
    const total = transactionState.data?.total ?? 0;
    const offset = Number(filters.offset);
    const limit = Number(filters.limit);

    if (transactionState.status === "ready" && total > 0 && offset >= total) {
      updateFilters({
        ...filters,
        offset: String(Math.floor((total - 1) / limit) * limit),
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateFilters is stable in behavior
  }, [transactionState, filters]);

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
      setStatsVersion((current) => current + 1);

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
        eyebrow="Ledger"
        title="Transactions"
        titleId="expenses-title"
        description="Search, filter, edit, and keep your ledger tidy."
        actions={(
          <Button asChild className="add-cta-desktop">
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

      <MonthStrip
        value={filters.from && filters.from === filters.to ? filters.from : ""}
        onChange={(day) => updateFilters({
          ...filters,
          from: day,
          offset: "0",
          to: day,
        })}
        onClear={() => updateFilters({
          ...filters,
          from: "",
          offset: "0",
          to: "",
        })}
      />

      {statsState.status === "error" ? (
        <ErrorState
          actionLabel="Retry"
          message={statsState.error}
          onRetry={() => setStatsVersion((current) => current + 1)}
          title="Statistics unavailable"
        />
      ) : null}

      {statsState.data ? (
        <div className="grid justify-items-center gap-4 py-2">
          <div className="grid size-44 place-items-center rounded-full bg-muted/70 p-4">
            <div
              className="grid size-full place-items-center rounded-full text-primary-foreground shadow-xl"
              style={{ background: "var(--primary-gradient)" }}
            >
              <strong className="px-3 text-center text-2xl font-bold text-primary-foreground">
                {formatCurrencyFromPaise(statsState.data.totalExpensePaise)}
              </strong>
            </div>
          </div>
          <p className="text-center text-xs font-medium text-muted-foreground">
            Expenses: {formatDateRange(filters.from, filters.to)}
          </p>
          {statsState.data.budgets?.summary?.totalBudgetedPaise > 0 ? (
            <p className="max-w-60 text-center text-sm font-bold text-foreground">
              You have spent {Math.round(
                (Number(statsState.data.budgets.summary.totalSpentPaise || 0) /
                  Number(statsState.data.budgets.summary.totalBudgetedPaise)) * 100,
              )}% of your monthly budget
            </p>
          ) : null}
        </div>
      ) : null}

      <Tabs className="grid gap-4" defaultValue="spends">
        <TabsList className="h-auto w-full justify-start gap-8 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            className="rounded-none border-b-2 border-transparent px-1 pb-3 text-base font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            value="spends"
          >
            Spends
          </TabsTrigger>
          <TabsTrigger
            className="rounded-none border-b-2 border-transparent px-1 pb-3 text-base font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            value="categories"
          >
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent className="grid gap-4" value="spends">

      <SavedViews
        autoApplyRef={savedViewAutoApplyRef}
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
          // Remount only when the *applied* filters change (chip, pill, saved
          // view); offset is pinned so paginating never clobbers a half-typed
          // draft or steals focus.
          key={JSON.stringify({ ...filters, offset: "" })}
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
          <LoadingState centered={false} title="Loading transactions" />
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

        </TabsContent>

        <TabsContent value="categories">
          <section className="panel" aria-label="Spending by category">
            {statsState.status === "error" ? (
              <ErrorState
                actionLabel="Retry"
                message={statsState.error}
                onRetry={() => setStatsVersion((current) => current + 1)}
                title="Statistics unavailable"
              />
            ) : (
              <CategoryChart items={statsState.data?.categoryBreakdown || []} />
            )}
          </section>
        </TabsContent>
      </Tabs>

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
