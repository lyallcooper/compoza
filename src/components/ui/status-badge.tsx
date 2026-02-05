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

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
  compact?: boolean | "responsive";
}

function StatusBadge({ label, variant, compact }: StatusBadgeProps) {
  if (compact === true) {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_COLORS[variant]}`}
        title={label}
      />
    );
  }

  if (compact === "responsive") {
    return (
      <>
        <span className="sm:hidden">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${DOT_COLORS[variant]}`}
            title={label}
          />
        </span>
        <span className="hidden sm:inline">
          <Badge variant={variant}>{label}</Badge>
        </span>
      </>
    );
  }

  return <Badge variant={variant}>{label}</Badge>;
}

interface ProjectStatusBadgeProps {
  status: string;
  compact?: boolean | "responsive";
}

export function ProjectStatusBadge({ status, compact }: ProjectStatusBadgeProps) {
  const variant = PROJECT_STATUS_VARIANTS[status] || "default";
  return <StatusBadge label={status} variant={variant} compact={compact} />;
}

interface ContainerStateBadgeProps {
  state: string;
  compact?: boolean | "responsive";
}

export function ContainerStateBadge({ state, compact }: ContainerStateBadgeProps) {
  const variant = CONTAINER_STATE_VARIANTS[state] || "default";
  return <StatusBadge label={state} variant={variant} compact={compact} />;
}
