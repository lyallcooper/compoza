"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Button, Badge, Spinner, Modal, ProjectStatusBadge, ContainerStateBadge, TruncatedText, PortsList, DropdownMenu, DropdownItem, Toast, ResponsiveTable, ColumnDef } from "@/components/ui";
import { ContainerActions } from "@/components/containers";
import { YamlEditor, EnvEditor, UpdateConfirmModal } from "@/components/projects";
import { useProject, useProjectUp, useProjectDown, useDeleteProject, useImageUpdates, useProjectCompose, useProjectEnv, useBackgroundProjectUpdate } from "@/hooks";
import { isProjectRunning, type ProjectRouteProps } from "@/types";

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
  const { updateProject } = useBackgroundProjectUpdate(decodedName);

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
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [rebuildImages, setRebuildImages] = useState(false);
  const [actionOutput, setActionOutput] = useState<string | null>(null);

  // Check if project has any updates available
  const hasUpdates = useMemo(() => {
    if (!project) return false;
    return project.services.some((s) => s.image && updatesMap.get(s.image));
  }, [project, updatesMap]);

  // Check if project has any services with Dockerfile builds
  const hasBuildServices = useMemo(() => {
    if (!project) return false;
    return project.services.some((s) => s.hasBuild);
  }, [project]);

  // Get images with updates for this project (with version info)
  const updatableImages = useMemo(() => {
    if (!project || !imageUpdates) return [];
    const seenImages = new Set<string>();
    const images: { image: string; currentVersion?: string; latestVersion?: string; currentDigest?: string; latestDigest?: string; sourceUrl?: string }[] = [];
    for (const service of project.services) {
      if (service.image && updatesMap.get(service.image) && !seenImages.has(service.image)) {
        seenImages.add(service.image);
        const update = imageUpdates.find((u) => u.image === service.image);
        images.push({
          image: service.image,
          currentVersion: update?.currentVersion,
          latestVersion: update?.latestVersion,
          currentDigest: update?.currentDigest,
          latestDigest: update?.latestDigest,
          sourceUrl: update?.sourceUrl,
        });
      }
    }
    return images;
  }, [project, imageUpdates, updatesMap]);

  // Derived state for action button disabled states
  const anyActionPending = projectUp.isPending || projectDown.isPending;
  const canUp = !anyActionPending && !hasChanges;
  const canDown = !anyActionPending && !hasChanges && project?.status !== "stopped";
  const canUpdate = !anyActionPending && !hasChanges;
  const canDelete = !hasChanges;

  // Shared save/discard buttons for editor boxes
  const saveDiscardButtons = (
    <>
      <Button onClick={handleDiscard} disabled={saving}>Discard</Button>
      <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
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

  const handleUpdate = () => {
    updateProject({ rebuild: rebuildImages });
    setShowUpdateModal(false);
    setRebuildImages(false);
  };

  const handleCloseUpdateModal = () => {
    setShowUpdateModal(false);
    setRebuildImages(false);
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 relative">
            <p className="absolute -top-3.5 left-0 text-[0.6rem] text-muted/50 uppercase tracking-wide leading-none">Project</p>
            <h1 className="text-xl font-semibold truncate">{project.name}</h1>
          </div>
          <span className="flex-shrink-0">
            <ProjectStatusBadge status={project.status} compact="responsive" />
          </span>
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            onClick={handleUp}
            loading={projectUp.isPending}
            disabled={!canUp}
            disabledReason={hasChanges ? "Save or discard changes first" : undefined}
          >
            Up
          </Button>
          <Button
            onClick={handleDown}
            loading={projectDown.isPending}
            disabled={!canDown}
            disabledReason={
              hasChanges ? "Save or discard changes first" :
              project?.status === "stopped" ? "Project is already stopped" : undefined
            }
          >
            Down
          </Button>
          <Button
            variant={hasUpdates ? "accent" : "default"}
            onClick={() => setShowUpdateModal(true)}
            disabled={!canUpdate}
            disabledReason={hasChanges ? "Save or discard changes first" : undefined}
          >
            Update…
          </Button>
          <Link href={`/projects/${encodeURIComponent(project.name)}/logs`} className="ml-2">
            <Button>Logs</Button>
          </Link>
          <Button
            variant="danger"
            onClick={() => setShowDeleteModal(true)}
            disabled={!canDelete}
            disabledReason={hasChanges ? "Save or discard changes first" : undefined}
            className="ml-2"
          >
            Delete…
          </Button>
        </div>

        {/* Mobile actions dropdown */}
        <DropdownMenu className="md:hidden flex-shrink-0">
          <DropdownItem
            onClick={handleUp}
            loading={projectUp.isPending}
            disabled={!canUp}
            disabledReason={hasChanges ? "Save or discard changes first" : undefined}
          >
            Up
          </DropdownItem>
          <DropdownItem
            onClick={handleDown}
            loading={projectDown.isPending}
            disabled={!canDown}
            disabledReason={
              hasChanges ? "Save or discard changes first" :
              project?.status === "stopped" ? "Project is already stopped" : undefined
            }
          >
            Down
          </DropdownItem>
          <DropdownItem
            variant={hasUpdates ? "accent" : "default"}
            onClick={() => setShowUpdateModal(true)}
            disabled={!canUpdate}
            disabledReason={hasChanges ? "Save or discard changes first" : undefined}
          >
            Update…
          </DropdownItem>
          <Link href={`/projects/${encodeURIComponent(project.name)}/logs`} className="block">
            <DropdownItem>Logs</DropdownItem>
          </Link>
          <DropdownItem
            variant="danger"
            onClick={() => setShowDeleteModal(true)}
            disabled={!canDelete}
            disabledReason={hasChanges ? "Save or discard changes first" : undefined}
          >
            Delete…
          </DropdownItem>
        </DropdownMenu>
      </div>

      {/* Action Output */}
      {actionOutput && (
        <Box title="Output">
          <pre className="text-sm text-muted whitespace-pre-wrap">{actionOutput}</pre>
          <Button onClick={() => setActionOutput(null)} className="mt-2">
            Clear
          </Button>
        </Box>
      )}

      {/* Error Messages */}
      {(projectUp.error || projectDown.error) && (
        <Box>
          <div className="text-error text-sm">
            {String(projectUp.error || projectDown.error)}
          </div>
        </Box>
      )}

      {/* Services */}
      <Box title="Services" padding={false}>
        <ResponsiveTable
          data={project.services}
          keyExtractor={(s) => s.name}
          onRowClick={(s) => s.containerName ? router.push(`/containers/${encodeURIComponent(s.containerName)}`) : undefined}
          columns={[
            {
              key: "service",
              header: "Service",
              cardPosition: "header",
              getValue: (s) => s.name,
              render: (s) => (
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.image && updatesMap.get(s.image) && (
                    <Badge variant="accent">update</Badge>
                  )}
                </div>
              ),
              renderCard: (s) => (
                <div className="flex items-center gap-2">
                  <span>{s.name}</span>
                  {s.image && updatesMap.get(s.image) && (
                    <Badge variant="accent">update</Badge>
                  )}
                </div>
              ),
            },
            {
              key: "image",
              header: "Image",
              cardPosition: "body",
              getValue: (s) => s.image || "",
              render: (s) => (
                <span className="text-muted font-mono">
                  <TruncatedText text={s.image || "-"} maxLength={50} />
                </span>
              ),
              renderCard: (s) => s.image ? (
                <span className="font-mono">
                  <TruncatedText text={s.image} maxLength={40} />
                </span>
              ) : null,
            },
            {
              key: "status",
              header: "Status",
              shrink: true,
              cardPosition: "body",
              render: (s) => <ContainerStateBadge state={s.status} />,
            },
            {
              key: "ports",
              header: "Ports",
              shrink: true,
              cardPosition: "body",
              render: (s) => (
                <span className="text-muted">
                  <PortsList ports={s.ports || []} />
                </span>
              ),
              renderCard: (s) => (s.ports?.length ?? 0) > 0 ? <PortsList ports={s.ports || []} /> : null,
            },
            {
              key: "actions",
              header: "Actions",
              shrink: true,
              cardPosition: "footer",
              render: (s) => s.containerId ? (
                <ContainerActions containerId={s.containerId} state={s.status} />
              ) : null,
            },
          ] satisfies ColumnDef<typeof project.services[number]>[]}
        />
      </Box>

      {/* Files */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Box
          title={hasComposeChanges ? "compose.yaml *" : "compose.yaml"}
          padding={false}
          actions={hasComposeChanges && saveDiscardButtons}
        >
          {editedCompose !== null ? (
            <YamlEditor value={editedCompose} onChange={setEditedCompose} className="h-80 lg:h-[32rem]" />
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
            <EnvEditor value={editedEnv} onChange={setEditedEnv} className="h-80 lg:h-[32rem]" />
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
            <Button variant="primary" onClick={handleUp} loading={projectUp.isPending}>
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

      {/* Update Modal */}
      {showUpdateModal && hasUpdates && (
        <UpdateConfirmModal
          open
          onClose={handleCloseUpdateModal}
          onConfirm={handleUpdate}
          title={`Update ${project.name}`}
          images={updatableImages}
          isRunning={isProjectRunning(project)}
          hasBuildServices={hasBuildServices}
          rebuildImages={rebuildImages}
          onRebuildChange={setRebuildImages}
        />
      )}

      {/* Update Modal - No updates detected */}
      {showUpdateModal && !hasUpdates && (
        <Modal
          open
          onClose={handleCloseUpdateModal}
          title={`Update ${project.name}`}
          footer={
            <>
              <Button onClick={handleCloseUpdateModal}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpdate}>
                {rebuildImages ? "Rebuild" : "Pull Images"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">
              No updates detected. Do you want to pull images anyway?
            </p>
            {hasBuildServices && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rebuildImages}
                  onChange={(e) => setRebuildImages(e.target.checked)}
                  className="accent-accent"
                />
                <span>Rebuild images from Dockerfile</span>
              </label>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

