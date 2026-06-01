import { LoaderCircle } from "lucide-react";
import { Card, CardContent } from "./ui/card.jsx";
import { Skeleton } from "./ui/skeleton.jsx";

export default function LoadingState({
  title = "Loading",
  message = "Please wait while the latest data is loaded.",
}) {
  return (
    <Card className="state-block loading-state" role="status" aria-live="polite">
      <CardContent className="flex gap-4 p-0">
        <LoaderCircle className="state-icon spin" aria-hidden="true" />
        <div className="grid flex-1 gap-2">
          <h2>{title}</h2>
          <p>{message}</p>
          <div className="grid gap-2 pt-1">
            <Skeleton className="h-2 w-full max-w-sm" />
            <Skeleton className="h-2 w-2/3 max-w-xs" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
