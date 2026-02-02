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

        {/* Description of what will happen */}
        <p className="text-sm text-muted">
          {isRunning
            ? `This will pull the latest image${images.length > 1 ? "s" : ""} and recreate the ${target}.`
            : `This will pull the latest image${images.length > 1 ? "s" : ""}. The ${target} is not running, so it will not be restarted.`}
        </p>
      </div>
    </Modal>
  );
}
