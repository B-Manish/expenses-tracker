import { Inbox } from "lucide-react";

export default function EmptyState({
  title = "Nothing here yet",
  message = "There is no data to show right now.",
  action = null,
}) {
  return (
    <div className="state-block empty-state">
      <Inbox className="state-icon" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action ? <div className="state-action">{action}</div> : null}
      </div>
    </div>
  );
}
