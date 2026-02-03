"use client";

import { useState, ReactNode } from "react";
import { Box } from "./box";
import { Badge } from "./badge";

interface CollapsibleSectionProps {
  title: string;
  count: number;
  variant: "warning" | "error" | "accent";
  children: ReactNode;
  defaultExpanded?: boolean;
  action?: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  variant,
  children,
  defaultExpanded = true,
  action,
  className,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (count === 0) return null;

  return (
    <Box
      title={
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:text-accent transition-colors"
        >
          <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          {title}
          <Badge variant={variant}>{count}</Badge>
        </button>
      }
      actions={action}
      padding={false}
      className={className}
    >
      {expanded && children}
    </Box>
  );
}
