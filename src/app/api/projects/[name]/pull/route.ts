import { NextRequest, NextResponse } from "next/server";
import { composePull } from "@/lib/projects";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const result = await composePull(name);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: { output: result.output } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to pull images" },
      { status: 500 }
    );
  }
}
