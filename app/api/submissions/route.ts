import { NextResponse } from "next/server";
import { createSubmission } from "@/lib/homework-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      throw new Error("audio is required");
    }

    const submission = await createSubmission({
      assignmentId: String(formData.get("assignmentId") ?? ""),
      studentId: String(formData.get("studentId") ?? ""),
      durationSec: Number(formData.get("durationSec") ?? 0),
      audio
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create submission" },
      { status: 400 }
    );
  }
}
