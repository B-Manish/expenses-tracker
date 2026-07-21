import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Landmark,
  PiggyBank,
  ReceiptText,
  Scale,
  Tags,
  TrendingDown,
  TrendingUp,
  Trophy,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CategoryChart from "../components/CategoryChart.jsx";
import AmountText from "../components/AmountText.jsx";
import DashboardCard from "../components/DashboardCard.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatCard from "../components/StatCard.jsx";
import TrendChart from "../components/TrendChart.jsx";
import { Button } from "../components/ui/button.jsx";
import { ApiError, api } from "../services/api.js";
import { useAuth } from "../services/auth.js";
import { formatCurrencyFromPaise, formatSignedCurrencyFromPaise } from "../utils/currency.js";
import { formatDisplayDateTime } from "../utils/dateUtils.js";
import { getErrorMessage } from "../utils/validation.js";

function toAmount(value) {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
}

function formatCount(value) {
  const count = Number(value ?? 0);

  return Number.isFinite(count) ? String(count) : "0";
}

function pluralizeTransactions(count) {
  return `${count} transaction${count === 1 ? "" : "s"}`;
}

function IncomeExpenseSummary({ expensePaise, incomePaise, netBalancePaise }) {
  const income = Math.max(toAmount(incomePaise), 0);
  const expense = Math.max(toAmount(expensePaise), 0);
  const max = Math.max(income, expense, 1);
  const incomeWidth = `${Math.max((income / max) * 100, income > 0 ? 4 : 0)}%`;
  const expenseWidth = `${Math.max((expense / max) * 100, expense > 0 ? 4 : 0)}%`;

  return (
    <div className="comparison-stack">
      <div className="comparison-row">
        <div>
          <span>Income</span>
          <strong className="income-text">{formatCurrencyFromPaise(income)}</strong>
        </div>
        <div className="comparison-track" aria-hidden="true">
          <span className="comparison-fill income-fill" style={{ width: incomeWidth }} />
        </div>
      </div>

      <div className="comparison-row">
        <div>
          <span>Expenses</span>
          <strong className="expense-text">{formatCurrencyFromPaise(expense)}</strong>
        </div>
        <div className="comparison-track" aria-hidden="true">
          <span className="comparison-fill expense-fill" style={{ width: expenseWidth }} />
        </div>
      </div>

      <div className="net-summary">
        <span>Net balance for selected period</span>
        <strong className={toAmount(netBalancePaise) < 0 ? "expense-text" : "income-text"}>
          {formatSignedCurrencyFromPaise(netBalancePaise)}
        </strong>
      </div>
    </div>
  );
}

function RecentTransactions({ items = [] }) {
  if (!items.length) {
    return <EmptyState title="No transactions yet" message="New transactions will appear here." />;
  }

  return (
    <ul className="item-list">
      {items.map((transaction) => (
        <li className="list-row" key={transaction.id}>
          <div className="list-icon" aria-hidden="true">
            <ReceiptText size={18} />
          </div>
          <div className="list-content">
            <Link className="row-title-link" to={`/expenses/${transaction.id}/edit`}>
              {transaction.title || "Untitled transaction"}
            </Link>
            <span>
              {formatDisplayDateTime(transaction.transactionDate, transaction.transactionTime)}
              {transaction.categoryName ? ` - ${transaction.categoryName}` : ""}
            </span>
          </div>
          <AmountText amountPaise={transaction.amountPaise} type={transaction.type} />
        </li>
      ))}
    </ul>
  );
}

function RecurringExpensesPreview({ items = [] }) {
  if (!items.length) {
    return <EmptyState title="No fixed monthly expenses" message="Active recurring expenses will appear here." />;
  }

  return (
    <ul className="item-list">
      {items.slice(0, 5).map((expense) => (
        <li className="list-row" key={expense.id}>
          <div className="list-icon" aria-hidden="true">
            <CalendarClock size={18} />
          </div>
          <div className="list-content">
            <strong>{expense.title || "Untitled recurring expense"}</strong>
            <span>
              Day {expense.billingDay}
              {expense.categoryName ? ` - ${expense.categoryName}` : ""}
            </span>
          </div>
          <AmountText amountPaise={expense.amountPaise} showSign={false} type="EXPENSE" />
        </li>
      ))}
    </ul>
  );
}

const BUDGET_STATUS_LABEL = {
  under: "On track",
  near: "Near limit",
  over: "Over budget",
};
const BUDGET_STATUS_ORDER = { over: 0, near: 1, under: 2 };

