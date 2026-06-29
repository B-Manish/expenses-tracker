export const SORT_OPTIONS = [
  { label: "Date newest", value: "transaction_date_desc" },
  { label: "Date oldest", value: "transaction_date_asc" },
  { label: "Created newest", value: "created_at_desc" },
  { label: "Created oldest", value: "created_at_asc" },
  { label: "Amount high-low", value: "amount_desc" },
  { label: "Amount low-high", value: "amount_asc" },
];

export const LIMIT_OPTIONS = [
  { label: "10 / page", value: "10" },
  { label: "25 / page", value: "25" },
  { label: "50 / page", value: "50" },
];
