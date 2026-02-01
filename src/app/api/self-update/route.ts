import { NextResponse } from "next/server";
import { selfUpdate } from "@/lib/updates";

export async function POST() {
  try {
    const result = await selfUpdate();

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json({ data: { message: result.message } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update" },
      { status: 500 }
    );
  }
}
