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
import { useImage, useDeleteImage } from "@/hooks";
import { formatDateTime, formatBytes, formatShortId } from "@/lib/format";
import type { ImageRouteProps, VolumeContainer } from "@/types";

export default function ImageDetailPage({ params }: ImageRouteProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: image, isLoading, error } = useImage(id);
  const deleteImage = useDeleteImage();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);

  // Sort containers by name
  const sortedContainers = useMemo(
    () =>
      [...(image?.containers || [])].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [image?.containers]
  );

  const canDelete = (image?.containers.length ?? 0) === 0;

  const handleDelete = async () => {
    try {
      await deleteImage.mutateAsync({ id, force: forceDelete });
      setShowDeleteModal(false);
      router.push("/images");
    } catch {
      // Error handled by mutation - keep modal open to show error or retry with force
    }
  };

  const handleCloseDeleteModal = () => {
    if (!deleteImage.isPending) {
      setShowDeleteModal(false);
      setForceDelete(false);
      deleteImage.reset();
    }
  };

  // Display name: first tag, repository, or short ID
  const displayName = useMemo(() => {
    if (!image) return "";
    if (image.tags.length > 0) return image.tags[0];
    if (image.repository) return image.repository;
    return formatShortId(image.id);
  }, [image]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">
            {error ? String(error) : "Image not found"}
          </div>
          <Link
            href="/images"
            className="text-accent hover:underline mt-2 inline-block"
          >
            Back to images
          </Link>
        </Box>
      </div>
    );
  }

  const detailsData = [
    {
      label: "Tags",
      value: image.tags.length > 0 ? image.tags.join(", ") : "-",
      mono: image.tags.length > 0,
    },
    { label: "ID", value: image.id, mono: true, truncate: true },
    { label: "Size", value: formatBytes(image.size) },
    { label: "Created", value: formatDateTime(new Date(image.created * 1000)) },
    ...(image.architecture
      ? [{ label: "Architecture", value: image.architecture }]
      : []),
    ...(image.os ? [{ label: "OS", value: image.os }] : []),
  ];

  const hasConfig =
    image.config?.entrypoint ||
    image.config?.cmd ||
    image.config?.workingDir ||
    (image.config?.exposedPorts && image.config.exposedPorts.length > 0);

  const configData = [
    ...(image.config?.entrypoint
      ? [
          {
            label: "Entrypoint",
            value: image.config.entrypoint.join(" "),
            mono: true,
          },
        ]
      : []),
    ...(image.config?.cmd
      ? [{ label: "Cmd", value: image.config.cmd.join(" "), mono: true }]
      : []),
    ...(image.config?.workingDir
      ? [{ label: "Working Directory", value: image.config.workingDir, mono: true }]
      : []),
    ...(image.config?.exposedPorts && image.config.exposedPorts.length > 0
      ? [{ label: "Exposed Ports", value: image.config.exposedPorts.join(", "), mono: true }]
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
              Image
            </p>
            <h1 className="text-xl font-semibold truncate">{displayName}</h1>
          </div>
        </div>

        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
          disabled={!canDelete}
          disabledReason={!canDelete ? "Image is in use by containers" : undefined}
        >
          Delete…
        </Button>
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
                    <span className="font-mono text-xs">
                      {row.truncate ? (
                        <TruncatedText text={row.value} />
                      ) : (
                        row.value
                      )}
                    </span>
                  ) : (
                    row.value
                  ),
              },
            ]}
            showHeader={false}
          />
        </Box>

        {/* Configuration */}
        {hasConfig && (
          <Box title="Configuration" padding={false} className="break-inside-avoid" collapsible>
            <ResponsiveTable
              data={configData}
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
                      <span className="font-mono text-xs">
                        <TruncatedText text={row.value} />
                      </span>
                    ) : (
                      row.value
                    ),
                },
              ]}
              showHeader={false}
            />
          </Box>
        )}

        {/* Containers */}
        {sortedContainers.length > 0 && (
          <Box
            title="Containers"
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
        {image.config?.labels && Object.keys(image.config.labels).length > 0 && (
          <Box title="Labels" padding={false} className="break-inside-avoid" collapsible>
            <GroupedLabels labels={image.config.labels} />
          </Box>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title="Delete Image"
        footer={
          <>
            <Button onClick={handleCloseDeleteModal} disabled={deleteImage.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleteImage.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete <strong>{displayName}</strong>?
        </p>
        {image.containers.length > 0 && (
          <p className="text-warning text-sm mt-2">
            This image is used by {image.containers.length} container
            {image.containers.length !== 1 ? "s" : ""}.
          </p>
        )}
        <p className="text-muted text-sm mt-2">This action cannot be undone.</p>
        {deleteImage.isError && (
          <div className="space-y-2 mt-2">
            <div className="text-sm text-error">
              {deleteImage.error?.message || "Failed to delete image"}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={forceDelete}
                onChange={(e) => setForceDelete(e.target.checked)}
                className="rounded border-border"
              />
              Force delete (remove even if in use)
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
