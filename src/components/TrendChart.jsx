import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrencyFromPaise } from "../utils/currency.js";
import { formatCompactDateLabel, formatMonthLabel } from "../utils/dateUtils.js";
import EmptyState from "./EmptyState.jsx";

function toAmount(value) {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
}

function defaultLabelFormatter(value, mode) {
  return mode === "monthly" ? formatMonthLabel(value) : formatCompactDateLabel(value);
}

function ChartTooltip({ active, label, labelFormatter, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{labelFormatter(label)}</strong>
      <span>{formatCurrencyFromPaise(payload[0]?.value)}</span>
    </div>
  );
}

export default function TrendChart({
  data = [],
  emptyMessage = "Trend data will appear after transactions exist.",
  emptyTitle = "No trend data",
  mode = "daily",
}) {
  const keyName = mode === "monthly" ? "month" : "date";
  const labelFormatter = (value) => defaultLabelFormatter(value, mode);
  const chartData = data.map((item) => ({
    amountPaise: toAmount(item?.amountPaise),
    label: item?.[keyName] || "",
  }));

  if (!chartData.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <div
      className="chart-frame trend-chart-frame"
      role="img"
      aria-label={`${mode === "monthly" ? "Monthly" : "Daily"} spending trend bar chart`}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ bottom: 0, left: 0, right: 6, top: 8 }}>
          <defs>
            <linearGradient id={`trendGradient-${mode}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.72" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            minTickGap={mode === "monthly" ? 8 : 4}
            tickFormatter={labelFormatter}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(value) => formatCurrencyFromPaise(value).replace(".00", "")}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            width={72}
          />
          <Tooltip content={<ChartTooltip labelFormatter={labelFormatter} />} />
          <Bar dataKey="amountPaise" fill={`url(#trendGradient-${mode})`} maxBarSize={42} radius={[7, 7, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
