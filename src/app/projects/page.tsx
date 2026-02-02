"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Spinner,
  Modal,
  Input,
  ProjectStatusBadge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { UpdateAllModal, UpdateConfirmModal } from "@/components/projects";
import { useProjects, useCreateProject, useImageUpdates, useProjectUp, useProjectDown, useProjectUpdate } from "@/hooks";
import type { Project } from "@/types";

export default function ProjectsPage() {
  const router = useRouter();
  const { data: projects, isLoading, error } = useProjects();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpdateAllModal, setShowUpdateAllModal] = useState(false);

  // Get cached update info from server
  const { data: imageUpdates, isLoading: updatesLoading } = useImageUpdates();

  // Build a map of image -> hasUpdate
  const updatesMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (imageUpdates) {
      for (const update of imageUpdates) {
        map.set(update.image, update.updateAvailable);
      }
    }
    return map;
  }, [imageUpdates]);

  // Get projects with updates and their updatable images (including version info)
  const projectsWithUpdates = useMemo(() => {
    if (!projects || !imageUpdates) return [];
    return projects
      .map((project) => {
        // Get unique images with updates (dedupe if multiple services use same image)
        const seenImages = new Set<string>();
        const images: { image: string; currentVersion?: string; latestVersion?: string }[] = [];
        for (const service of project.services) {
          if (service.image && updatesMap.get(service.image) && !seenImages.has(service.image)) {
            seenImages.add(service.image);
            const update = imageUpdates.find((u) => u.image === service.image);
            images.push({
              image: service.image,
              currentVersion: update?.currentVersion,
              latestVersion: update?.latestVersion,
            });
          }
        }
        return { name: project.name, images };
      })
      .filter((p) => p.images.length > 0);
  }, [projects, updatesMap, imageUpdates]);

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
        <div className="flex items-center gap-2">
          {projectsWithUpdates.length > 0 && (
            <Button variant="accent" onClick={() => setShowUpdateAllModal(true)}>
              Update {projectsWithUpdates.length} Project{projectsWithUpdates.length !== 1 ? "s" : ""}…
            </Button>
          )}
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            + New Project…
          </Button>
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
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              Create your first project…
            </Button>
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

      {showCreateModal && (
        <CreateProjectModal onClose={() => setShowCreateModal(false)} />
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
  const projectUpdate = useProjectUpdate(project.name);
  const runningCount = project.services.filter((s) => s.status === "running").length;
  const hasUpdates = updatableImages.length > 0;
  const isRunning = project.status === "running" || project.status === "partial";

  const handleUpdate = () => {
    projectUpdate.mutate(undefined, {
      onSuccess: () => setShowUpdateModal(false),
    });
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
          isRunning={isRunning}
          loading={projectUpdate.isPending}
        />
      )}
    </>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [composeContent, setComposeContent] = useState(DEFAULT_COMPOSE);
  const [envContent, setEnvContent] = useState("");
  const createProject = useCreateProject();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createProject.mutateAsync({ name, composeContent, envContent: envContent || undefined });
      onClose();
    } catch (error) {
      console.error("[Create Project] Error:", error);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New Project"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={createProject.isPending}
            disabled={!name || !composeContent}
          >
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          pattern="[a-zA-Z0-9_-]+"
          required
        />
        <div>
          <label className="text-sm text-muted block mb-1">Compose File</label>
          <textarea
            value={composeContent}
            onChange={(e) => setComposeContent(e.target.value)}
            className="w-full h-48 border border-border bg-background p-2 text-sm font-mono resize-none focus:border-accent focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="text-sm text-muted block mb-1">Environment Variables (optional)</label>
          <textarea
            value={envContent}
            onChange={(e) => setEnvContent(e.target.value)}
            className="w-full h-24 border border-border bg-background p-2 text-sm font-mono resize-none focus:border-accent focus:outline-none"
            placeholder="KEY=value"
          />
        </div>
        {createProject.error && (
          <div className="text-error text-sm">{String(createProject.error)}</div>
        )}
      </form>
    </Modal>
  );
}

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
`;
