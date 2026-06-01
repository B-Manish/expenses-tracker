import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";
import { cn } from "../../lib/utils.js";

const Separator = React.forwardRef(({
  className,
  decorative = true,
  orientation = "horizontal",
  ...props
}, ref) => (
  <SeparatorPrimitive.Root
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className,
    )}
    decorative={decorative}
    orientation={orientation}
    ref={ref}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
