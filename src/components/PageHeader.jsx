export default function PageHeader({
  actions = null,
  description = "",
  eyebrow = "",
  title,
  titleId,
}) {
  return (
    <div className="page-header">
      <div className="page-title-group">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId}>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
