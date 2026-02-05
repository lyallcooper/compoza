"use client";

import { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "accent";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface text-muted",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  error: "bg-error-muted text-error",
  accent: "bg-accent-muted text-accent",
};

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center shrink-0 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide rounded
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
