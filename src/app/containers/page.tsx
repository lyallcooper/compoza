"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Spinner, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button, ContainerStateBadge, TruncatedText, PortsList } from "@/components/ui";
import { useContainers, useStartContainer, useStopContainer, useRestartContainer } from "@/hooks";

export default function ContainersPage() {
  const router = useRouter();
  const { data: containers, isLoading, error } = useContainers();
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();

  const sortedContainers = useMemo(
    () => [...(containers || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [containers]
  );

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Project</TableHead>
                <TableHead className="hidden sm:table-cell">Image</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Ports</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedContainers.map((container) => (
                <TableRow
                  key={container.id}
                  clickable
                  onClick={() => router.push(`/containers/${encodeURIComponent(container.id)}`)}
                >
                  <TableCell>{container.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted">
                    {container.projectName ? (
                      <Link
                        href={`/projects/${encodeURIComponent(container.projectName)}`}
                        className="hover:text-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {container.projectName}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted font-mono text-xs min-w-[150px]">
                    <TruncatedText text={container.image} maxLength={60} />
                  </TableCell>
                  <TableCell>
                    <ContainerStateBadge state={container.state} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted text-xs">
                    <PortsList ports={container.ports} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {container.state === "running" ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => stopContainer.mutate(container.id)}
                            loading={stopContainer.isPending && stopContainer.variables === container.id}
                          >
                            Stop
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => restartContainer.mutate(container.id)}
                            loading={restartContainer.isPending && restartContainer.variables === container.id}
                          >
                            Restart
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => startContainer.mutate(container.id)}
                          loading={startContainer.isPending && startContainer.variables === container.id}
                        >
                          Start
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </div>
  );
}

