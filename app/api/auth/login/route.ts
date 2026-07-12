import { NextResponse } from "next/server";
import {
  authenticateDemoUser,
  authenticateStudentByNameAndCode,
  setSessionCookie
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const studentName = typeof body?.studentName === "string" ? body.studentName : "";
  const loginCode = typeof body?.loginCode === "string" ? body.loginCode : "";
  const user =
    studentName && loginCode
      ? await authenticateStudentByNameAndCode(studentName, loginCode)
      : await authenticateDemoUser(email, password);

  if (!user) {
    return NextResponse.json(
      {
        error: "Invalid email or password"
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ user });
  setSessionCookie(response, user);

  return response;
}
