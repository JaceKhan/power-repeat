import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteAssignment } from "@/lib/homework-data";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    assignmentId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "teacher" && user.role !== "admin") {
      return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
    }

    const { assignmentId } = await context.params;
    await deleteAssignment(assignmentId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete assignment" },
      { status: 400 }
    );
  }
}
