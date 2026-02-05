"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Box, Button, Spinner, ContainerStateBadge, TruncatedText, GroupedLabels, DropdownMenu, DropdownItem, Badge, ResponsiveTable, ColumnDef, Modal } from "@/components/ui";
import { StatsDisplay } from "@/components/containers";
import { UpdateConfirmModal } from "@/components/projects";
import { useContainer, useContainerStats, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer, useImageUpdates, useBackgroundContainerUpdate } from "@/hooks";
import { formatDateTime, isSensitiveKey } from "@/lib/format";
import type { ContainerRouteProps } from "@/types";

function EnvironmentVariablesSection({ env }: { env: Record<string, string> }) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const sortedEntries = useMemo(
    () => Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
    [env]
  );

  const columns: ColumnDef<[string, string]>[] = [
    {
      key: "key",
      header: "Key",
      shrink: true,
      cardPosition: "header",
      render: ([key]) => (
        <span className="font-mono text-xs font-medium">{key}</span>
      ),
    },
    {
      key: "value",
      header: "Value",
      cardPosition: "body",
      cardLabel: false,
      render: ([key, value]) => {
        const isSensitive = isSensitiveKey(key);
        const isRevealed = revealedKeys.has(key);

        return (
          <span className="font-mono text-xs">
            <TruncatedText
              text={value}
              maxLength={50}
              sensitive={isSensitive}
              revealed={isRevealed}
              onRevealChange={(revealed) => {
                setRevealedKeys((prev) => {
                  const next = new Set(prev);
                  if (revealed) {
                    next.add(key);
                  } else {
                    next.delete(key);
                  }
                  return next;
                });
              }}
            />
          </span>
        );
      },
    },
  ];

  return (
    <Box title="Environment Variables" padding={false} className="break-inside-avoid" collapsible>
      <ResponsiveTable
        data={sortedEntries}
        columns={columns}
        keyExtractor={([key]) => key}
      />
    </Box>
  );
}

