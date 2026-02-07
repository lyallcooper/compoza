"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const errorId = error && inputId ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm text-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`
            w-full border border-border bg-background px-3 py-2 text-foreground rounded
            placeholder:text-muted focus:border-accent focus:outline-none
            disabled:cursor-not-allowed disabled:opacity-50
            ${error ? "border-error" : ""}
            ${className}
          `}
          {...props}
        />
        {error && <span id={errorId} className="text-xs text-error">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
