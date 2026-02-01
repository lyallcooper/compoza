"use client";

import Link from "next/link";
import { Box, Spinner, ProjectStatusBadge } from "@/components/ui";
import { useProjects, useContainers } from "@/hooks";

export default function Dashboard() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: containers, isLoading: containersLoading } = useContainers();

  const runningProjects = projects?.filter((p) => p.status === "running").length ?? 0;
  const totalProjects = projects?.length ?? 0;
  const runningContainers = containers?.filter((c) => c.state === "running").length ?? 0;
  const totalContainers = containers?.length ?? 0;

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
        ) : projects?.length === 0 ? (
          <div className="p-4 text-muted">
            No projects found.{" "}
            <Link href="/projects" className="text-accent hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {projects?.slice(0, 10).map((project) => (
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
        {projects && projects.length > 10 && (
          <div className="border-t border-border px-3 py-2">
            <Link href="/projects" className="text-accent hover:underline text-sm">
              View all {projects.length} projects
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
            {containers?.filter((c) => c.state === "running").length === 0 ? (
              <div className="p-4 text-muted">No running containers</div>
            ) : (
              <div className="divide-y divide-border">
                {containers
                  ?.filter((c) => c.state === "running")
                  .slice(0, 10)
                  .map((container) => (
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
            {containers && containers.filter((c) => c.state === "running").length > 10 && (
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
