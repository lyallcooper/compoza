"use client";

import { use } from "react";
import Link from "next/link";
import { Box, Spinner } from "@/components/ui";
import { LogViewer } from "@/components/logs";
import { useContainer } from "@/hooks";
import type { ContainerRouteProps } from "@/types";

export default function ContainerLogsPage({ params }: ContainerRouteProps) {
  const { id } = use(params);
  const { data: container, isLoading } = useContainer(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!container) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">Container not found</div>
          <Link href="/containers" className="text-accent hover:underline mt-2 inline-block">
            Back to containers
          </Link>
        </Box>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <Link
          href={`/containers/${encodeURIComponent(id)}`}
          className="text-muted hover:text-foreground"
        >
          &larr;
        </Link>
        <h1 className="text-xl font-semibold">{container.name} - Logs</h1>
      </div>

      {/* Log viewer */}
      <Box title="Logs" padding={false} className="flex-1 flex flex-col min-h-0">
        <LogViewer
          url={`/api/containers/${encodeURIComponent(id)}/logs?tail=100`}
          className="flex-1 min-h-0"
        />
      </Box>
    </div>
  );
}
