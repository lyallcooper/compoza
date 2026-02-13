"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Button,
  Spinner,
  GroupedLabels,
  TruncatedText,
  ResponsiveTable,
  ColumnDef,
  DetailHeader,
  PropertyTable,
  ConfirmModal,
} from "@/components/ui";
import type { PropertyRow } from "@/components/ui";
import { useVolume, useRemoveVolume } from "@/hooks";
import { formatDateTime, formatBytes } from "@/lib/format";
import type { VolumeRouteProps, VolumeContainer } from "@/types";

export default function VolumeDetailPage({ params }: VolumeRouteProps) {
  const { name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
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

  const detailsData: PropertyRow[] = [
    { label: "Driver", value: volume.driver },
    { label: "Scope", value: volume.scope },
    { label: "Mount Point", value: volume.mountpoint, mono: true, truncate: true },
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
      render: (c) => <TruncatedText text={c.name} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <DetailHeader resourceType="Volume" name={volume.name} actions={
        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
          disabled={!volume.actions.canDelete}
          disabledReason={!volume.actions.canDelete ? "Volume is in use by containers" : undefined}
        >
          Delete…
        </Button>
      } />

      {/* Content sections */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="contents md:flex md:flex-col md:gap-6 md:flex-1 md:min-w-0">
          {/* Details */}
          <Box title="Details" padding={false} className="order-1 md:order-none" collapsible>
            <PropertyTable data={detailsData} />
          </Box>

          {/* Labels */}
          {Object.keys(volume.labels).length > 0 && (
            <div className="order-3 md:order-none">
              <GroupedLabels labels={volume.labels} />
            </div>
          )}
        </div>

        <div className="contents md:flex md:flex-col md:gap-6 md:flex-1 md:min-w-0">
          {/* Connected Containers */}
          {sortedContainers.length > 0 && (
            <Box
              title="Connected Containers"
              padding={false}
              className="order-2 md:order-none"
              collapsible
            >
              <ResponsiveTable
                data={sortedContainers}
                columns={containerColumns}
                keyExtractor={(c) => c.id}
                rowHref={(c) => `/containers/${encodeURIComponent(c.name)}`}
              />
            </Box>
          )}

          {/* Options */}
          {volume.options && Object.keys(volume.options).length > 0 && (
            <div className="order-4 md:order-none">
              <GroupedLabels labels={volume.options} title="Options" />
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Volume"
        loading={removeVolume.isPending}
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
      </ConfirmModal>
    </div>
  );
}
