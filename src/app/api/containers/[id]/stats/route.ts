import { NextRequest, NextResponse } from "next/server";
import { getContainerStats } from "@/lib/docker";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    const stats = await getContainerStats(id);
    return NextResponse.json({ data: stats });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get container stats" },
      { status: 500 }
    );
  }
}
