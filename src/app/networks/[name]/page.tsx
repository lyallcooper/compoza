"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Button,
  Spinner,
  Modal,
  GroupedLabels,
  TruncatedText,
  ResponsiveTable,
  ColumnDef,
} from "@/components/ui";
import { useNetwork, useRemoveNetwork } from "@/hooks";
import type { NetworkRouteProps, NetworkContainer } from "@/types";

export default function NetworkDetailPage({ params }: NetworkRouteProps) {
  const { name } = use(params);
  const router = useRouter();
  const { data: network, isLoading, error } = useNetwork(name);
  const removeNetwork = useRemoveNetwork();

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Sort containers by name
  const sortedContainers = useMemo(
    () =>
      [...(network?.containers || [])].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [network?.containers]
  );

  const handleDelete = async () => {
    try {
      await removeNetwork.mutateAsync(name);
      setShowDeleteModal(false);
      router.push("/networks");
    } catch {
      // Error handled by mutation - keep modal open to show error
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !network) {
    return (
      <div className="p-4">
        <Box>
          <div className="text-error">
            {error ? String(error) : "Network not found"}
          </div>
          <Link
            href="/networks"
            className="text-accent hover:underline mt-2 inline-block"
          >
            Back to networks
          </Link>
        </Box>
      </div>
    );
  }

  const detailsData = [
    { label: "Driver", value: network.driver },
    { label: "Scope", value: network.scope },
    { label: "Internal", value: network.internal ? "Yes" : "No" },
    { label: "Attachable", value: network.attachable ? "Yes" : "No" },
    ...(network.ipam?.subnet
      ? [{ label: "Subnet", value: network.ipam.subnet, mono: true }]
      : []),
    ...(network.ipam?.gateway
      ? [{ label: "Gateway", value: network.ipam.gateway, mono: true }]
      : []),
  ];

  const containerColumns: ColumnDef<NetworkContainer>[] = [
    {
      key: "name",
      header: "Name",
      cardPosition: "header",
      render: (c) => (
        <Link
          href={`/containers/${encodeURIComponent(c.name)}`}
          className="text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <TruncatedText text={c.name} />
        </Link>
      ),
    },
    {
      key: "ipv4Address",
      header: "IP Address",
      cardPosition: "body",
      render: (c) => (
        <span className="font-mono">
          {c.ipv4Address || <span className="text-muted">-</span>}
        </span>
      ),
    },
    {
      key: "macAddress",
      header: "MAC Address",
      cardPosition: "body",
      render: (c) => (
        <span className="font-mono">
          {c.macAddress || <span className="text-muted">-</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 relative">
            <p className="absolute -top-3.5 left-0 text-[0.6rem] text-muted/50 uppercase tracking-wide leading-none">
              Network
            </p>
            <h1 className="text-xl font-semibold truncate">{network.name}</h1>
          </div>
        </div>

        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
          disabled={!network.actions.canDelete}
          disabledReason={!network.actions.canDelete ? "Built-in networks cannot be deleted" : undefined}
        >
          Delete…
        </Button>
      </div>

      {/* Content sections */}
      <div className="columns-1 md:columns-2 gap-6 space-y-6">
        {/* Details */}
        <Box title="Details" padding={false} className="break-inside-avoid" collapsible>
          <ResponsiveTable
            data={detailsData}
            keyExtractor={(row) => row.label}
            columns={[
              {
                key: "label",
                header: "Property",
                shrink: true,
                cardPosition: "body",
                cardLabel: false,
                render: (row) => <span className="text-muted">{row.label}</span>,
                renderCard: (row) => (
                  <span className="text-muted shrink-0">{row.label}</span>
                ),
              },
              {
                key: "value",
                header: "Value",
                cardPosition: "body",
                cardLabel: false,
                render: (row) =>
                  row.mono ? (
                    <span className="font-mono">{row.value}</span>
                  ) : (
                    row.value
                  ),
              },
            ]}
            showHeader={false}
          />
        </Box>

        {/* Connected Containers */}
        {sortedContainers.length > 0 && (
          <Box
            title="Connected Containers"
            padding={false}
            className="break-inside-avoid"
            collapsible
          >
            <ResponsiveTable
              data={sortedContainers}
              columns={containerColumns}
              keyExtractor={(c) => c.id}
            />
          </Box>
        )}

        {/* Labels */}
        {Object.keys(network.labels).length > 0 && (
          <Box title="Labels" padding={false} className="break-inside-avoid" collapsible>
            <GroupedLabels labels={network.labels} />
          </Box>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Network"
        footer={
          <>
            <Button onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={removeNetwork.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          Are you sure you want to delete <strong>{network.name}</strong>?
        </p>
        {network.containerCount > 0 && (
          <p className="text-warning text-sm mt-2">
            This network has {network.containerCount} connected container
            {network.containerCount !== 1 ? "s" : ""}.
          </p>
        )}
        <p className="text-muted text-sm mt-2">This action cannot be undone.</p>
        {removeNetwork.isError && (
          <p className="text-error text-sm mt-2">
            {removeNetwork.error?.message || "Failed to delete network"}
          </p>
        )}
      </Modal>
    </div>
  );
}
