import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.jsx";

const EMPTY_VALUE = "__empty_value__";

function toInternalValue(value) {
  return value === "" || value === null || value === undefined ? EMPTY_VALUE : String(value);
}

function fromInternalValue(value) {
  return value === EMPTY_VALUE ? "" : value;
}

export default function SelectControl({
  disabled = false,
  onChange,
  options = [],
  placeholder = "Select an option",
  value,
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(nextValue) => onChange(fromInternalValue(nextValue))}
      value={toInternalValue(value)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            disabled={option.disabled}
            key={toInternalValue(option.value)}
            value={toInternalValue(option.value)}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
