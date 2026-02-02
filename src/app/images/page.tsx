"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  Modal,
} from "@/components/ui";
import { PullImageModal } from "@/components/images";
import { useImages, useDeleteImage, useImageUpdates, usePruneImages, useContainers } from "@/hooks";
import type { PruneResult } from "@/hooks";
import { formatBytes, formatDateTime, formatShortId } from "@/lib/format";

export default function ImagesPage() {
  const { data: images, isLoading, error } = useImages();
  const { data: containers } = useContainers();
  const { data: imageUpdates } = useImageUpdates();
  const deleteImage = useDeleteImage();
  const pruneImages = usePruneImages();

  const [pullModalOpen, setPullModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; tags: string[]; repository?: string } | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneResult, setPruneResult] = useState<PruneResult | null>(null);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteImage.mutateAsync({ id: deleteTarget.id, force: forceDelete });
      setDeleteTarget(null);
      setForceDelete(false);
    } catch {
      // Error handled by mutation - keep modal open to show error or retry with force
    }
  };

  const handleCloseDeleteModal = () => {
    if (!deleteImage.isPending) {
      setDeleteTarget(null);
      setForceDelete(false);
      deleteImage.reset();
    }
  };

  // Check if any tag for this image has an update
  const hasUpdate = (tags: string[]) => {
    return tags.some((tag) => updateStatusMap.get(tag));
  };

  const handlePrune = async () => {
    try {
      const result = await pruneImages.mutateAsync(!pruneOnlyUntagged);
      setPruneResult(result);
    } catch {
      // Error handled by mutation
    }
  };

  const handleClosePruneModal = () => {
    if (!pruneImages.isPending) {
      setPruneModalOpen(false);
      setPruneResult(null);
      setPruneOnlyUntagged(true);
      pruneImages.reset();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Images</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setPruneModalOpen(true)}>
            Remove Unused…
          </Button>
          <Button variant="default" onClick={() => setPullModalOpen(true)}>
            Pull Image…
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tags</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedImages.map((image) => (
                <TableRow key={image.id}>
                  <TableCell>
                    <div className="space-y-1">
                      {image.tags.length > 0 ? (
                        image.tags.map((tag) => (
                          <div key={tag} className="font-mono text-xs">
                            {tag}
                          </div>
                        ))
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs">{image.repository || formatShortId(image.id)}</span>
                            <Badge variant="default">untagged</Badge>
                          </div>
                          {image.repository && (
                            <div className="font-mono text-xs text-muted">{formatShortId(image.id)}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted">
                    {formatBytes(image.size)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted text-xs">
                    {formatDateTime(new Date(image.created * 1000))}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {hasUpdate(image.tags) && (
                        <Badge variant="accent">Update</Badge>
                      )}
                      {!usedImageIds.has(image.id) && (
                        <Badge variant="warning">Unused</Badge>
                      )}
                      {!hasUpdate(image.tags) && usedImageIds.has(image.id) && (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTarget({ id: image.id, tags: image.tags, repository: image.repository })}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <PullImageModal open={pullModalOpen} onClose={() => setPullModalOpen(false)} />

      <Modal
        open={deleteTarget !== null}
        onClose={handleCloseDeleteModal}
        title="Delete Image"
        footer={
          <>
            <Button variant="ghost" onClick={handleCloseDeleteModal} disabled={deleteImage.isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleteImage.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to delete this image?
          </p>
          {deleteTarget && (
            <div className="bg-surface border border-border rounded p-3">
              {deleteTarget.tags.length > 0 ? (
                deleteTarget.tags.map((tag) => (
                  <div key={tag} className="font-mono text-sm">
                    {tag}
                  </div>
                ))
              ) : (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{deleteTarget.repository || formatShortId(deleteTarget.id)}</span>
                    <Badge variant="default">untagged</Badge>
                  </div>
                  {deleteTarget.repository && (
                    <div className="font-mono text-xs text-muted">{formatShortId(deleteTarget.id)}</div>
                  )}
                </div>
              )}
            </div>
          )}
          {deleteImage.isError && (
            <div className="space-y-2">
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
        </div>
      </Modal>

      <Modal
        open={pruneModalOpen}
        onClose={handleClosePruneModal}
        title={pruneOnlyUntagged ? "Remove Untagged Images" : "Remove All Unused Images"}
        footer={
          pruneResult ? (
            <Button variant="default" onClick={handleClosePruneModal}>
              Close
            </Button>
          ) : (
            <div className="flex w-full items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pruneOnlyUntagged}
                  onChange={(e) => setPruneOnlyUntagged(e.target.checked)}
                  className="rounded border-border"
                  disabled={pruneImages.isPending}
                />
                Only untagged
              </label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleClosePruneModal} disabled={pruneImages.isPending}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handlePrune}
                  loading={pruneImages.isPending}
                  disabled={imagesToPrune.length === 0}
                >
                  Remove
                </Button>
              </div>
            </div>
          )
        }
      >
        <div className="space-y-4">
          {pruneResult ? (
            <div className="space-y-2">
              <p className="text-success">Cleanup complete</p>
              <div className="bg-surface border border-border rounded p-3 space-y-1 text-sm">
                <div>Images removed: <span className="font-semibold">{pruneResult.imagesDeleted}</span></div>
                <div>Space reclaimed: <span className="font-semibold">{formatBytes(pruneResult.spaceReclaimed)}</span></div>
              </div>
            </div>
          ) : imagesToPrune.length === 0 ? (
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
                      <div className="min-w-0">
                        {img.tags.length > 0 ? (
                          <div className="font-mono truncate">{img.tags[0]}</div>
                        ) : (
                          <>
                            <div className="font-mono truncate">{img.repository || formatShortId(img.id)}</div>
                            {img.repository && (
                              <div className="font-mono text-xs text-muted">{formatShortId(img.id)}</div>
                            )}
                          </>
                        )}
                      </div>
                      <span className="text-muted shrink-0">{formatBytes(img.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted">
                Total space to reclaim: <span className="font-semibold">{formatBytes(pruneTotalSize)}</span>
              </p>
              {pruneImages.isError && (
                <div className="text-sm text-error">
                  {pruneImages.error?.message || "Failed to remove unused images"}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
