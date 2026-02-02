"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Input } from "@/components/ui";
import { YamlEditor, EnvEditor } from "@/components/projects";
import { useCreateProject } from "@/hooks";

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "8080:80"
`;

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [composeContent, setComposeContent] = useState(DEFAULT_COMPOSE);
  const [envContent, setEnvContent] = useState("");

  const canCreate = name.trim() && composeContent.trim();

  const handleCreate = async () => {
    if (!canCreate) return;

    try {
      await createProject.mutateAsync({
        name: name.trim(),
        composeContent,
        envContent: envContent || undefined,
      });
      router.push(`/projects/${encodeURIComponent(name.trim())}`);
    } catch (error) {
      console.error("[Create Project] Error:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/projects" className="text-muted hover:text-foreground flex-shrink-0">
            &larr;
          </Link>
          <h1 className="text-xl font-semibold">New Project</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={handleCreate}
            loading={createProject.isPending}
            disabled={!canCreate}
          >
            Create
          </Button>
        </div>
      </div>

      {/* Project Name */}
      <Box>
        <Input
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-project"
          pattern="[a-zA-Z0-9_-]+"
          autoFocus
        />
        <p className="text-xs text-muted mt-1">
          Letters, numbers, hyphens, and underscores only
        </p>
      </Box>

      {/* Error */}
      {createProject.error && (
        <Box>
          <div className="text-error text-sm">{String(createProject.error)}</div>
        </Box>
      )}

      {/* Editors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Box title="compose.yaml" padding={false}>
          <YamlEditor
            value={composeContent}
            onChange={setComposeContent}
            className="h-80 lg:h-[32rem]"
          />
        </Box>
        <Box title=".env" padding={false}>
          <EnvEditor
            value={envContent}
            onChange={setEnvContent}
            className="h-80 lg:h-[32rem]"
          />
        </Box>
      </div>
    </div>
  );
}
