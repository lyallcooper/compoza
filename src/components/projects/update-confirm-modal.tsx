"use client";

import { useState } from "react";
import { useIgnoreImageUpdate } from "@/hooks/use-image-updates";
import { Modal, Button, Badge } from "@/components/ui";
import { getReleasesUrl, formatVersionChange } from "@/lib/format";

interface ImageUpdate {
  image: string;
  ignored?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  currentDigest?: string;
  latestDigest?: string;
  sourceUrl?: string;
}

interface UpdateConfirmModalProps {
  open: boolean;
  showDescription?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Service name if updating a single service (container update) */
  serviceName?: string;
  /** Images being updated with version info */
  images: ImageUpdate[];
  /** Whether the project/container is currently running */
  isRunning: boolean;
  /** Whether the project has services with Dockerfile builds */
  hasBuildServices?: boolean;
  /** Whether to rebuild images */
  rebuildImages?: boolean;
  /** Callback when rebuild checkbox changes */
  onRebuildChange?: (value: boolean) => void;
}

export function UpdateConfirmModal({
  open,
  showDescription = true,
  onClose,
  onConfirm,
  title,
  serviceName,
  images,
  isRunning,
  hasBuildServices,
  rebuildImages,
  onRebuildChange,
}: UpdateConfirmModalProps) {
  const target = serviceName ? "service" : "project";
  const [skippedReleases, setSkippedReleases] = useState<string[]>([]);
  const releaseKey = (image: ImageUpdate) => JSON.stringify([image.image, image.latestDigest]);
  const displayedImages = images.map((image) => ({
    ...image,
    ignored: image.ignored || skippedReleases.includes(releaseKey(image)),
  }));
  const ignore = useIgnoreImageUpdate((release) => {
    setSkippedReleases((previous) => [...previous, releaseKey(release)]);
  });

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={handleConfirm} disabled={ignore.isPending || displayedImages.length === 0}>
            Update
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Images being updated */}
        <div>
          <div className="text-sm text-muted mb-2">
            {displayedImages.length === 1 ? "Image to update:" : "Images to update:"}
          </div>
          <div className="space-y-3">
            {displayedImages.map((img, idx) => {
              const change = formatVersionChange(img);
              return (
                <div key={`${img.image}-${idx}`} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
                  <div className="min-w-0 w-full sm:w-auto">
                    <div className="font-mono break-all">{img.image}</div>
                    {change && (
                      <div className="text-muted text-xs italic">{change}</div>
                    )}
                    {img.sourceUrl && (
                      <a
                        href={getReleasesUrl(img.sourceUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
                      >
                        View releases
                      </a>
                    )}
                  </div>
                  {img.ignored ? <Badge>Skipped</Badge> : <Button
                    className="shrink-0"
                    disabled={!img.latestDigest || ignore.isPending}
                    disabledReason={!img.latestDigest ? "The release must be identified before it can be skipped" : undefined}
                    loading={ignore.isPending && ignore.variables?.image === img.image}
                    aria-label={`Skip this update for ${img.image}`}
                    title="Hide this release until a newer image update is available"
                    onClick={() => {
                      if (img.latestDigest) ignore.mutate({ image: img.image, latestDigest: img.latestDigest });
                    }}
                  >
                    Skip
                  </Button>}
                </div>
              );
            })}
          </div>
        </div>

        {ignore.isError && <p role="alert" className="text-sm text-error">{ignore.error.message}</p>}

        {/* Rebuild checkbox - only shown for projects with Dockerfile builds */}
        {hasBuildServices && onRebuildChange && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rebuildImages}
              onChange={(e) => onRebuildChange(e.target.checked)}
              className="accent-accent"
            />
            <span>Rebuild images from Dockerfile</span>
          </label>
        )}

        {/* Description of what will happen */}
        {showDescription && <p className="text-sm text-muted">
          {isRunning
            ? `This will pull the latest image${displayedImages.length > 1 ? "s" : ""}${rebuildImages ? ", rebuild Dockerfile images," : ""} and recreate the ${target}.`
            : `This will pull the latest image${displayedImages.length > 1 ? "s" : ""}${rebuildImages ? " and rebuild Dockerfile images" : ""}. The ${target} is not running, so it will not be restarted.`}
        </p>}
      </div>
    </Modal>
  );
}