export default function ContainerDetailPage({ params }: ContainerRouteProps) {
  const { name } = use(params);
  const router = useRouter();
  const { data: container, isLoading, error } = useContainer(name);
  const { data: stats } = useContainerStats(name, container?.state === "running");
  const { data: imageUpdates } = useImageUpdates();
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();
  const removeContainer = useRemoveContainer();
  const { updateContainer } = useBackgroundContainerUpdate();

  // Get current image info (digest and version) from update cache
  const imageInfo = useMemo(() => {
    if (!container?.image || !imageUpdates) return null;
    const update = imageUpdates.find((u) => u.image === container.image);
    if (!update) return null;
    return {
      currentDigest: update.currentDigest,
      currentVersion: update.currentVersion,
      latestDigest: update.latestDigest,
      latestVersion: update.latestVersion,
      updateAvailable: update.updateAvailable,
    };
  }, [container, imageUpdates]);

  const hasUpdate = imageInfo?.updateAvailable ?? false;

  // Build update info for the modal (only when update available)
  const updateInfo = hasUpdate ? imageInfo : null;

  // Use domain model's computed actions
  const canUpdate = container?.actions.canUpdate && hasUpdate;

  // Sorted data for deterministic table ordering
  const sortedPorts = useMemo(
    () => [...(container?.ports ?? [])].sort((a, b) =>
      a.container - b.container || a.protocol.localeCompare(b.protocol)
    ),
    [container?.ports]
  );

  const sortedMounts = useMemo(
    () => [...(container?.mounts ?? [])].sort((a, b) =>
      a.destination.localeCompare(b.destination)
    ),
    [container?.mounts]
  );

  const sortedNetworks = useMemo(
    () => [...(container?.networks ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    [container?.networks]
  );

  // Update modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const handleUpdate = () => {
    updateContainer({ containerId: name, containerName: container?.name || name });
    setShowUpdateModal(false);
  };

  const handleDelete = async () => {
    try {
      const isRunning = container?.state === "running";
      await removeContainer.mutateAsync({ id: name, force: isRunning });
      router.push("/containers");
    } catch {
      // Error is handled by the mutation
    }
    setShowRemoveModal(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !container) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">
            {error ? String(error) : "Container not found"}
          </div>
          <Link href="/containers" className="text-accent hover:underline mt-2 inline-block">
            Back to containers
          </Link>
        </Box>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/containers" className="text-muted hover:text-foreground flex-shrink-0">
            &larr;
          </Link>
          <div className="min-w-0 relative">
            <p className="absolute -top-3.5 left-0 text-[0.6rem] text-muted/50 uppercase tracking-wide leading-none">Container</p>
            <h1 className="text-xl font-semibold truncate">{container.name}</h1>
          </div>
          <span className="flex-shrink-0">
            <ContainerStateBadge state={container.state} compact="responsive" />
          </span>
          {hasUpdate && (
            <Badge variant="accent" className="flex-shrink-0">
              {updateInfo?.currentVersion && updateInfo?.latestVersion && updateInfo.currentVersion !== updateInfo.latestVersion
                ? `${updateInfo.currentVersion} → ${updateInfo.latestVersion}`
                : "update available"}
            </Badge>
          )}
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          {container.actions.canStart && (
            <Button
              onClick={() => startContainer.mutate(name)}
              loading={startContainer.isPending}
            >
              Start
            </Button>
          )}
          {container.actions.canStop && (
            <Button
              onClick={() => stopContainer.mutate(name)}
              loading={stopContainer.isPending}
            >
              Stop
            </Button>
          )}
          {container.actions.canRestart && (
            <Button
              onClick={() => restartContainer.mutate(name)}
              loading={restartContainer.isPending}
            >
              Restart
            </Button>
          )}
          {canUpdate && (
            <Button
              variant="accent"
              onClick={() => setShowUpdateModal(true)}
            >
              Update…
            </Button>
          )}
          <Link href={`/containers/${encodeURIComponent(name)}/logs`} className="ml-2">
            <Button>Logs</Button>
          </Link>
          {container.actions.canExec && (
            <Link href={`/containers/${encodeURIComponent(name)}/exec`}>
              <Button>Terminal</Button>
            </Link>
          )}
          <Button
            variant="danger"
            onClick={() => setShowRemoveModal(true)}
          >
            Delete…
          </Button>
        </div>

        {/* Mobile actions dropdown */}
        <DropdownMenu className="md:hidden">
          {container.actions.canStart && (
            <DropdownItem
              onClick={() => startContainer.mutate(name)}
              loading={startContainer.isPending}
            >
              Start
            </DropdownItem>
          )}
          {container.actions.canStop && (
            <DropdownItem
              onClick={() => stopContainer.mutate(name)}
              loading={stopContainer.isPending}
            >
              Stop
            </DropdownItem>
          )}
          {container.actions.canRestart && (
            <DropdownItem
              onClick={() => restartContainer.mutate(name)}
              loading={restartContainer.isPending}
            >
              Restart
            </DropdownItem>
          )}
          {canUpdate && (
            <DropdownItem onClick={() => setShowUpdateModal(true)}>
              Update…
            </DropdownItem>
          )}
          <Link href={`/containers/${encodeURIComponent(name)}/logs`} className="block">
            <DropdownItem>Logs</DropdownItem>
          </Link>
          {container.actions.canExec && (
            <Link href={`/containers/${encodeURIComponent(name)}/exec`} className="block">
              <DropdownItem>Terminal</DropdownItem>
            </Link>
          )}
          <DropdownItem
            variant="danger"
            onClick={() => setShowRemoveModal(true)}
          >
            Delete…
          </DropdownItem>
        </DropdownMenu>
      </div>

      {/* Content sections - columns layout for masonry-like flow */}
      <div className="columns-1 md:columns-2 gap-6 space-y-6">
        {/* Stats - only shown for running containers */}
        {container.state === "running" && (
          <Box title="Stats" padding={false} className="break-inside-avoid" collapsible>
            <StatsDisplay stats={stats} loading={!stats} />
          </Box>
        )}

        {/* Details */}
        <Box title="Details" padding={false} className="break-inside-avoid" collapsible>
          <ResponsiveTable
            data={[
              {
                label: "Image",
                value: container.image,
                mono: true,
              },
              { label: "Status", value: container.status },
              {
                label: "Container ID",
                value: container.id,
                mono: true,
                maxLength: 36,
              },
              {
                label: "Image ID",
                value: container.imageId,
                mono: true,
                maxLength: 36,
              },
              ...(imageInfo?.currentDigest
                ? [{
                    label: "Digest",
                    value: imageInfo.currentDigest,
                    mono: true,
                    maxLength: 36,
                  }]
                : []),
              ...(imageInfo?.currentVersion
                ? [{ label: "Version", value: imageInfo.currentVersion }]
                : []),
              {
                label: "Created",
                value: formatDateTime(new Date(container.created * 1000)),
              },
              ...(container.projectName
                ? [{
                    label: "Project",
                    value: container.projectName,
                    link: `/projects/${encodeURIComponent(container.projectName)}`,
                  }]
                : []),
            ]}
            keyExtractor={(row) => row.label}
            columns={[
              {
                key: "label",
                header: "Property",
                shrink: true,
                cardPosition: "body",
                cardLabel: false,
                render: (row) => <span className="text-muted">{row.label}</span>,
                renderCard: (row) => <span className="text-muted shrink-0">{row.label}</span>,
              },
              {
                key: "value",
                header: "Value",
                cardPosition: "body",
                cardLabel: false,
                render: (row) => {
                  if (row.link) {
                    return (
                      <Link href={row.link} className="text-accent hover:underline">
                        {row.value}
                      </Link>
                    );
                  }
                  if (row.mono) {
                    return (
                      <span className="font-mono">
                        <TruncatedText text={row.value} maxLength={row.maxLength} />
                      </span>
                    );
                  }
                  return row.value;
                },
              },
            ]}
            showHeader={false}
          />
        </Box>

        {/* Ports */}
        {sortedPorts.length > 0 && (
          <Box title="Ports" padding={false} className="break-inside-avoid" collapsible>
            <ResponsiveTable
              data={sortedPorts}
              keyExtractor={(p) => `${p.container}-${p.protocol}`}
              columns={[
                {
                  key: "host",
                  header: "Host",
                  shrink: true,
                  cardPosition: "header",
                  render: (p) => (
                    <span className="font-mono">
                      {p.host || <span className="text-muted">-</span>}
                    </span>
                  ),
                  renderCard: (p) => (
                    <span className="font-mono">
                      {p.host || "-"} → {p.container}
                    </span>
                  ),
                },
                {
                  key: "container",
                  header: "Container",
                  shrink: true,
                  cardPosition: "hidden",
                  render: (p) => <span className="font-mono">{p.container}</span>,
                },
                {
                  key: "protocol",
                  header: "Protocol",
                  shrink: true,
                  cardPosition: "body",
                  render: (p) => <span className="text-muted">{p.protocol}</span>,
                },
              ] satisfies ColumnDef<typeof container.ports[number]>[]}
            />
          </Box>
        )}

        {/* Mounts */}
        {sortedMounts.length > 0 && (
          <Box title="Mounts" padding={false} className="break-inside-avoid" collapsible>
            <ResponsiveTable
              data={sortedMounts}
              keyExtractor={(m) => m.destination}
              columns={[
                {
                  key: "type",
                  header: "Type",
                  shrink: true,
                  cardPosition: "body",
                  render: (m) => <span className="capitalize text-muted">{m.type}</span>,
                },
                {
                  key: "source",
                  header: "Source",
                  cardPosition: "body",
                  getValue: (m) => m.source || "",
                  render: (m) => (
                    <span className="font-mono">
                      <TruncatedText text={m.source || "-"} />
                    </span>
                  ),
                },
                {
                  key: "destination",
                  header: "Destination",
                  cardPosition: "header",
                  getValue: (m) => m.destination,
                  render: (m) => (
                    <span className="font-mono">
                      <TruncatedText text={m.destination} />
                    </span>
                  ),
                },
                {
                  key: "mode",
                  header: "Mode",
                  shrink: true,
                  cardPosition: "body",
                  render: (m) => (
                    <span className="text-muted">
                      {m.rw ? (m.mode || "rw") : <span className="text-warning">ro</span>}
                    </span>
                  ),
                },
              ] satisfies ColumnDef<typeof container.mounts[number]>[]}
            />
          </Box>
        )}

        {/* Networks */}
        {sortedNetworks.length > 0 && (
          <Box title="Networks" padding={false} className="break-inside-avoid" collapsible>
            <ResponsiveTable
              data={sortedNetworks}
              keyExtractor={(n) => n.name}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  shrink: true,
                  cardPosition: "header",
                  render: (n) => <span className="font-medium">{n.name}</span>,
                },
                {
                  key: "ipAddress",
                  header: "IP Address",
                  shrink: true,
                  cardPosition: "body",
                  render: (n) => (
                    <span className="font-mono">
                      {n.ipAddress || <span className="text-muted">-</span>}
                    </span>
                  ),
                },
                {
                  key: "gateway",
                  header: "Gateway",
                  shrink: true,
                  cardPosition: "body",
                  render: (n) => (
                    <span className="font-mono">
                      {n.gateway || <span className="text-muted">-</span>}
                    </span>
                  ),
                },
                {
                  key: "macAddress",
                  header: "MAC Address",
                  shrink: true,
                  cardPosition: "body",
                  render: (n) => (
                    <span className="font-mono">
                      {n.macAddress || <span className="text-muted">-</span>}
                    </span>
                  ),
                },
              ] satisfies ColumnDef<typeof container.networks[number]>[]}
            />
          </Box>
        )}

        {/* Environment Variables */}
        {Object.keys(container.env).length > 0 && (
          <EnvironmentVariablesSection env={container.env} />
        )}

        {/* Labels - last to avoid column reflow when expanding */}
        {Object.keys(container.labels).length > 0 && (
          <Box title="Labels" padding={false} className="break-inside-avoid" collapsible>
            <GroupedLabels labels={container.labels} />
          </Box>
        )}
      </div>

      {/* Update confirmation modal */}
      {showUpdateModal && container.projectName && container.serviceName && (
        <UpdateConfirmModal
          open
          onClose={() => setShowUpdateModal(false)}
          onConfirm={handleUpdate}
          title={`Update ${container.name}`}
          serviceName={container.serviceName}
          images={[{
            image: container.image,
            currentVersion: updateInfo?.currentVersion,
            latestVersion: updateInfo?.latestVersion,
            currentDigest: updateInfo?.currentDigest,
            latestDigest: updateInfo?.latestDigest,
          }]}
          isRunning={container.state === "running"}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal
        open={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Delete Container"
        footer={
          <>
            <Button onClick={() => setShowRemoveModal(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={removeContainer.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete <strong>{container.name}</strong>?
        </p>
        {container.state === "running" && (
          <p className="text-warning text-sm mt-2">
            This container is currently running and will be forcefully stopped.
          </p>
        )}
        <p className="text-muted text-sm mt-2">
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
