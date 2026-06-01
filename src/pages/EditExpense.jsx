import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ExpenseForm from "../components/ExpenseForm.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Button } from "../components/ui/button.jsx";
import { ApiError, api } from "../services/api.js";
import { getErrorMessage } from "../utils/validation.js";

export default function EditExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({
    categories: [],
    error: "",
    paymentMethods: [],
    status: "loading",
    transaction: null,
  });
  const [submitState, setSubmitState] = useState({
    error: "",
    status: "idle",
  });

  const fetchPageData = useCallback(() => Promise.all([
    api.getExpense(id),
    api.getCategories(),
    api.getPaymentMethods(),
  ]), [id]);

  const loadPageData = useCallback(async () => {
    setState((current) => ({
      ...current,
      error: "",
      status: "loading",
    }));

    try {
      const [transaction, categories, paymentMethods] = await fetchPageData();

      setState({
        categories: categories?.items || [],
        error: "",
        paymentMethods: paymentMethods?.items || [],
        status: "ready",
        transaction,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to edit this transaction." },
        });
        return;
      }

      setState({
        categories: [],
        error: getErrorMessage(error),
        paymentMethods: [],
        status: "error",
        transaction: null,
      });
    }
  }, [fetchPageData, navigate]);

  useEffect(() => {
    let isCurrent = true;

    fetchPageData()
      .then(([transaction, categories, paymentMethods]) => {
        if (isCurrent) {
          setState({
            categories: categories?.items || [],
            error: "",
            paymentMethods: paymentMethods?.items || [],
            status: "ready",
            transaction,
          });
        }
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          navigate("/login", {
            replace: true,
            state: { notice: "Please log in again to edit this transaction." },
          });
          return;
        }

        setState({
          categories: [],
          error: getErrorMessage(error),
          paymentMethods: [],
          status: "error",
          transaction: null,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [fetchPageData, navigate]);

  async function handleSubmit(payload) {
    setSubmitState({
      error: "",
      status: "submitting",
    });

    try {
      await api.updateExpense(id, payload);
      navigate("/expenses", {
        replace: true,
        state: { notice: "Transaction updated." },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to edit this transaction." },
        });
        return;
      }

      setSubmitState({
        error: getErrorMessage(error),
        status: "idle",
      });
    }
  }

  if (state.status === "loading") {
    return <LoadingState title="Loading transaction" message="Fetching the selected record." />;
  }

  if (state.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          title="Transaction unavailable"
          message={state.error}
          actionLabel="Reload"
          onRetry={loadPageData}
        />
      </section>
    );
  }

  const transaction = state.transaction;

  return (
    <section className="page-section narrow-section" aria-labelledby="edit-expense-title">
      <PageHeader
        eyebrow="Transactions"
        title="Edit transaction"
        titleId="edit-expense-title"
        description="Update the amount, category, date, and context for this entry."
        actions={(
          <Button asChild variant="outline">
            <Link to="/expenses">
              <ArrowLeft size={18} aria-hidden="true" />
              Back
            </Link>
          </Button>
        )}
      />

      {transaction ? (
        <ExpenseForm
          categories={state.categories}
          initialTransaction={transaction}
          isSubmitting={submitState.status === "submitting"}
          key={transaction.id}
          onSubmit={handleSubmit}
          paymentMethods={state.paymentMethods}
          serverError={submitState.error}
          submitLabel="Update transaction"
        />
      ) : (
        <EmptyState title="No transaction" message="No transaction was returned for this route." />
      )}
    </section>
  );
}
