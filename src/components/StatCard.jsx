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
    <article className={cardClassName}>
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
    </article>
  );
}
