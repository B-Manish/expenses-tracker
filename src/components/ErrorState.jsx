import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent } from "./ui/card.jsx";

export default function ErrorState({
  title = "Unable to load",
  message = "The request could not be completed.",
  actionLabel = "Retry",
  onRetry,
}) {
  return (
    <Card className="state-block error-state" role="alert">
      <CardContent className="flex gap-4 p-0">
        <AlertCircle className="state-icon" aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{message}</p>
          {onRetry ? (
            <Button className="state-action" type="button" onClick={onRetry} variant="outline">
              <RefreshCw size={16} aria-hidden="true" />
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
