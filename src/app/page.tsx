"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Box, Spinner, ProjectStatusBadge, TruncatedText } from "@/components/ui";
import { useProjects, useContainers } from "@/hooks";

export default function Dashboard() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: containers, isLoading: containersLoading } = useContainers();

  const { runningProjects, totalProjects, topProjects, hasMoreProjects } = useMemo(() => {
    const running = projects?.filter((p) => p.status === "running").length ?? 0;
    const total = projects?.length ?? 0;
    const top = projects?.slice(0, 8) ?? [];
    return {
      runningProjects: running,
      totalProjects: total,
      topProjects: top,
      hasMoreProjects: total > 8,
    };
  }, [projects]);

  const { runningContainers, totalContainers, topRunningContainers, hasMoreRunning } = useMemo(() => {
    const running = containers?.filter((c) => c.state === "running") ?? [];
    const total = containers?.length ?? 0;
    return {
      runningContainers: running.length,
      totalContainers: total,
      topRunningContainers: running.slice(0, 8),
      hasMoreRunning: running.length > 8,
    };
  }, [containers]);

  const projectsTitle = projectsLoading
    ? "Projects"
    : `Projects (${runningProjects}/${totalProjects} running)`;

  const containersTitle = containersLoading
    ? "Containers"
    : `Containers (${runningContainers}/${totalContainers} running)`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Projects */}
      <Box
        title={
          <Link href="/projects" className="hover:text-accent transition-colors">
            {projectsTitle}
          </Link>
        }
        padding={false}
      >
        {projectsLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : topProjects.length === 0 ? (
          <div className="p-4 text-muted">
            No projects found.{" "}
            <Link href="/projects" className="text-accent hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topProjects.map((project) => (
              <Link
                key={project.name}
                href={`/projects/${encodeURIComponent(project.name)}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-surface"
              >
                <span className="truncate">{project.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-xs text-muted">
                    {project.services.length}
                    <span className="hidden sm:inline">
                      {project.services.length === 1 ? " service\u00A0" : " services"}
                    </span>
                  </span>
                  <ProjectStatusBadge status={project.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
        {hasMoreProjects && (
          <div className="border-t border-border px-3 py-2">
            <Link href="/projects" className="text-accent hover:underline text-sm">
              View all {totalProjects} projects
            </Link>
          </div>
        )}
      </Box>

      {/* Running Containers */}
      <Box
        title={
          <Link href="/containers" className="hover:text-accent transition-colors">
            {containersTitle}
          </Link>
        }
        padding={false}
      >
        {containersLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : topRunningContainers.length === 0 ? (
          <div className="p-4 text-muted">No running containers</div>
        ) : (
          <div className="divide-y divide-border">
            {topRunningContainers.map((container) => (
              <Link
                key={container.id}
                href={`/containers/${encodeURIComponent(container.id)}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-surface"
              >
                <span className="flex-shrink-0">{container.name}</span>
                <TruncatedText
                  text={container.image.split("/").pop() ?? ""}
                  className="text-xs text-muted ml-2"
                />
              </Link>
            ))}
          </div>
        )}
        {hasMoreRunning && (
          <div className="border-t border-border px-3 py-2">
            <Link href="/containers" className="text-accent hover:underline text-sm">
              View all {runningContainers} running
            </Link>
          </div>
        )}
      </Box>
    </div>
  );
}
