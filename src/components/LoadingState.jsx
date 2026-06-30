import { LoaderCircle } from "lucide-react";

export default function LoadingState({ title = "Loading", centered = true }) {
  const spinner = (
    <span role="status" aria-live="polite">
      <LoaderCircle className="spin size-8 text-primary" aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </span>
  );

  if (!centered) {
    return spinner;
  }

  return <div className="grid min-h-[70svh] w-full place-items-center">{spinner}</div>;
}
