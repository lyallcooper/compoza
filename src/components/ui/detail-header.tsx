"use client";

import { ReactNode } from "react";

interface DetailHeaderProps {
  resourceType: string;
  name: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function DetailHeader({ resourceType, name, children, actions }: DetailHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 relative">
          <p className="absolute -top-3.5 left-0 text-[0.6rem] text-muted/50 uppercase tracking-wide leading-none">
            {resourceType}
          </p>
          <h1 className="text-xl font-semibold truncate">{name}</h1>
        </div>
        {children}
      </div>
      {actions}
    </div>
  );
}
