"use client";

export interface Port {
  host?: number;
  container: number;
  protocol: string;
}

interface PortsListProps {
  ports: Port[];
  maxLength?: number;
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

export function PortsList({ ports, maxLength = 5 }: PortsListProps) {
  if (ports.length === 0) {
    return <span>-</span>;
  }

  const fullText = ports.map(formatPort).join(", ");

  // Find how many ports fit before the first comma after maxLength
  let visibleCount = ports.length;
  let len = 0;
  for (let i = 0; i < ports.length; i++) {
    if (i > 0) len += 2; // ", "
    len += formatPort(ports[i]).length;
    if (i < ports.length - 1 && len >= maxLength) {
      visibleCount = i + 1;
      break;
    }
  }

  const truncated = visibleCount < ports.length;

  return (
    <span title={fullText} className="font-mono">
      {ports.slice(0, visibleCount).map((p, i) => (
        <span key={`${p.host}-${p.container}-${p.protocol}`}>
          {i > 0 && ", "}
          {p.host ? formatPort(p) : <em>{formatPort(p)}</em>}
        </span>
      ))}
      {truncated && "…"}
    </span>
  );
}
