"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Spinner } from "@/components/ui";
import { YamlEditor } from "@/components/projects";
import { useProject } from "@/hooks";
import type { ProjectRouteProps } from "@/types";

export default function EditProjectPage({ params }: ProjectRouteProps) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const router = useRouter();
  const { data: project, isLoading: projectLoading } = useProject(decodedName);

  const [composeContent, setComposeContent] = useState("");
  const [envContent, setEnvContent] = useState("");
  const [composeLoading, setComposeLoading] = useState(true);
  const [envLoading, setEnvLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalCompose, setOriginalCompose] = useState("");
  const [originalEnv, setOriginalEnv] = useState("");

  // Load compose file
  useEffect(() => {
    if (!decodedName) return;

    fetch(`/api/projects/${encodeURIComponent(decodedName)}/compose`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setComposeContent(data.data?.content || "");
        setOriginalCompose(data.data?.content || "");
      })
      .catch((err) => setError(String(err)))
      .finally(() => setComposeLoading(false));
  }, [decodedName]);

  // Load env file
  useEffect(() => {
    if (!decodedName) return;

    fetch(`/api/projects/${encodeURIComponent(decodedName)}/env`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setEnvContent(data.data?.content || "");
        setOriginalEnv(data.data?.content || "");
      })
      .catch(() => {
        // Env file might not exist, that's okay
        setEnvContent("");
        setOriginalEnv("");
      })
      .finally(() => setEnvLoading(false));
  }, [decodedName]);

  // Track changes
  useEffect(() => {
    setHasChanges(composeContent !== originalCompose || envContent !== originalEnv);
  }, [composeContent, envContent, originalCompose, originalEnv]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Save compose file
      if (composeContent !== originalCompose) {
        const composeRes = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/compose`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: composeContent }),
        });
        const composeData = await composeRes.json();
        if (composeData.error) throw new Error(composeData.error);
      }

      // Save env file
      if (envContent !== originalEnv) {
        const envRes = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/env`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: envContent }),
        });
        const envData = await envRes.json();
        if (envData.error) throw new Error(envData.error);
      }

      setOriginalCompose(composeContent);
      setOriginalEnv(envContent);
      setHasChanges(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (projectLoading || composeLoading || envLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">Project not found</div>
          <Link href="/projects" className="text-accent hover:underline mt-2 inline-block">
            Back to projects
          </Link>
        </Box>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${encodeURIComponent(decodedName)}`}
            className="text-muted hover:text-foreground"
          >
            &larr;
          </Link>
          <h1 className="text-xl font-semibold">Edit {project.name}</h1>
          {hasChanges && (
            <span className="text-sm text-warning">(unsaved changes)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => router.push(`/projects/${encodeURIComponent(decodedName)}`)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
          >
            Save
          </Button>
        </div>
      </div>

      {error && (
        <Box className="flex-shrink-0">
          <div className="text-error text-sm">{error}</div>
        </Box>
      )}

      {/* Editors */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        <div className="flex flex-col min-h-0">
          <div className="text-sm text-muted mb-1 flex-shrink-0">compose.yaml</div>
          <YamlEditor
            value={composeContent}
            onChange={setComposeContent}
            className="flex-1 min-h-0"
          />
        </div>
        <div className="flex flex-col min-h-0">
          <div className="text-sm text-muted mb-1 flex-shrink-0">.env</div>
          <textarea
            value={envContent}
            onChange={(e) => setEnvContent(e.target.value)}
            className="flex-1 min-h-0 border border-border bg-background p-2 text-sm font-mono resize-none focus:border-accent focus:outline-none"
            placeholder="# Environment variables&#10;KEY=value"
          />
        </div>
      </div>
    </div>
  );
}
