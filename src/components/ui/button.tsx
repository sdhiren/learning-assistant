import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-lift hover:brightness-110 enabled:hover:-translate-y-px disabled:shadow-none",
  secondary:
    "border border-border-strong bg-surface text-ink hover:border-accent/60 hover:bg-surface-muted",
  ghost: "text-muted hover:bg-surface-muted hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

/** Button styling, also used to make links look like buttons. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-all",
    "active:translate-y-0 active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClasses(variant, size), className)} {...props} />;
}
