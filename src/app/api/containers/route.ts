import { NextResponse } from "next/server";
import { listContainers } from "@/lib/docker";

export async function GET() {
  try {
    const containers = await listContainers(true);
    return NextResponse.json({ data: containers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list containers" },
      { status: 500 }
    );
  }
}
