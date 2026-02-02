"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Spinner,
  ProjectStatusBadge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  DropdownMenu,
  DropdownItem,
} from "@/components/ui";
import { UpdateAllModal, UpdateConfirmModal } from "@/components/projects";
import { useProjects, useImageUpdates, useProjectUp, useProjectDown, useBackgroundProjectUpdate, getProjectsWithUpdates } from "@/hooks";
import { isProjectRunning, type Project } from "@/types";

export default function ProjectsPage() {
  const router = useRouter();
  const { data: projects, isLoading, error } = useProjects();
  const [showUpdateAllModal, setShowUpdateAllModal] = useState(false);

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Services</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProjects.map((project) => {
                const updateInfo = projectsWithUpdates.find((p) => p.name === project.name);
                return (
                  <ProjectRow
                    key={project.name}
                    project={project}
                    updatableImages={updateInfo?.images || []}
                    onClick={() => router.push(`/projects/${encodeURIComponent(project.name)}`)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {showUpdateAllModal && (
        <UpdateAllModal
          onClose={() => setShowUpdateAllModal(false)}
          projects={projectsWithUpdates}
        />
      )}
    </div>
  );
}

interface ImageUpdate {
  image: string;
  currentVersion?: string;
  latestVersion?: string;
}

function ProjectRow({
  project,
  updatableImages,
  onClick,
}: {
  project: Project;
  updatableImages: ImageUpdate[];
  onClick: () => void;
}) {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const projectUp = useProjectUp(project.name);
  const projectDown = useProjectDown(project.name);
  const { updateProject } = useBackgroundProjectUpdate(project.name);
  const runningCount = project.services.filter((s) => s.status === "running").length;
  const hasUpdates = updatableImages.length > 0;

  const handleUpdate = () => {
    updateProject();
    setShowUpdateModal(false);
  };

  return (
    <>
      <TableRow clickable onClick={onClick}>
        <TableCell>
          <span className="font-medium">{project.name}</span>
        </TableCell>
        <TableCell className="hidden sm:table-cell text-muted">
          {runningCount}/{project.services.length}
        </TableCell>
        <TableCell>
          <ProjectStatusBadge status={project.status} />
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => projectUp.mutate()}
              loading={projectUp.isPending}
            >
              Up
            </Button>
            <Button
              size="sm"
              onClick={() => projectDown.mutate()}
              loading={projectDown.isPending}
              disabled={project.status === "stopped"}
            >
              Down
            </Button>
            {hasUpdates && (
              <Button
                size="sm"
                variant="accent"
                onClick={() => setShowUpdateModal(true)}
              >
                Update…
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {showUpdateModal && (
        <UpdateConfirmModal
          open
          onClose={() => setShowUpdateModal(false)}
          onConfirm={handleUpdate}
          title={`Update ${project.name}`}
          images={updatableImages}
          isRunning={isProjectRunning(project)}
        />
      )}
    </>
  );
}

