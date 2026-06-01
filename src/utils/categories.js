export function formatCategoryLabel(category, options = {}) {
  const name = category?.parentName
    ? `${category.parentName} / ${category.name}`
    : category?.name || "Uncategorized";

  if (!options.includeType) {
    return name;
  }

  const type = category?.type === "INCOME" ? "Income" : "Expense";

  return `${name} (${type})`;
}
