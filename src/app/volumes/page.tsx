"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Spinner,
  Button,
  Badge,
  Modal,
  Input,
  ResponsiveTable,
  ColumnDef,
  TruncatedText,
} from "@/components/ui";
import { useVolumes, useCreateVolume, usePruneVolumes } from "@/hooks";
import { formatBytes } from "@/lib/format";
import type { DockerVolume } from "@/types";
import type { CreateVolumeOptions, VolumePruneResult } from "@/lib/docker";

export default function VolumesPage() {
  const router = useRouter();
  const { data: volumes, isLoading, error } = useVolumes();
  const createVolume = useCreateVolume();
  const pruneVolumes = usePruneVolumes();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneResult, setPruneResult] = useState<VolumePruneResult | null>(null);

  // Create form state
  const [volumeName, setVolumeName] = useState("");
  const [volumeDriver, setVolumeDriver] = useState("local");

  // Sort volumes by name
  const sortedVolumes = useMemo(
    () => [...(volumes || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [volumes]
  );

  // Get unused volumes for prune preview
  const unusedVolumes = useMemo(
    () => (volumes || []).filter((vol) => vol.containerCount === 0),
    [volumes]
  );

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

  const handlePrune = async () => {
    try {
      const result = await pruneVolumes.mutateAsync();
      setPruneResult(result);
    } catch {
      // Error handled by mutation
    }
  };

  const handleClosePruneModal = () => {
    if (!pruneVolumes.isPending) {
      setPruneModalOpen(false);
      setPruneResult(null);
      pruneVolumes.reset();
    }
  };

  const columns: ColumnDef<DockerVolume>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (vol) => (
        <div className="flex items-center gap-2 min-w-0">
          <TruncatedText text={vol.name} className="font-medium" />
          {vol.containerCount === 0 && <Badge variant="warning">Unused</Badge>}
        </div>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      cardPosition: "body",
      render: (vol) => <span className="text-muted">{vol.driver}</span>,
    },
    {
      key: "size",
      header: "Size",
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
      cardPosition: "body",
      render: (vol) => <span className="text-muted">{vol.containerCount}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Volumes</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setPruneModalOpen(true)}>
            Remove Unused…
          </Button>
          <Button variant="default" onClick={() => setCreateModalOpen(true)}>
            Create Volume…
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Box>
          <div className="text-error">Error loading volumes: {String(error)}</div>
        </Box>
      ) : volumes?.length === 0 ? (
        <Box>
          <div className="text-center py-8 text-muted">No volumes found</div>
        </Box>
      ) : (
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
          <div>
            <label className="block text-sm text-muted mb-1">Driver</label>
            <select
              value={volumeDriver}
              onChange={(e) => setVolumeDriver(e.target.value)}
              disabled={createVolume.isPending}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="local">local</option>
            </select>
          </div>
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
        title="Remove Unused Volumes"
        footer={
          pruneResult ? (
            <Button variant="default" onClick={handleClosePruneModal}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClosePruneModal}
                disabled={pruneVolumes.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handlePrune}
                loading={pruneVolumes.isPending}
                disabled={unusedVolumes.length === 0}
              >
                Remove
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          {pruneResult ? (
            <div className="space-y-2">
              <p className="text-success">Cleanup complete</p>
              <div className="bg-surface border border-border rounded p-3 space-y-1 text-sm">
                <div>
                  Volumes removed:{" "}
                  <span className="font-semibold">
                    {pruneResult.volumesDeleted.length}
                  </span>
                </div>
                {pruneResult.volumesDeleted.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5 text-muted font-mono text-xs">
                    {pruneResult.volumesDeleted.map((name) => (
                      <div key={name}>{name}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : unusedVolumes.length === 0 ? (
            <p className="text-muted">No unused volumes to remove.</p>
          ) : (
            <>
              <p>
                The following{" "}
                {unusedVolumes.length === 1
                  ? "volume"
                  : `${unusedVolumes.length} volumes`}{" "}
                will be removed:
              </p>
              <div className="bg-surface border border-border rounded p-3 max-h-48 overflow-y-auto">
                <div className="space-y-1">
                  {unusedVolumes.map((vol) => (
                    <div key={vol.name} className="font-mono text-sm">
                      {vol.name}
                    </div>
                  ))}
                </div>
              </div>
              {pruneVolumes.isError && (
                <div className="text-sm text-error">
                  {pruneVolumes.error?.message || "Failed to remove unused volumes"}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
