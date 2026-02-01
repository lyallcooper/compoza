import { NextRequest, NextResponse } from "next/server";
import { restartContainer } from "@/lib/docker";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    await restartContainer(id);
    return NextResponse.json({ data: { message: "Container restarted" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restart container" },
      { status: 500 }
    );
  }
}
