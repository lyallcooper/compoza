"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Spinner, ProjectStatusBadge, TruncatedText, Badge, Button, ResponsiveTable } from "@/components/ui";
import type { ColumnDef } from "@/components/ui";
import { UpdateAllModal, UpdateConfirmModal } from "@/components/projects";
import { useProjects, useContainers, useImageUpdates, getProjectsWithUpdates, useBackgroundProjectUpdate, useDiskUsage } from "@/hooks";
import type { ProjectWithUpdates } from "@/hooks/use-image-updates";
import type { Container, Project } from "@/types";
import { formatBytes } from "@/lib/format";

function ProjectUpdateRow({ project }: { project: ProjectWithUpdates }) {
  const [showModal, setShowModal] = useState(false);
  const { updateProject } = useBackgroundProjectUpdate();

  const handleUpdate = () => {
    updateProject(project.name);
    setShowModal(false);
  };

  return (
    <>
      <div className="flex items-center justify-between px-2 py-2 hover:bg-surface">
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

interface StorageItem {
  category: string;
  size: number | null;
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
  const { data: diskUsage, isLoading: diskLoading } = useDiskUsage();
  const [showUpdateAllModal, setShowUpdateAllModal] = useState(false);

  const { runningProjects, totalProjects, topProjects, hasMoreProjects } = useMemo(() => {
    const running = projects?.filter((p) => p.status === "running").length ?? 0;
    const total = projects?.length ?? 0;

    // Build a map of project name -> most recent container creation time
    const projectStartTimes = new Map<string, number>();
    containers?.forEach((c) => {
      if (c.projectName) {
        const current = projectStartTimes.get(c.projectName) ?? 0;
        if (c.created > current) {
          projectStartTimes.set(c.projectName, c.created);
        }
      }
    });

    // Sort projects by most recently started (running first, then by container creation time)
    const sorted = [...(projects ?? [])].sort((a, b) => {
      const aTime = projectStartTimes.get(a.name) ?? 0;
      const bTime = projectStartTimes.get(b.name) ?? 0;
      return bTime - aTime;
    });

    return {
      runningProjects: running,
      totalProjects: total,
      topProjects: sorted.slice(0, 8),
      hasMoreProjects: total > 8,
    };
  }, [projects, containers]);

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
      getValue: (container) => container.name,
      render: (container) => <TruncatedText text={container.name} />,
    },
    {
      key: "image",
      header: "Image",
      cardLabel: "Image",
      getValue: (container) => container.image.split("/").pop() ?? "",
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
      getValue: ({ container }) => container.name,
      render: ({ container }) => <span className="font-medium">{container.name}</span>,
    },
    {
      key: "image",
      header: "Image",
      cardLabel: "Image",
      getValue: ({ container }) => container.image.split("/").pop() ?? "",
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

  const storageItems: StorageItem[] = useMemo(() => {
    if (!diskUsage) return [];
    return [
      { category: "Images", size: diskUsage.images.size },
      { category: "Containers", size: diskUsage.containers.size },
      { category: "Volumes", size: diskUsage.volumes.size },
      { category: "Build Cache", size: diskUsage.buildCache.size },
    ];
  }, [diskUsage]);

  const storageColumns: ColumnDef<StorageItem>[] = useMemo(() => [
    {
      key: "category",
      header: "Category",
      cardPosition: "body",
      cardLabel: false,
      render: (item) => <span className="text-muted">{item.category}</span>,
    },
    {
      key: "size",
      header: "Size",
      cardPosition: "body",
      cardLabel: false,
      render: (item) => (
        <span className="font-mono">
          {item.size !== null ? formatBytes(item.size) : "--"}
        </span>
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
            Projects
          </Link>
        }
        actions={
          !projectsLoading && (
            <span className="text-muted font-normal text-xs">
              {runningProjects}/{totalProjects} running
            </span>
          )
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
          <Link
            href="/projects"
            className="block px-2 py-1.5 text-muted hover:bg-surface hover:text-foreground text-xs border-t border-border"
          >
            View all {totalProjects} projects →
          </Link>
        )}
      </Box>

      {/* Running Containers */}
      <Box
        title={
          <Link href="/containers" className="hover:text-accent transition-colors">
            Containers
          </Link>
        }
        actions={
          !containersLoading && (
            <span className="text-muted font-normal text-xs">
              {runningContainers}/{totalContainers} running
            </span>
          )
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
          <Link
            href="/containers"
            className="block px-2 py-1.5 text-muted hover:bg-surface hover:text-foreground text-xs border-t border-border"
          >
            View all {runningContainers} containers →
          </Link>
        )}
      </Box>

      {/* Storage */}
      <Box
        title={
          <Link href="/system" className="hover:text-accent transition-colors">
            Storage
          </Link>
        }
        padding={false}
        className="break-inside-avoid"
        collapsible
      >
        {diskLoading ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : diskUsage ? (
          <>
            <ResponsiveTable
              data={storageItems}
              columns={storageColumns}
              keyExtractor={(item) => item.category}
              showHeader={false}
            />
            <Link
              href="/system"
              className="block px-2 py-1.5 text-muted hover:bg-surface hover:text-foreground text-xs border-t border-border"
            >
              View more system info →
            </Link>
          </>
        ) : (
          <div className="p-4 text-muted">Unable to load storage info</div>
        )}
      </Box>
    </div>
  );
}
