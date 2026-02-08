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
  EnvironmentVariablesSection,
  DetailHeader,
  PropertyTable,
  ConfirmModal,
  Checkbox,
} from "@/components/ui";
import type { PropertyRow } from "@/components/ui";
import { useImage, useDeleteImage, useImageUpdates } from "@/hooks";
import { formatDateTime, formatBytes, extractSourceUrl } from "@/lib/format";
import type { ImageRouteProps, VolumeContainer } from "@/types";

export default function ImageDetailPage({ params }: ImageRouteProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: image, isLoading, error } = useImage(id);
  const { data: imageUpdates } = useImageUpdates();
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
    setShowDeleteModal(false);
    const success = await deleteImage.execute({ id, force: forceDelete });
    if (success) router.push("/images");
  };

  // Find matched tags from the update check cache (tags sharing the same digest on the registry)
  const matchedTags = useMemo(() => {
    if (!image || !imageUpdates) return undefined;
    const update = imageUpdates.find((u) => image.tags.includes(u.image));
    return update?.matchedTags;
  }, [image, imageUpdates]);

  const sourceUrl = useMemo(
    () => image
      ? extractSourceUrl(image.config?.labels, image.name)
      : undefined,
    [image]
  );

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

  const detailsData: PropertyRow[] = [
    ...(matchedTags
      ? [{
          label: "Tags",
          value: matchedTags.join(", "),
          mono: true,
        }]
      : image.tags.length > 0
        ? [{
            label: "Tags",
            value: [...new Set(image.tags.map((t) => t.split(":")[1] || "latest"))].join(", "),
            mono: true,
          }]
        : []),
    { label: "ID", value: image.id, mono: true, truncate: true },
    { label: "Size", value: formatBytes(image.size) },
    { label: "Created", value: formatDateTime(new Date(image.created * 1000)) },
    ...(image.architecture
      ? [{ label: "Architecture", value: image.architecture }]
      : []),
    ...(image.os ? [{ label: "OS", value: image.os }] : []),
    ...(sourceUrl
      ? [{ label: "Source", value: sourceUrl, link: sourceUrl, external: true }]
      : []),
  ];

  const hasConfig =
    image.config?.entrypoint ||
    image.config?.cmd ||
    image.config?.workingDir ||
    image.config?.user ||
    image.config?.healthcheck ||
    (image.config?.exposedPorts && image.config.exposedPorts.length > 0) ||
    (image.config?.volumes && image.config.volumes.length > 0);

  const configData: PropertyRow[] = [
    ...(image.config?.entrypoint
      ? [{
          label: "Entrypoint",
          value: image.config.entrypoint.join(" "),
          mono: true,
        }]
      : []),
    ...(image.config?.cmd
      ? [{ label: "Cmd", value: image.config.cmd.join(" "), mono: true }]
      : []),
    ...(image.config?.workingDir
      ? [{ label: "Working Directory", value: image.config.workingDir, mono: true }]
      : []),
    ...(image.config?.user
      ? [{ label: "User", value: image.config.user, mono: true }]
      : []),
    ...(image.config?.exposedPorts && image.config.exposedPorts.length > 0
      ? [{ label: "Exposed Ports", value: image.config.exposedPorts.join(", "), mono: true }]
      : []),
    ...(image.config?.volumes && image.config.volumes.length > 0
      ? [{ label: "Volumes", value: image.config.volumes.join(", "), mono: true }]
      : []),
    ...(image.config?.healthcheck
      ? [{
          label: "Healthcheck",
          value: image.config.healthcheck.test[0] === "CMD-SHELL"
            ? image.config.healthcheck.test.slice(1).join(" ")
            : image.config.healthcheck.test.filter((t) => t !== "CMD").join(" "),
          mono: true,
        }]
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
      <DetailHeader resourceType="Image" name={image.name} actions={
        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
          disabled={!canDelete}
          disabledReason={!canDelete ? "Image is in use by containers" : undefined}
        >
          Delete…
        </Button>
      } />

      {/* Content sections */}
      <div className="columns-1 md:columns-2 gap-6 space-y-6">
        {/* Details */}
        <Box title="Details" padding={false} className="break-inside-avoid" collapsible>
          <PropertyTable data={detailsData} />
        </Box>

        {/* Configuration */}
        {hasConfig && (
          <Box title="Configuration" padding={false} className="break-inside-avoid" collapsible>
            <PropertyTable data={configData} />
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

        {/* Environment Variables */}
        {image.config?.env && Object.keys(image.config.env).length > 0 && (
          <EnvironmentVariablesSection env={image.config.env} />
        )}

        {/* Labels */}
        {image.config?.labels && Object.keys(image.config.labels).length > 0 && (
          <Box title="Labels" padding={false} className="break-inside-avoid" collapsible>
            <GroupedLabels labels={image.config.labels} />
          </Box>
        )}
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Image"
      >
        <p>
          Are you sure you want to delete <strong>{image.name}</strong>?
        </p>
        {image.containers.length > 0 && (
          <>
            <p className="text-warning text-sm mt-2">
              This image is used by {image.containers.length} container
              {image.containers.length !== 1 ? "s" : ""}.
            </p>
            <Checkbox
              checked={forceDelete}
              onChange={(e) => setForceDelete(e.target.checked)}
              label="Force delete (remove even if in use)"
              className="mt-2"
            />
          </>
        )}
        <p className="text-muted text-sm mt-2">This action cannot be undone.</p>
      </ConfirmModal>
    </div>
  );
}
