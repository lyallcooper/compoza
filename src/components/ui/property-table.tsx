"use client";

import Link from "next/link";
import { ResponsiveTable } from "./responsive-table";
import { TruncatedText } from "./truncated-text";
import type { ColumnDef } from "./responsive-table";

export interface PropertyRow {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  maxLength?: number;
  link?: string;
  external?: boolean;
}

interface PropertyTableProps {
  data: PropertyRow[];
}

const columns: ColumnDef<PropertyRow>[] = [
  {
    key: "label",
    header: "Property",
    shrink: true,
    cardPosition: "body",
    cardLabel: false,
    render: (row) => <span className="text-muted">{row.label}</span>,
    renderCard: (row) => <span className="text-muted shrink-0">{row.label}</span>,
  },
  {
    key: "value",
    header: "Value",
    cardPosition: "body",
    cardLabel: false,
    render: (row) => {
      const content = renderValue(row);

      if (row.link) {
        if (row.external) {
          return (
            <a href={row.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {content}
            </a>
          );
        }
        return (
          <Link href={row.link} className="text-accent hover:underline">
            {content}
          </Link>
        );
      }

      return content;
    },
  },
];

function renderValue(row: PropertyRow) {
  if (row.mono && (row.truncate || row.maxLength)) {
    return (
      <span className="font-mono text-xs">
        <TruncatedText text={row.value} maxLength={row.maxLength} />
      </span>
    );
  }
  if (row.mono) {
    return <span className="font-mono text-xs">{row.value}</span>;
  }
  if (row.truncate || row.maxLength) {
    return <TruncatedText text={row.value} maxLength={row.maxLength} />;
  }
  return row.value;
}

export function PropertyTable({ data }: PropertyTableProps) {
  return (
    <ResponsiveTable
      data={data}
      columns={columns}
      keyExtractor={(row) => row.label}
      showHeader={false}
    />
  );
}
