import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatCurrencyFromPaise } from "../utils/currency.js";
import EmptyState from "./EmptyState.jsx";

const FALLBACK_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f43f5e",
  "#f59e0b",
  "#6366f1",
  "#06b6d4",
  "#ec4899",
];

function toAmount(value) {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload;

  return (
    <div className="chart-tooltip">
      <strong>{item?.category || "Category"}</strong>
      <span>{formatCurrencyFromPaise(item?.amountPaise)}</span>
    </div>
  );
}

export default function CategoryChart({ items = [] }) {
  const data = items
    .map((item, index) => ({
      amountPaise: toAmount(item?.amountPaise),
      category: item?.category || "Uncategorized",
      color: item?.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    }))
    .filter((item) => item.amountPaise > 0);
  const total = data.reduce((sum, item) => sum + item.amountPaise, 0);

  if (!data.length) {
    return (
      <EmptyState
        title="No category spending"
        message="Expense categories will appear after transactions exist."
      />
    );
  }

  return (
    <div className="chart-with-list">
      <div className="chart-frame" aria-label="Category spending chart">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="amountPaise"
              innerRadius="58%"
              nameKey="category"
              outerRadius="84%"
              paddingAngle={3}
            >
              {data.map((item) => (
                <Cell fill={item.color} key={item.category} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="chart-center-label" aria-hidden="true">
          <span>Total</span>
          <strong>{formatCurrencyFromPaise(total)}</strong>
        </div>
      </div>

      {/* The list below is the legend; the in-chart Legend was removed so a
          long category tail cannot squash the pie inside its fixed frame. */}
      <ul className="category-list chart-detail-list">
        {data.slice(0, 6).map((item) => (
          <li className="category-row" key={item.category}>
            <span className="category-color" style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span>{item.category}</span>
            <strong>{formatCurrencyFromPaise(item.amountPaise)}</strong>
          </li>
        ))}
        {data.length > 6 ? (
          <li className="category-row" key="__more">
            <span className="category-color bg-muted" aria-hidden="true" />
            <span>{data.length - 6} more {data.length - 6 === 1 ? "category" : "categories"}</span>
            <strong>
              {formatCurrencyFromPaise(data.slice(6).reduce((sum, item) => sum + item.amountPaise, 0))}
            </strong>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
