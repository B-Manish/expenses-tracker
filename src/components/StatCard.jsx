export default function StatCard({
  detail = "",
  icon: Icon,
  label,
  tone = "neutral",
  value,
}) {
  return (
    <article className={`summary-card ${tone}`}>
      <div className="summary-card-header">
        <p>{label}</p>
        {Icon ? (
          <span className="summary-card-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      <strong>{value}</strong>
      {detail ? <span className="summary-card-detail">{detail}</span> : null}
    </article>
  );
}
