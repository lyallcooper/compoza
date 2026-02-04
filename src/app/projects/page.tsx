"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Spinner,
  ProjectStatusBadge,
  ResponsiveTable,
  ColumnDef,
  DropdownMenu,
  DropdownItem,
} from "@/components/ui";
import { UpdateAllModal, UpdateConfirmModal } from "@/components/projects";
import { useProjects, useImageUpdates, useProjectUp, useProjectDown, useBackgroundProjectUpdate, getProjectsWithUpdates } from "@/hooks";
import { isProjectRunning, type Project } from "@/types";

interface ImageUpdate {
  image: string;
  currentVersion?: string;
  latestVersion?: string;
}

interface ProjectWithUpdates {
  project: Project;
  updatableImages: ImageUpdate[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: projects, isLoading, error } = useProjects();
  const [showUpdateAllModal, setShowUpdateAllModal] = useState(false);
  const [updateModalProject, setUpdateModalProject] = useState<ProjectWithUpdates | null>(null);

  // Get cached update info from server
  const { data: imageUpdates, isLoading: updatesLoading } = useImageUpdates();

  // Get projects with updates and their updatable images
  const projectsWithUpdates = useMemo(
    () => getProjectsWithUpdates(projects, imageUpdates),
    [projects, imageUpdates]
  );

  const sortedProjects = useMemo(
    () => [...(projects || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  // Create a map of project name to update info
  const updateInfoMap = useMemo(() => {
    const map = new Map<string, ImageUpdate[]>();
    for (const p of projectsWithUpdates) {
      map.set(p.name, p.images);
    }
    return map;
  }, [projectsWithUpdates]);

  const columns: ColumnDef<Project>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (p) => <span className="font-medium">{p.name}</span>,
    },
    {
      key: "services",
      header: "Services",
      shrink: true,
      cardPosition: "body",
      className: "hidden sm:block",
      render: (p) => {
        const runningCount = p.services.filter((s) => s.status === "running").length;
        return <span className="text-muted">{runningCount}/{p.services.length}</span>;
      },
      renderCard: (p) => {
        const runningCount = p.services.filter((s) => s.status === "running").length;
        return <span>{runningCount}/{p.services.length} services</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      shrink: true,
      cardPosition: "body",
      render: (p) => <ProjectStatusBadge status={p.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      shrink: true,
      cardPosition: "footer",
      render: (p) => (
        <ProjectActions
          project={p}
          updatableImages={updateInfoMap.get(p.name) || []}
          onUpdateClick={() => setUpdateModalProject({ project: p, updatableImages: updateInfoMap.get(p.name) || [] })}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Projects</h1>
          {updatesLoading && <Spinner size="sm" />}
        </div>
        {/* Buttons - visible on sm and up */}
        <div className="hidden sm:flex items-center gap-2">
          {projectsWithUpdates.length > 0 && (
            <Button variant="accent" onClick={() => setShowUpdateAllModal(true)}>
              Update {projectsWithUpdates.length} Project{projectsWithUpdates.length !== 1 ? "s" : ""}…
            </Button>
          )}
          <Link href="/projects/new">
            <Button variant="primary">+ New Project</Button>
          </Link>
        </div>
        {/* Dropdown menu - visible below sm */}
        <div className="sm:hidden">
          <DropdownMenu label="Actions">
            {projectsWithUpdates.length > 0 && (
              <DropdownItem variant="accent" onClick={() => setShowUpdateAllModal(true)}>
                Update {projectsWithUpdates.length} Project{projectsWithUpdates.length !== 1 ? "s" : ""}…
              </DropdownItem>
            )}
            <Link href="/projects/new" className="block">
              <DropdownItem>New Project</DropdownItem>
            </Link>
          </DropdownMenu>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Box>
          <div className="text-error">Error loading projects: {String(error)}</div>
        </Box>
      ) : projects?.length === 0 ? (
        <Box>
          <div className="text-center py-8">
            <p className="text-muted mb-4">No projects found</p>
            <Link href="/projects/new">
              <Button variant="primary">Create your first project</Button>
            </Link>
          </div>
        </Box>
      ) : (
        <Box padding={false}>
          <ResponsiveTable
            data={sortedProjects}
            columns={columns}
            keyExtractor={(p) => p.name}
            onRowClick={(p) => router.push(`/projects/${encodeURIComponent(p.name)}`)}
          />
        </Box>
      )}

      {showUpdateAllModal && (
        <UpdateAllModal
          onClose={() => setShowUpdateAllModal(false)}
          projects={projectsWithUpdates}
        />
      )}

      {updateModalProject && (
        <UpdateConfirmModalWrapper
          project={updateModalProject.project}
          updatableImages={updateModalProject.updatableImages}
          onClose={() => setUpdateModalProject(null)}
        />
      )}
    </div>
  );
}

function ProjectActions({
  project,
  updatableImages,
  onUpdateClick,
}: {
  project: Project;
  updatableImages: ImageUpdate[];
  onUpdateClick: () => void;
}) {
  const projectUp = useProjectUp(project.name);
  const projectDown = useProjectDown(project.name);
  const hasUpdates = updatableImages.length > 0;

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          projectUp.mutate();
        }}
        loading={projectUp.isPending}
      >
        Up
      </Button>
      <Button
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          projectDown.mutate();
        }}
        loading={projectDown.isPending}
        disabled={project.status === "stopped"}
      >
        Down
      </Button>
      {hasUpdates && (
        <Button
          size="sm"
          variant="accent"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateClick();
          }}
        >
          Update…
        </Button>
      )}
    </div>
  );
}

function UpdateConfirmModalWrapper({
  project,
  updatableImages,
  onClose,
}: {
  project: Project;
  updatableImages: ImageUpdate[];
  onClose: () => void;
}) {
  const { updateProject } = useBackgroundProjectUpdate(project.name);

  const handleUpdate = () => {
    updateProject();
    onClose();
  };

  return (
    <UpdateConfirmModal
      open
      onClose={onClose}
      onConfirm={handleUpdate}
      title={`Update ${project.name}`}
      images={updatableImages}
      isRunning={isProjectRunning(project)}
    />
  );
}
