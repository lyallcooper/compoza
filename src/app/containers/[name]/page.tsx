"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Box, Button, Spinner, ContainerStateBadge, TruncatedText, SelectableText, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, GroupedLabels, DropdownMenu, DropdownItem, Badge } from "@/components/ui";
import { StatsDisplay } from "@/components/containers";
import { UpdateConfirmModal } from "@/components/projects";
import { useContainer, useContainerStats, useStartContainer, useStopContainer, useRestartContainer, useContainerUpdate, useImageUpdates } from "@/hooks";
import { formatDateTime } from "@/lib/format";
import type { ContainerRouteProps } from "@/types";

export default function ContainerDetailPage({ params }: ContainerRouteProps) {
  const { name } = use(params);
  const { data: container, isLoading, error } = useContainer(name);
  const { data: stats } = useContainerStats(name, container?.state === "running");
  const { data: imageUpdates } = useImageUpdates();
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();
  const containerUpdate = useContainerUpdate();

  // Check if this container has an update available and get version info
  const updateInfo = useMemo(() => {
    if (!container?.image || !imageUpdates) return null;
    const update = imageUpdates.find((u) => u.image === container.image);
    if (!update?.updateAvailable) return null;
    return {
      hasUpdate: true,
      currentVersion: update.currentVersion,
      latestVersion: update.latestVersion,
      currentDigest: update.currentDigest,
      latestDigest: update.latestDigest,
    };
  }, [container, imageUpdates]);

  const hasUpdate = updateInfo?.hasUpdate ?? false;

  // Use domain model's computed actions
  const canUpdate = container?.actions.canUpdate && hasUpdate;

  // Update modal state
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const handleUpdate = () => {
    containerUpdate.mutate(name, {
      onSuccess: () => setShowUpdateModal(false),
    });
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

      {/* Stats - only shown for running containers */}
      {container.state === "running" && (
        <Box title="Stats">
          {stats ? (
            <StatsDisplay stats={stats} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted">CPU</div>
                <div className="text-muted">--</div>
              </div>
              <div>
                <div className="text-muted">Memory</div>
                <div className="text-muted">--</div>
                <div className="text-xs text-muted">&nbsp;</div>
              </div>
              <div>
                <div className="text-muted">Network I/O</div>
                <div className="text-muted">--</div>
              </div>
              <div>
                <div className="text-muted">Disk I/O</div>
                <div className="text-muted">--</div>
              </div>
            </div>
          )}
        </Box>
      )}

      {/* Details and Ports side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Details */}
        <Box title="Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted">Image</div>
              <div className="font-mono text-xs">
                <SelectableText>
                  <TruncatedText text={container.image} maxLength={50} />
                </SelectableText>
              </div>
            </div>
            <div>
              <div className="text-muted">Status</div>
              <div>{container.status}</div>
            </div>
            <div>
              <div className="text-muted">Container ID</div>
              <div className="font-mono text-xs">
                <SelectableText>
                  <TruncatedText text={container.id} maxLength={24} />
                </SelectableText>
              </div>
            </div>
            <div>
              <div className="text-muted">Image ID</div>
              <div className="font-mono text-xs">
                <SelectableText>
                  <TruncatedText text={container.imageId} maxLength={24} />
                </SelectableText>
              </div>
            </div>
            <div>
              <div className="text-muted">Created</div>
              <div>{formatDateTime(new Date(container.created * 1000))}</div>
            </div>
            {container.projectName && (
              <div>
                <div className="text-muted">Project</div>
                <div>
                  <Link
                    href={`/projects/${encodeURIComponent(container.projectName)}`}
                    className="text-accent hover:underline"
                  >
                    {container.projectName}
                  </Link>
                  {container.serviceName && (
                    <span className="text-muted"> / {container.serviceName}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Box>

        {/* Ports */}
        {container.ports.length > 0 && (
          <Box title="Ports" padding={false}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Host</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Protocol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {container.ports.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">
                      {p.host || <span className="text-muted">-</span>}
                    </TableCell>
                    <TableCell className="font-mono">{p.container}</TableCell>
                    <TableCell className="text-muted">{p.protocol}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </div>

      {/* Labels */}
      {Object.keys(container.labels).length > 0 && (
        <Box title="Labels">
          <GroupedLabels labels={container.labels} />
        </Box>
      )}

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
          loading={containerUpdate.isPending}
        />
      )}
    </div>
  );
}
