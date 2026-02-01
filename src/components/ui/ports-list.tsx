"use client";

export interface Port {
  host?: number;
  container: number;
  protocol: string;
}

interface PortsListProps {
  ports: Port[];
  maxVisible?: number;
}

function formatPort(p: Port) {
  const showProtocol = p.protocol !== "tcp";
  const protocolSuffix = showProtocol ? `/${p.protocol}` : "";

  if (p.host) {
    if (p.host === p.container) {
      return `${p.host}${protocolSuffix}`;
    }
    return `${p.host}:${p.container}${protocolSuffix}`;
  }
  return `${p.container}${protocolSuffix}`;
}

export function PortsList({ ports, maxVisible = 3 }: PortsListProps) {
  if (ports.length === 0) {
    return <span>-</span>;
  }

  const allPorts = ports.map(formatPort).join(", ");
  const visiblePorts = ports.slice(0, maxVisible);
  const hiddenCount = ports.length - maxVisible;

  return (
    <span title={allPorts}>
      {visiblePorts.map((p, i) => (
        <span key={`${p.host}-${p.container}-${p.protocol}`}>
          {p.host ? formatPort(p) : <em>{formatPort(p)}</em>}
          {i < visiblePorts.length - 1 && ", "}
        </span>
      ))}
      {hiddenCount > 0 && <span> +{hiddenCount}</span>}
    </span>
  );
}
