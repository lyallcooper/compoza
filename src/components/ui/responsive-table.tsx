"use client";

import { ReactNode, useMemo } from "react";

export type SortDirection = "asc" | "desc";
export interface SortState {
  columnKey: string;
  direction: SortDirection;
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  /**
   * Column sizing behavior:
   * - true: Column shrinks to fit content (for labels, badges, buttons)
   * - false (default): Column expands to fill remaining space, may truncate
   */
  shrink?: boolean;
  /**
   * Returns raw string value for auto-weighting variable columns.
   * Columns with getValue are weighted by their max content length.
   * Only applies when shrink is false.
   */
  getValue?: (row: T) => string;
  /** Returns a sortable value. Presence implies the column is sortable. */
  sortValue?: (row: T) => string | number;
  /** Direction to use when this column is first sorted. Defaults to "asc". */
  defaultSortDirection?: SortDirection;
  /** Returns a searchable string. Presence implies the column is searchable. */
  searchValue?: (row: T) => string;
  /** Custom render function */
  render: (row: T, index: number) => ReactNode;
  /** Custom render for card view */
  renderCard?: (row: T, index: number) => ReactNode;
  /** Label shown in card view body. Set to false to hide label. */
  cardLabel?: string | false;
  /** Position in card view layout */
  cardPosition?: "header" | "body" | "footer" | "hidden";
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor?: (row: T, index: number) => string | number;
  onRowClick?: (row: T, index: number) => void;
  breakpoint?: "sm" | "md" | "lg";
  className?: string;
  showHeader?: boolean;
  emptyState?: ReactNode;
  sortState?: SortState;
  onSortChange?: (columnKey: string, defaultDirection?: SortDirection) => void;
}

const breakpointClasses = {
  sm: { hide: "sm:hidden", show: "hidden sm:block" },
  md: { hide: "md:hidden", show: "hidden md:block" },
  lg: { hide: "lg:hidden", show: "hidden lg:block" },
};

