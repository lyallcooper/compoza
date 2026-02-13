"use client";

import { useState, useMemo } from "react";
import { Box, Spinner, Button, ResponsiveTable, PropertyTable, ConfirmModal, Checkbox } from "@/components/ui";
import type { ColumnDef, PropertyRow } from "@/components/ui";
import { useSystemInfo, useDiskUsage, useSystemPrune } from "@/hooks";
import { formatBytes } from "@/lib/format";
import type { SystemPruneOptions } from "@/types";

const GITHUB_REPO = "https://github.com/lyallcooper/compoza";

interface DiskUsageItem {
  category: string;
  count: number;
  size: number | null;
  reclaimable: number | null;
}

export default function SystemPage() {
  const { data: systemInfo, isLoading: infoLoading, error: infoError } = useSystemInfo();
  const { data: diskUsage, isLoading: diskLoading, error: diskError } = useDiskUsage();
  const systemPrune = useSystemPrune();

  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneOptions, setPruneOptions] = useState<SystemPruneOptions>({
    containers: true,
    networks: true,
    images: true,
    volumes: false,
    buildCache: true,
    allImages: false,
  });

  const handlePrune = () => {
    systemPrune.execute(pruneOptions);
    setPruneModalOpen(false);
  };

  const toggleOption = (key: keyof SystemPruneOptions) => {
    setPruneOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const infoItems: PropertyRow[] = useMemo(() => {
    if (!systemInfo) return [];
    return [
      { label: "Version", value: systemInfo.version },
      { label: "OS", value: systemInfo.os },
      { label: "Architecture", value: systemInfo.arch },
      { label: "Kernel", value: systemInfo.kernelVersion },
      { label: "Storage Driver", value: systemInfo.storageDriver },
      { label: "Root Directory", value: systemInfo.rootDir },
      { label: "CPUs", value: String(systemInfo.cpus) },
      { label: "Memory", value: formatBytes(systemInfo.memoryLimit) },
      { label: "Containers", value: `${systemInfo.containers.total} (${systemInfo.containers.running} running)` },
      { label: "Images", value: String(systemInfo.images) },
    ];
  }, [systemInfo]);

  const compozaItems: PropertyRow[] = useMemo(() => {
    if (!systemInfo) return [];
    const items: PropertyRow[] = [
      { label: "Version", value: systemInfo.compoza.version },
      { label: "Projects Directory", value: systemInfo.compoza.projectsDir },
    ];
    // Only show host path if different from projects dir
    if (systemInfo.compoza.hostProjectsDir !== systemInfo.compoza.projectsDir) {
      items.push({ label: "Host Projects Path", value: systemInfo.compoza.hostProjectsDir });
    }
    items.push({ label: "Docker Host", value: systemInfo.compoza.dockerHost });
    // Show registry auth status
    const registries: string[] = [];
    if (systemInfo.compoza.registries.dockerHub) registries.push("Docker Hub");
    if (systemInfo.compoza.registries.ghcr) registries.push("GHCR");
    items.push({ label: "Registry Auth", value: registries.length > 0 ? registries.join(", ") : "None" });
    return items;
  }, [systemInfo]);

  const diskUsageItems: DiskUsageItem[] = useMemo(() => {
    if (!diskUsage) return [];
    return [
      { category: "Images", count: diskUsage.images.total, size: diskUsage.images.size, reclaimable: diskUsage.images.reclaimable },
      { category: "Containers", count: diskUsage.containers.total, size: diskUsage.containers.size, reclaimable: diskUsage.containers.reclaimable },
      { category: "Volumes", count: diskUsage.volumes.total, size: diskUsage.volumes.size, reclaimable: diskUsage.volumes.reclaimable },
      { category: "Build Cache", count: diskUsage.buildCache.total, size: diskUsage.buildCache.size, reclaimable: diskUsage.buildCache.reclaimable },
      { category: "Total", count: -1, size: diskUsage.totalSize, reclaimable: diskUsage.totalReclaimable },
    ];
  }, [diskUsage]);

  const diskUsageColumns: ColumnDef<DiskUsageItem>[] = useMemo(() => [
    {
      key: "category",
      header: "Category",
      cardPosition: "header",
      render: (item) => (
        <span className={item.category === "Total" ? "font-semibold" : ""}>
          {item.category}
        </span>
      ),
    },
    {
      key: "count",
      header: "Count",
      shrink: true,
      cardLabel: "Count",
      render: (item) => (
        <span className="text-muted">{item.count >= 0 ? item.count : "-"}</span>
      ),
    },
    {
      key: "size",
      header: "Size",
      shrink: true,
      cardLabel: "Size",
      render: (item) => (
        <span className={`font-mono ${item.category === "Total" ? "font-semibold" : ""}`}>
          {item.size !== null ? formatBytes(item.size) : <span className="text-muted">--</span>}
        </span>
      ),
    },
    {
      key: "reclaimable",
      header: "Reclaimable",
      shrink: true,
      cardLabel: "Reclaimable",
      render: (item) => (
        <span className={`font-mono ${item.category === "Total" ? "font-semibold" : "text-muted"}`}>
          {item.reclaimable !== null ? formatBytes(item.reclaimable) : "--"}
        </span>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold shrink-0">System</h1>
        <Button variant="default" onClick={() => setPruneModalOpen(true)}>
          System Prune…
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="contents md:flex md:flex-col md:gap-6 md:flex-1 md:min-w-0">
          {/* Docker Info */}
          <Box title="Docker Info" padding={false} className="order-1 md:order-none" collapsible>
            {infoLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner />
              </div>
            ) : infoError ? (
              <div className="p-4 text-error">Failed to load system info</div>
            ) : systemInfo ? (
              <>
                <PropertyTable data={infoItems} />
                {systemInfo.warnings.length > 0 && (
                  <div className="p-3 border-t border-border">
                    <div className="text-warning text-sm font-medium mb-1">Warnings</div>
                    {systemInfo.warnings.map((warning, i) => (
                      <div key={i} className="text-sm text-muted">{warning}</div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </Box>

          {/* Disk Usage */}
          <Box
            title="Disk Usage"
            padding={false}
            className="order-3 md:order-none"
            collapsible
          >
            {diskLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner />
              </div>
            ) : diskError ? (
              <div className="p-4 text-error">Failed to load disk usage</div>
            ) : diskUsage ? (
              <ResponsiveTable
                data={diskUsageItems}
                columns={diskUsageColumns}
                keyExtractor={(item) => item.category}
                showHeader={true}
              />
            ) : null}
          </Box>
        </div>

        <div className="contents md:flex md:flex-col md:gap-6 md:flex-1 md:min-w-0">
          {/* Compoza */}
          <Box
            title="Compoza"
            padding={false}
            className="order-2 md:order-none"
            collapsible
            actions={
              <a
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-foreground text-xs inline-flex items-center gap-1"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
              </a>
            }
          >
            {infoLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner />
              </div>
            ) : infoError ? (
              <div className="p-4 text-error">Docker connection failed</div>
            ) : systemInfo ? (
              <PropertyTable data={compozaItems} />
            ) : null}
          </Box>
        </div>
      </div>

      {/* System Prune Modal */}
      <ConfirmModal
        open={pruneModalOpen}
        onClose={() => setPruneModalOpen(false)}
        onConfirm={handlePrune}
        title="System Prune"
        confirmLabel="Prune"
        confirmVariant="danger"
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Remove unused Docker resources to free up disk space.
          </p>
          <div className="space-y-2">
            <Checkbox
              checked={pruneOptions.containers}
              onChange={() => toggleOption("containers")}
              label="Stopped containers"
            />
            <Checkbox
              checked={pruneOptions.networks}
              onChange={() => toggleOption("networks")}
              label="Unused networks"
            />
            <Checkbox
              checked={pruneOptions.images}
              onChange={() => toggleOption("images")}
              label="Dangling images"
            />
            <Checkbox
              checked={pruneOptions.allImages}
              onChange={() => toggleOption("allImages")}
              disabled={!pruneOptions.images}
              className="ml-6"
              label={
                <span className={!pruneOptions.images ? "text-muted" : ""}>
                  Include all unused images (not just dangling)
                </span>
              }
            />
            <Checkbox
              checked={pruneOptions.volumes}
              onChange={() => toggleOption("volumes")}
              label={
                <>
                  <span>Unused volumes</span>
                  <span className="text-warning text-xs ml-1">(data loss risk)</span>
                </>
              }
            />
            <Checkbox
              checked={pruneOptions.buildCache}
              onChange={() => toggleOption("buildCache")}
              label="Build cache"
            />
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
}
