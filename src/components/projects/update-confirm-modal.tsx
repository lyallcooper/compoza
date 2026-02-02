"use client";

import { Modal, Button } from "@/components/ui";

interface ImageUpdate {
  image: string;
  currentVersion?: string;
  latestVersion?: string;
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
  /** Whether the update is in progress */
  loading?: boolean;
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
  loading,
  hasBuildServices,
  rebuildImages,
  onRebuildChange,
}: UpdateConfirmModalProps) {
  const target = serviceName ? "service" : "project";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="accent" onClick={onConfirm} loading={loading}>
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
            {images.map((img, idx) => (
              <div key={`${img.image}-${idx}`} className="text-sm font-mono flex items-center gap-2">
                <span className="truncate">{img.image}</span>
                {img.currentVersion && img.latestVersion && img.currentVersion !== img.latestVersion && (
                  <span className="text-accent whitespace-nowrap">
                    {img.currentVersion} → {img.latestVersion}
                  </span>
                )}
              </div>
            ))}
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
