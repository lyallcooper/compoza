"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Box, Button, Badge, Spinner, Modal, Input, ProjectStatusBadge } from "@/components/ui";
import { useProjects, useCreateProject, useImageUpdates } from "@/hooks";

export default function ProjectsPage() {
  const { data: projects, isLoading, error } = useProjects();
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  // Count updates available
  const updatesAvailable = imageUpdates?.filter((u) => u.updateAvailable).length ?? 0;

  // Check if a project has any updates available
  const projectHasUpdates = (projectName: string): boolean => {
    const project = projects?.find((p) => p.name === projectName);
    if (!project) return false;
    return project.services.some((s) => s.image && updatesMap.get(s.image));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Projects</h1>
          {updatesAvailable > 0 && (
            <Badge variant="accent">{updatesAvailable} update{updatesAvailable !== 1 ? "s" : ""}</Badge>
          )}
          {updatesLoading && <Spinner size="sm" />}
        </div>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          + New Project
        </Button>
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
              Create your first project
            </Button>
          </div>
        </Box>
      ) : (
        <Box padding={false}>
          <div className="divide-y divide-border">
            {projects?.map((project) => (
              <Link
                key={project.name}
                href={`/projects/${encodeURIComponent(project.name)}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface"
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {project.name}
                    {projectHasUpdates(project.name) && (
                      <Badge variant="accent">update</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted">
                    {project.services.length} service{project.services.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-muted">
                    {project.services.filter((s) => s.status === "running").length} running
                  </div>
                  <ProjectStatusBadge status={project.status} />
                </div>
              </Link>
            ))}
          </div>
        </Box>
      )}

      {showCreateModal && (
        <CreateProjectModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
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
