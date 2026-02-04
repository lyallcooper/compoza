"use client";

import { ReactNode, useMemo } from "react";
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
  showHeader = true,
  emptyState,
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
                {columns.map((col) => (
                  <div
                    key={col.key}
                    role="columnheader"
                    className={`px-2 py-1 flex items-center text-left text-xs font-semibold bg-surface-subtle border-b border-border ${
                      col.shrink ? "whitespace-nowrap" : "min-w-0"
                    }`}
                  >
                    {col.header}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body rows */}
          <div role="rowgroup" className="contents">
            {data.map((row, rowIndex) => {
              const isClickable = !!onRowClick;

              const handleClick = () => {
                const selection = window.getSelection();
                if (selection && selection.toString().length > 0) return;
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
                >
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      role="cell"
                      className={`px-2 py-1 flex items-center border-b border-border group-last:border-b-0 group-hover:bg-surface ${
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
      <div className={`${hide} space-y-2 p-2`}>
        {data.map((row, index) => {
          const isClickable = !!onRowClick;

          const handleClick = () => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;
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
              className={`
                p-3 rounded-lg border border-border bg-surface-subtle overflow-hidden
                ${isClickable ? "cursor-pointer hover:bg-surface focus:outline-none focus:bg-surface focus:ring-1 focus:ring-primary" : ""}
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
                <div className={`space-y-1.5 text-sm ${headerColumns.length > 0 ? "mt-2" : ""}`}>
                  {bodyColumns.map((col) => {
                    const label = col.cardLabel === false ? null : col.cardLabel || col.header;
                    const content = col.renderCard ? col.renderCard(row, index) : col.render(row, index);

                    return (
                      <div key={col.key} className="flex justify-between items-center gap-4">
                        {label && <span className="text-muted shrink-0">{label}</span>}
                        <span className={`text-foreground min-w-0 ${label ? "text-right" : ""}`}>
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
                      ? "mt-3 pt-3 border-t border-border"
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

