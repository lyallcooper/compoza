import { Badge } from "./badge";

type BadgeVariant = "success" | "warning" | "error" | "default";

const PROJECT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  running: "success",
  partial: "warning",
  stopped: "default",
  unknown: "default",
};

const CONTAINER_STATE_VARIANTS: Record<string, BadgeVariant> = {
  running: "success",
  exited: "error",
  paused: "warning",
  restarting: "warning",
  dead: "error",
  created: "default",
  removing: "warning",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={PROJECT_STATUS_VARIANTS[status] || "default"}>
      {status}
    </Badge>
  );
}

export function ContainerStateBadge({ state }: { state: string }) {
  return (
    <Badge variant={CONTAINER_STATE_VARIANTS[state] || "default"}>
      {state}
    </Badge>
  );
}
