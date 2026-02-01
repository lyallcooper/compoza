"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "default" | "primary" | "danger" | "ghost" | "accent";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "border-border bg-background text-foreground hover:bg-surface hover:border-foreground",
  primary: "border-foreground bg-foreground text-background hover:bg-muted hover:border-muted",
  danger: "border-error text-error bg-background hover:bg-error-muted",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-surface",
  accent: "border-accent text-accent bg-background hover:bg-accent-muted",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "md", loading, disabled, className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          relative inline-flex items-center justify-center gap-2 border font-medium rounded
          transition-all disabled:cursor-not-allowed disabled:opacity-50
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        <span className={loading ? "invisible" : ""}>{children}</span>
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-3 w-3 animate-spin border-2 border-current border-t-transparent rounded-full" />
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
