import { LoaderCircle } from "lucide-react";

export default function LoadingState({
  title = "Loading",
  message = "Please wait while the latest data is loaded.",
}) {
  return (
    <div className="state-block loading-state" role="status" aria-live="polite">
      <LoaderCircle className="state-icon spin" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}
