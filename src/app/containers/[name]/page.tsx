"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Box, Button, Spinner, ContainerStateBadge, TruncatedText, SelectableText, GroupedLabels, DropdownMenu, DropdownItem, Badge, ResponsiveTable, ColumnDef } from "@/components/ui";
import { StatsDisplay } from "@/components/containers";
import { UpdateConfirmModal } from "@/components/projects";
import { useContainer, useContainerStats, useStartContainer, useStopContainer, useRestartContainer, useImageUpdates, useBackgroundContainerUpdate } from "@/hooks";
import { formatDateTime } from "@/lib/format";
import type { ContainerRouteProps } from "@/types";

const SENSITIVE_PATTERNS = ["PASSWORD", "SECRET", "KEY", "TOKEN", "CREDENTIAL", "API_KEY", "APIKEY", "PRIVATE"];

function isSensitiveEnvVar(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SENSITIVE_PATTERNS.some((pattern) => upperKey.includes(pattern));
}

function EnvironmentVariablesSection({ env }: { env: Record<string, string> }) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const sortedEntries = useMemo(
    () => Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
    [env]
  );

  const columns: ColumnDef<[string, string]>[] = [
    {
      key: "key",
      header: "Key",
      cardPosition: "header",
      render: ([key]) => (
        <span className="font-mono text-xs font-medium">
          <SelectableText>{key}</SelectableText>
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      cardPosition: "body",
      cardLabel: false,
      render: ([key, value]) => {
        const isSensitive = isSensitiveEnvVar(key);
        const isRevealed = revealedKeys.has(key);
        const displayValue = isSensitive && !isRevealed ? "••••••••" : value;

        return (
          <div className="flex items-center gap-2 font-mono text-xs">
            <SelectableText>
              <TruncatedText text={displayValue} maxLength={50} />
            </SelectableText>
            {isSensitive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleReveal(key);
                }}
                className="text-muted hover:text-foreground text-xs shrink-0"
                title={isRevealed ? "Hide" : "Reveal"}
              >
                {isRevealed ? "hide" : "reveal"}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Box title="Environment Variables" padding={false} className="break-inside-avoid">
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
  const { data: container, isLoading, error } = useContainer(name);
  const { data: stats } = useContainerStats(name, container?.state === "running");
  const { data: imageUpdates } = useImageUpdates();
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();
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

  const handleUpdate = () => {
    updateContainer({ containerId: name, containerName: container?.name || name });
    setShowUpdateModal(false);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/containers" className="text-muted hover:text-foreground">
            &larr;
          </Link>
          <h1 className="text-xl font-semibold">{container.name}</h1>
          <ContainerStateBadge state={container.state} />
          {hasUpdate && (
            <Badge variant="accent">
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
        </DropdownMenu>
      </div>

      {/* Content sections - columns layout for masonry-like flow */}
      <div className="columns-1 md:columns-2 gap-6 space-y-6">
        {/* Stats - only shown for running containers */}
        {container.state === "running" && (
          <Box title="Stats" padding={false} className="break-inside-avoid">
            <StatsDisplay stats={stats} loading={!stats} />
          </Box>
        )}

        {/* Details */}
        <Box title="Details" padding={false} className="break-inside-avoid">
          <ResponsiveTable
            data={[
              {
                label: "Image",
                value: (
                  <span className="font-mono">
                    <SelectableText>
                      <TruncatedText text={container.image} maxLength={50} />
                    </SelectableText>
                  </span>
                ),
              },
              { label: "Status", value: container.status },
              {
                label: "Container ID",
                value: (
                  <span className="font-mono">
                    <SelectableText>
                      <TruncatedText text={container.id} maxLength={24} />
                    </SelectableText>
                  </span>
                ),
              },
              {
                label: "Image ID",
                value: (
                  <span className="font-mono">
                    <SelectableText>
                      <TruncatedText text={container.imageId} maxLength={24} />
                    </SelectableText>
                  </span>
                ),
              },
              ...(imageInfo?.currentDigest
                ? [{
                    label: "Digest",
                    value: (
                      <span className="font-mono">
                        <SelectableText>
                          <TruncatedText text={imageInfo.currentDigest} maxLength={24} />
                        </SelectableText>
                      </span>
                    ),
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
                    value: (
                      <>
                        <Link
                          href={`/projects/${encodeURIComponent(container.projectName)}`}
                          className="text-accent hover:underline"
                        >
                          {container.projectName}
                        </Link>
                        {container.serviceName && (
                          <span className="text-muted"> / {container.serviceName}</span>
                        )}
                      </>
                    ),
                  }]
                : []),
            ]}
            keyExtractor={(row) => row.label}
            columns={[
              {
                key: "label",
                header: "Property",
                cardPosition: "body",
                cardLabel: false,
                className: "w-1/3",
                render: (row) => <span className="text-muted">{row.label}</span>,
                renderCard: (row) => <span className="text-muted shrink-0">{row.label}</span>,
              },
              {
                key: "value",
                header: "Value",
                cardPosition: "body",
                cardLabel: false,
                render: (row) => row.value,
              },
            ]}
            showHeader={false}
          />
        </Box>

        {/* Ports */}
        {sortedPorts.length > 0 && (
          <Box title="Ports" padding={false} className="break-inside-avoid">
            <ResponsiveTable
              data={sortedPorts}
              keyExtractor={(p) => `${p.container}-${p.protocol}`}
              columns={[
                {
                  key: "host",
                  header: "Host",
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
                  cardPosition: "hidden",
                  render: (p) => <span className="font-mono">{p.container}</span>,
                },
                {
                  key: "protocol",
                  header: "Protocol",
                  cardPosition: "body",
                  render: (p) => <span className="text-muted">{p.protocol}</span>,
                },
              ] satisfies ColumnDef<typeof container.ports[number]>[]}
            />
          </Box>
        )}

        {/* Mounts */}
        {sortedMounts.length > 0 && (
          <Box title="Mounts" padding={false} className="break-inside-avoid">
            <ResponsiveTable
              data={sortedMounts}
              keyExtractor={(m) => m.destination}
              columns={[
                {
                  key: "type",
                  header: "Type",
                  cardPosition: "body",
                  render: (m) => <span className="capitalize text-muted">{m.type}</span>,
                },
                {
                  key: "source",
                  header: "Source",
                  cardPosition: "body",
                  render: (m) => (
                    <span className="font-mono">
                      <SelectableText>
                        <TruncatedText text={m.source || "-"} maxLength={35} />
                      </SelectableText>
                    </span>
                  ),
                },
                {
                  key: "destination",
                  header: "Destination",
                  cardPosition: "header",
                  render: (m) => (
                    <span className="font-mono">
                      <SelectableText>
                        <TruncatedText text={m.destination} maxLength={35} />
                      </SelectableText>
                    </span>
                  ),
                },
                {
                  key: "mode",
                  header: "Mode",
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
          <Box title="Networks" padding={false} className="break-inside-avoid">
            <ResponsiveTable
              data={sortedNetworks}
              keyExtractor={(n) => n.name}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cardPosition: "header",
                  render: (n) => (
                    <span className="font-medium">
                      <SelectableText>{n.name}</SelectableText>
                    </span>
                  ),
                },
                {
                  key: "ipAddress",
                  header: "IP Address",
                  cardPosition: "body",
                  render: (n) => (
                    <span className="font-mono">
                      {n.ipAddress ? (
                        <SelectableText>{n.ipAddress}</SelectableText>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </span>
                  ),
                },
                {
                  key: "gateway",
                  header: "Gateway",
                  cardPosition: "body",
                  render: (n) => (
                    <span className="font-mono">
                      {n.gateway ? (
                        <SelectableText>{n.gateway}</SelectableText>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </span>
                  ),
                },
                {
                  key: "macAddress",
                  header: "MAC Address",
                  cardPosition: "body",
                  render: (n) => (
                    <span className="font-mono">
                      {n.macAddress ? (
                        <SelectableText>{n.macAddress}</SelectableText>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </span>
                  ),
                },
              ] satisfies ColumnDef<typeof container.networks[number]>[]}
            />
          </Box>
        )}

        {/* Labels */}
        {Object.keys(container.labels).length > 0 && (
          <Box title="Labels" className="break-inside-avoid">
            <GroupedLabels labels={container.labels} />
          </Box>
        )}

        {/* Environment Variables */}
        {Object.keys(container.env).length > 0 && (
          <EnvironmentVariablesSection env={container.env} />
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
    </div>
  );
}
