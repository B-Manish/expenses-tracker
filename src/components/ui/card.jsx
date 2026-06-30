import * as React from "react";
import { cn } from "../../lib/utils.js";

const Card = React.forwardRef(({ as: Comp = "div", className, ...props }, ref) => (
  <Comp
    className={cn(
      "rounded-2xl border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-18px_rgba(15,23,42,0.22)]",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div className={cn("flex flex-col space-y-1.5 p-5", className)} ref={ref} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    className={cn("text-base font-semibold leading-none tracking-normal", className)}
    ref={ref}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p className={cn("text-sm text-muted-foreground", className)} ref={ref} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div className={cn("p-5 pt-0", className)} ref={ref} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div className={cn("flex items-center p-5 pt-0", className)} ref={ref} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
