import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Assignment = {
  id: string;
  title: string;
  bookName: string;
  level: number;
  passageTitle: string;
  className: string;
  passage: string;
  instructions: string;
  dueDate: string;
  createdAt: string;
  teacherName: string;
  templateId?: string;
};

export type PassageTemplate = {
  id: string;
  bookName: string;
  level: number;
  passageTitle: string;
  passage: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
};

export type ClassGroup = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
};

export type Submission = {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  grade: "A+" | "A" | "B";
  prepCompleted: boolean;
  completedPrepSegments: number;
  totalPrepSegments: number;
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
  email: string;
  password: string;
  active: boolean;
  createdAt: string;
};

export type HomeworkState = {
  assignments: Assignment[];
  submissions: Submission[];
  classes: ClassGroup[];
  students: Student[];
  templates: PassageTemplate[];
};

type StoredHomeworkData = {
  assignments: Assignment[];
  submissions: Submission[];
  classes: ClassGroup[];
  students: Student[];
  templates: PassageTemplate[];
};

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
};

type CreateSubmissionInput = {
  assignmentId: string;
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
  email: string;
  password: string;
};

type ReviewSubmissionInput = {
  status: Submission["status"];
  feedback?: string;
  score?: number;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "power-repeat.json");

const seedClasses: ClassGroup[] = [
  { id: "class-a", name: "CHESS Reading A", active: true, createdAt: "2026-06-22T00:00:00.000Z" },
  { id: "class-b", name: "CHESS Reading B", active: true, createdAt: "2026-06-22T00:00:00.000Z" }
];

const seedStudents: Student[] = [
  {
    id: "s-1",
    name: "김민준",
    className: "CHESS Reading A",
    email: "minjun@powerrepeat.test",
    password: "student123",
    active: true,
    createdAt: "2026-06-22T00:00:00.000Z"
  },
  {
    id: "s-2",
    name: "이서연",
    className: "CHESS Reading A",
    email: "seoyeon@powerrepeat.test",
    password: "student123",
    active: true,
    createdAt: "2026-06-22T00:00:00.000Z"
  },
  {
    id: "s-3",
    name: "박지우",
    className: "CHESS Reading B",
    email: "jiwoo@powerrepeat.test",
    password: "student123",
    active: true,
    createdAt: "2026-06-22T00:00:00.000Z"
  },
  {
    id: "s-4",
    name: "최도윤",
    className: "CHESS Reading B",
    email: "doyoon@powerrepeat.test",
    password: "student123",
    active: true,
    createdAt: "2026-06-22T00:00:00.000Z"
  }
];

