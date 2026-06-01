import { Card, CardContent } from "./ui/card.jsx";

export default function StatCard({
  className = "",
  detail = "",
  icon: Icon,
  label,
  meta = "",
  tone = "neutral",
  value,
}) {
  const cardClassName = ["summary-card", tone, className].filter(Boolean).join(" ");

  return (
    <Card className={cardClassName}>
      <CardContent className="grid gap-2 p-0">
        <div className="summary-card-header">
          {Icon ? (
            <span className="summary-card-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
          ) : null}
          {meta ? <span className="summary-card-meta">{meta}</span> : null}
        </div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail ? <span className="summary-card-detail">{detail}</span> : null}
      </CardContent>
    </Card>
  );
}
