"use client";

import type { ContainerStats } from "@/types";

interface StatsDisplayProps {
  stats: ContainerStats;
}

export function StatsDisplay({ stats }: StatsDisplayProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      <div>
        <div className="text-muted">CPU</div>
        <div className="font-bold">{stats.cpuPercent.toFixed(1)}%</div>
      </div>
      <div>
        <div className="text-muted">Memory</div>
        <div className="font-bold">
          {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
        </div>
        <div className="text-xs text-muted">{stats.memoryPercent.toFixed(1)}%</div>
      </div>
      <div>
        <div className="text-muted">Network I/O</div>
        <div className="font-bold">
          {formatBytes(stats.networkRx)} / {formatBytes(stats.networkTx)}
        </div>
      </div>
      <div>
        <div className="text-muted">Disk I/O</div>
        <div className="font-bold">
          {formatBytes(stats.blockRead)} / {formatBytes(stats.blockWrite)}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
