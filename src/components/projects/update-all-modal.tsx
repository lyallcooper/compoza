"use client";

import { Modal, Button } from "@/components/ui";
import { useUpdateAllProjects } from "@/hooks";

interface ImageWithVersion {
  image: string;
  currentVersion?: string;
  latestVersion?: string;
}

interface ProjectWithUpdates {
  name: string;
  images: ImageWithVersion[];
}

interface UpdateAllModalProps {
  onClose: () => void;
  projects: ProjectWithUpdates[];
}

export function UpdateAllModal({ onClose, projects }: UpdateAllModalProps) {
  const { start } = useUpdateAllProjects();
  const projectCount = projects.length;

  const handleUpdate = () => {
    start(projects.map((p) => p.name));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Update All Projects"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="accent" onClick={handleUpdate}>
            Update {projectCount} Project{projectCount !== 1 ? "s" : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-muted">
          The following projects have image updates available. Running projects
          will be restarted with the new images.
        </p>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {projects.map((project) => (
            <div key={project.name} className="text-sm">
              <div className="font-medium">{project.name}</div>
              <div className="text-muted text-xs pl-3 space-y-0.5">
                {project.images.map(({ image, currentVersion, latestVersion }, idx) => (
                  <div key={`${image}-${idx}`} className="flex items-center gap-2">
                    <span className="font-mono truncate">{image}</span>
                    {currentVersion && latestVersion && currentVersion !== latestVersion && (
                      <span className="text-accent whitespace-nowrap">
                        {currentVersion} → {latestVersion}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
