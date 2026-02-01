"use client";

import { use } from "react";
import Link from "next/link";
import { Box, Spinner } from "@/components/ui";
import { LogViewer } from "@/components/logs";
import { useProject } from "@/hooks";
import type { ProjectRouteProps } from "@/types";

export default function ProjectLogsPage({ params }: ProjectRouteProps) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const { data: project, isLoading } = useProject(decodedName);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">Project not found</div>
          <Link href="/projects" className="text-accent hover:underline mt-2 inline-block">
            Back to projects
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
          href={`/projects/${encodeURIComponent(decodedName)}`}
          className="text-muted hover:text-foreground"
        >
          &larr;
        </Link>
        <h1 className="text-xl font-semibold">{project.name} - Logs</h1>
      </div>

      {/* Log viewer */}
      <Box title="Logs" padding={false} className="flex-1 flex flex-col min-h-0">
        <LogViewer
          url={`/api/projects/${encodeURIComponent(decodedName)}/logs?tail=100`}
          className="flex-1 min-h-0"
        />
      </Box>
    </div>
  );
}
