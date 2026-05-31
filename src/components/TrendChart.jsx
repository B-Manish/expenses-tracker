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
    <div className="chart-frame trend-chart-frame">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ bottom: 0, left: 0, right: 6, top: 8 }}>
          <CartesianGrid stroke="#d9e1ea" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            minTickGap={mode === "monthly" ? 8 : 4}
            tickFormatter={labelFormatter}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => formatCurrencyFromPaise(value).replace(".00", "")}
            tickLine={false}
            width={72}
          />
          <Tooltip content={<ChartTooltip labelFormatter={labelFormatter} />} />
          <Bar dataKey="amountPaise" fill="#2563eb" maxBarSize={42} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
