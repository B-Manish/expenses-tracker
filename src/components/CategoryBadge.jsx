export default function CategoryBadge({
  color = "#64748b",
  label = "Uncategorized",
}) {
  return (
    <span className="category-badge">
      <span className="category-color" style={{ backgroundColor: color }} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
