"use client";

import { use } from "react";
import Link from "next/link";
import { Box, Button, Spinner, ContainerStateBadge, TruncatedText, SelectableText } from "@/components/ui";
import { StatsDisplay } from "@/components/containers";
import { useContainer, useContainerStats, useStartContainer, useStopContainer, useRestartContainer } from "@/hooks";
import type { ContainerRouteProps } from "@/types";

export default function ContainerDetailPage({ params }: ContainerRouteProps) {
  const { id } = use(params);
  const { data: container, isLoading, error } = useContainer(id);
  const { data: stats } = useContainerStats(id, container?.state === "running");
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();

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
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/containers/${encodeURIComponent(id)}/logs`}>
            <Button>Logs</Button>
          </Link>
          {container.state === "running" && (
            <Link href={`/containers/${encodeURIComponent(id)}/exec`}>
              <Button>Terminal</Button>
            </Link>
          )}
          {container.state === "running" ? (
            <>
              <Button
                onClick={() => stopContainer.mutate(id)}
                loading={stopContainer.isPending}
              >
                Stop
              </Button>
              <Button
                onClick={() => restartContainer.mutate(id)}
                loading={restartContainer.isPending}
              >
                Restart
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => startContainer.mutate(id)}
              loading={startContainer.isPending}
            >
              Start
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <Box title="Stats">
          <StatsDisplay stats={stats} />
        </Box>
      )}

      {/* Info */}
      <Box title="Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted">Image</div>
            <div className="font-mono">{container.image}</div>
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
            <div>{new Date(container.created * 1000).toLocaleString()}</div>
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
        <Box title="Ports">
          <div className="text-sm space-y-1">
            {container.ports.map((p, i) => (
              <div key={i}>
                {p.host ? (
                  <span>
                    <span className="text-muted">Host:</span> {p.host} &rarr;{" "}
                    <span className="text-muted">Container:</span> {p.container}/{p.protocol}
                  </span>
                ) : (
                  <span>
                    <span className="text-muted">Container:</span> {p.container}/{p.protocol}{" "}
                    <span className="text-muted">(not exposed)</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </Box>
      )}

      {/* Labels */}
      {Object.keys(container.labels).length > 0 && (
        <Box title="Labels">
          <div className="text-sm font-mono space-y-1 max-h-48 overflow-auto">
            {Object.entries(container.labels).map(([key, value]) => (
              <div key={key} className="break-all">
                <span className="text-muted">{key}:</span> {value}
              </div>
            ))}
          </div>
        </Box>
      )}
    </div>
  );
}
