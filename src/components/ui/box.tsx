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

  // Collapsible only on small screens (below md breakpoint)
  const titleContent = collapsible ? (
    <>
      {/* Mobile: clickable with arrow */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="md:hidden flex items-center gap-2 hover:text-accent transition-colors"
      >
        <span className={`transition-transform text-xs ${expanded ? "rotate-90" : ""}`}>
          ▶
        </span>
        {title}
      </button>
      {/* Desktop: static title */}
      <span className="hidden md:block">{title}</span>
    </>
  ) : (
    <span>{title}</span>
  );

  // On mobile: respect expanded state. On desktop: always show.
  const showContent = !collapsible || expanded;
  const collapsedOnMobile = collapsible && !expanded;

  return (
    <div className={`border border-border bg-background rounded ${className}`}>
      {(title || actions) && (
        <div className={`${collapsedOnMobile ? "md:border-b md:border-border" : "border-b border-border"} bg-surface px-4 text-sm font-semibold flex items-center justify-between gap-2 flex-shrink-0 ${actions !== undefined ? "h-10" : "py-2"}`}>
          {titleContent}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {/* Mobile: conditionally render. Desktop: always show. */}
      <div className={`${padding ? "p-4" : ""} ${isFlexCol ? "flex-1 flex flex-col min-h-0" : ""} ${showContent ? "" : "hidden"} ${collapsible ? "md:block" : ""}`}>
        {children}
      </div>
    </div>
  );
}
