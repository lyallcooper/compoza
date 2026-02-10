"use client";

import { ReactNode, useState } from "react";

type CollapseMode = "none" | "mobile" | "always";

interface BoxProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
  collapsible?: boolean | CollapseMode;
  defaultExpanded?: boolean;
}

export function Box({ title, actions, children, className = "", padding = true, collapsible = false, defaultExpanded = true }: BoxProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isFlexCol = className.includes("flex-col");

  // Normalize collapsible to CollapseMode
  const collapseMode: CollapseMode = collapsible === true ? "mobile" : collapsible === false ? "none" : collapsible;
  const isMobileOnly = collapseMode === "mobile";
  const isAlways = collapseMode === "always";
  const isCollapsible = collapseMode !== "none";

  const titleContent = isCollapsible ? (
    <>
      {/* Clickable toggle - mobile only or always based on mode */}
      <button
        onClick={(e) => {
          if (e.target !== e.currentTarget && (e.target as HTMLElement).closest("a")) return;
          setExpanded(!expanded);
        }}
        className={`flex items-center gap-2 hover:text-accent transition-colors ${isMobileOnly ? "md:hidden" : ""}`}
      >
        <span className={`transition-transform text-xs ${expanded ? "rotate-90" : ""}`}>
          ▶
        </span>
        {title}
      </button>
      {/* Desktop: static title (only for mobile-only mode) */}
      {isMobileOnly && <span className="hidden md:block">{title}</span>}
    </>
  ) : (
    <span>{title}</span>
  );

  // Content visibility:
  // - "none": always show
  // - "mobile": hide on mobile when collapsed, always show on desktop
  // - "always": hide when collapsed on all screen sizes
  const contentClasses = [
    padding ? "p-4" : "",
    isFlexCol ? "flex-1 flex flex-col min-h-0" : "",
    isMobileOnly && !expanded ? "hidden md:block" : "",
    isAlways && !expanded ? "hidden" : "",
  ].filter(Boolean).join(" ");

  // Border visibility when collapsed
  const showBorder = expanded || !isCollapsible;
  const borderClasses = isMobileOnly && !expanded
    ? "md:border-b md:border-border"
    : showBorder ? "border-b border-border" : "";

  return (
    <div className={`border border-border bg-background rounded ${className}`}>
      {(title || actions) && (
        <div className={`${borderClasses} bg-surface px-2 text-sm font-semibold flex items-center justify-between gap-2 flex-shrink-0 ${actions !== undefined ? "h-10" : "py-2"}`}>
          {titleContent}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={contentClasses || undefined}>
        {children}
      </div>
    </div>
  );
}
