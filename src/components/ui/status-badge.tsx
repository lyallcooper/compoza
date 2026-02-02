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

const DOT_COLORS: Record<BadgeVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  default: "bg-muted",
};

interface ProjectStatusBadgeProps {
  status: string;
  compact?: boolean | "responsive";
}

export function ProjectStatusBadge({ status, compact }: ProjectStatusBadgeProps) {
  const variant = PROJECT_STATUS_VARIANTS[status] || "default";

  if (compact === true) {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_COLORS[variant]}`}
        title={status}
      />
    );
  }

  if (compact === "responsive") {
    return (
      <>
        <span className="sm:hidden">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_COLORS[variant]}`}
            title={status}
          />
        </span>
        <span className="hidden sm:inline">
          <Badge variant={variant}>
            {status}
          </Badge>
        </span>
      </>
    );
  }

  return (
    <Badge variant={variant}>
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
