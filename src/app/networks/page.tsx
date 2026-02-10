"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Button,
  Badge,
  Modal,
  Input,
  SearchInput,
  ResponsiveTable,
  ColumnDef,
  DataView,
  Select,
} from "@/components/ui";
import { useNetworks, useCreateNetwork, usePruneNetworks, useTableSort, useTableSearch } from "@/hooks";
import type { DockerNetwork } from "@/types";
import type { CreateNetworkOptions } from "@/lib/docker";

export default function NetworksPage() {
  const { data: networks, isLoading, error } = useNetworks();
  const createNetwork = useCreateNetwork();
  const pruneNetworks = usePruneNetworks();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);

  // Create form state
  const [networkName, setNetworkName] = useState("");
  const [networkDriver, setNetworkDriver] = useState("bridge");
  const [networkSubnet, setNetworkSubnet] = useState("");
  const [networkGateway, setNetworkGateway] = useState("");

  const { sortState, onSortChange, sortData } = useTableSort<DockerNetwork>("name", "asc");
  const { query, setQuery, filterData } = useTableSearch<DockerNetwork>();

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

  const handlePrune = () => {
    pruneNetworks.execute();
    setPruneModalOpen(false);
  };

  const columns: ColumnDef<DockerNetwork>[] = useMemo(() => [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      sortValue: (net) => net.name,
      searchValue: (net) => net.name,
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
      sortValue: (net) => net.driver,
      searchValue: (net) => net.driver,
      render: (net) => <span className="text-muted">{net.driver}</span>,
    },
    {
      key: "containers",
      header: "Containers",
      cardPosition: "body",
      sortValue: (net) => net.containerCount,
      defaultSortDirection: "desc",
      render: (net) => <span className="text-muted">{net.containerCount}</span>,
    },
  ], []);

  const processedData = useMemo(
    () => sortData(filterData(networks || [], columns), columns),
    [networks, sortData, filterData, columns]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold shrink-0">Networks</h1>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={() => setPruneModalOpen(true)}>
            Remove Unused…
          </Button>
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            + New
          </Button>
        </div>
      </div>

      <DataView data={networks} isLoading={isLoading} error={error} resourceName="networks">
        {() => (
          <>
            <SearchInput value={query} onChange={setQuery} className="mb-3" />
            <Box padding={false}>
              <ResponsiveTable
                data={processedData}
                columns={columns}
                keyExtractor={(net) => net.id}
                rowHref={(net) => `/networks/${encodeURIComponent(net.name)}`}
                sortState={sortState}
                onSortChange={onSortChange}
                emptyState={query ? <div className="text-center py-8 text-muted">No networks matching &quot;{query}&quot;</div> : undefined}
              />
            </Box>
          </>
        )}
      </DataView>

      {/* Create Network Modal */}
      <Modal
        open={createModalOpen}
        onClose={handleCloseCreateModal}
        title="Create Network"
        footer={
          <>
            <Button
              variant="default"
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
          <Select
            label="Driver"
            value={networkDriver}
            onChange={(e) => setNetworkDriver(e.target.value)}
            disabled={createNetwork.isPending}
            options={[
              { value: "bridge", label: "bridge" },
              { value: "host", label: "host" },
              { value: "overlay", label: "overlay" },
              { value: "macvlan", label: "macvlan" },
              { value: "none", label: "none" },
            ]}
          />
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
        onClose={() => setPruneModalOpen(false)}
        title="Remove Unused Networks"
        footer={
          <>
            <Button variant="default" onClick={() => setPruneModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handlePrune}
              disabled={unusedNetworks.length === 0}
            >
              Remove
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {unusedNetworks.length === 0 ? (
            <p className="text-muted">No unused networks to remove.</p>
          ) : (
            <div>
              <p>
                The following{" "}
                {unusedNetworks.length === 1
                  ? "network"
                  : `${unusedNetworks.length} networks`}{" "}
                will be removed:
              </p>
              <div className="bg-surface border border-border rounded p-3 max-h-48 overflow-y-auto mt-4">
                <div className="space-y-1">
                  {unusedNetworks.map((net) => (
                    <div key={net.id} className="font-mono text-sm">
                      {net.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
