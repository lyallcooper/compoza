"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Spinner,
  Button,
  Badge,
  Modal,
  Input,
  ResponsiveTable,
  ColumnDef,
} from "@/components/ui";
import { useNetworks, useCreateNetwork, usePruneNetworks } from "@/hooks";
import type { DockerNetwork } from "@/types";
import type { CreateNetworkOptions, NetworkPruneResult } from "@/lib/docker";

export default function NetworksPage() {
  const router = useRouter();
  const { data: networks, isLoading, error } = useNetworks();
  const createNetwork = useCreateNetwork();
  const pruneNetworks = usePruneNetworks();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [pruneResult, setPruneResult] = useState<NetworkPruneResult | null>(null);

  // Create form state
  const [networkName, setNetworkName] = useState("");
  const [networkDriver, setNetworkDriver] = useState("bridge");
  const [networkSubnet, setNetworkSubnet] = useState("");
  const [networkGateway, setNetworkGateway] = useState("");

  // Sort networks by name
  const sortedNetworks = useMemo(
    () => [...(networks || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [networks]
  );

  // Get networks with 0 containers for prune preview
  const unusedNetworks = useMemo(
    () =>
      (networks || []).filter(
        (net) => net.containerCount === 0 && net.actions.canDelete
      ),
    [networks]
  );

  const handleCreate = async () => {
    const params: CreateNetworkOptions = {
      name: networkName,
      driver: networkDriver || undefined,
      subnet: networkSubnet || undefined,
      gateway: networkGateway || undefined,
    };
    try {
      await createNetwork.mutateAsync(params);
      handleCloseCreateModal();
    } catch {
      // Error handled by mutation
    }
  };

  const handleCloseCreateModal = () => {
    if (!createNetwork.isPending) {
      setCreateModalOpen(false);
      setNetworkName("");
      setNetworkDriver("bridge");
      setNetworkSubnet("");
      setNetworkGateway("");
      createNetwork.reset();
    }
  };

  const handlePrune = async () => {
    try {
      const result = await pruneNetworks.mutateAsync();
      setPruneResult(result);
    } catch {
      // Error handled by mutation
    }
  };

  const handleClosePruneModal = () => {
    if (!pruneNetworks.isPending) {
      setPruneModalOpen(false);
      setPruneResult(null);
      pruneNetworks.reset();
    }
  };

  const columns: ColumnDef<DockerNetwork>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (net) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{net.name}</span>
          {net.containerCount === 0 && net.actions.canDelete && (
            <Badge variant="warning">Unused</Badge>
          )}
        </div>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      cardPosition: "body",
      render: (net) => <span className="text-muted">{net.driver}</span>,
    },
    {
      key: "containers",
      header: "Containers",
      cardPosition: "body",
      render: (net) => <span className="text-muted">{net.containerCount}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold shrink-0">Networks</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setPruneModalOpen(true)}>
            Remove Unused…
          </Button>
          <Button variant="default" onClick={() => setCreateModalOpen(true)}>
            Create…
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Box>
          <div className="text-error">Error loading networks: {String(error)}</div>
        </Box>
      ) : networks?.length === 0 ? (
        <Box>
          <div className="text-center py-8 text-muted">No networks found</div>
        </Box>
      ) : (
        <Box padding={false}>
          <ResponsiveTable
            data={sortedNetworks}
            columns={columns}
            keyExtractor={(net) => net.id}
            onRowClick={(net) =>
              router.push(`/networks/${encodeURIComponent(net.name)}`)
            }
          />
        </Box>
      )}

      {/* Create Network Modal */}
      <Modal
        open={createModalOpen}
        onClose={handleCloseCreateModal}
        title="Create Network"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={handleCloseCreateModal}
              disabled={createNetwork.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={createNetwork.isPending}
              disabled={!networkName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Name</label>
            <Input
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              placeholder="my-network"
              disabled={createNetwork.isPending}
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Driver</label>
            <select
              value={networkDriver}
              onChange={(e) => setNetworkDriver(e.target.value)}
              disabled={createNetwork.isPending}
              className="w-full px-3 py-2 bg-background border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="bridge">bridge</option>
              <option value="host">host</option>
              <option value="overlay">overlay</option>
              <option value="macvlan">macvlan</option>
              <option value="none">none</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">
              Subnet <span className="text-muted/50">(optional)</span>
            </label>
            <Input
              value={networkSubnet}
              onChange={(e) => setNetworkSubnet(e.target.value)}
              placeholder="172.20.0.0/16"
              disabled={createNetwork.isPending}
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">
              Gateway <span className="text-muted/50">(optional)</span>
            </label>
            <Input
              value={networkGateway}
              onChange={(e) => setNetworkGateway(e.target.value)}
              placeholder="172.20.0.1"
              disabled={createNetwork.isPending}
            />
          </div>
          {createNetwork.isError && (
            <div className="text-sm text-error">
              {createNetwork.error?.message || "Failed to create network"}
            </div>
          )}
        </div>
      </Modal>

      {/* Prune Networks Modal */}
      <Modal
        open={pruneModalOpen}
        onClose={handleClosePruneModal}
        title="Remove Unused Networks"
        footer={
          pruneResult ? (
            <Button variant="default" onClick={handleClosePruneModal}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClosePruneModal}
                disabled={pruneNetworks.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handlePrune}
                loading={pruneNetworks.isPending}
                disabled={unusedNetworks.length === 0}
              >
                Remove
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          {pruneResult ? (
            <div className="space-y-2">
              <p className="text-success">Cleanup complete</p>
              <div className="bg-surface border border-border rounded p-3 space-y-1 text-sm">
                <div>
                  Networks removed:{" "}
                  <span className="font-semibold">
                    {pruneResult.networksDeleted.length}
                  </span>
                </div>
                {pruneResult.networksDeleted.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5 text-muted font-mono text-xs">
                    {pruneResult.networksDeleted.map((name) => (
                      <div key={name}>{name}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : unusedNetworks.length === 0 ? (
            <p className="text-muted">No unused networks to remove.</p>
          ) : (
            <>
              <p>
                The following{" "}
                {unusedNetworks.length === 1
                  ? "network"
                  : `${unusedNetworks.length} networks`}{" "}
                will be removed:
              </p>
              <div className="bg-surface border border-border rounded p-3 max-h-48 overflow-y-auto">
                <div className="space-y-1">
                  {unusedNetworks.map((net) => (
                    <div key={net.id} className="font-mono text-sm">
                      {net.name}
                    </div>
                  ))}
                </div>
              </div>
              {pruneNetworks.isError && (
                <div className="text-sm text-error">
                  {pruneNetworks.error?.message || "Failed to remove unused networks"}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
