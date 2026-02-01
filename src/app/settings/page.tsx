"use client";

import { useState } from "react";
import { Box, Button, Badge, SelectableText, TruncatedText } from "@/components/ui";
import { useImages } from "@/hooks";

export default function SettingsPage() {
  const { data: images } = useImages();
  const [selfUpdating, setSelfUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string } | null>(null);

  const projectsDir = process.env.NEXT_PUBLIC_PROJECTS_DIR || "/home/user/docker";
  const dockerHost = process.env.NEXT_PUBLIC_DOCKER_HOST || "/var/run/docker.sock";

  const handleSelfUpdate = async () => {
    setSelfUpdating(true);
    setUpdateResult(null);

    try {
      const res = await fetch("/api/self-update", { method: "POST" });
      const data = await res.json();

      if (data.error) {
        setUpdateResult({ success: false, message: data.error });
      } else {
        setUpdateResult({ success: true, message: data.data?.message || "Update initiated" });
      }
    } catch (error) {
      setUpdateResult({ success: false, message: String(error) });
    } finally {
      setSelfUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Configuration */}
      <Box title="Configuration">
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted">Projects Directory</div>
            <SelectableText className="font-mono">{projectsDir}</SelectableText>
            <div className="text-xs text-muted mt-1">
              Set via PROJECTS_DIR environment variable
            </div>
          </div>
          <div>
            <div className="text-muted">Docker Host</div>
            <SelectableText className="font-mono">{dockerHost}</SelectableText>
            <div className="text-xs text-muted mt-1">
              Set via DOCKER_HOST environment variable
            </div>
          </div>
        </div>
      </Box>

      {/* Self-Update */}
      <Box title="Self-Update">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Pull the latest Compoza image and restart the container.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSelfUpdate}
              loading={selfUpdating}
              disabled={selfUpdating}
            >
              Check for Updates
            </Button>
            {updateResult && (
              <Badge variant={updateResult.success ? "success" : "error"}>
                {updateResult.message}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted">
            Note: Self-update requires the container to be managed by a tool like
            Watchtower or a wrapper script that handles container recreation.
          </p>
        </div>
      </Box>

      {/* Images */}
      <Box title="Cached Images" padding={false}>
        {images?.length === 0 ? (
          <div className="p-4 text-muted">No images found</div>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-auto">
            {images?.map((image) => (
              <div key={image.id} className="px-4 py-2 text-sm">
                <div className="font-mono text-xs">
                  {image.tags.length > 0 ? (
                    image.tags.map((tag, i) => (
                      <span key={tag}>
                        {i > 0 && ", "}
                        <SelectableText>
                          <TruncatedText text={tag} maxLength={60} />
                        </SelectableText>
                      </span>
                    ))
                  ) : (
                    "<untagged>"
                  )}
                </div>
                <div className="text-xs text-muted mt-1">
                  {formatBytes(image.size)} • Created {formatDate(image.created)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Box>

      {/* About */}
      <Box title="About">
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted">Version:</span> 0.1.0
          </div>
          <div>
            <span className="text-muted">Stack:</span> Next.js 15 + TypeScript + Tailwind CSS
          </div>
          <div className="text-muted text-xs mt-4">
            Compoza - Docker Compose Manager for homelab/NAS environments
          </div>
        </div>
      </Box>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}
