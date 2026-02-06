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
          <Button
            onClick={() => stopContainer.mutate(containerId)}
            loading={stopContainer.isPending && stopContainer.variables === containerId}
          >
            Stop
          </Button>
          <Button
            onClick={() => restartContainer.mutate(containerId)}
            loading={restartContainer.isPending && restartContainer.variables === containerId}
          >
            Restart
          </Button>
        </>
      ) : (
        <Button
          onClick={() => startContainer.mutate(containerId)}
          loading={startContainer.isPending && startContainer.variables === containerId}
        >
          Start
        </Button>
      )}
    </div>
  );
}
