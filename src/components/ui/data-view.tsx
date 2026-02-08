"use client";

import { ReactNode } from "react";
import { Box } from "./box";
import { Spinner } from "./spinner";

interface DataViewProps<T> {
  data: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  resourceName: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  children: (data: T[]) => ReactNode;
}

export function DataView<T>({
  data,
  isLoading,
  error,
  resourceName,
  emptyMessage,
  emptyAction,
  children,
}: DataViewProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Box>
        <div className="text-error">Error loading {resourceName}: {String(error)}</div>
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box>
        <div className="text-center py-8">
          <p className="text-muted">{emptyMessage || `No ${resourceName} found`}</p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      </Box>
    );
  }

  return <>{children(data)}</>;
}
