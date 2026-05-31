import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ErrorState from "../components/ErrorState.jsx";
import ExpenseForm from "../components/ExpenseForm.jsx";
import LoadingState from "../components/LoadingState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ApiError, api } from "../services/api.js";
import { getErrorMessage } from "../utils/validation.js";

export default function AddExpense() {
  const navigate = useNavigate();
  const [referenceState, setReferenceState] = useState({
    categories: [],
    error: "",
    paymentMethods: [],
    status: "loading",
  });
  const [submitState, setSubmitState] = useState({
    error: "",
    status: "idle",
  });

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
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to add a transaction." },
        });
        return;
      }

      setReferenceState({
        categories: [],
        error: getErrorMessage(error),
        paymentMethods: [],
        status: "error",
      });
    }
  }, [navigate]);

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

        if (error instanceof ApiError && error.status === 401) {
          navigate("/login", {
            replace: true,
            state: { notice: "Please log in again to add a transaction." },
          });
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
  }, [navigate]);

  async function handleSubmit(payload) {
    setSubmitState({
      error: "",
      status: "submitting",
    });

    try {
      await api.createExpense(payload);
      navigate("/expenses", {
        replace: true,
        state: { notice: "Transaction added." },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", {
          replace: true,
          state: { notice: "Please log in again to add a transaction." },
        });
        return;
      }

      setSubmitState({
        error: getErrorMessage(error),
        status: "idle",
      });
    }
  }

  if (referenceState.status === "loading") {
    return <LoadingState title="Loading form" message="Fetching categories and payment methods." />;
  }

  if (referenceState.status === "error") {
    return (
      <section className="page-section narrow-section">
        <ErrorState
          actionLabel="Reload"
          message={referenceState.error}
          onRetry={loadReferences}
          title="Transaction form unavailable"
        />
      </section>
    );
  }

  return (
    <section className="page-section narrow-section" aria-labelledby="add-expense-title">
      <PageHeader
        eyebrow="Transactions"
        title="Add transaction"
        titleId="add-expense-title"
        description="Record an expense or income entry with category, payment, and notes."
        actions={(
          <Link className="button secondary-button" to="/expenses">
            <ArrowLeft size={18} aria-hidden="true" />
            Back
          </Link>
        )}
      />

      <ExpenseForm
        categories={referenceState.categories}
        isSubmitting={submitState.status === "submitting"}
        onSubmit={handleSubmit}
        paymentMethods={referenceState.paymentMethods}
        serverError={submitState.error}
        submitLabel="Add transaction"
      />
    </section>
  );
}
