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
  /** Project name for compose commands */
  projectName: string;
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
  projectName,
  serviceName,
  images,
  isRunning,
  loading,
}: UpdateConfirmModalProps) {
  // Build the commands that will be run
  const serviceArg = serviceName ? ` ${serviceName}` : "";
  const commands = [
    `docker compose -p ${projectName} pull${serviceArg}`,
    ...(isRunning ? [`docker compose -p ${projectName} up -d${serviceArg}`] : []),
  ];

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

        {/* Commands to run */}
        <div>
          <div className="text-sm text-muted mb-2">Commands:</div>
          <div className="bg-surface border border-border p-2 font-mono text-xs space-y-1">
            {commands.map((cmd, idx) => (
              <div key={idx} className="text-foreground">
                $ {cmd}
              </div>
            ))}
          </div>
          {!isRunning && (
            <div className="text-xs text-muted mt-1">
              Container is not running, so it will not be restarted.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
