import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Assignment = {
  id: string;
  title: string;
  className: string;
  passage: string;
  instructions: string;
  dueDate: string;
  createdAt: string;
  teacherName: string;
};

export type Submission = {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  audioUrl: string;
  audioFileName: string;
  audioContentType: string;
  durationSec: number;
  submittedAt: string;
  status: "submitted" | "reviewed" | "resubmit";
  feedback?: string;
  score?: number;
};

export type Student = {
  id: string;
  name: string;
  className: string;
};

export type HomeworkState = {
  assignments: Assignment[];
  submissions: Submission[];
  students: Student[];
};

type StoredHomeworkData = {
  assignments: Assignment[];
  submissions: Submission[];
};

type CreateAssignmentInput = {
  title: string;
  className: string;
  passage: string;
  instructions: string;
  dueDate: string;
};

type CreateSubmissionInput = {
  assignmentId: string;
  studentId: string;
  durationSec: number;
  audio: File;
};

type ReviewSubmissionInput = {
  status: Submission["status"];
  feedback?: string;
  score?: number;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "power-repeat.json");

const STUDENTS: Student[] = [
  { id: "s-1", name: "김민준", className: "CHESS Reading A" },
  { id: "s-2", name: "이서연", className: "CHESS Reading A" },
  { id: "s-3", name: "박지우", className: "CHESS Reading B" },
  { id: "s-4", name: "최도윤", className: "CHESS Reading B" }
];

const seedAssignments: Assignment[] = [
  {
    id: "a-1",
    title: "Storybook Reading 1: The Tiny Seed",
    className: "CHESS Reading A",
    passage:
      "A tiny seed slept under the ground. Every morning, the sun warmed the soil. One day, rain fell softly, and the seed began to grow. It pushed up a small green leaf and looked at the bright sky.",
    instructions:
      "본문을 2번 연습한 뒤 한 번에 끝까지 읽어 녹음하세요. 너무 빠르게 읽기보다 또렷한 발음과 자연스러운 억양을 신경 써 주세요.",
    dueDate: "2026-06-24",
    createdAt: "2026-06-22T00:00:00.000Z",
    teacherName: "Jamie Teacher"
  }
];

const initialData: StoredHomeworkData = {
  assignments: seedAssignments,
  submissions: []
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

const cloneInitialData = (): StoredHomeworkData => JSON.parse(JSON.stringify(initialData));

const ensureStorage = async () => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await fs.access(DB_FILE);
  } catch {
    await writeData(cloneInitialData());
  }
};

const readData = async (): Promise<StoredHomeworkData> => {
  await ensureStorage();
  const raw = await fs.readFile(DB_FILE, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoredHomeworkData>;

  return {
    assignments: Array.isArray(parsed.assignments) ? parsed.assignments : seedAssignments,
    submissions: Array.isArray(parsed.submissions) ? parsed.submissions : []
  };
};

const writeData = async (data: StoredHomeworkData) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
};

const assertText = (value: unknown, fieldName: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
};

const getAudioExtension = (audio: File) => {
  if (audio.type && contentTypeToExtension[audio.type]) {
    return contentTypeToExtension[audio.type];
  }

  const extension = path.extname(audio.name).replace(".", "").toLowerCase();
  return extension || "webm";
};

const removeUploadIfPresent = async (fileName: string) => {
  if (path.basename(fileName) !== fileName) {
    return;
  }

  try {
    await fs.unlink(path.join(UPLOAD_DIR, fileName));
  } catch {
    // Missing old files should not block a new submission.
  }
};

export const getStudents = () => STUDENTS;

export const getHomeworkState = async (): Promise<HomeworkState> => {
  const data = await readData();
  return {
    ...data,
    students: STUDENTS
  };
};

export const createAssignment = async (input: CreateAssignmentInput) => {
  const title = assertText(input.title, "title");
  const className = assertText(input.className, "className");
  const passage = assertText(input.passage, "passage");
  const dueDate = assertText(input.dueDate, "dueDate");

  const assignment: Assignment = {
    id: `a-${randomUUID()}`,
    title,
    className,
    passage,
    dueDate,
    instructions: input.instructions?.trim() ?? "",
    createdAt: new Date().toISOString(),
    teacherName: "Jamie Teacher"
  };

  const data = await readData();
  data.assignments = [assignment, ...data.assignments];
  await writeData(data);

  return assignment;
};

export const createSubmission = async (input: CreateSubmissionInput) => {
  const assignmentId = assertText(input.assignmentId, "assignmentId");
  const studentId = assertText(input.studentId, "studentId");

  if (!input.audio || input.audio.size === 0) {
    throw new Error("audio is required");
  }

  const data = await readData();
  const assignment = data.assignments.find((item) => item.id === assignmentId);
  const student = STUDENTS.find((item) => item.id === studentId);

  if (!assignment) {
    throw new Error("assignment not found");
  }

  if (!student) {
    throw new Error("student not found");
  }

  if (student.className !== assignment.className) {
    throw new Error("student is not assigned to this class");
  }

  const previousSubmission = data.submissions.find(
    (item) => item.assignmentId === assignmentId && item.studentId === studentId
  );

  if (previousSubmission?.audioFileName) {
    await removeUploadIfPresent(previousSubmission.audioFileName);
  }

  const extension = getAudioExtension(input.audio);
  const audioFileName = `${randomUUID()}.${extension}`;
  const audioPath = path.join(UPLOAD_DIR, audioFileName);
  const audioBuffer = Buffer.from(await input.audio.arrayBuffer());
  await fs.writeFile(audioPath, audioBuffer);

  const submission: Submission = {
    id: `sub-${randomUUID()}`,
    assignmentId,
    studentId,
    studentName: student.name,
    audioUrl: `/api/audio/${audioFileName}`,
    audioFileName,
    audioContentType: input.audio.type || "audio/webm",
    durationSec: Math.max(Math.round(input.durationSec), 1),
    submittedAt: new Date().toISOString(),
    status: "submitted"
  };

  data.submissions = [
    submission,
    ...data.submissions.filter(
      (item) => !(item.assignmentId === assignmentId && item.studentId === studentId)
    )
  ];
  await writeData(data);

  return submission;
};

export const reviewSubmission = async (submissionId: string, input: ReviewSubmissionInput) => {
  const data = await readData();
  const status = input.status;

  if (!["submitted", "reviewed", "resubmit"].includes(status)) {
    throw new Error("invalid status");
  }

  const nextSubmissions = data.submissions.map((submission) => {
    if (submission.id !== submissionId) {
      return submission;
    }

    return {
      ...submission,
      status,
      feedback: input.feedback?.trim() || submission.feedback,
      score: typeof input.score === "number" && Number.isFinite(input.score) ? input.score : submission.score
    };
  });

  const changed = nextSubmissions.some((submission, index) => submission !== data.submissions[index]);
  if (!changed) {
    throw new Error("submission not found");
  }

  data.submissions = nextSubmissions;
  await writeData(data);

  return nextSubmissions.find((submission) => submission.id === submissionId);
};

export const readAudio = async (fileName: string) => {
  const safeFileName = path.basename(fileName);
  if (safeFileName !== fileName) {
    throw new Error("invalid file name");
  }

  await ensureStorage();
  const audioPath = path.join(UPLOAD_DIR, safeFileName);
  const data = await readData();
  const submission = data.submissions.find((item) => item.audioFileName === safeFileName);

  if (!submission) {
    throw new Error("audio not found");
  }

  const buffer = await fs.readFile(audioPath);

  return {
    buffer,
    contentType: submission.audioContentType || "audio/webm"
  };
};
