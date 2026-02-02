"use client";

import { useState } from "react";
import { Modal, Button, Input } from "@/components/ui";
import { usePullImage } from "@/hooks";

interface PullImageModalProps {
  open: boolean;
  onClose: () => void;
}

export function PullImageModal({ open, onClose }: PullImageModalProps) {
  const [imageName, setImageName] = useState("");
  const pullImage = usePullImage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageName.trim()) return;

    try {
      await pullImage.mutateAsync(imageName.trim());
      setImageName("");
      onClose();
    } catch {
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
    if (!pullImage.isPending) {
      setImageName("");
      pullImage.reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Pull Image"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={pullImage.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={pullImage.isPending}
            disabled={!imageName.trim()}
          >
            Pull
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Image Name"
          placeholder="e.g., nginx:latest or alpine"
          value={imageName}
          onChange={(e) => setImageName(e.target.value)}
          disabled={pullImage.isPending}
          autoFocus
        />
        {pullImage.isError && (
          <div className="text-sm text-error">
            {pullImage.error?.message || "Failed to pull image"}
          </div>
        )}
      </form>
    </Modal>
  );
}
