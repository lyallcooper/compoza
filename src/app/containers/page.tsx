"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Spinner, Button, Modal, ContainerStateBadge, TruncatedText, PortsList, ResponsiveTable, ColumnDef } from "@/components/ui";
import { ContainerActions } from "@/components/containers";
import { useContainers, usePruneContainers } from "@/hooks";
import type { Container } from "@/types";

export default function ContainersPage() {
  const router = useRouter();
  const { data: containers, isLoading, error } = useContainers();
  const pruneContainers = usePruneContainers();

  const [pruneModalOpen, setPruneModalOpen] = useState(false);

  const sortedContainers = useMemo(
    () => [...(containers || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [containers]
  );

  const stoppedContainers = useMemo(
    () => (containers || []).filter((c) => c.state === "exited"),
    [containers]
  );

  const handlePrune = () => {
    pruneContainers.execute();
    setPruneModalOpen(false);
  };

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
          <Link
            href={`/images/${encodeURIComponent(c.image)}`}
            className="group/link hover:text-foreground [&_span]:group-hover/link:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <TruncatedText text={c.image} maxLength={60} />
          </Link>
        </span>
      ),
      renderCard: (c) => (
        <Link
          href={`/images/${encodeURIComponent(c.image)}`}
          className="group/link font-mono text-accent [&_span]:group-hover/link:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <TruncatedText text={c.image} maxLength={40} />
        </Link>
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold shrink-0">Containers</h1>
        <Button variant="default" onClick={() => setPruneModalOpen(true)}>
          Remove Stopped…
        </Button>
      </div>

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

      <Modal
        open={pruneModalOpen}
        onClose={() => setPruneModalOpen(false)}
        title="Remove Stopped Containers"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPruneModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handlePrune}
              disabled={stoppedContainers.length === 0}
            >
              Remove
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {stoppedContainers.length === 0 ? (
            <p className="text-muted">No stopped containers to remove.</p>
          ) : (
            <div>
              <p>
                The following {stoppedContainers.length === 1 ? "container" : `${stoppedContainers.length} containers`} will be removed:
              </p>
              <div className="bg-surface border border-border rounded p-3 h-48 overflow-y-auto mt-4">
                <div className="space-y-2">
                  {stoppedContainers.map((c) => (
                    <div key={c.id} className="text-sm font-mono truncate">{c.name}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
