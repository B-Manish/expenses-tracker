import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.jsx";

export default function DashboardCard({
  actions = null,
  children,
  className = "",
  description = "",
  title,
  titleId,
}) {
  const cardClassName = ["dashboard-card", className].filter(Boolean).join(" ");

  return (
    <Card className={cardClassName} as="section" aria-labelledby={titleId}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="grid gap-1">
          <CardTitle id={titleId}>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