const seedAssignments: Assignment[] = [
  {
    id: "a-1",
    title: "Storybook Reading 1: The Tiny Seed",
    bookName: "Storybook Reading",
    level: 1,
    passageTitle: "The Tiny Seed",
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
  submissions: [],
  classes: seedClasses,
  students: seedStudents,
  templates: [
    {
      id: "tpl-1",
      bookName: "Storybook Reading",
      level: 1,
      passageTitle: "The Tiny Seed",
      passage: seedAssignments[0].passage,
      instructions: seedAssignments[0].instructions,
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z"
    }
  ]
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

const buildAssignmentTitle = ({
  bookName,
  level,
  passageTitle
}: {
  bookName: string;
  level: number;
  passageTitle: string;
}) => `${bookName} / Level ${level} / ${passageTitle}`;

const normalizeAssignment = (assignment: Assignment): Assignment => {
  const bookName = assignment.bookName?.trim() || "Uncategorized Book";
  const level = Number.isFinite(assignment.level) ? assignment.level : 1;
  const passageTitle = assignment.passageTitle?.trim() || assignment.title;

  return {
    ...assignment,
    bookName,
    level,
    passageTitle,
    title: assignment.title?.trim() || buildAssignmentTitle({ bookName, level, passageTitle })
  };
};

const normalizeTemplate = (template: PassageTemplate): PassageTemplate => {
  const now = new Date().toISOString();

  return {
    id: template.id || `tpl-${randomUUID()}`,
    bookName: template.bookName?.trim() || "Uncategorized Book",
    level: Number.isFinite(template.level) ? template.level : 1,
    passageTitle: template.passageTitle?.trim() || "Untitled Passage",
    passage: template.passage ?? "",
    instructions: template.instructions ?? "",
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || template.createdAt || now
  };
};

const normalizeClass = (classGroup: ClassGroup): ClassGroup => ({
  id: classGroup.id || `class-${randomUUID()}`,
  name: classGroup.name?.trim() || "Untitled Class",
  active: typeof classGroup.active === "boolean" ? classGroup.active : true,
  createdAt: classGroup.createdAt || new Date().toISOString()
});

const normalizeStudent = (student: Student): Student => {
  const fallbackEmail = `${student.name || student.id || "student"}@powerrepeat.test`
    .replace(/\s+/g, "")
    .toLowerCase();

  return {
    id: student.id || `s-${randomUUID()}`,
    name: student.name?.trim() || "Unnamed Student",
    className: student.className?.trim() || seedClasses[0].name,
    email: student.email?.trim().toLowerCase() || fallbackEmail,
    password: student.password || "student123",
    active: typeof student.active === "boolean" ? student.active : true,
    createdAt: student.createdAt || new Date().toISOString()
  };
};

const normalizeSubmission = (submission: Submission, assignments: Assignment[]): Submission => {
  const assignment = assignments.find((item) => item.id === submission.assignmentId);
  const totalPrepSegments = Number.isFinite(submission.totalPrepSegments)
    ? submission.totalPrepSegments
    : 0;
  const completedPrepSegments = Number.isFinite(submission.completedPrepSegments)
    ? submission.completedPrepSegments
    : 0;
  const prepCompleted =
    typeof submission.prepCompleted === "boolean"
      ? submission.prepCompleted
      : totalPrepSegments > 0 && completedPrepSegments >= totalPrepSegments;

  return {
    ...submission,
    totalPrepSegments,
    completedPrepSegments,
    prepCompleted,
    grade:
      submission.grade ??
      calculateSubmissionGrade({
        passage: assignment?.passage ?? "",
        durationSec: submission.durationSec,
        prepCompleted
      })
  };
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

  const assignments = Array.isArray(parsed.assignments)
    ? parsed.assignments.map((assignment) => normalizeAssignment(assignment))
    : seedAssignments;
  const submissions = Array.isArray(parsed.submissions)
    ? parsed.submissions.map((submission) => normalizeSubmission(submission, assignments))
    : [];
  const classes = Array.isArray(parsed.classes)
    ? parsed.classes.map((classGroup) => normalizeClass(classGroup))
    : seedClasses;
  const students = Array.isArray(parsed.students)
    ? parsed.students.map((student) => normalizeStudent(student))
    : seedStudents;
  const templates = Array.isArray(parsed.templates)
    ? parsed.templates.map((template) => normalizeTemplate(template))
    : initialData.templates;

  return {
    assignments,
    submissions,
    classes,
    students,
    templates
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

export const getHomeworkState = async (): Promise<HomeworkState> => {
  const data = await readData();
  return {
    ...data
  };
};

export const createAssignment = async (input: CreateAssignmentInput) => {
  const bookName = assertText(input.bookName, "bookName");
  const level = Math.min(Math.max(Math.round(Number(input.level)), 1), 6);
  const passageTitle = assertText(input.passageTitle, "passageTitle");
  const title = input.title?.trim() || buildAssignmentTitle({ bookName, level, passageTitle });
  const className = assertText(input.className, "className");
  const passage = assertText(input.passage, "passage");
  const dueDate = assertText(input.dueDate, "dueDate");
  const data = await readData();
  if (!data.classes.some((classGroup) => classGroup.name === className && classGroup.active)) {
    throw new Error("class not found");
  }

  const now = new Date().toISOString();
  const existingTemplate = data.templates.find(
    (template) =>
      template.bookName.toLowerCase() === bookName.toLowerCase() &&
      template.level === level &&
      template.passageTitle.toLowerCase() === passageTitle.toLowerCase()
  );
  const template: PassageTemplate = existingTemplate
    ? {
        ...existingTemplate,
        passage,
        instructions: input.instructions?.trim() ?? "",
        updatedAt: now
      }
    : {
        id: `tpl-${randomUUID()}`,
        bookName,
        level,
        passageTitle,
        passage,
        instructions: input.instructions?.trim() ?? "",
        createdAt: now,
        updatedAt: now
      };

  const assignment: Assignment = {
    id: `a-${randomUUID()}`,
    title,
    bookName,
    level,
    passageTitle,
    className,
    passage,
    dueDate,
    instructions: input.instructions?.trim() ?? "",
    createdAt: now,
    teacherName: input.teacherName?.trim() || "Jamie Teacher",
    templateId: template.id
  };

  data.assignments = [assignment, ...data.assignments];
  data.templates = existingTemplate
    ? data.templates.map((item) => (item.id === template.id ? template : item))
    : [template, ...data.templates];
  await writeData(data);

  return assignment;
};

export const createClassGroup = async (input: CreateClassInput) => {
  const name = assertText(input.name, "name");
  const data = await readData();

  if (data.classes.some((classGroup) => classGroup.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("class already exists");
  }

  const classGroup: ClassGroup = {
    id: `class-${randomUUID()}`,
    name,
    active: true,
    createdAt: new Date().toISOString()
  };

  data.classes = [classGroup, ...data.classes];
  await writeData(data);

  return classGroup;
};

export const createStudent = async (input: CreateStudentInput) => {
  const name = assertText(input.name, "name");
  const className = assertText(input.className, "className");
  const email = assertText(input.email, "email").toLowerCase();
  const password = assertText(input.password, "password");
  const data = await readData();

  if (!data.classes.some((classGroup) => classGroup.name === className && classGroup.active)) {
    throw new Error("class not found");
  }

  if (data.students.some((student) => student.email.toLowerCase() === email)) {
    throw new Error("student email already exists");
  }

  const student: Student = {
    id: `s-${randomUUID()}`,
    name,
    className,
    email,
    password,
    active: true,
    createdAt: new Date().toISOString()
  };

  data.students = [student, ...data.students];
  await writeData(data);

  return student;
};

export const findStudentByCredentials = async (email: string, password: string) => {
  const data = await readData();
  return (
    data.students.find(
      (student) =>
        student.active &&
        student.email.toLowerCase() === email.trim().toLowerCase() &&
        student.password === password
    ) ?? null
  );
};

export const createSubmission = async (input: CreateSubmissionInput) => {
  const assignmentId = assertText(input.assignmentId, "assignmentId");
  const studentId = assertText(input.studentId, "studentId");

  if (!input.audio || input.audio.size === 0) {
    throw new Error("audio is required");
  }

  const data = await readData();
  const assignment = data.assignments.find((item) => item.id === assignmentId);
  const student = data.students.find((item) => item.id === studentId && item.active);

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

  const durationSec = Math.max(Math.round(input.durationSec), 1);
  const totalPrepSegments = Math.max(Math.round(input.totalPrepSegments), 0);
  const completedPrepSegments = Math.min(
    Math.max(Math.round(input.completedPrepSegments), 0),
    totalPrepSegments
  );
  const prepCompleted = totalPrepSegments > 0 && completedPrepSegments >= totalPrepSegments;

  const submission: Submission = {
    id: `sub-${randomUUID()}`,
    assignmentId,
    studentId,
    studentName: student.name,
    grade: calculateSubmissionGrade({
      passage: assignment.passage,
      durationSec,
      prepCompleted
    }),
    prepCompleted,
    completedPrepSegments,
    totalPrepSegments,
    audioUrl: `/api/audio/${audioFileName}`,
    audioFileName,
    audioContentType: input.audio.type || "audio/webm",
    durationSec,
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
    contentType: submission.audioContentType || "audio/webm",
    submission
  };
};
