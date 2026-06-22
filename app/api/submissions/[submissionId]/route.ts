import { NextResponse } from "next/server";
import { reviewSubmission } from "@/lib/homework-data";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    submissionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { submissionId } = await context.params;
    const body = await request.json();
    const submission = await reviewSubmission(submissionId, body);

    return NextResponse.json(submission);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to review submission" },
      { status: 400 }
    );
  }
}
