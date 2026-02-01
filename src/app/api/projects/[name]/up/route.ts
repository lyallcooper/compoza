import { NextRequest, NextResponse } from "next/server";
import { composeUp } from "@/lib/projects";

type RouteContext = { params: Promise<{ name: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { name } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const { build, pull } = body;

    const result = await composeUp(name, { build, pull });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: { output: result.output } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start project" },
      { status: 500 }
    );
  }
}
