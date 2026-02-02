"use client";

import { Modal, Button, Spinner } from "@/components/ui";
import { useUpdateAllProjects, type ProjectProgress } from "@/hooks";

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
  const {
    isRunning,
    progress,
    total,
    current,
    summary,
    error,
    start,
    cancel,
    reset,
  } = useUpdateAllProjects();

  const hasStarted = progress.length > 0 || isRunning;
  const isDone = summary !== null;
  const projectCount = projects.length;

  const handleClose = () => {
    if (isRunning) {
      cancel();
    }
    reset();
    onClose();
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title="Update All Projects"
      footer={
        <>
          {!hasStarted && (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button variant="accent" onClick={start}>
                Update {projectCount} Project{projectCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {isRunning && (
            <Button onClick={cancel}>Cancel</Button>
          )}
          {isDone && (
            <Button variant="primary" onClick={handleClose}>Done</Button>
          )}
        </>
      }
    >
      {!hasStarted && (
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
      )}

      {hasStarted && (
        <div className="space-y-3">
          {/* Progress header */}
          {isRunning && (
            <div className="text-sm text-muted">
              Updating project {current} of {total}...
            </div>
          )}

          {/* Project list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {progress.map((p) => (
              <ProjectProgressRow key={p.project} progress={p} />
            ))}
          </div>

          {/* Summary */}
          {summary && (
            <div className="pt-3 border-t border-border">
              <p className="text-sm">
                <span className="text-success">{summary.updated} updated</span>
                {summary.failed > 0 && (
                  <span className="text-error ml-3">{summary.failed} failed</span>
                )}
              </p>
            </div>
          )}

          {/* Error */}
          {error && !summary && (
            <div className="text-error text-sm">{error}</div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ProjectProgressRow({ progress }: { progress: ProjectProgress }) {
  const { project, step, restarted, error } = progress;

  const getStatusIcon = () => {
    switch (step) {
      case "checking":
        return <Spinner size="sm" />;
      case "pulling":
        return <Spinner size="sm" />;
      case "restarting":
        return <Spinner size="sm" />;
      case "complete":
        return <span className="text-success">✓</span>;
      case "error":
        return <span className="text-error">✗</span>;
    }
  };

  const getStatusText = () => {
    switch (step) {
      case "checking":
        return "Checking...";
      case "pulling":
        return "Pulling images...";
      case "restarting":
        return "Restarting...";
      case "complete":
        return restarted ? "Updated and restarted" : "Updated";
      case "error":
        return error || "Failed";
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm py-1">
      <span className="w-5 flex-shrink-0">{getStatusIcon()}</span>
      <span className="font-medium flex-shrink-0">{project}</span>
      <span className={`text-muted truncate ${step === "error" ? "text-error" : ""}`}>
        {getStatusText()}
      </span>
    </div>
  );
}
