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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageName.trim()) return;

    pullImage.execute(imageName.trim());
    setImageName("");
    onClose();
  };

  const handleClose = () => {
    setImageName("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Pull Image"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
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
          autoFocus
        />
      </form>
    </Modal>
  );
}
