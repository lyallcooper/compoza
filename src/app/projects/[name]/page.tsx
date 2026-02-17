"use client";

import { useState, useEffect, useRef, use, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Box, Button, Badge, Spinner, Modal, ProjectStatusBadge, ContainerStateBadge, TruncatedText, PortsList, DropdownMenu, DropdownItem, Toast, ResponsiveTable, ColumnDef, DetailHeader, ConfirmModal, Checkbox } from "@/components/ui";
import { ContainerActions } from "@/components/containers";
import { UpdateConfirmModal } from "@/components/projects";
import { useProject, useProjectUp, useProjectDown, useDeleteProject, useImageUpdates, useProjectCompose, useProjectEnv, useSaveProjectCompose, useSaveProjectEnv, useBackgroundProjectUpdate } from "@/hooks";
import { isProjectRunning, type ProjectRouteProps } from "@/types";

const editorFallback = <div className="h-80 lg:h-[32rem]" />;
const YamlEditor = dynamic(() => import("@/components/projects/yaml-editor").then(m => m.YamlEditor), { ssr: false, loading: () => editorFallback });
const EnvEditor = dynamic(() => import("@/components/projects/env-editor").then(m => m.EnvEditor), { ssr: false, loading: () => editorFallback });

export default function ProjectDetailPage({ params }: ProjectRouteProps) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(decodedName);
  const { data: composeContent } = useProjectCompose(decodedName);
  const { data: envContent } = useProjectEnv(decodedName);
  const projectUp = useProjectUp(decodedName);
  const projectDown = useProjectDown(decodedName);
  const deleteProject = useDeleteProject(decodedName);
  const { updateProject } = useBackgroundProjectUpdate();
  const saveCompose = useSaveProjectCompose(decodedName);
  const saveEnv = useSaveProjectEnv(decodedName);

  // Editing state
  const focusedEditor = useRef<"compose" | "env" | null>(null);
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

  const handleSave = useCallback(async (which: "compose" | "env" | "all") => {
    setSaving(true);
    setSaveError(null);
    try {
      if ((which === "compose" || which === "all") && hasComposeChanges && editedCompose !== null) {
        await saveCompose.mutateAsync(editedCompose);
      }
      if ((which === "env" || which === "all") && hasEnvChanges && editedEnv !== null) {
        await saveEnv.mutateAsync(editedEnv);
      }
      setShowApplyPrompt(true);
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }, [editedCompose, editedEnv, hasComposeChanges, hasEnvChanges, saveCompose, saveEnv]);

  const handleDiscard = useCallback((which: "compose" | "env") => {
    if (which === "compose") setEditedCompose(composeContent ?? "");
    if (which === "env") setEditedEnv(envContent || "");
    setSaveError(null);
  }, [composeContent, envContent]);

  // Keyboard shortcut: Cmd/Ctrl+S to save focused editor (or all if none focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saving) return;
        if (focusedEditor.current === "compose" && hasComposeChanges) {
          handleSave("compose");
        } else if (focusedEditor.current === "env" && hasEnvChanges) {
          handleSave("env");
        } else if (hasChanges) {
          handleSave("all");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, hasComposeChanges, hasEnvChanges, saving, handleSave]);

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

  const canUp = !hasChanges;
  const canDown = !hasChanges && project?.status !== "stopped";
  const canUpdate = !hasChanges;
  const canDelete = !hasChanges;

  const handleUp = () => {
    setShowApplyPrompt(false);
    projectUp.execute();
  };

  const handleDown = () => {
    projectDown.execute();
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    const success = await deleteProject.execute();
    if (success) router.push("/projects");
  };

  const handleUpdate = () => {
    updateProject(decodedName, { rebuild: rebuildImages });
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
      <DetailHeader resourceType="Project" name={project.name} actions={
        <>
          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              onClick={handleUp}
              disabled={!canUp}
              disabledReason={hasChanges ? "Save or discard changes first" : undefined}
              loading={projectUp.isPending}
            >
              Up
            </Button>
            <Button
              onClick={handleDown}
              disabled={!canDown}
              disabledReason={
                hasChanges ? "Save or discard changes first" :
                project?.status === "stopped" ? "Project is already stopped" : undefined
              }
              loading={projectDown.isPending}
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
              disabled={!canUp}
              disabledReason={hasChanges ? "Save or discard changes first" : undefined}
              loading={projectUp.isPending}
            >
              Up
            </DropdownItem>
            <DropdownItem
              onClick={handleDown}
              disabled={!canDown}
              disabledReason={
                hasChanges ? "Save or discard changes first" :
                project?.status === "stopped" ? "Project is already stopped" : undefined
              }
              loading={projectDown.isPending}
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
            <DropdownItem href={`/projects/${encodeURIComponent(project.name)}/logs`}>
              Logs
            </DropdownItem>
            <DropdownItem
              variant="danger"
              onClick={() => setShowDeleteModal(true)}
              disabled={!canDelete}
              disabledReason={hasChanges ? "Save or discard changes first" : undefined}
            >
              Delete…
            </DropdownItem>
          </DropdownMenu>
        </>
      }>
        <span className="flex-shrink-0">
          <ProjectStatusBadge status={project.status} compact="responsive" />
        </span>
      </DetailHeader>

      {/* Services */}
      <Box title="Services" padding={false}>
        <ResponsiveTable
          data={project.services}
          keyExtractor={(s) => s.name}
          rowHref={(s) => s.containerName ? `/containers/${encodeURIComponent(s.containerName)}` : undefined}
          columns={[
            {
              key: "service",
              header: "Service",
              cardPosition: "header",
              getValue: (s) => s.name,
              render: (s) => <span className="font-medium">{s.name}</span>,
              renderCard: (s) => s.name,
            },
            {
              key: "image",
              header: "Image",
              cardPosition: "body",
              cardLabel: false,
              getValue: (s) => s.image || "",
              render: (s) => (
                <span className="text-muted font-mono">
                  {s.image ? (
                    <Link
                      href={`/images/${encodeURIComponent(s.image)}`}
                      className="group/link hover:text-foreground [&_span]:group-hover/link:underline"
                    >
                      <TruncatedText text={s.image} maxLength={50} />
                    </Link>
                  ) : "-"}
                </span>
              ),
              renderCard: (s) => s.image ? (
                <Link
                  href={`/images/${encodeURIComponent(s.image)}`}
                  className="group/link font-mono text-accent [&_span]:group-hover/link:underline"
                >
                  <TruncatedText text={s.image} maxLength={40} />
                </Link>
              ) : null,
            },
            {
              key: "status",
              header: "Status",
              shrink: true,
              cardPosition: "body",
              cardLabel: false,
              cardFullWidth: true,
              render: (s) => {
                const hasImageUpdate = s.image && updatesMap.get(s.image);
                return hasImageUpdate ? (
                  <div className="flex items-center gap-1.5">
                    <ContainerStateBadge state={s.status} />
                    <Badge variant="accent">update</Badge>
                  </div>
                ) : (
                  <ContainerStateBadge state={s.status} />
                );
              },
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
          actions={hasComposeChanges && (
            <>
              <Button onClick={() => handleDiscard("compose")} disabled={saving}>Discard</Button>
              <Button variant="primary" onClick={() => handleSave("compose")} loading={saving}>Save</Button>
            </>
          )}
        >
          <div onFocus={() => focusedEditor.current = "compose"} onBlur={() => focusedEditor.current = null}>
            {editedCompose !== null ? (
              <YamlEditor value={editedCompose} onChange={setEditedCompose} className="h-80 lg:h-[32rem]" />
            ) : (
              <div className="p-4 text-muted">Loading...</div>
            )}
          </div>
        </Box>
        <Box
          title={hasEnvChanges ? ".env *" : ".env"}
          padding={false}
          actions={hasEnvChanges && (
            <>
              <Button onClick={() => handleDiscard("env")} disabled={saving}>Discard</Button>
              <Button variant="primary" onClick={() => handleSave("env")} loading={saving}>Save</Button>
            </>
          )}
        >
          <div onFocus={() => focusedEditor.current = "env"} onBlur={() => focusedEditor.current = null}>
            {editedEnv !== null ? (
              <EnvEditor value={editedEnv} onChange={setEditedEnv} className="h-80 lg:h-[32rem]" />
            ) : (
              <div className="p-4 text-muted">Loading...</div>
            )}
          </div>
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
      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Project"
      >
        <p>
          Are you sure you want to delete <strong>{project.name}</strong>?
        </p>
        <p className="text-sm text-muted mt-2">
          This will stop all containers and remove the project directory.
        </p>
      </ConfirmModal>

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
              <Checkbox
                checked={rebuildImages}
                onChange={(e) => setRebuildImages(e.target.checked)}
                label="Rebuild images from Dockerfile"
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
