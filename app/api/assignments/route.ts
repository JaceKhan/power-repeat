import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAssignment } from "@/lib/homework-data";

export const runtime = "nodejs";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "Unable to create assignment";
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "teacher" && user.role !== "admin") {
      return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
    }

    const body = await request.json();
    const assignment = await createAssignment({
      ...body,
      teacherName: user.name
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
