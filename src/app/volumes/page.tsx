"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Badge,
  Modal,
  Input,
  ResponsiveTable,
  ColumnDef,
  TruncatedText,
  DataView,
  Select,
  Checkbox,
} from "@/components/ui";
import { useVolumes, useCreateVolume, usePruneVolumes } from "@/hooks";
import { formatBytes } from "@/lib/format";
import type { DockerVolume } from "@/types";
import type { CreateVolumeOptions } from "@/lib/docker";

/** Docker marks anonymous volumes with this label */
const ANONYMOUS_VOLUME_LABEL = "com.docker.volume.anonymous";
const isAnonymousVolume = (labels: Record<string, string>) =>
  ANONYMOUS_VOLUME_LABEL in labels;

export default function VolumesPage() {
  const router = useRouter();
  const { data: volumes, isLoading, error } = useVolumes();
  const createVolume = useCreateVolume();
  const pruneVolumes = usePruneVolumes();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);

  // Create form state
  const [volumeName, setVolumeName] = useState("");
  const [volumeDriver, setVolumeDriver] = useState("local");

  // Prune options
  const [pruneOnlyAnonymous, setPruneOnlyAnonymous] = useState(true);

  // Sort volumes by name
  const sortedVolumes = useMemo(
    () => [...(volumes || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [volumes]
  );

  // Get unused volumes for prune preview
  const allUnusedVolumes = useMemo(
    () => (volumes || []).filter((vol) => vol.containerCount === 0),
    [volumes]
  );

  const anonymousUnusedVolumes = useMemo(
    () => allUnusedVolumes.filter((vol) => isAnonymousVolume(vol.labels)),
    [allUnusedVolumes]
  );

  // Select which volumes to show based on checkbox
  const volumesToPrune = pruneOnlyAnonymous ? anonymousUnusedVolumes : allUnusedVolumes;

  const handleCreate = async () => {
    const params: CreateVolumeOptions = {
      name: volumeName,
      driver: volumeDriver || undefined,
    };
    try {
      await createVolume.mutateAsync(params);
      handleCloseCreateModal();
    } catch {
      // Error handled by mutation
    }
  };

  const handleCloseCreateModal = () => {
    if (!createVolume.isPending) {
      setCreateModalOpen(false);
      setVolumeName("");
      setVolumeDriver("local");
      createVolume.reset();
    }
  };

  const handlePrune = () => {
    pruneVolumes.execute(!pruneOnlyAnonymous);
    setPruneModalOpen(false);
    setPruneOnlyAnonymous(true);
  };

  const handleClosePruneModal = () => {
    setPruneModalOpen(false);
    setPruneOnlyAnonymous(true);
  };

  const columns: ColumnDef<DockerVolume>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (vol) => <TruncatedText text={vol.name} maxLength={30} className="font-medium" />,
    },
    {
      key: "status",
      header: "Status",
      cardPosition: "body",
      render: (vol) => (
        <div className="flex items-center gap-1">
          {isAnonymousVolume(vol.labels) && <Badge variant="default">Anonymous</Badge>}
          {vol.containerCount === 0 ? (
            <Badge variant="warning">Unused</Badge>
          ) : (
            <Badge variant="success">In Use</Badge>
          )}
        </div>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      shrink: true,
      cardPosition: "body",
      render: (vol) => <span className="text-muted">{vol.driver}</span>,
    },
    {
      key: "size",
      header: "Size",
      shrink: true,
      cardPosition: "body",
      render: (vol) => (
        <span className="text-muted">
          {vol.size !== null ? formatBytes(vol.size) : "-"}
        </span>
      ),
    },
    {
      key: "containers",
      header: "Containers",
      shrink: true,
      cardPosition: "body",
      render: (vol) => <span className="text-muted">{vol.containerCount}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold shrink-0">Volumes</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setPruneModalOpen(true)}>
            Remove Unused…
          </Button>
          <Button variant="default" onClick={() => setCreateModalOpen(true)}>
            Create…
          </Button>
        </div>
      </div>

      <DataView data={volumes} isLoading={isLoading} error={error} resourceName="volumes">
        {() => (
          <Box padding={false}>
            <ResponsiveTable
              data={sortedVolumes}
              columns={columns}
              keyExtractor={(vol) => vol.name}
              onRowClick={(vol) =>
                router.push(`/volumes/${encodeURIComponent(vol.name)}`)
              }
            />
          </Box>
        )}
      </DataView>

      {/* Create Volume Modal */}
      <Modal
        open={createModalOpen}
        onClose={handleCloseCreateModal}
        title="Create Volume"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={handleCloseCreateModal}
              disabled={createVolume.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={createVolume.isPending}
              disabled={!volumeName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Name</label>
            <Input
              value={volumeName}
              onChange={(e) => setVolumeName(e.target.value)}
              placeholder="my-volume"
              disabled={createVolume.isPending}
            />
          </div>
          <Select
            label="Driver"
            value={volumeDriver}
            onChange={(e) => setVolumeDriver(e.target.value)}
            disabled={createVolume.isPending}
            options={[
              { value: "local", label: "local" },
            ]}
          />
          {createVolume.isError && (
            <div className="text-sm text-error">
              {createVolume.error?.message || "Failed to create volume"}
            </div>
          )}
        </div>
      </Modal>

      {/* Prune Volumes Modal */}
      <Modal
        open={pruneModalOpen}
        onClose={handleClosePruneModal}
        title={pruneOnlyAnonymous ? "Remove Anonymous Volumes" : "Remove All Unused Volumes"}
        footer={
          <div className="flex w-full items-center justify-between">
            <Checkbox
              checked={pruneOnlyAnonymous}
              onChange={(e) => setPruneOnlyAnonymous(e.target.checked)}
              label="Only anonymous"
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleClosePruneModal}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handlePrune}
                disabled={volumesToPrune.length === 0}
              >
                Remove
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {volumesToPrune.length === 0 ? (
            <p className="text-muted">
              {pruneOnlyAnonymous
                ? "No anonymous volumes to remove."
                : "No unused volumes to remove."}
            </p>
          ) : (
            <>
              <p>
                The following{" "}
                {volumesToPrune.length === 1
                  ? "volume"
                  : `${volumesToPrune.length} volumes`}{" "}
                will be removed:
              </p>
              <div className="bg-surface border border-border rounded p-3 max-h-48 overflow-y-auto">
                <div className="space-y-1">
                  {volumesToPrune.map((vol) => (
                    <div key={vol.name} className="font-mono text-sm">
                      {vol.name}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
