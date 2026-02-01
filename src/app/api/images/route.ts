import { NextResponse } from "next/server";
import { listImages } from "@/lib/docker";

export async function GET() {
  try {
    const images = await listImages();
    return NextResponse.json({ data: images });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list images" },
      { status: 500 }
    );
  }
}
