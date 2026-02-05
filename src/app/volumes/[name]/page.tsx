"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Button,
  Spinner,
  Modal,
  GroupedLabels,
  TruncatedText,
  ResponsiveTable,
  ColumnDef,
} from "@/components/ui";
import { useVolume, useRemoveVolume } from "@/hooks";
import { formatDateTime, formatBytes } from "@/lib/format";
import type { VolumeRouteProps, VolumeContainer } from "@/types";

export default function VolumeDetailPage({ params }: VolumeRouteProps) {
  const { name } = use(params);
  const router = useRouter();
  const { data: volume, isLoading, error } = useVolume(name);
  const removeVolume = useRemoveVolume();

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Sort containers by name
  const sortedContainers = useMemo(
    () =>
      [...(volume?.containers || [])].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [volume?.containers]
  );

  const handleDelete = async () => {
    try {
      await removeVolume.mutateAsync(name);
      setShowDeleteModal(false);
      router.push("/volumes");
    } catch {
      // Error handled by mutation - keep modal open to show error
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !volume) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">
            {error ? String(error) : "Volume not found"}
          </div>
          <Link
            href="/volumes"
            className="text-accent hover:underline mt-2 inline-block"
          >
            Back to volumes
          </Link>
        </Box>
      </div>
    );
  }

  const detailsData = [
    { label: "Driver", value: volume.driver },
    { label: "Scope", value: volume.scope },
    { label: "Mount Point", value: volume.mountpoint, mono: true },
    ...(volume.size !== null
      ? [{ label: "Size", value: formatBytes(volume.size) }]
      : []),
    ...(volume.created
      ? [{ label: "Created", value: formatDateTime(new Date(volume.created)) }]
      : []),
  ];

  const containerColumns: ColumnDef<VolumeContainer>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (c) => (
        <Link
          href={`/containers/${encodeURIComponent(c.name)}`}
          className="text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <TruncatedText text={c.name} />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 relative">
            <p className="absolute -top-3.5 left-0 text-[0.6rem] text-muted/50 uppercase tracking-wide leading-none">
              Volume
            </p>
            <h1 className="text-xl font-semibold truncate">{volume.name}</h1>
          </div>
        </div>

        {volume.actions.canDelete && (
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete…
          </Button>
        )}
      </div>

      {/* Content sections */}
      <div className="columns-1 md:columns-2 gap-6 space-y-6">
        {/* Details */}
        <Box title="Details" padding={false} className="break-inside-avoid" collapsible>
          <ResponsiveTable
            data={detailsData}
            keyExtractor={(row) => row.label}
            columns={[
              {
                key: "label",
                header: "Property",
                shrink: true,
                cardPosition: "body",
                cardLabel: false,
                render: (row) => <span className="text-muted">{row.label}</span>,
                renderCard: (row) => (
                  <span className="text-muted shrink-0">{row.label}</span>
                ),
              },
              {
                key: "value",
                header: "Value",
                cardPosition: "body",
                cardLabel: false,
                render: (row) =>
                  row.mono ? (
                    <span className="font-mono text-xs break-all">{row.value}</span>
                  ) : (
                    row.value
                  ),
              },
            ]}
            showHeader={false}
          />
        </Box>

        {/* Connected Containers */}
        {sortedContainers.length > 0 && (
          <Box
            title="Connected Containers"
            padding={false}
            className="break-inside-avoid"
            collapsible
          >
            <ResponsiveTable
              data={sortedContainers}
              columns={containerColumns}
              keyExtractor={(c) => c.id}
            />
          </Box>
        )}

        {/* Labels */}
        {Object.keys(volume.labels).length > 0 && (
          <Box title="Labels" padding={false} className="break-inside-avoid" collapsible>
            <GroupedLabels labels={volume.labels} />
          </Box>
        )}

        {/* Options */}
        {volume.options && Object.keys(volume.options).length > 0 && (
          <Box title="Options" padding={false} className="break-inside-avoid" collapsible>
            <GroupedLabels labels={volume.options} />
          </Box>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Volume"
        footer={
          <>
            <Button onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={removeVolume.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete <strong>{volume.name}</strong>?
        </p>
        {volume.containerCount > 0 && (
          <p className="text-warning text-sm mt-2">
            This volume has {volume.containerCount} connected container
            {volume.containerCount !== 1 ? "s" : ""}.
          </p>
        )}
        <p className="text-muted text-sm mt-2">This action cannot be undone.</p>
        {removeVolume.isError && (
          <p className="text-error text-sm mt-2">
            {removeVolume.error?.message || "Failed to delete volume"}
          </p>
        )}
      </Modal>
    </div>
  );
}
