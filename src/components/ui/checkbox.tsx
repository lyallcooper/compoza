"use client";

import { InputHTMLAttributes, ReactNode, forwardRef } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string | ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <label className={`flex items-center gap-2 text-sm cursor-pointer ${className}`}>
        <input
          ref={ref}
          type="checkbox"
          className="rounded border-border accent-accent"
          {...props}
        />
        {typeof label === "string" ? <span>{label}</span> : label}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
