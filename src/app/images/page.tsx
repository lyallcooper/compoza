"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Spinner,
  Button,
  Badge,
  Modal,
  ResponsiveTable,
  ColumnDef,
} from "@/components/ui";
import { PullImageModal } from "@/components/images";
import { useImages, useImageUpdates, usePruneImages, useContainers } from "@/hooks";
import type { DockerImage } from "@/types";
import { formatBytes, formatDateTime } from "@/lib/format";

export default function ImagesPage() {
  const router = useRouter();
  const { data: images, isLoading, error } = useImages();
  const { data: containers } = useContainers();
  const { data: imageUpdates } = useImageUpdates();
  const pruneImages = usePruneImages();

  const [pullModalOpen, setPullModalOpen] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneOnlyUntagged, setPruneOnlyUntagged] = useState(true);

  // Create a map of image tags to update status
  const updateStatusMap = useMemo(() => {
    if (!imageUpdates) return new Map<string, boolean>();
    return new Map(imageUpdates.map((u) => [u.image, u.updateAvailable]));
  }, [imageUpdates]);

  // Create a set of image IDs in use by containers
  const usedImageIds = useMemo(() => {
    if (!containers) return new Set<string>();
    return new Set(containers.map((c) => c.imageId));
  }, [containers]);

  // Sort images by most recently created
  const sortedImages = useMemo(
    () => [...(images || [])].sort((a, b) => b.created - a.created),
    [images]
  );

  // Get dangling images for prune preview (untagged AND unused)
  const danglingImages = useMemo(
    () => (images || []).filter((img) => img.tags.length === 0 && !usedImageIds.has(img.id)),
    [images, usedImageIds]
  );

  // Get all unused images (including tagged ones)
  const unusedImages = useMemo(
    () => (images || []).filter((img) => !usedImageIds.has(img.id)),
    [images, usedImageIds]
  );

  // Select which images to show based on checkbox
  const imagesToPrune = pruneOnlyUntagged ? danglingImages : unusedImages;
  const pruneTotalSize = useMemo(
    () => imagesToPrune.reduce((sum, img) => sum + img.size, 0),
    [imagesToPrune]
  );

  // Check if any tag for this image has an update
  const hasUpdate = (tags: string[]) => {
    return tags.some((tag) => updateStatusMap.get(tag));
  };

  const handlePrune = () => {
    pruneImages.execute(!pruneOnlyUntagged);
    setPruneModalOpen(false);
    setPruneOnlyUntagged(true);
  };

  const handleClosePruneModal = () => {
    setPruneModalOpen(false);
    setPruneOnlyUntagged(true);
  };

  const columns: ColumnDef<DockerImage>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (image) => (
        <div className="flex items-center gap-2">
          <span className="font-mono">{image.name}</span>
          {image.tags.length === 0 && <Badge variant="default">untagged</Badge>}
        </div>
      ),
    },
    {
      key: "size",
      header: "Size",
      shrink: true,
      cardPosition: "body",
      render: (image) => <span className="text-muted">{formatBytes(image.size)}</span>,
    },
    {
      key: "created",
      header: "Created",
      shrink: true,
      cardPosition: "body",
      render: (image) => (
        <span className="text-muted">{formatDateTime(new Date(image.created * 1000))}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      shrink: true,
      cardPosition: "body",
      render: (image) => (
        <div className="flex flex-wrap gap-1">
          {hasUpdate(image.tags) && (
            <Badge variant="accent">Update</Badge>
          )}
          {!usedImageIds.has(image.id) && (
            <Badge variant="warning">Unused</Badge>
          )}
          {!hasUpdate(image.tags) && usedImageIds.has(image.id) && (
            <span className="text-muted">-</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold shrink-0">Images</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setPruneModalOpen(true)}>
            Remove Unused…
          </Button>
          <Button variant="default" onClick={() => setPullModalOpen(true)}>
            Pull…
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Box>
          <div className="text-error">Error loading images: {String(error)}</div>
        </Box>
      ) : images?.length === 0 ? (
        <Box>
          <div className="text-center py-8 text-muted">No images found</div>
        </Box>
      ) : (
        <Box padding={false}>
          <ResponsiveTable
            data={sortedImages}
            columns={columns}
            keyExtractor={(image) => image.id}
            onRowClick={(image) => router.push(`/images/${encodeURIComponent(image.tags[0] || image.id)}`)}
          />
        </Box>
      )}

      <PullImageModal open={pullModalOpen} onClose={() => setPullModalOpen(false)} />

      <Modal
        open={pruneModalOpen}
        onClose={handleClosePruneModal}
        title={pruneOnlyUntagged ? "Remove Untagged Images" : "Remove All Unused Images"}
        footer={
          <div className="flex w-full items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pruneOnlyUntagged}
                onChange={(e) => setPruneOnlyUntagged(e.target.checked)}
                className="rounded border-border"
              />
              Only untagged
            </label>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={handleClosePruneModal}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handlePrune}
                disabled={imagesToPrune.length === 0}
              >
                Remove
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {imagesToPrune.length === 0 ? (
            <p className="text-muted">No unused images to remove.</p>
          ) : (
            <>
              <p>
                The following {imagesToPrune.length === 1 ? "image" : `${imagesToPrune.length} images`} will be removed:
              </p>
              <div className="bg-surface border border-border rounded p-3 h-48 overflow-y-auto">
                <div className="space-y-2">
                  {imagesToPrune.map((img) => (
                    <div key={img.id} className="flex items-center justify-between gap-4 text-sm">
                      <div className="font-mono truncate min-w-0">{img.name}</div>
                      <span className="text-muted shrink-0">{formatBytes(img.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted">
                Total space to reclaim: <span className="font-semibold">{formatBytes(pruneTotalSize)}</span>
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