function BudgetsSummary({ data }) {
  const items = data?.items || [];
  const summary = data?.summary || null;

  if (!items.length) {
    return (
      <EmptyState
        title="No budgets yet"
        message="Set monthly category budgets to track spending against limits."
      />
    );
  }

  const sorted = [...items]
    .sort((first, second) => (
      (BUDGET_STATUS_ORDER[first.status] ?? 3) - (BUDGET_STATUS_ORDER[second.status] ?? 3) ||
      second.percentUsed - first.percentUsed
    ))
    .slice(0, 5);

  return (
    <div className="comparison-stack">
      <div className="net-summary budget-summary-totals">
        <span>
          {formatCurrencyFromPaise(summary?.totalSpentPaise || 0)} of {formatCurrencyFromPaise(summary?.totalBudgetedPaise || 0)}
        </span>
        <strong className={toAmount(summary?.totalRemainingPaise) < 0 ? "expense-text" : "income-text"}>
          {formatCurrencyFromPaise(summary?.totalRemainingPaise || 0)} left
        </strong>
      </div>
      {sorted.map((budget) => (
        <div className="budget-progress" key={budget.id}>
          <div className="comparison-row">
            <div>
              <span>{budget.categoryName || "Uncategorized"}</span>
              <strong className={budget.status === "over" ? "expense-text" : ""}>
                {budget.percentUsed}% - {BUDGET_STATUS_LABEL[budget.status] || ""}
              </strong>
            </div>
          </div>
          <div className="comparison-track" aria-hidden="true">
            <span
              className={`comparison-fill budget-fill ${budget.status}`}
              style={{ width: `${Math.min(budget.percentUsed, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { markUnauthenticated } = useAuth();
  const [state, setState] = useState({
    data: null,
    error: "",
    status: "loading",
  });

  const handleAuthError = useCallback((error) => {
    if (error instanceof ApiError && error.status === 401) {
      markUnauthenticated();
      navigate("/login", {
        replace: true,
        state: { notice: "Please log in again to view your dashboard." },
      });
      return true;
    }

    return false;
  }, [markUnauthenticated, navigate]);

  const loadStats = useCallback(async () => {
    setState((current) => ({
      ...current,
      error: "",
      status: "loading",
    }));

    try {
      const data = await api.getStats();

      setState({
        data,
        error: "",
        status: "ready",
      });
    } catch (error) {
      if (handleAuthError(error)) {
        return;
      }

      setState({
        data: null,
        error: getErrorMessage(error),
        status: "error",
      });
    }
  }, [handleAuthError]);

  // Deferred so the loading setState inside loadStats is not synchronous in
  // the effect body; the cleanup also dedupes StrictMode's double mount.
  useEffect(() => {
    const timer = setTimeout(loadStats, 0);

    return () => clearTimeout(timer);
  }, [loadStats]);

  if (state.status === "loading") {
    return <LoadingState title="Loading dashboard" />;
  }

  if (state.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          title="Dashboard unavailable"
          message={state.error}
          actionLabel="Reload"
          onRetry={loadStats}
        />
      </section>
    );
  }

  const stats = state.data;

  if (!stats) {
    return (
      <section className="page-section narrow-section">
        <EmptyState title="No dashboard data" message="No summary data was returned." />
      </section>
    );
  }

  const biggestExpense = stats.biggestExpense;
  const mostUsedCategory = stats.mostUsedCategory;
  const mostUsedCount = Number(mostUsedCategory?.count ?? 0);
  const periodLabel = "Current month";
  const cards = [
    {
      detail: "Asia/Kolkata today",
      icon: CalendarDays,
      label: "Today spent",
      tone: "expense",
      value: formatCurrencyFromPaise(stats.todaySpentPaise),
    },
    {
      detail: "Current week",
      icon: TrendingDown,
      label: "This week",
      tone: "expense",
      value: formatCurrencyFromPaise(stats.weekSpentPaise),
    },
    {
      detail: "Current month",
      icon: CreditCard,
      label: "This month",
      tone: "expense",
      value: formatCurrencyFromPaise(stats.monthSpentPaise),
    },
    {
      detail: periodLabel,
      icon: TrendingUp,
      label: "Total income",
      tone: "income",
      value: formatCurrencyFromPaise(stats.totalIncomePaise),
    },
    {
      className: "hero",
      detail: periodLabel,
      icon: WalletCards,
      label: "Total expense",
      tone: "expense",
      value: formatCurrencyFromPaise(stats.totalExpensePaise),
    },
    {
      detail: "Income minus expenses",
      icon: Scale,
      label: "Net balance",
      tone: toAmount(stats.netBalancePaise) < 0 ? "expense" : "balance",
      value: formatSignedCurrencyFromPaise(stats.netBalancePaise),
    },
    {
      detail: "Active fixed monthly costs",
      icon: CalendarClock,
      label: "Recurring",
      tone: "expense",
      value: formatCurrencyFromPaise(stats.totalMonthlyRecurringPaise),
    },
    {
      detail: periodLabel,
      icon: ReceiptText,
      label: "Transactions",
      tone: "neutral",
      value: formatCount(stats.transactionCount),
    },
  ];
  const insights = [
    {
      detail: biggestExpense
        ? `${biggestExpense.title || "Untitled"} on ${formatDisplayDateTime(
          biggestExpense.transactionDate,
          biggestExpense.transactionTime,
        )}`
        : "No expenses in this period",
      icon: Trophy,
      label: "Biggest expense",
      tone: "expense",
      value: biggestExpense ? formatCurrencyFromPaise(biggestExpense.amountPaise) : "None yet",
    },
    {
      detail: mostUsedCategory ? pluralizeTransactions(mostUsedCount) : "No expense categories yet",
      icon: Landmark,
      label: "Most used category",
      tone: "neutral",
      value: mostUsedCategory?.category || "None yet",
    },
    {
      detail: "Average expense per day this month",
      icon: PiggyBank,
      label: "Daily average",
      tone: "balance",
      value: formatCurrencyFromPaise(stats.averageDailySpendPaise),
    },
  ];

  return (
    <section className="page-section" aria-labelledby="dashboard-title">
      <PageHeader
        title="Overview"
        titleId="dashboard-title"
        description="Track your spending, income, and recurring payments in one calm view."
        actions={(
          <Button asChild className="add-cta-desktop">
            <Link to="/expenses/new">
              <CircleDollarSign size={18} aria-hidden="true" />
              Add transaction
            </Link>
          </Button>
        )}
      />

      <div
        aria-label="Spending summary cards"
        className="summary-grid dashboard-summary-grid"
        role="region"
        tabIndex={0}
      >
        {cards.map((card) => (
          <StatCard
            className={card.className || ""}
            detail={card.detail}
            icon={card.icon}
            key={card.label}
            label={card.label}
            tone={card.tone}
            value={card.value}
          />
        ))}
      </div>

      <nav className="quick-actions" aria-label="Quick actions">
        <Link className="quick-pill primary" to="/budgets">
          <PiggyBank size={18} aria-hidden="true" />
          Budgets
        </Link>
        <Link className="quick-pill" to="/recurring-expenses">
          <BellRing size={18} aria-hidden="true" />
          Recurring
        </Link>
        <Link className="quick-pill" to="/categories">
          <Tags size={18} aria-hidden="true" />
          Categories
        </Link>
      </nav>

      <div className="insight-grid">
        {insights.map(({ detail, icon: Icon, label, tone, value }) => (
          <article className={`insight-card ${tone}`} key={label}>
            <span className="insight-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
              <span>{detail}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="content-grid dashboard-chart-grid">
        <DashboardCard
          title="Spending by category"
          titleId="category-title"
          description="Expense breakdown for the current month."
        >
          <CategoryChart items={stats.categoryBreakdown || []} />
        </DashboardCard>

        <DashboardCard
          title="Income vs expense"
          titleId="income-expense-title"
          description="Side-by-side monthly totals with net balance."
        >
          <IncomeExpenseSummary
            expensePaise={stats.totalExpensePaise}
            incomePaise={stats.totalIncomePaise}
            netBalancePaise={stats.netBalancePaise}
          />
        </DashboardCard>

        <DashboardCard
          className="wide-panel"
          title="Daily spending trend"
          titleId="daily-title"
          description="Zero-value days stay visible so gaps are easy to spot."
        >
          <TrendChart
            data={stats.dailyTrend || []}
            emptyMessage="Daily spending will appear after transactions exist."
            emptyTitle="No daily spending"
          />
        </DashboardCard>

        <DashboardCard
          className="wide-panel"
          title="Monthly spending trend"
          titleId="monthly-title"
          description="Current-year expense totals, including months with no spending."
        >
          <TrendChart
            data={stats.monthlyTrend || []}
            emptyMessage="Monthly spending will appear after transactions exist."
            emptyTitle="No monthly spending"
            mode="monthly"
          />
        </DashboardCard>
      </div>

      <div className="content-grid two-column-grid">
        <DashboardCard
          title="Budgets"
          titleId="budgets-summary-title"
          description="Monthly category limits, over-budget and near-limit first."
          actions={(
            <Link className="text-link" to="/budgets">
              Manage
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        >
          <BudgetsSummary data={stats.budgets} />
        </DashboardCard>

        <DashboardCard
          title="Latest entries"
          titleId="recent-title"
          description="The latest entries across expenses and income."
          actions={(
            <Link className="text-link" to="/expenses">
              View all
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        >
          <RecentTransactions items={stats.recentTransactions || []} />
        </DashboardCard>

        <DashboardCard
          title="Fixed monthly expenses"
          titleId="fixed-expenses-title"
          description="Active recurring expenses included in monthly totals."
          actions={(
            <Link className="text-link" to="/recurring-expenses">
              Manage
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        >
          <RecurringExpensesPreview items={stats.recurringExpenses || []} />
        </DashboardCard>
      </div>
    </section>
  );
}
