import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  buildSessionDrafts,
  ensureAssignmentSessions,
  getSessionPassage,
  materializeSessions,
  type AssignmentMode,
  type SessionDraft
} from "@/lib/assignment-sessions";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  Assignment,
  ClassGroup,
  HomeworkState,
  PassageTemplate,
  Student,
  Submission
} from "@/lib/homework-data";

type CreateAssignmentInput = {
  title?: string;
  bookName: string;
  level: number;
  passageTitle: string;
  className: string;
  passage: string;
  instructions: string;
  dueDate: string;
  teacherName?: string;
  mode?: AssignmentMode;
  sessions?: SessionDraft[];
};

type CreateSubmissionInput = {
  assignmentId: string;
  sessionId: string;
  studentId: string;
  durationSec: number;
  prepCompleted: boolean;
  completedPrepSegments: number;
  totalPrepSegments: number;
  audio: File;
};

type CreateClassInput = {
  name: string;
};

type CreateStudentInput = {
  name: string;
  className: string;
  email?: string;
  password?: string;
};

type ReviewSubmissionInput = {
  status: Submission["status"];
  feedback?: string;
  score?: number;
};

const RECORDINGS_BUCKET = "recordings";

const assertText = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
};

const buildAssignmentTitle = ({
  bookName,
  level,
  passageTitle
}: {
  bookName: string;
  level: number;
  passageTitle: string;
}) => `${bookName} / Level ${level} / ${passageTitle}`;

const estimateReadingDurationSec = (passage: string) => {
  const words = passage.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(Math.round((words / 135) * 60), 8);
};

const calculateSubmissionGrade = ({
  passage,
  durationSec,
  prepCompleted
}: {
  passage: string;
  durationSec: number;
  prepCompleted: boolean;
}): Submission["grade"] => {
  const expectedDurationSec = estimateReadingDurationSec(passage);

  if (durationSec < expectedDurationSec * 0.5) {
    return "B";
  }

  return prepCompleted ? "A+" : "A";
};

const contentTypeToExtension: Record<string, string> = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a"
};

const getAudioExtension = (audio: File) => {
  if (audio.type && contentTypeToExtension[audio.type]) {
    return contentTypeToExtension[audio.type];
  }

  const extension = path.extname(audio.name).replace(".", "").toLowerCase();
  return extension || "webm";
};

type DbRow = Record<string, unknown>;

const asRow = (value: unknown): DbRow => (value && typeof value === "object" ? (value as DbRow) : {});

const getString = (row: DbRow, key: string) => String(row[key] ?? "");

const getOptionalString = (row: DbRow, key: string) =>
  row[key] === null || row[key] === undefined ? undefined : String(row[key]);

const getNumber = (row: DbRow, key: string) => Number(row[key] ?? 0);

const getBoolean = (row: DbRow, key: string) => Boolean(row[key]);

const mapClass = (row: DbRow): ClassGroup => ({
  id: getString(row, "id"),
  name: getString(row, "name"),
  active: getBoolean(row, "active"),
  createdAt: getString(row, "created_at")
});

const mapStudent = (row: DbRow, classById: Map<string, ClassGroup>): Student => ({
  id: getString(row, "id"),
  name: getString(row, "name"),
  className: classById.get(getString(row, "class_id"))?.name ?? "",
  email: getOptionalString(row, "memo") ?? "",
  password: getString(row, "login_code"),
  loginCode: getString(row, "login_code"),
  active: getBoolean(row, "active"),
  createdAt: getString(row, "created_at")
});

const mapTemplate = (row: DbRow): PassageTemplate => ({
  id: getString(row, "id"),
  bookName: getString(row, "book_name"),
  level: getNumber(row, "level"),
  passageTitle: getString(row, "passage_title"),
  passage: getString(row, "passage"),
  instructions: getOptionalString(row, "instructions") ?? "",
  createdAt: getString(row, "created_at"),
  updatedAt: getString(row, "updated_at")
});

const mapAssignment = (row: DbRow, classById: Map<string, ClassGroup>, profileById: Map<string, DbRow>): Assignment => {
  const base = {
    id: getString(row, "id"),
    title: getString(row, "title"),
    bookName: getString(row, "book_name"),
    level: getNumber(row, "level"),
    passageTitle: getString(row, "passage_title"),
    className: classById.get(getString(row, "class_id"))?.name ?? "",
    passage: getString(row, "passage"),
    instructions: getOptionalString(row, "instructions") ?? "",
    dueDate: getString(row, "due_date"),
    createdAt: getString(row, "created_at"),
    teacherName:
      getOptionalString(profileById.get(getString(row, "teacher_id")) ?? {}, "display_name") ?? "Teacher",
    templateId: getOptionalString(row, "template_id"),
    mode: (getOptionalString(row, "mode") as AssignmentMode | undefined) ?? undefined,
    sessions: Array.isArray(row.sessions) ? (row.sessions as Assignment["sessions"]) : undefined
  };

  return ensureAssignmentSessions(base);
};

