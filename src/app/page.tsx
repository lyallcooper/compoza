"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Box, Spinner, ProjectStatusBadge } from "@/components/ui";
import { useProjects, useContainers } from "@/hooks";

export default function Dashboard() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: containers, isLoading: containersLoading } = useContainers();

  const { runningProjects, totalProjects, topProjects, hasMoreProjects } = useMemo(() => {
    const running = projects?.filter((p) => p.status === "running").length ?? 0;
    const total = projects?.length ?? 0;
    const top = projects?.slice(0, 10) ?? [];
    return {
      runningProjects: running,
      totalProjects: total,
      topProjects: top,
      hasMoreProjects: total > 10,
    };
  }, [projects]);

  const { runningContainers, totalContainers, topRunningContainers, hasMoreRunning } = useMemo(() => {
    const running = containers?.filter((c) => c.state === "running") ?? [];
    const total = containers?.length ?? 0;
    return {
      runningContainers: running.length,
      totalContainers: total,
      topRunningContainers: running.slice(0, 10),
      hasMoreRunning: running.length > 10,
    };
  }, [containers]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Box title="Projects">
          {projectsLoading ? (
            <Spinner />
          ) : (
            <div className="text-2xl font-bold">
              <span className="text-success">{runningProjects}</span>
              <span className="text-muted"> / {totalProjects}</span>
            </div>
          )}
          <div className="text-sm text-muted">running</div>
        </Box>

        <Box title="Containers">
          {containersLoading ? (
            <Spinner />
          ) : (
            <div className="text-2xl font-bold">
              <span className="text-success">{runningContainers}</span>
              <span className="text-muted"> / {totalContainers}</span>
            </div>
          )}
          <div className="text-sm text-muted">running</div>
        </Box>
      </div>

      {/* Recent Projects */}
      <Box title="Projects" padding={false}>
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
                <span>{project.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">
                    {project.services.length} service{project.services.length !== 1 ? "s" : ""}
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
      <Box title="Running Containers" padding={false}>
        {containersLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : (
          <>
            {topRunningContainers.length === 0 ? (
              <div className="p-4 text-muted">No running containers</div>
            ) : (
              <div className="divide-y divide-border">
                {topRunningContainers.map((container) => (
                  <Link
                    key={container.id}
                    href={`/containers/${encodeURIComponent(container.id)}`}
                    className="flex items-center justify-between px-3 py-2 hover:bg-surface"
                  >
                    <div>
                      <span>{container.name}</span>
                      {container.projectName && (
                        <span className="text-sm text-muted ml-2">
                          ({container.projectName})
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-muted">{container.image}</span>
                  </Link>
                ))}
              </div>
            )}
            {hasMoreRunning && (
              <div className="border-t border-border px-3 py-2">
                <Link href="/containers" className="text-accent hover:underline text-sm">
                  View all containers
                </Link>
              </div>
            )}
          </>
        )}
      </Box>
    </div>
  );
}
