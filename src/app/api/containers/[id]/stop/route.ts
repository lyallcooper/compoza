import { NextRequest, NextResponse } from "next/server";
import { stopContainer } from "@/lib/docker";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  try {
    await stopContainer(id);
    return NextResponse.json({ data: { message: "Container stopped" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop container" },
      { status: 500 }
    );
  }
}
