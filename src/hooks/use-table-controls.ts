"use client";

import { useState, useCallback } from "react";
import type { ColumnDef, SortState, SortDirection } from "@/components/ui";

function compare(a: string | number, b: string | number): number {
  return typeof a === "string" && typeof b === "string"
    ? a.localeCompare(b)
    : (a as number) - (b as number);
}

export function useTableSort<T>(defaultKey: string, defaultDirection: SortDirection = "asc") {
  const [sortState, setSortState] = useState<SortState>({
    columnKey: defaultKey,
    direction: defaultDirection,
  });

  const onSortChange = useCallback((key: string, columnDefault?: SortDirection) => {
    setSortState((prev) =>
      prev.columnKey === key
        ? { columnKey: key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { columnKey: key, direction: columnDefault ?? "asc" }
    );
  }, []);

  const sortData = useCallback(
    (data: T[], columns: ColumnDef<T>[]) => {
      const col = columns.find((c) => c.key === sortState.columnKey);
      if (!col?.sortValue) return data;

      const tiebreakCol = sortState.columnKey !== defaultKey
        ? columns.find((c) => c.key === defaultKey)
        : undefined;

      return [...data].sort((a, b) => {
        const directed = compare(col.sortValue!(a), col.sortValue!(b))
          * (sortState.direction === "asc" ? 1 : -1);

        if (directed !== 0 || !tiebreakCol?.sortValue) return directed;
        return compare(tiebreakCol.sortValue(a), tiebreakCol.sortValue(b));
      });
    },
    [sortState, defaultKey]
  );

  return { sortState, onSortChange, sortData };
}

export function useTableSearch<T>() {
  const [query, setQuery] = useState("");

  const filterData = useCallback(
    (data: T[], columns: ColumnDef<T>[]) => {
      if (!query) return data;
      const lower = query.toLowerCase();
      const searchableCols = columns.filter((c) => c.searchValue);
      if (searchableCols.length === 0) return data;

      return data.filter((row) =>
        searchableCols.some((col) => col.searchValue!(row).toLowerCase().includes(lower))
      );
    },
    [query]
  );

  return { query, setQuery, filterData };
}
