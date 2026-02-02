"use client";

import type { ContainerStats } from "@/types";
import { formatBytes } from "@/lib/format";

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