const mapSubmission = (
  row: DbRow,
  studentById: Map<string, Student>,
  assignmentById?: Map<string, Assignment>
): Submission => {
  const assignmentId = getString(row, "assignment_id");
  const fallbackSessionId =
    assignmentById?.get(assignmentId)?.sessions[0]?.id || `${assignmentId}-s1`;

  return {
    id: getString(row, "id"),
    assignmentId,
    sessionId: getOptionalString(row, "session_id") || fallbackSessionId,
    studentId: getString(row, "student_id"),
    studentName: studentById.get(getString(row, "student_id"))?.name ?? "Unknown Student",
    grade: getString(row, "grade") as Submission["grade"],
    prepCompleted: getBoolean(row, "prep_completed"),
    completedPrepSegments: getNumber(row, "completed_prep_segments"),
    totalPrepSegments: getNumber(row, "total_prep_segments"),
    audioUrl: `/api/audio/${getString(row, "audio_path")}`,
    audioFileName: getString(row, "audio_path"),
    audioContentType: getOptionalString(row, "audio_content_type") ?? "audio/webm",
    durationSec: getNumber(row, "duration_sec"),
    submittedAt: getString(row, "submitted_at"),
    status: getString(row, "status") as Submission["status"],
    feedback: getOptionalString(row, "feedback"),
    score: row.score === null || row.score === undefined ? undefined : getNumber(row, "score")
  };
};

const generateLoginCode = async () => {
  const supabase = getSupabaseAdmin();

  for (let attempt = 0; attempt < 9000; attempt += 1) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const { data, error } = await supabase
      .from("students")
      .select("id")
      .eq("login_code", code)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return code;
    }
  }

  throw new Error("no available login code");
};

