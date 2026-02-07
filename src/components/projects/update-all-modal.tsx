"use client";

import { useState } from "react";
import { Modal, Button } from "@/components/ui";
import { useUpdateAllProjects } from "@/hooks";
import { getReleasesUrl } from "@/lib/format";

interface ImageWithVersion {
  image: string;
  currentVersion?: string;
  latestVersion?: string;
  sourceUrl?: string;
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
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.name))
  );

  const selectedCount = selected.size;
  const allSelected = selectedCount === projects.length;

  const toggleProject = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(projects.map((p) => p.name)));
    }
  };

  const handleUpdate = () => {
    start(Array.from(selected));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Update Projects"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            onClick={handleUpdate}
            disabled={selectedCount === 0}
          >
            Update {selectedCount} Project{selectedCount !== 1 ? "s" : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-muted">
          Select projects to update. Running projects will be restarted with the new images.
        </p>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {projects.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-border"
              />
              <span>Select all</span>
            </label>
          )}
          {projects.map((project) => (
            <label key={project.name} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(project.name)}
                onChange={() => toggleProject(project.name)}
                className="rounded border-border mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{project.name}</div>
                <div className="text-muted text-xs space-y-0.5">
                  {project.images.map(({ image, currentVersion, latestVersion, sourceUrl }, idx) => (
                    <div key={`${image}-${idx}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono truncate">{image}</span>
                        {currentVersion && latestVersion && currentVersion !== latestVersion && (
                          <span className="text-accent whitespace-nowrap">
                            {currentVersion} → {latestVersion}
                          </span>
                        )}
                      </div>
                      {sourceUrl && (
                        <a
                          href={getReleasesUrl(sourceUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View releases
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
