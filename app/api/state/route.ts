import { NextResponse } from "next/server";
import { isStudentAssignmentTarget } from "@/lib/assignment-sessions";
import { getCurrentUser } from "@/lib/auth";
import { getHomeworkState } from "@/lib/homework-data";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getHomeworkState();

  if (user.role === "teacher" || user.role === "admin") {
    return NextResponse.json({
      ...state,
      currentUser: user
    });
  }

  const currentStudent = state.students.find((student) => student.id === user.studentId);
  const assignments = currentStudent
    ? state.assignments.filter((assignment) => isStudentAssignmentTarget(assignment, currentStudent))
    : [];
  const submissions = state.submissions.filter((submission) => submission.studentId === user.studentId);

  return NextResponse.json({
    assignments,
    submissions,
    classes: [],
    students: currentStudent ? [currentStudent] : [],
    templates: [],
    currentUser: user
  });
}
