"use client";

import { ReactNode } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./table";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  renderCard?: (row: T, index: number) => ReactNode;
  className?: string;
  cardLabel?: string | false;
  cardPosition?: "header" | "body" | "footer" | "hidden";
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor?: (row: T, index: number) => string | number;
  onRowClick?: (row: T, index: number) => void;
  breakpoint?: "sm" | "md" | "lg";
  className?: string;
  tableClassName?: string;
  showHeader?: boolean;
  emptyState?: ReactNode;
}

const breakpointClasses = {
  sm: { hide: "sm:hidden", show: "hidden sm:block" },
  md: { hide: "md:hidden", show: "hidden md:block" },
  lg: { hide: "lg:hidden", show: "hidden lg:block" },
};

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor = (_, index) => index,
  onRowClick,
  breakpoint = "sm",
  className = "",
  tableClassName = "",
  showHeader = true,
  emptyState,
}: ResponsiveTableProps<T>) {
  const { hide, show } = breakpointClasses[breakpoint];

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const headerColumns = columns.filter((col) => col.cardPosition === "header");
  const bodyColumns = columns.filter(
    (col) => !col.cardPosition || col.cardPosition === "body"
  );
  const footerColumns = columns.filter((col) => col.cardPosition === "footer");

  return (
    <div className={className}>
      {/* Table view (wide screens) */}
      <div className={show}>
        <Table className={tableClassName}>
          {showHeader && (
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {data.map((row, index) => (
              <TableRow
                key={keyExtractor(row, index)}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                clickable={!!onRowClick}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row, index)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card view (narrow screens) */}
      <div className={`${hide} space-y-3`}>
        {data.map((row, index) => {
          const isClickable = !!onRowClick;
          const cardContent = (
            <>
              {/* Header section */}
              {headerColumns.length > 0 && (
                <div className="font-medium text-foreground">
                  {headerColumns.map((col) => (
                    <div key={col.key}>
                      {col.renderCard
                        ? col.renderCard(row, index)
                        : col.render(row, index)}
                    </div>
                  ))}
                </div>
              )}

              {/* Body section */}
              {bodyColumns.length > 0 && (
                <div
                  className={`space-y-1.5 text-sm ${headerColumns.length > 0 ? "mt-2" : ""}`}
                >
                  {bodyColumns.map((col) => {
                    const label =
                      col.cardLabel === false
                        ? null
                        : col.cardLabel || col.header;
                    const content = col.renderCard
                      ? col.renderCard(row, index)
                      : col.render(row, index);

                    return (
                      <div
                        key={col.key}
                        className="flex justify-between items-center gap-4"
                      >
                        {label && (
                          <span className="text-muted shrink-0">{label}</span>
                        )}
                        <span
                          className={`text-foreground ${label ? "text-right" : ""}`}
                        >
                          {content}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer section (actions) */}
              {footerColumns.length > 0 && (
                <div
                  className={`flex items-center justify-end gap-2 ${headerColumns.length > 0 || bodyColumns.length > 0 ? "mt-3 pt-3 border-t border-border" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {footerColumns.map((col) => (
                    <div key={col.key}>
                      {col.renderCard
                        ? col.renderCard(row, index)
                        : col.render(row, index)}
                    </div>
                  ))}
                </div>
              )}
            </>
          );

          const handleClick = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) {
              return;
            }
            onRowClick?.(row, index);
          };

          const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick?.(row, index);
            }
          };

          return (
            <div
              key={keyExtractor(row, index)}
              onClick={isClickable ? handleClick : undefined}
              onKeyDown={isClickable ? handleKeyDown : undefined}
              tabIndex={isClickable ? 0 : undefined}
              className={`
                p-4 rounded-lg border border-border bg-surface-subtle
                ${isClickable ? "cursor-pointer hover:bg-surface focus:outline-none focus:bg-surface focus:ring-1 focus:ring-primary" : ""}
              `}
            >
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
