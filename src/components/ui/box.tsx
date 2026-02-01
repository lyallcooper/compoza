"use client";

import { ReactNode } from "react";

interface BoxProps {
  title?: string;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function Box({ title, children, className = "", padding = true }: BoxProps) {
  return (
    <div className={`border border-border bg-background rounded ${className}`}>
      {title && (
        <div className="border-b border-border bg-surface px-4 py-2 text-sm font-semibold">
          {title}
        </div>
      )}
      <div className={padding ? "p-4" : ""}>{children}</div>
    </div>
  );
}
