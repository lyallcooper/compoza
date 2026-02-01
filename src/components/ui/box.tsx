"use client";

import { ReactNode } from "react";

interface BoxProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function Box({ title, actions, children, className = "", padding = true }: BoxProps) {
  return (
    <div className={`border border-border bg-background rounded ${className}`}>
      {(title || actions) && (
        <div className={`border-b border-border bg-surface px-4 text-sm font-semibold flex items-center justify-between gap-2 ${actions !== undefined ? "h-10" : "py-2"}`}>
          <span>{title}</span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padding ? "p-4" : ""}>{children}</div>
    </div>
  );
}
