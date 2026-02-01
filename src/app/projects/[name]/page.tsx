"use client";

import { useState, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Badge, Spinner, Modal, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ProjectStatusBadge, ContainerStateBadge, TruncatedText, PortsList } from "@/components/ui";
import { useProject, useProjectUp, useProjectDown, useDeleteProject, useProjectUpdate, useStartContainer, useStopContainer, useImageUpdates } from "@/hooks";
import type { ProjectRouteProps } from "@/types";

export default function ProjectDetailPage({ params }: ProjectRouteProps) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(decodedName);
  const projectUp = useProjectUp(decodedName);
  const projectDown = useProjectDown(decodedName);
  const deleteProject = useDeleteProject(decodedName);
  const projectUpdate = useProjectUpdate(decodedName);
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();

  // Get cached update info from server
  const { data: imageUpdates } = useImageUpdates();
  const updatesMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (imageUpdates) {
      for (const update of imageUpdates) {
        map.set(update.image, update.updateAvailable);
      }
    }
    return map;
  }, [imageUpdates]);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionOutput, setActionOutput] = useState<string | null>(null);

  const handleUp = async () => {
    try {
      const result = await projectUp.mutateAsync();
      setActionOutput(result?.output || "Started");
    } catch (error) {
      console.error("[Project Up] Error:", error);
    }
  };

  const handleDown = async () => {
    try {
      const result = await projectDown.mutateAsync();
      setActionOutput(result?.output || "Stopped");
    } catch (error) {
      console.error("[Project Down] Error:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync();
      router.push("/projects");
    } catch (error) {
      console.error("[Project Delete] Error:", error);
    }
  };

  const handleUpdate = async () => {
    try {
      const result = await projectUpdate.mutateAsync();
      setActionOutput(result?.output || "Updated");
    } catch (error) {
      console.error("[Project Update] Error:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">
            {error ? String(error) : "Project not found"}
          </div>
          <Link href="/projects" className="text-accent hover:underline mt-2 inline-block">
            Back to projects
          </Link>
        </Box>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="text-muted hover:text-foreground">
            &larr;
          </Link>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${encodeURIComponent(project.name)}/logs`}>
            <Button>Logs</Button>
          </Link>
          <Link href={`/projects/${encodeURIComponent(project.name)}/edit`}>
            <Button>Edit</Button>
          </Link>
          <Button
            variant="primary"
            onClick={handleUp}
            loading={projectUp.isPending}
            disabled={projectDown.isPending || projectUpdate.isPending}
          >
            Up
          </Button>
          <Button
            onClick={handleDown}
            loading={projectDown.isPending}
            disabled={projectUp.isPending || projectUpdate.isPending || project.status === "stopped"}
          >
            Down
          </Button>
          <Button
            onClick={handleUpdate}
            loading={projectUpdate.isPending}
            disabled={projectUp.isPending || projectDown.isPending}
          >
            Update
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Action Output */}
      {actionOutput && (
        <Box title="Output">
          <pre className="text-sm text-muted whitespace-pre-wrap">{actionOutput}</pre>
          <Button size="sm" onClick={() => setActionOutput(null)} className="mt-2">
            Clear
          </Button>
        </Box>
      )}

      {/* Error Messages */}
      {(projectUp.error || projectDown.error || projectUpdate.error) && (
        <Box>
          <div className="text-error text-sm">
            {String(projectUp.error || projectDown.error || projectUpdate.error)}
          </div>
        </Box>
      )}

      {/* Services */}
      <Box title="Services" padding={false}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead className="hidden sm:table-cell">Image</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Ports</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {project.services.map((service) => (
              <TableRow
                key={service.name}
                clickable={!!service.containerId}
                onClick={service.containerId ? () => router.push(`/containers/${encodeURIComponent(service.containerId!)}`) : undefined}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{service.name}</span>
                    {service.image && updatesMap.get(service.image) && (
                      <Badge variant="accent">update</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted font-mono text-xs">
                  <TruncatedText text={service.image || "-"} maxLength={50} />
                </TableCell>
                <TableCell>
                  <ContainerStateBadge state={service.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted text-xs">
                  <PortsList ports={service.ports || []} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {service.containerId && (
                    <div className="flex gap-1">
                      {service.status === "running" ? (
                        <Button
                          size="sm"
                          onClick={() => stopContainer.mutate(service.containerId!)}
                          loading={stopContainer.isPending && stopContainer.variables === service.containerId}
                        >
                          Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => startContainer.mutate(service.containerId!)}
                          loading={startContainer.isPending && startContainer.variables === service.containerId}
                        >
                          Start
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {/* Info */}
      <Box title="Info">
        <div className="space-y-1 text-sm">
          <div>
            <span className="text-muted">Path:</span>{" "}
            <span className="font-mono">{project.path}</span>
          </div>
          <div>
            <span className="text-muted">Compose file:</span>{" "}
            <span className="font-mono">{project.composeFile}</span>
          </div>
        </div>
      </Box>

      {/* Delete Modal */}
      {showDeleteModal && (
        <Modal
          open
          onClose={() => setShowDeleteModal(false)}
          title="Delete Project"
          footer={
            <>
              <Button onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                loading={deleteProject.isPending}
              >
                Delete
              </Button>
            </>
          }
        >
          <p>
            Are you sure you want to delete <strong>{project.name}</strong>?
          </p>
          <p className="text-sm text-muted mt-2">
            This will stop all containers and remove the project directory.
          </p>
          {deleteProject.error && (
            <div className="text-error text-sm mt-2">{String(deleteProject.error)}</div>
          )}
        </Modal>
      )}
    </div>
  );
}