export const getSupabaseHomeworkState = async (): Promise<HomeworkState> => {
  const supabase = getSupabaseAdmin();
  const [classesResult, studentsResult, templatesResult, assignmentsResult, submissionsResult, profilesResult] =
    await Promise.all([
      supabase.from("classes").select("*").order("created_at", { ascending: false }),
      supabase.from("students").select("*").order("created_at", { ascending: false }),
      supabase.from("passage_templates").select("*").order("updated_at", { ascending: false }),
      supabase.from("assignments").select("*").order("created_at", { ascending: false }),
      supabase.from("submissions").select("*").order("submitted_at", { ascending: false }),
      supabase.from("profiles").select("*")
    ]);

  for (const result of [classesResult, studentsResult, templatesResult, assignmentsResult, submissionsResult, profilesResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  const classes = (classesResult.data ?? []).map((classGroup) => mapClass(asRow(classGroup)));
  const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
  const profiles = profilesResult.data ?? [];
  const profileById = new Map(profiles.map((profile) => [getString(asRow(profile), "id"), asRow(profile)]));
  const students = (studentsResult.data ?? []).map((student) => mapStudent(asRow(student), classById));
  const studentById = new Map(students.map((student) => [student.id, student]));
  const templates = (templatesResult.data ?? []).map((template) => mapTemplate(asRow(template)));
  const assignments = (assignmentsResult.data ?? []).map((assignment) =>
    mapAssignment(asRow(assignment), classById, profileById)
  );
  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const submissions = (submissionsResult.data ?? []).map((submission) =>
    mapSubmission(asRow(submission), studentById, assignmentById)
  );

  return {
    assignments,
    submissions,
    classes,
    students,
    templates
  };
};

export const createSupabaseAssignment = async (input: CreateAssignmentInput) => {
  const supabase = getSupabaseAdmin();
  const bookName = assertText(input.bookName, "bookName");
  const level = Math.min(Math.max(Math.round(Number(input.level)), 1), 6);
  const passageTitle = assertText(input.passageTitle, "passageTitle");
  const className = assertText(input.className, "className");
  const passage = assertText(input.passage, "passage");
  const dueDate = assertText(input.dueDate, "dueDate");
  const mode: AssignmentMode = input.mode ?? "single";
  const title = input.title?.trim() || buildAssignmentTitle({ bookName, level, passageTitle });
  const instructions = input.instructions?.trim() ?? "";

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("*")
    .eq("name", className)
    .eq("active", true)
    .single();

  if (classError) {
    throw classError;
  }

  const { data: templateRow, error: templateError } = await supabase
    .from("passage_templates")
    .upsert(
      {
        book_name: bookName,
        level,
        passage_title: passageTitle,
        passage,
        instructions,
        updated_at: new Date().toISOString()
      },
      { onConflict: "book_name,level,passage_title" }
    )
    .select()
    .single();

  if (templateError) {
    throw templateError;
  }

  const tempId = `a-${randomUUID()}`;
  const sessionDrafts =
    input.sessions?.length && input.sessions.every((session) => session.dueDate)
      ? input.sessions
      : buildSessionDrafts({
          mode,
          passage,
          startDate: dueDate,
          sessionCount: mode === "single" ? 1 : Math.max(input.sessions?.length ?? 3, 1)
        });
  const sessions = materializeSessions(sessionDrafts, tempId);
  const lastDueDate = sessions[sessions.length - 1]?.dueDate || dueDate;

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("assignments")
    .insert({
      template_id: templateRow.id,
      class_id: classRow.id,
      title,
      book_name: bookName,
      level,
      passage_title: passageTitle,
      passage,
      instructions,
      due_date: lastDueDate,
      mode,
      sessions
    })
    .select()
    .single();

  if (assignmentError) {
    throw assignmentError;
  }

  const classData = asRow(classRow);
  const mapped = mapAssignment(
    asRow(assignmentRow),
    new Map([[getString(classData, "id"), mapClass(classData)]]),
    new Map()
  );

  // Keep session ids stable against the real assignment id.
  if (mapped.id !== tempId) {
    mapped.sessions = materializeSessions(
      mapped.sessions.map((session) => ({
        assignedDate: session.assignedDate,
        dueDate: session.dueDate,
        segmentStart: session.segmentStart,
        segmentEnd: session.segmentEnd
      })),
      mapped.id
    );
    await supabase.from("assignments").update({ sessions: mapped.sessions }).eq("id", mapped.id);
  }

  return mapped;
};

export const deleteSupabaseAssignment = async (assignmentId: string) => {
  const supabase = getSupabaseAdmin();
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("audio_path")
    .eq("assignment_id", assignmentId);

  if (submissionsError) {
    throw submissionsError;
  }

  const audioPaths = (submissions ?? [])
    .map((submission) => getOptionalString(asRow(submission), "audio_path"))
    .filter((audioPath): audioPath is string => Boolean(audioPath));

  if (audioPaths.length) {
    await supabase.storage.from(RECORDINGS_BUCKET).remove(audioPaths);
  }

  const { error: deleteSubmissionsError } = await supabase
    .from("submissions")
    .delete()
    .eq("assignment_id", assignmentId);

  if (deleteSubmissionsError) {
    throw deleteSubmissionsError;
  }

  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);

  if (error) {
    throw error;
  }

  return { ok: true };
};

export const createSupabaseClassGroup = async (input: CreateClassInput) => {
  const supabase = getSupabaseAdmin();
  const name = assertText(input.name, "name");
  const { data, error } = await supabase
    .from("classes")
    .insert({ name })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapClass(asRow(data));
};

export const createSupabaseStudent = async (input: CreateStudentInput) => {
  const supabase = getSupabaseAdmin();
  const name = assertText(input.name, "name");
  const className = assertText(input.className, "className");
  const loginCode = await generateLoginCode();

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("*")
    .eq("name", className)
    .eq("active", true)
    .single();

  if (classError) {
    throw classError;
  }

  const { data, error } = await supabase
    .from("students")
    .insert({
      name,
      class_id: classRow.id,
      login_code: loginCode,
      memo: input.email?.trim() || null
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const classData = asRow(classRow);
  return mapStudent(asRow(data), new Map([[getString(classData, "id"), mapClass(classData)]]));
};

export const findSupabaseStudentByCredentials = async (email: string, password: string) => {
  void email;
  void password;
  return null;
};

export const findSupabaseStudentByNameAndCode = async (name: string, loginCode: string) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .select("*, classes(*)")
    .ilike("name", name.trim())
    .eq("login_code", loginCode.trim())
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const studentRow = asRow(data);
  const classRow = asRow(studentRow.classes);
  return mapStudent(studentRow, new Map([[getString(studentRow, "class_id"), mapClass(classRow)]]));
};

export const createSupabaseSubmission = async (input: CreateSubmissionInput) => {
  const supabase = getSupabaseAdmin();
  const assignmentId = assertText(input.assignmentId, "assignmentId");
  const sessionId = assertText(input.sessionId, "sessionId");
  const studentId = assertText(input.studentId, "studentId");

  if (!input.audio || input.audio.size === 0) {
    throw new Error("audio is required");
  }

  const [{ data: assignmentRow, error: assignmentError }, { data: studentRow, error: studentError }] =
    await Promise.all([
      supabase.from("assignments").select("*").eq("id", assignmentId).single(),
      supabase.from("students").select("*, classes(*)").eq("id", studentId).eq("active", true).single()
    ]);

  if (assignmentError) throw assignmentError;
  if (studentError) throw studentError;

  if (studentRow.class_id !== assignmentRow.class_id) {
    throw new Error("student is not assigned to this class");
  }

  const assignment = mapAssignment(asRow(assignmentRow), new Map(), new Map());
  const session = assignment.sessions.find((item) => item.id === sessionId);
  if (!session) {
    throw new Error("session not found");
  }

  const { data: previousSubmission, error: previousError } = await supabase
    .from("submissions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (previousError) {
    throw previousError;
  }

  if (previousSubmission?.audio_path) {
    await supabase.storage.from(RECORDINGS_BUCKET).remove([previousSubmission.audio_path]);
  }

  const extension = getAudioExtension(input.audio);
  const audioPath = `${randomUUID()}.${extension}`;
  const audioBuffer = Buffer.from(await input.audio.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(audioPath, audioBuffer, {
      contentType: input.audio.type || "audio/webm",
      upsert: true
    });

  if (uploadError) {
    throw uploadError;
  }

  const durationSec = Math.max(Math.round(input.durationSec), 1);
  const totalPrepSegments = Math.max(Math.round(input.totalPrepSegments), 0);
  const completedPrepSegments = Math.min(
    Math.max(Math.round(input.completedPrepSegments), 0),
    totalPrepSegments || Number.MAX_SAFE_INTEGER
  );
  const prepCompleted =
    typeof input.prepCompleted === "boolean"
      ? input.prepCompleted
      : totalPrepSegments > 0 && completedPrepSegments >= totalPrepSegments;
  const grade = calculateSubmissionGrade({
    passage: getSessionPassage(assignment.passage, session),
    durationSec,
    prepCompleted
  });
  const submissionPayload = {
    assignment_id: assignmentId,
    session_id: sessionId,
    student_id: studentId,
    audio_path: audioPath,
    audio_content_type: input.audio.type || "audio/webm",
    duration_sec: durationSec,
    grade,
    prep_completed: prepCompleted,
    completed_prep_segments: completedPrepSegments,
    total_prep_segments: totalPrepSegments,
    status: "submitted",
    submitted_at: new Date().toISOString(),
    feedback: null,
    score: null
  };

  const query = previousSubmission
    ? supabase.from("submissions").update(submissionPayload).eq("id", previousSubmission.id)
    : supabase.from("submissions").insert(submissionPayload);
  const { data, error } = await query.select().single();

  if (error) {
    throw error;
  }

  const studentData = asRow(studentRow);
  const classGroup = mapClass(asRow(studentData.classes));
  const student = mapStudent(studentData, new Map([[classGroup.id, classGroup]]));

  return mapSubmission(asRow(data), new Map([[student.id, student]]), new Map([[assignment.id, assignment]]));
};

export const reviewSupabaseSubmission = async (submissionId: string, input: ReviewSubmissionInput) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("submissions")
    .update({
      status: input.status,
      feedback: input.feedback?.trim() || null,
      score: typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", submissionId)
    .select("*, students(*, classes(*)), assignments(*)")
    .single();

  if (error) {
    throw error;
  }

  const submissionData = asRow(data);
  const studentData = asRow(submissionData.students);
  const classGroup = mapClass(asRow(studentData.classes));
  const student = mapStudent(studentData, new Map([[classGroup.id, classGroup]]));

  return mapSubmission(submissionData, new Map([[student.id, student]]));
};

export const readSupabaseAudio = async (fileName: string) => {
  const supabase = getSupabaseAdmin();
  const safeFileName = path.basename(fileName);
  if (safeFileName !== fileName) {
    throw new Error("invalid file name");
  }

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("*")
    .eq("audio_path", safeFileName)
    .single();

  if (submissionError) {
    throw submissionError;
  }

  const { data, error } = await supabase.storage.from(RECORDINGS_BUCKET).download(safeFileName);
  if (error) {
    throw error;
  }

  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: submission.audio_content_type || "audio/webm",
    submission: {
      studentId: submission.student_id
    }
  };
};
