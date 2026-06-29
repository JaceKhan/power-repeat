import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reviewSubmission } from "@/lib/homework-data";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    submissionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "teacher" && user.role !== "admin") {
      return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
    }

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
