export default function DashboardCard({
  actions = null,
  children,
  className = "",
  description = "",
  title,
  titleId,
}) {
  const cardClassName = ["panel", "dashboard-card", className].filter(Boolean).join(" ");

  return (
    <section className={cardClassName} aria-labelledby={titleId}>
      <div className="panel-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
