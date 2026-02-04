"use client";

import { ReactNode } from "react";

/**
 * @deprecated Use ResponsiveTable instead. This component uses table-fixed layout
 * which doesn't auto-size columns based on content. ResponsiveTable uses CSS Grid
 * with proper fixed/variable column support and includes mobile card view.
 */

interface TableProps {
  children: ReactNode;
  className?: string;
}

interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

interface TableBodyProps {
  children: ReactNode;
  className?: string;
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  clickable?: boolean;
}

interface TableHeadProps {
  children: ReactNode;
  className?: string;
}

interface TableCellProps {
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function Table({ children, className = "" }: TableProps) {
  // Only apply w-full if no width class is provided
  const hasWidthClass = /\bw-(full|auto|fit|screen|min|max|\d|\/|\[)/.test(className);
  return (
    <div className="overflow-hidden">
      <table className={`${hasWidthClass ? "" : "w-full"} table-fixed text-xs ${className}`}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className = "" }: TableHeaderProps) {
  return <thead className={`border-b border-border ${className}`}>{children}</thead>;
}

export function TableBody({ children, className = "" }: TableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ children, className = "", onClick, clickable }: TableRowProps) {
  const isInteractive = clickable || !!onClick;

  const handleClick = onClick
    ? () => {
        // Don't trigger navigation if user is selecting text
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
          return;
        }
        onClick();
      }
    : undefined;

  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isInteractive ? 0 : undefined}
      className={`
        border-b border-border last:border-b-0 hover:bg-surface
        ${isInteractive ? "cursor-pointer focus:outline-none focus:bg-surface" : ""}
        ${className}
      `}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = "" }: TableHeadProps) {
  return (
    <th className={`px-3 py-1.5 text-left text-xs font-semibold bg-surface-subtle ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", onClick }: TableCellProps) {
  return <td className={`px-3 py-1.5 ${className}`} onClick={onClick}>{children}</td>;
}
