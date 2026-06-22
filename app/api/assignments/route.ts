import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAssignment } from "@/lib/homework-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "teacher") {
      return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
    }

    const body = await request.json();
    const assignment = await createAssignment({
      ...body,
      teacherName: user.name
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create assignment" },
      { status: 400 }
    );
  }
}
