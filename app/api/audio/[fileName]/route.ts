import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readAudio } from "@/lib/homework-data";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    fileName: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileName } = await context.params;
    const audio = await readAudio(fileName);
    if (user.role === "student" && audio.submission.studentId !== user.studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
