import { NextRequest, NextResponse } from "next/server";
import { startContainer } from "@/lib/docker";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    await startContainer(id);
    return NextResponse.json({ data: { message: "Container started" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start container" },
      { status: 500 }
    );
  }
}
