"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Box, Spinner, ProjectStatusBadge, TruncatedText, Badge, Button, CollapsibleSection } from "@/components/ui";
import { UpdateAllModal, UpdateConfirmModal } from "@/components/projects";
import { useProjects, useContainers, useImageUpdates, getProjectsWithUpdates, useProjectUpdate } from "@/hooks";
import type { ProjectWithUpdates } from "@/hooks/use-image-updates";
import type { Container } from "@/types";

function ProjectUpdateRow({ project }: { project: ProjectWithUpdates }) {
  const [showModal, setShowModal] = useState(false);
  const projectUpdate = useProjectUpdate(project.name);

  const handleUpdate = () => {
    projectUpdate.mutate(undefined, {
      onSuccess: () => setShowModal(false),
    });
  };

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 hover:bg-surface">
        <Link
          href={`/projects/${encodeURIComponent(project.name)}`}
          className="flex flex-col gap-0.5 min-w-0 flex-1"
        >
          <span className="font-medium">{project.name}</span>
          {project.images.map((img) => (
            <div key={img.image} className="text-xs text-muted">
              <div className="font-mono truncate">{img.image}</div>
              {img.currentVersion && img.latestVersion && img.currentVersion !== img.latestVersion && (
                <div className="text-accent">
                  {img.currentVersion} → {img.latestVersion}
                </div>
              )}
            </div>
          ))}
        </Link>
        <Button
          size="sm"
          variant="accent"
          className="ml-2 flex-shrink-0"
          onClick={() => setShowModal(true)}
        >
          Update{project.images.length > 1 ? ` (${project.images.length})` : ""}…
        </Button>
      </div>

      {showModal && (
        <UpdateConfirmModal
          open
          onClose={() => setShowModal(false)}
          onConfirm={handleUpdate}
          title={`Update ${project.name}`}
          images={project.images}
          isRunning={project.isRunning}
          loading={projectUpdate.isPending}
        />
      )}
    </>
  );
}

interface ContainerIssue {
  container: Container;
  issues: string[];
}

function getContainersNeedingAttention(containers: Container[] | undefined): ContainerIssue[] {
  if (!containers) return [];

  return containers
    .map((container) => {
      const issues: string[] = [];

      if (container.health?.status === "unhealthy") {
        issues.push("Unhealthy");
      }

      if (container.restartCount && container.restartCount > 0) {
        issues.push(`${container.restartCount} restart${container.restartCount > 1 ? "s" : ""}`);
      }

      if (container.state === "exited" && container.exitCode !== undefined && container.exitCode !== 0) {
        issues.push(`Exit code ${container.exitCode}`);
      }

      return { container, issues };
    })
    .filter((item) => item.issues.length > 0);
}

export default function Dashboard() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: containers, isLoading: containersLoading } = useContainers({ includeHealth: true });
  const { data: imageUpdates, isLoading: updatesLoading } = useImageUpdates();
  const [showUpdateAllModal, setShowUpdateAllModal] = useState(false);

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

  const projectsWithUpdates = useMemo(
    () => getProjectsWithUpdates(projects, imageUpdates),
    [projects, imageUpdates]
  );

  const containersNeedingAttention = useMemo(
    () => getContainersNeedingAttention(containers),
    [containers]
  );

  const projectsTitle = projectsLoading
    ? "Projects"
    : `Projects (${runningProjects}/${totalProjects} running)`;

  const containersTitle = containersLoading
    ? "Containers"
    : `Containers (${runningContainers}/${totalContainers} running)`;

  return (
    <div className="space-y-6">
      {/* Updates Available */}
      {!updatesLoading && !projectsLoading && (
        <CollapsibleSection
          title="Updates"
          count={projectsWithUpdates.length}
          variant="accent"
          defaultExpanded={projectsWithUpdates.length <= 5}
          action={
            projectsWithUpdates.length > 0 && (
              <Button
                size="sm"
                variant="accent"
                onClick={() => setShowUpdateAllModal(true)}
              >
                Update All…
              </Button>
            )
          }
        >
          <div className="divide-y divide-border">
            {projectsWithUpdates.map((project) => (
              <ProjectUpdateRow key={project.name} project={project} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {showUpdateAllModal && (
        <UpdateAllModal
          onClose={() => setShowUpdateAllModal(false)}
          projects={projectsWithUpdates}
        />
      )}

      {/* Needs Attention */}
      {!containersLoading && (
        <CollapsibleSection
          title="Needs Attention"
          count={containersNeedingAttention.length}
          variant="warning"
          defaultExpanded={containersNeedingAttention.length <= 5}
        >
          <div className="divide-y divide-border">
            {containersNeedingAttention.map(({ container, issues }) => (
              <Link
                key={container.id}
                href={`/containers/${encodeURIComponent(container.id)}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-surface"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{container.name}</span>
                  <TruncatedText
                    text={container.image.split("/").pop() ?? ""}
                    className="text-xs text-muted"
                  />
                </div>
                <div className="flex gap-1">
                  {issues.map((issue) => (
                    <Badge
                      key={issue}
                      variant={issue === "Unhealthy" ? "error" : "warning"}
                    >
                      {issue}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Projects and Containers Grid */}
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
    </div>
  );
}
