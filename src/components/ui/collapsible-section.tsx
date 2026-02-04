"use client";

import { ReactNode } from "react";
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
  if (count === 0) return null;

  return (
    <Box
      title={
        <>
          {title}
          <Badge variant={variant}>{count}</Badge>
        </>
      }
      actions={action}
      padding={false}
      collapsible="always"
      defaultExpanded={defaultExpanded}
      className={className}
    >
      {children}
    </Box>
  );
}
