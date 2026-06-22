import { NextResponse } from "next/server";
import { readAudio } from "@/lib/homework-data";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    fileName: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { fileName } = await context.params;
    const audio = await readAudio(fileName);

    return new NextResponse(audio.buffer, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type": audio.contentType
      }
    });
  } catch {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }
}
