import { NextResponse } from "next/server";
import { getCurrentUser, getDemoLoginUsers } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  return NextResponse.json({
    user,
    demoUsers: getDemoLoginUsers()
  });
}
