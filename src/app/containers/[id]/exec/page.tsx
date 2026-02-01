"use client";

import { use } from "react";
import Link from "next/link";
import { Box, Spinner } from "@/components/ui";
import { Terminal } from "@/components/terminal";
import { useContainer } from "@/hooks";
import type { ContainerRouteProps } from "@/types";

export default function ContainerExecPage({ params }: ContainerRouteProps) {
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

  if (container.state !== "running") {
    return (
      <div className="p-4">
        <Box>
          <div className="text-warning">Container is not running</div>
          <p className="text-sm text-muted mt-2">
            Start the container to access the terminal.
          </p>
          <Link
            href={`/containers/${encodeURIComponent(id)}`}
            className="text-accent hover:underline mt-2 inline-block"
          >
            Back to container
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
        <h1 className="text-xl font-semibold">{container.name} - Terminal</h1>
      </div>

      {/* Terminal */}
      <Box title="Terminal" padding={false} className="flex-1 flex flex-col min-h-0">
        <Terminal containerId={id} className="flex-1 min-h-0" />
      </Box>
    </div>
  );
}
