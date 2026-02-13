"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box,
  Button,
  Spinner,
  GroupedLabels,
  TruncatedText,
  ResponsiveTable,
  ColumnDef,
  DetailHeader,
  PropertyTable,
  ConfirmModal,
} from "@/components/ui";
import type { PropertyRow } from "@/components/ui";
import { useNetwork, useRemoveNetwork } from "@/hooks";
import type { NetworkRouteProps, NetworkContainer } from "@/types";

export default function NetworkDetailPage({ params }: NetworkRouteProps) {
  const { name: rawName } = use(params);
  const name = decodeURIComponent(rawName);
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

  const detailsData: PropertyRow[] = [
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
      render: (c) => <TruncatedText text={c.name} />,
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
      <DetailHeader resourceType="Network" name={network.name} actions={
        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
          disabled={!network.actions.canDelete}
          disabledReason={!network.actions.canDelete ? "Built-in networks cannot be deleted" : undefined}
        >
          Delete…
        </Button>
      } />

      {/* Content sections */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="contents md:flex md:flex-col md:gap-6 md:flex-1 md:min-w-0">
          {/* Details */}
          <Box title="Details" padding={false} className="order-1 md:order-none" collapsible>
            <PropertyTable data={detailsData} />
          </Box>

          {/* Labels */}
          {Object.keys(network.labels).length > 0 && (
            <div className="order-3 md:order-none">
              <GroupedLabels labels={network.labels} />
            </div>
          )}
        </div>

        <div className="contents md:flex md:flex-col md:gap-6 md:flex-1 md:min-w-0">
          {/* Connected Containers */}
          {sortedContainers.length > 0 && (
            <Box
              title="Connected Containers"
              padding={false}
              className="order-2 md:order-none"
              collapsible
            >
              <ResponsiveTable
                data={sortedContainers}
                columns={containerColumns}
                keyExtractor={(c) => c.id}
                rowHref={(c) => `/containers/${encodeURIComponent(c.name)}`}
              />
            </Box>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete Network"
        loading={removeNetwork.isPending}
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
      </ConfirmModal>
    </div>
  );
}
