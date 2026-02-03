"use client";

import { ReactNode, useState } from "react";

interface BoxProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function Box({ title, actions, children, className = "", padding = true, collapsible = false, defaultExpanded = true }: BoxProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isFlexCol = className.includes("flex-col");

  const titleContent = collapsible ? (
    <button
      onClick={() => setExpanded(!expanded)}
      className="flex items-center gap-2 hover:text-accent transition-colors"
    >
      <span className={`transition-transform text-xs ${expanded ? "rotate-90" : ""}`}>
        ▶
      </span>
      {title}
    </button>
  ) : (
    <span>{title}</span>
  );

  return (
    <div className={`border border-border bg-background rounded ${className}`}>
      {(title || actions) && (
        <div className={`${collapsible && !expanded ? "" : "border-b border-border"} bg-surface px-4 text-sm font-semibold flex items-center justify-between gap-2 flex-shrink-0 ${actions !== undefined ? "h-10" : "py-2"}`}>
          {titleContent}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {(!collapsible || expanded) && (
        <div className={`${padding ? "p-4" : ""} ${isFlexCol ? "flex-1 flex flex-col min-h-0" : ""}`}>{children}</div>
      )}
    </div>
  );
}
