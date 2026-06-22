import { NextResponse } from "next/server";
import { createAssignment } from "@/lib/homework-data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const assignment = await createAssignment(body);

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create assignment" },
      { status: 400 }
    );
  }
}
