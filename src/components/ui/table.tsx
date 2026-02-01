"use client";

import { ReactNode } from "react";

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
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${className}`}>{children}</table>
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

  return (
    <tr
      onClick={handleClick}
      className={`
        border-b border-border last:border-b-0 hover:bg-surface
        ${clickable || onClick ? "cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = "" }: TableHeadProps) {
  return (
    <th className={`px-3 py-2 text-left text-xs font-semibold bg-surface-subtle ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", onClick }: TableCellProps) {
  return <td className={`px-3 py-2 ${className}`} onClick={onClick}>{children}</td>;
}
