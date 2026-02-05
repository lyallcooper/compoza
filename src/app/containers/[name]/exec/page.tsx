"use client";

import { use } from "react";
import Link from "next/link";
import { Box, Spinner } from "@/components/ui";
import { Terminal } from "@/components/terminal";
import { useContainer } from "@/hooks";
import type { ContainerRouteProps } from "@/types";

export default function ContainerExecPage({ params }: ContainerRouteProps) {
  const { name } = use(params);
  const { data: container, isLoading } = useContainer(name);

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
            href={`/containers/${encodeURIComponent(name)}`}
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
        <div className="min-w-0 relative">
          <p className="absolute -top-3.5 left-0 text-[0.6rem] text-muted/50 uppercase tracking-wide leading-none">Terminal</p>
          <h1 className="text-xl font-semibold truncate">{container.name}</h1>
        </div>
      </div>

      {/* Terminal */}
      <Box padding={false} className="flex-1 flex flex-col min-h-0">
        <Terminal containerId={container.id} className="flex-1 min-h-0" />
      </Box>
    </div>
  );
}
