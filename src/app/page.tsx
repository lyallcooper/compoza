"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Spinner, ProjectStatusBadge, TruncatedText, Badge, Button, ResponsiveTable } from "@/components/ui";
import type { ColumnDef } from "@/components/ui";
import { UpdateAllModal, UpdateConfirmModal } from "@/components/projects";
import { useProjects, useContainers, useImageUpdates, getProjectsWithUpdates, useBackgroundProjectUpdate } from "@/hooks";
import type { ProjectWithUpdates } from "@/hooks/use-image-updates";
import type { Container, Project } from "@/types";

function ProjectUpdateRow({ project }: { project: ProjectWithUpdates }) {
  const [showModal, setShowModal] = useState(false);
  const { updateProject } = useBackgroundProjectUpdate(project.name);

  const handleUpdate = () => {
    updateProject();
    setShowModal(false);
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
          Update…
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
  const router = useRouter();
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

  const projectColumns: ColumnDef<Project>[] = useMemo(() => [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (project) => <span className="truncate">{project.name}</span>,
    },
    {
      key: "services",
      header: "Services",
      shrink: true,
      cardLabel: "Services",
      render: (project) => (
        <span className="text-muted">
          {project.services.length}
          {project.services.length === 1 ? " service" : " services"}
        </span>
      ),
      renderCard: (project) => (
        <span>
          {project.services.length}
          {project.services.length === 1 ? " service" : " services"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      shrink: true,
      cardLabel: "Status",
      render: (project) => <ProjectStatusBadge status={project.status} />,
    },
  ], []);

  const containerColumns: ColumnDef<Container>[] = useMemo(() => [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (container) => <span className="flex-shrink-0">{container.name}</span>,
    },
    {
      key: "image",
      header: "Image",
      cardLabel: "Image",
      render: (container) => (
        <TruncatedText
          text={container.image.split("/").pop() ?? ""}
          className="text-muted"
        />
      ),
      renderCard: (container) => (
        <span className="font-mono text-xs truncate">
          {container.image.split("/").pop() ?? ""}
        </span>
      ),
    },
  ], []);

  const attentionColumns: ColumnDef<ContainerIssue>[] = useMemo(() => [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: ({ container }) => <span className="font-medium">{container.name}</span>,
    },
    {
      key: "image",
      header: "Image",
      cardLabel: "Image",
      render: ({ container }) => (
        <TruncatedText
          text={container.image.split("/").pop() ?? ""}
          className="text-muted"
        />
      ),
      renderCard: ({ container }) => (
        <span className="font-mono text-xs truncate">
          {container.image.split("/").pop() ?? ""}
        </span>
      ),
    },
    {
      key: "issues",
      header: "Issues",
      shrink: true,
      cardLabel: "Issues",
      render: ({ issues }) => (
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
      ),
    },
  ], []);

  return (
    <div className="columns-1 md:columns-2 gap-6 space-y-6">
      {/* Updates Available */}
      {!updatesLoading && !projectsLoading && projectsWithUpdates.length > 0 && (
        <Box
          title={<>Updates <Badge variant="accent">{projectsWithUpdates.length}</Badge></>}
          padding={false}
          collapsible
          defaultExpanded={projectsWithUpdates.length <= 5}
          className="break-inside-avoid"
          actions={
            <Button
              size="sm"
              variant="accent"
              onClick={() => setShowUpdateAllModal(true)}
            >
              Update All…
            </Button>
          }
        >
          <div className="divide-y divide-border">
            {projectsWithUpdates.map((project) => (
              <ProjectUpdateRow key={project.name} project={project} />
            ))}
          </div>
        </Box>
      )}

      {showUpdateAllModal && (
        <UpdateAllModal
          onClose={() => setShowUpdateAllModal(false)}
          projects={projectsWithUpdates}
        />
      )}

      {/* Needs Attention */}
      {!containersLoading && containersNeedingAttention.length > 0 && (
        <Box
          title={<>Needs Attention <Badge variant="warning">{containersNeedingAttention.length}</Badge></>}
          padding={false}
          collapsible
          defaultExpanded={containersNeedingAttention.length <= 5}
          className="break-inside-avoid"
        >
          <ResponsiveTable
            data={containersNeedingAttention}
            columns={attentionColumns}
            keyExtractor={({ container }) => container.id}
            onRowClick={({ container }) => router.push(`/containers/${encodeURIComponent(container.name)}`)}
            showHeader={false}
          />
        </Box>
      )}

      {/* Projects */}
      <Box
        title={
          <Link href="/projects" className="hover:text-accent transition-colors">
            {projectsTitle}
          </Link>
        }
        padding={false}
        className="break-inside-avoid"
        collapsible
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
          <ResponsiveTable
            data={topProjects}
            columns={projectColumns}
            keyExtractor={(project) => project.name}
            onRowClick={(project) => router.push(`/projects/${encodeURIComponent(project.name)}`)}
            showHeader={false}
            emptyState={
              <div className="p-4 text-muted">
                No projects found.{" "}
                <Link href="/projects" className="text-accent hover:underline">
                  Create one
                </Link>
              </div>
            }
          />
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
        className="break-inside-avoid"
        collapsible
      >
        {containersLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : topRunningContainers.length === 0 ? (
          <div className="p-4 text-muted">No running containers</div>
        ) : (
          <ResponsiveTable
            data={topRunningContainers}
            columns={containerColumns}
            keyExtractor={(container) => container.id}
            onRowClick={(container) => router.push(`/containers/${encodeURIComponent(container.name)}`)}
            showHeader={false}
            emptyState={<div className="p-4 text-muted">No running containers</div>}
          />
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
