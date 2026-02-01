"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Button, Badge, Spinner, Modal, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, ProjectStatusBadge, ContainerStateBadge, TruncatedText, PortsList, DropdownMenu, DropdownItem, Toast } from "@/components/ui";
import { ContainerActions } from "@/components/containers";
import { YamlEditor, EnvEditor } from "@/components/projects";
import { useProject, useProjectUp, useProjectDown, useDeleteProject, useProjectUpdate, useImageUpdates, useProjectCompose, useProjectEnv } from "@/hooks";
import type { ProjectRouteProps } from "@/types";

export default function ProjectDetailPage({ params }: ProjectRouteProps) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: project, isLoading, error } = useProject(decodedName);
  const { data: composeContent } = useProjectCompose(decodedName);
  const { data: envContent } = useProjectEnv(decodedName);
  const projectUp = useProjectUp(decodedName);
  const projectDown = useProjectDown(decodedName);
  const deleteProject = useDeleteProject(decodedName);
  const projectUpdate = useProjectUpdate(decodedName);

  // Editing state
  const [editedCompose, setEditedCompose] = useState<string | null>(null);
  const [editedEnv, setEditedEnv] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showApplyPrompt, setShowApplyPrompt] = useState(false);

  // Initialize edited content when data loads
  useEffect(() => {
    if (composeContent !== undefined && editedCompose === null) {
      setEditedCompose(composeContent);
    }
  }, [composeContent, editedCompose]);

  useEffect(() => {
    if (envContent !== undefined && editedEnv === null) {
      setEditedEnv(envContent || "");
    }
  }, [envContent, editedEnv]);

  // Track if there are unsaved changes
  const hasComposeChanges = editedCompose !== null && editedCompose !== composeContent;
  const hasEnvChanges = editedEnv !== null && editedEnv !== (envContent || "");
  const hasChanges = hasComposeChanges || hasEnvChanges;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      // Save compose file
      if (hasComposeChanges) {
        const composeRes = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/compose`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editedCompose }),
        });
        const composeData = await composeRes.json();
        if (composeData.error) throw new Error(composeData.error);
      }

      // Save env file
      if (hasEnvChanges) {
        const envRes = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/env`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editedEnv }),
        });
        const envData = await envRes.json();
        if (envData.error) throw new Error(envData.error);
      }

      // Invalidate cache to refetch fresh data
      await queryClient.invalidateQueries({ queryKey: ["projects", decodedName, "compose"] });
      await queryClient.invalidateQueries({ queryKey: ["projects", decodedName, "env"] });

      // Show prompt to apply changes
      setShowApplyPrompt(true);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }, [decodedName, editedCompose, editedEnv, hasComposeChanges, hasEnvChanges, queryClient]);

  const handleDiscard = useCallback(() => {
    setEditedCompose(composeContent ?? "");
    setEditedEnv(envContent || "");
    setSaveError(null);
  }, [composeContent, envContent]);

  // Keyboard shortcut: Cmd/Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !saving) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, saving, handleSave]);

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

  // Derived state for action button disabled states
  const anyActionPending = projectUp.isPending || projectDown.isPending || projectUpdate.isPending;
  const canUp = !anyActionPending && !hasChanges;
  const canDown = !anyActionPending && !hasChanges && project?.status !== "stopped";
  const canUpdate = !anyActionPending && !hasChanges;
  const canDelete = !hasChanges;

  // Shared save/discard buttons for editor boxes
  const saveDiscardButtons = (
    <>
      <Button size="sm" onClick={handleDiscard} disabled={saving}>Discard</Button>
      <Button size="sm" variant="primary" onClick={handleSave} loading={saving}>Save</Button>
    </>
  );

  const handleUp = async () => {
    setShowApplyPrompt(false);
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

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          <Button onClick={handleUp} loading={projectUp.isPending} disabled={!canUp}>
            Up
          </Button>
          <Button onClick={handleDown} loading={projectDown.isPending} disabled={!canDown}>
            Down
          </Button>
          <Button onClick={handleUpdate} loading={projectUpdate.isPending} disabled={!canUpdate}>
            Update
          </Button>
          <Link href={`/projects/${encodeURIComponent(project.name)}/logs`} className="ml-2">
            <Button>Logs</Button>
          </Link>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)} disabled={!canDelete} className="ml-2">
            Delete
          </Button>
        </div>

        {/* Mobile actions dropdown */}
        <DropdownMenu className="md:hidden">
          <DropdownItem onClick={handleUp} loading={projectUp.isPending} disabled={!canUp}>
            Up
          </DropdownItem>
          <DropdownItem onClick={handleDown} loading={projectDown.isPending} disabled={!canDown}>
            Down
          </DropdownItem>
          <DropdownItem onClick={handleUpdate} loading={projectUpdate.isPending} disabled={!canUpdate}>
            Update
          </DropdownItem>
          <Link href={`/projects/${encodeURIComponent(project.name)}/logs`} className="block">
            <DropdownItem>Logs</DropdownItem>
          </Link>
          <DropdownItem variant="danger" onClick={() => setShowDeleteModal(true)} disabled={!canDelete}>
            Delete
          </DropdownItem>
        </DropdownMenu>
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
                clickable={!!service.containerName}
                onClick={service.containerName ? () => router.push(`/containers/${encodeURIComponent(service.containerName!)}`) : undefined}
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
                    <ContainerActions containerId={service.containerId} state={service.status} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {/* Files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Box
          title={hasComposeChanges ? "compose.yaml *" : "compose.yaml"}
          padding={false}
          actions={hasComposeChanges && saveDiscardButtons}
        >
          {editedCompose !== null ? (
            <YamlEditor value={editedCompose} onChange={setEditedCompose} className="h-80" />
          ) : (
            <div className="p-4 text-muted">Loading...</div>
          )}
        </Box>
        <Box
          title={hasEnvChanges ? ".env *" : ".env"}
          padding={false}
          actions={hasEnvChanges && saveDiscardButtons}
        >
          {editedEnv !== null ? (
            <EnvEditor value={editedEnv} onChange={setEditedEnv} className="h-80" />
          ) : (
            <div className="p-4 text-muted">Loading...</div>
          )}
        </Box>
      </div>

      {/* Save error message */}
      {saveError && (
        <div className="text-error text-sm text-right">{saveError}</div>
      )}

      {/* Apply changes prompt */}
      {showApplyPrompt && !hasChanges && (
        <Toast
          onClose={() => setShowApplyPrompt(false)}
          actions={
            <Button size="sm" variant="primary" onClick={handleUp} loading={projectUp.isPending}>
              Up
            </Button>
          }
        >
          Changes saved. Run Up to apply them.
        </Toast>
      )}

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

