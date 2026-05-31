import { AlertCircle, RefreshCw } from "lucide-react";

export default function ErrorState({
  title = "Unable to load",
  message = "The request could not be completed.",
  actionLabel = "Retry",
  onRetry,
}) {
  return (
    <div className="state-block error-state" role="alert">
      <AlertCircle className="state-icon" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {onRetry ? (
          <button className="button secondary-button state-action" type="button" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
