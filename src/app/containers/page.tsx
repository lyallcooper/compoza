"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Spinner, ContainerStateBadge, TruncatedText, PortsList, ResponsiveTable, ColumnDef } from "@/components/ui";
import { ContainerActions } from "@/components/containers";
import { useContainers } from "@/hooks";
import type { Container } from "@/types";

export default function ContainersPage() {
  const router = useRouter();
  const { data: containers, isLoading, error } = useContainers();

  const sortedContainers = useMemo(
    () => [...(containers || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [containers]
  );

  const columns: ColumnDef<Container>[] = [
    {
      key: "name",
      header: "Name",
      shrink: true,
      cardPosition: "header",
      render: (c) => c.name,
    },
    {
      key: "project",
      header: "Project",
      shrink: true,
      cardPosition: "body",
      render: (c) => (
        <span className="text-muted">
          {c.projectName ? (
            <Link
              href={`/projects/${encodeURIComponent(c.projectName)}`}
              className="hover:text-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {c.projectName}
            </Link>
          ) : (
            "-"
          )}
        </span>
      ),
      renderCard: (c) =>
        c.projectName ? (
          <Link
            href={`/projects/${encodeURIComponent(c.projectName)}`}
            className="text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.projectName}
          </Link>
        ) : null,
    },
    {
      key: "image",
      header: "Image",
      cardPosition: "body",
      render: (c) => (
        <span className="text-muted font-mono">
          <TruncatedText text={c.image} maxLength={60} />
        </span>
      ),
      renderCard: (c) => (
        <span className="font-mono">
          <TruncatedText text={c.image} maxLength={40} />
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      shrink: true,
      cardPosition: "body",
      render: (c) => <ContainerStateBadge state={c.state} />,
    },
    {
      key: "ports",
      header: "Ports",
      shrink: true,
      cardPosition: "body",
      render: (c) => (
        <span className="text-muted">
          <PortsList ports={c.ports} />
        </span>
      ),
      renderCard: (c) => c.ports.length > 0 ? <PortsList ports={c.ports} /> : null,
    },
    {
      key: "actions",
      header: "Actions",
      shrink: true,
      cardPosition: "footer",
      render: (c) => <ContainerActions containerId={c.id} state={c.state} />,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Containers</h1>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Box>
          <div className="text-error">Error loading containers: {String(error)}</div>
        </Box>
      ) : containers?.length === 0 ? (
        <Box>
          <div className="text-center py-8 text-muted">No containers found</div>
        </Box>
      ) : (
        <Box padding={false}>
          <ResponsiveTable
            data={sortedContainers}
            columns={columns}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => router.push(`/containers/${encodeURIComponent(c.name)}`)}
          />
        </Box>
      )}
    </div>
  );
}
