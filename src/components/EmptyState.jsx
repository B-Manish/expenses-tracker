import { Inbox } from "lucide-react";
import { Card, CardContent } from "./ui/card.jsx";

export default function EmptyState({
  title = "Nothing here yet",
  message = "There is no data to show right now.",
  action = null,
}) {
  return (
    <Card className="state-block empty-state">
      <CardContent className="flex gap-4 p-0">
        <Inbox className="state-icon" aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{message}</p>
          {action ? <div className="state-action">{action}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
