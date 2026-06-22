import { NextResponse } from "next/server";
import { getHomeworkState } from "@/lib/homework-data";

export const runtime = "nodejs";

export async function GET() {
  const state = await getHomeworkState();
  return NextResponse.json(state);
}
