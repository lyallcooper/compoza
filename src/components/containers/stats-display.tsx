"use client";

import type { ContainerStats } from "@/types";
import { formatBytes } from "@/lib/format";
import { ResponsiveTable, ColumnDef } from "@/components/ui";

interface StatsDisplayProps {
  stats?: ContainerStats;
  loading?: boolean;
}

interface StatItem {
  label: string;
  value: string;
  subValue?: string;
  muted?: boolean;
}

export function StatsDisplay({ stats, loading }: StatsDisplayProps) {
  const data: StatItem[] = loading || !stats
    ? [
        { label: "CPU", value: "—", muted: true },
        { label: "Memory", value: "— / —", subValue: "\u00A0", muted: true },
        { label: "Network I/O", value: "— / —", muted: true },
        { label: "Disk I/O", value: "— / —", muted: true },
      ]
    : [
        {
          label: "CPU",
          value: `${stats.cpuPercent.toFixed(1)}%`,
        },
        {
          label: "Memory",
          value: `${formatBytes(stats.memoryUsage)} / ${formatBytes(stats.memoryLimit)}`,
          subValue: `${stats.memoryPercent.toFixed(1)}%`,
        },
        {
          label: "Network I/O",
          value: `${formatBytes(stats.networkRx)} / ${formatBytes(stats.networkTx)}`,
        },
        {
          label: "Disk I/O",
          value: `${formatBytes(stats.blockRead)} / ${formatBytes(stats.blockWrite)}`,
        },
      ];

  const columns: ColumnDef<StatItem>[] = [
    {
      key: "label",
      header: "Metric",
      shrink: true,
      cardPosition: "body",
      cardLabel: false,
      render: (row) => <span className="text-muted">{row.label}</span>,
    },
    {
      key: "value",
      header: "Value",
      cardPosition: "body",
      cardLabel: false,
      render: (row) => (
        <div>
          <div className={row.muted ? "text-muted" : ""}>{row.value}</div>
          {row.subValue && <div className="text-xs text-muted">{row.subValue}</div>}
        </div>
      ),
    },
  ];

  return (
    <ResponsiveTable
      data={data}
      columns={columns}
      keyExtractor={(row) => row.label}
      showHeader={false}
    />
  );
}