function SortArrow({ direction, className }: { direction: SortDirection; className?: string }) {
  const path = direction === "asc" ? "M8 13V3M3 7l5-5 5 5" : "M8 3v10M3 9l5 5 5-5";
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`ml-0.5 w-2.5 h-2.5 shrink-0 ${className ?? ""}`} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) {
    return <SortArrow direction={direction} className="opacity-0 group-hover/sort:opacity-100 text-muted transition-opacity" />;
  }
  return <SortArrow direction={direction} className="text-muted" />;
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor = (_, index) => index,
  onRowClick,
  breakpoint = "sm",
  className = "",
  showHeader = true,
  emptyState,
  sortState,
  onSortChange,
}: ResponsiveTableProps<T>) {
  const { hide, show } = breakpointClasses[breakpoint];

  // Calculate weights for variable columns based on content length
  const columnWeights = useMemo(() => {
    const weights: Record<string, number> = {};
    const variableCols = columns.filter((col) => !col.shrink && col.getValue);

    if (variableCols.length === 0 || data.length === 0) return weights;

    // Calculate max length for each column
    const maxLengths: Record<string, number> = {};
    for (const col of variableCols) {
      let maxLen = col.header.length;
      for (const row of data) {
        maxLen = Math.max(maxLen, col.getValue!(row).length);
      }
      maxLengths[col.key] = maxLen;
    }

    // Apply square root scaling to compress the range
    // This prevents very long values from dominating (4x length -> 2x weight)
    const scaledLengths: Record<string, number> = {};
    for (const [key, len] of Object.entries(maxLengths)) {
      scaledLengths[key] = Math.sqrt(len);
    }

    // Convert to relative weights (normalize so average is ~1)
    const avgScaled = Object.values(scaledLengths).reduce((a, b) => a + b, 0) / variableCols.length || 1;
    for (const [key, scaled] of Object.entries(scaledLengths)) {
      // Clamp weights to reasonable range (0.5 - 2) to avoid extreme ratios
      weights[key] = Math.max(0.5, Math.min(2, scaled / avgScaled));
    }

    return weights;
  }, [columns, data]);

  // Generate grid template: shrink columns get 'auto', variable columns get weighted 'minmax(0, Xfr)'
  // Note: cardPosition only affects card view, all columns show in table view
  const gridTemplateColumns = columns
    .map((col) => {
      if (col.shrink) return "auto";
      const weight = columnWeights[col.key] ?? 1;
      return `minmax(0, ${weight}fr)`;
    })
    .join(" ");

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // Card view column groups
  const headerColumns = columns.filter((col) => col.cardPosition === "header");
  const bodyColumns = columns.filter(
    (col) => !col.cardPosition || col.cardPosition === "body"
  );
  const footerColumns = columns.filter((col) => col.cardPosition === "footer");

  return (
    <div className={className}>
      {/* Grid table view (wide screens) */}
      <div className={show}>
        <div
          role="table"
          className="w-full text-xs overflow-hidden"
          style={{ display: "grid", gridTemplateColumns }}
        >
          {/* Header row */}
          {showHeader && (
            <div role="rowgroup" className="contents">
              <div role="row" className="contents">
                {columns.map((col) => {
                  const isSortable = !!col.sortValue && !!onSortChange && !!sortState;
                  const isActive = isSortable && sortState.columnKey === col.key;

                  return (
                    <div
                      key={col.key}
                      role="columnheader"
                      className={`px-2 py-1.5 flex items-center text-left text-xs font-semibold bg-surface-subtle border-b border-border ${
                        col.shrink ? "whitespace-nowrap" : "min-w-0"
                      }`}
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          className="group/sort flex items-center hover:text-foreground transition-colors cursor-pointer"
                          onClick={() => onSortChange(col.key, col.defaultSortDirection)}
                        >
                          {col.header}
                          <SortIndicator active={isActive} direction={isActive ? sortState.direction : (col.defaultSortDirection ?? "asc")} />
                        </button>
                      ) : (
                        col.header
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Body rows */}
          <div role="rowgroup" className="contents">
            {data.map((row, rowIndex) => {
              const isClickable = !!onRowClick;

              const handleClick = () => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) return;
                onRowClick?.(row, rowIndex);
              };

              const handleKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick?.(row, rowIndex);
                }
              };

              return (
                <div
                  key={keyExtractor(row, rowIndex)}
                  role="row"
                  className={`contents group ${isClickable ? "cursor-pointer" : ""}`}
                  onClick={isClickable ? handleClick : undefined}
                  onKeyDown={isClickable ? handleKeyDown : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  data-row-clickable={isClickable ? "true" : undefined}
                >
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      role="cell"
                      className={`px-2 py-1.5 flex items-center border-b border-border group-last:border-b-0 group-hover:bg-surface ${
                        isClickable ? "group-focus:bg-surface" : ""
                      } ${col.shrink ? "whitespace-nowrap" : "min-w-0 overflow-hidden"}`}
                      data-truncate-container={col.shrink ? undefined : "true"}
                    >
                      {col.render(row, rowIndex)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Card view (narrow screens) */}
      <div className={`${hide} space-y-1.5 p-1.5`}>
        {data.map((row, index) => {
          const isClickable = !!onRowClick;

          const handleClick = () => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) return;
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
              data-truncate-container="true"
              data-row-clickable={isClickable ? "true" : undefined}
              className={`
                p-2 rounded-lg border border-border bg-surface-subtle overflow-hidden
                ${isClickable ? "cursor-pointer transition-transform active:not-[:has(button:active,a:active)]:scale-[0.98] hover:bg-surface focus:outline-none focus-visible:bg-surface focus-visible:ring-1 focus-visible:ring-primary" : ""}
              `}
            >
              {/* Header section */}
              {headerColumns.length > 0 && (
                <div className="font-medium text-foreground">
                  {headerColumns.map((col) => (
                    <div key={col.key} className="min-w-0">
                      {col.renderCard ? col.renderCard(row, index) : col.render(row, index)}
                    </div>
                  ))}
                </div>
              )}

              {/* Body section */}
              {bodyColumns.length > 0 && (
                <div className={`space-y-1 text-sm ${headerColumns.length > 0 ? "mt-1.5" : ""}`}>
                  {bodyColumns.map((col) => {
                    const label = col.cardLabel === false ? null : col.cardLabel || col.header;
                    const content = col.renderCard ? col.renderCard(row, index) : col.render(row, index);

                    return (
                      <div key={col.key} className="flex items-center gap-3">
                        {label && <span className="text-muted shrink-0">{label}</span>}
                        <span
                          className={`text-foreground min-w-0 overflow-hidden flex-1 ${label ? "text-right" : ""}`}
                          data-truncate-container="true"
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
                  className={`flex items-center justify-end gap-2 ${
                    headerColumns.length > 0 || bodyColumns.length > 0
                      ? "mt-2 pt-2 border-t border-border"
                      : ""
                  }`}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {footerColumns.map((col) => (
                    <div key={col.key}>
                      {col.renderCard ? col.renderCard(row, index) : col.render(row, index)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

