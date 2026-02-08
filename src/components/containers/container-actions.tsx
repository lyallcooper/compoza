"use client";

import { Button } from "@/components/ui";
import { useStartContainer, useStopContainer, useRestartContainer } from "@/hooks";

interface ContainerActionsProps {
  containerId: string;
  state: string;
}

export function ContainerActions({ containerId, state }: ContainerActionsProps) {
  const startContainer = useStartContainer();
  const stopContainer = useStopContainer();
  const restartContainer = useRestartContainer();

  const isRunning = state === "running";

  return (
    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      {isRunning ? (
        <>
          <Button onClick={() => stopContainer.execute(containerId)} loading={stopContainer.isPending}>
            Stop
          </Button>
          <Button onClick={() => restartContainer.execute(containerId)} loading={restartContainer.isPending}>
            Restart
          </Button>
        </>
      ) : (
        <Button onClick={() => startContainer.execute(containerId)} loading={startContainer.isPending}>
          Start
        </Button>
      )}
    </div>
  );
}
