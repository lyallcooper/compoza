"use client";

import { Modal, Button } from "@/components/ui";
import { getReleasesUrl } from "@/lib/format";

interface ImageUpdate {
  image: string;
  currentVersion?: string;
  latestVersion?: string;
  currentDigest?: string;
  latestDigest?: string;
  sourceUrl?: string;
}

/**
 * Format the change indicator for an image update.
 * Shows version change if available and different, otherwise falls back to digest prefix.
 */
function formatChange(img: ImageUpdate): string | null {
  // Show version change if versions are different
  if (img.currentVersion && img.latestVersion && img.currentVersion !== img.latestVersion) {
    return `${img.currentVersion} → ${img.latestVersion}`;
  }

  // Fall back to digest prefix if we have both digests
  if (img.currentDigest && img.latestDigest && img.currentDigest !== img.latestDigest) {
    const current = img.currentDigest.replace("sha256:", "").slice(0, 8);
    const latest = img.latestDigest.replace("sha256:", "").slice(0, 8);
    return `${current} → ${latest}`;
  }

  return null;
}

interface UpdateConfirmModalProps {
  open: boolean;
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
          <Button variant="accent" onClick={handleConfirm}>
            Update
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Images being updated */}
        <div>
          <div className="text-sm text-muted mb-2">
            {images.length === 1 ? "Image to update:" : "Images to update:"}
          </div>
          <div className="space-y-1">
            {images.map((img, idx) => {
              const change = formatChange(img);
              return (
                <div key={`${img.image}-${idx}`} className="text-sm">
                  <div className="font-mono flex items-center gap-2">
                    <span className="truncate">{img.image}</span>
                    {change && (
                      <span className="text-accent whitespace-nowrap">{change}</span>
                    )}
                  </div>
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
              );
            })}
          </div>
        </div>

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
        <p className="text-sm text-muted">
          {isRunning
            ? `This will pull the latest image${images.length > 1 ? "s" : ""}${rebuildImages ? ", rebuild Dockerfile images," : ""} and recreate the ${target}.`
            : `This will pull the latest image${images.length > 1 ? "s" : ""}${rebuildImages ? " and rebuild Dockerfile images" : ""}. The ${target} is not running, so it will not be restarted.`}
        </p>
      </div>
    </Modal>
  );
}
