import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "button-control inline-flex items-center justify-center text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60",
  { variants: { variant: { default: "button-primary", secondary: "button-secondary" }, size: { default: "min-h-11 px-5 py-2.5" } }, defaultVariants: { variant: "default", size: "default" } }
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
