"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type {
  Assignment,
  AssignmentMode,
  AssignmentSession,
  ClassGroup,
  HomeworkState,
  PassageTemplate,
  Student,
  Submission
} from "@/lib/homework-data";
import {
  ASSIGNMENT_MODE_LABEL,
  buildSessionDrafts,
  formatAssignedDateLabel,
  getSessionPassage,
  getSessionPrepSegments,
  getWeekSunday,
  type SessionDraft
} from "@/lib/assignment-sessions";
import { splitPassageIntoPrepSegments, type PrepSegment } from "@/lib/passage-segments";
import { getAssignmentColorKey, getPassageColorClass, getPassageColorIndex } from "@/lib/passage-colors";

type RecordingState = "idle" | "recording" | "ready";
type LoginDemoUser = Pick<SessionUser, "email" | "name" | "role"> & {
  passwordHint: string;
};
type AuthenticatedHomeworkState = HomeworkState & {
  currentUser: SessionUser;
};
type HomeworkStatusKey = "pending" | "submitted" | "reviewed" | "resubmit";
type AssignStep = 1 | 2 | 3;
type AssignmentForm = {
  bookName: string;
  level: number;
  passageTitle: string;
  className: string;
  dueDate: string;
  passage: string;
  instructions: string;
  mode: AssignmentMode;
  sessionCount: number;
  sessionDrafts: SessionDraft[];
};
type VisibleSession = {
  assignment: Assignment;
  session: AssignmentSession;
};

const getDefaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

const SPEECH_RATE = 0.88;
const MIN_SESSION_COUNT = 1;
const MAX_SESSION_COUNT = 5;
const assignmentModeOptions: Array<{ value: AssignmentMode; label: string; helper: string }> = [
  { value: "single", label: "통 배정", helper: "한 번에 전체 본문" },
  { value: "split", label: "구간 분할", helper: "여러 날짜에 나눠 제출" },
  { value: "repeat", label: "통 반복", helper: "전체 본문을 여러 번 반복" }
];
const calendarWeekdayLabels = ["월", "화", "수", "목", "금", "토", "일"];

const homeworkStatusLabel: Record<HomeworkStatusKey, string> = {
  pending: "미제출",
  submitted: "검토 대기",
  reviewed: "피드백 완료",
  resubmit: "재제출 필요"
};

const getHomeworkStatus = (submission?: Submission | null): HomeworkStatusKey => {
  if (!submission) {
    return "pending";
  }

  return submission.status;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const getGradeClassName = (grade: Submission["grade"] | "F") =>
  `grade-pill ${
    grade === "A+"
      ? "grade-aplus"
      : grade === "A"
        ? "grade-a"
        : grade === "B"
          ? "grade-b"
          : "grade-f"
  }`;

const gradePoints: Record<Submission["grade"] | "F", number> = {
  "A+": 5,
  A: 4,
  B: 2,
  F: 0
};

const getWeekStart = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getSessionAssignedDate = (session: Pick<AssignmentSession, "assignedDate" | "dueDate">) =>
  session.assignedDate || session.dueDate;

const getDraftAssignedDate = (draft: SessionDraft) => draft.assignedDate || draft.dueDate;

const getUniqueSortedDates = (dates: string[]) =>
  Array.from(new Set(dates.filter(Boolean))).sort((left, right) => left.localeCompare(right));

const clampSessionCount = (count: number) =>
  Math.max(MIN_SESSION_COUNT, Math.min(MAX_SESSION_COUNT, Math.round(count) || MIN_SESSION_COUNT));

const getSessionCountForMode = (mode: AssignmentMode, sessionCount: number) =>
  mode === "single" ? 1 : clampSessionCount(sessionCount);

const buildDraftsForForm = (
  form: AssignmentForm,
  options: { resetDates?: boolean; resetRanges?: boolean } = {}
) =>
  buildSessionDrafts({
    mode: form.mode,
    passage: form.passage,
    startDate: form.dueDate,
    sessionCount: getSessionCountForMode(form.mode, form.sessionCount),
    sessionDates: options.resetDates ? undefined : form.sessionDrafts.map(getDraftAssignedDate),
    segmentRanges: options.resetRanges
      ? undefined
      : form.sessionDrafts.map((draft) => ({
          segmentStart: draft.segmentStart,
          segmentEnd: draft.segmentEnd
        }))
  });

const getInitialAssignmentForm = (): AssignmentForm => {
  const dueDate = getDefaultDueDate();
  const baseForm: AssignmentForm = {
    bookName: "Reading Explorer",
    level: 2,
    passageTitle: "",
    className: "CHESS Reading A",
    dueDate,
    passage: "",
    instructions: "본문 전체를 또렷하게 읽고, 제출 전 반드시 미리듣기로 확인하세요.",
    mode: "single",
    sessionCount: 3,
    sessionDrafts: []
  };

  return baseForm;
};

const getSessionSummary = (assignment: Pick<Assignment, "mode" | "sessions">, session: AssignmentSession) => {
  if (assignment.mode !== "split") {
    return "전체 본문";
  }

  return `${session.segmentStart + 1}-${session.segmentEnd + 1}번 구간`;
};

const getDraftSummary = (mode: AssignmentMode, draft: SessionDraft) => {
  if (mode !== "split") {
    return "전체 본문";
  }

  return `${draft.segmentStart + 1}-${draft.segmentEnd + 1}번 구간`;
};

const formatSessionScheduleLabel = (assignedDate: string, dueDate?: string) =>
  `배정 ${formatAssignedDateLabel(assignedDate)} · ~${formatAssignedDateLabel(
    dueDate || getWeekSunday(assignedDate)
  )}까지`;

const buildFormWithAssignedDates = (
  form: AssignmentForm,
  dates: string[],
  options: { resetRanges?: boolean } = {}
): AssignmentForm => {
  const sessionDates = getUniqueSortedDates(dates).slice(
    0,
    form.mode === "single" ? 1 : MAX_SESSION_COUNT
  );

  if (!sessionDates.length) {
    return {
      ...form,
      sessionCount: 1,
      sessionDrafts: []
    };
  }

  const sessionCount = form.mode === "single" ? 1 : clampSessionCount(sessionDates.length);
  const nextForm: AssignmentForm = {
    ...form,
    dueDate: getWeekSunday(sessionDates[sessionDates.length - 1]),
    sessionCount
  };

  return {
    ...nextForm,
    sessionDrafts: buildSessionDrafts({
      mode: nextForm.mode,
      passage: nextForm.passage,
      startDate: sessionDates[0],
      sessionCount,
      sessionDates,
      segmentRanges: options.resetRanges
        ? undefined
        : form.sessionDrafts.map((draft) => ({
            segmentStart: draft.segmentStart,
            segmentEnd: draft.segmentEnd
          }))
    })
  };
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export default function Home() {
  const [activeRole, setActiveRole] = useState<"teacher" | "student">("teacher");
  const [teacherCategory, setTeacherCategory] = useState<"content" | "roster">("content");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<LoginDemoUser[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [templates, setTemplates] = useState<PassageTemplate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateBookFilter, setTemplateBookFilter] = useState("all");
  const [templateLevelFilter, setTemplateLevelFilter] = useState<number | "all">("all");
  const [selectedAchievementClassName, setSelectedAchievementClassName] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(new Date()));
  const [teacherCalendarMonth, setTeacherCalendarMonth] = useState(() => getMonthStart(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioDataUrl, setAudioDataUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingSegmentId, setSpeakingSegmentId] = useState<string | null>(null);
  const [completedPrepSegments, setCompletedPrepSegments] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [assignStep, setAssignStep] = useState<AssignStep>(1);
  const [assignSuccessTitle, setAssignSuccessTitle] = useState("");
  const [statusClassFilter, setStatusClassFilter] = useState("all");
  const [form, setForm] = useState<AssignmentForm>(() => getInitialAssignmentForm());
  const [classForm, setClassForm] = useState({
    name: ""
  });
  const [studentForm, setStudentForm] = useState({
    name: "",
    className: "CHESS Reading A",
    email: ""
  });
  const [loginForm, setLoginForm] = useState({
    email: "teacher@powerrepeat.test",
    password: "teacher123"
  });
  const [studentLoginForm, setStudentLoginForm] = useState({
    studentName: "김민준",
    loginCode: "1234"
  });
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [scoreDraft, setScoreDraft] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const speechTokenRef = useRef(0);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? students[0],
    [selectedStudentId, students]
  );

  const visibleAssignments = useMemo(
    () =>
      selectedStudent
        ? assignments.filter((assignment) => assignment.className === selectedStudent.className)
        : [],
    [assignments, selectedStudent]
  );

  const visibleSessions = useMemo<VisibleSession[]>(
    () =>
      visibleAssignments
        .flatMap((assignment) =>
          assignment.sessions.map((session) => ({
            assignment,
            session
          }))
        )
        .sort(
          (left, right) =>
            getSessionAssignedDate(left.session).localeCompare(getSessionAssignedDate(right.session)) ||
            left.session.dueDate.localeCompare(right.session.dueDate) ||
            left.assignment.passageTitle.localeCompare(right.assignment.passageTitle) ||
            left.session.index - right.session.index
        ),
    [visibleAssignments]
  );

  const selectedSessionItem = useMemo(
    () =>
      visibleSessions.find((item) => item.session.id === selectedSessionId) ??
      visibleSessions.find((item) => item.assignment.id === selectedAssignmentId) ??
      visibleSessions[0],
    [selectedAssignmentId, selectedSessionId, visibleSessions]
  );

  const selectedAssignment =
    selectedSessionItem?.assignment ??
    visibleAssignments.find((assignment) => assignment.id === selectedAssignmentId) ??
    visibleAssignments[0] ??
    assignments[0];
  const selectedSession = selectedSessionItem?.session ?? selectedAssignment?.sessions[0];

  const currentSubmission = useMemo(
    () =>
      submissions.find(
        (submission) =>
          submission.sessionId === selectedSession?.id &&
          submission.studentId === selectedStudent?.id
      ),
    [selectedSession?.id, selectedStudent?.id, submissions]
  );

  const prepSegments = useMemo(
    () =>
      selectedAssignment && selectedSession
        ? getSessionPrepSegments(selectedAssignment.passage, selectedSession)
        : [],
    [selectedAssignment, selectedSession]
  );

  const selectedSessionPassage = useMemo(
    () =>
      selectedAssignment && selectedSession
        ? getSessionPassage(selectedAssignment.passage, selectedSession)
        : "",
    [selectedAssignment, selectedSession]
  );

  const completedSegmentIds = useMemo(() => {
    if (!selectedSession) {
      return [];
    }

    return completedPrepSegments[selectedSession.id] ?? [];
  }, [completedPrepSegments, selectedSession]);

  const prepCompleted =
    prepSegments.length > 0 && completedSegmentIds.length >= prepSegments.length;

  const formPrepSegments = useMemo<PrepSegment[]>(
    () => splitPassageIntoPrepSegments(form.passage),
    [form.passage]
  );

  const sessionsByDate = useMemo(() => {
    const byDate = new Map<string, VisibleSession[]>();
    visibleSessions.forEach((item) => {
      const assignedDate = getSessionAssignedDate(item.session);
      const items = byDate.get(assignedDate) ?? [];
      items.push(item);
      byDate.set(assignedDate, items);
    });
    return byDate;
  }, [visibleSessions]);

  const classScheduledSessions = useMemo(() => {
    return assignments
      .filter((assignment) => assignment.className === form.className)
      .flatMap((assignment) =>
        assignment.sessions.map((session) => ({
          assignment,
          session,
          assignedDate: getSessionAssignedDate(session),
          colorIndex: getPassageColorIndex(getAssignmentColorKey(assignment))
        }))
      );
  }, [assignments, form.className]);

  const classScheduleByDate = useMemo(() => {
    const byDate = new Map<string, typeof classScheduledSessions>();
    classScheduledSessions.forEach((item) => {
      const items = byDate.get(item.assignedDate) ?? [];
      items.push(item);
      byDate.set(item.assignedDate, items);
    });
    return byDate;
  }, [classScheduledSessions]);

  const classPassageLegend = useMemo(() => {
    const seen = new Map<string, { title: string; colorClass: string }>();
    classScheduledSessions.forEach(({ assignment }) => {
      const key = getAssignmentColorKey(assignment);
      if (!seen.has(key)) {
        seen.set(key, {
          title: assignment.passageTitle,
          colorClass: getPassageColorClass(key)
        });
      }
    });
    return Array.from(seen.values());
  }, [classScheduledSessions]);

  const classAssignedHomework = useMemo(() => {
    return assignments
      .filter((assignment) => assignment.className === form.className)
      .slice()
      .sort((left, right) => {
        const leftDate = getSessionAssignedDate(left.sessions[0] ?? { assignedDate: left.dueDate, dueDate: left.dueDate });
        const rightDate = getSessionAssignedDate(
          right.sessions[0] ?? { assignedDate: right.dueDate, dueDate: right.dueDate }
        );
        return rightDate.localeCompare(leftDate) || right.createdAt.localeCompare(left.createdAt);
      });
  }, [assignments, form.className]);

  const statusBoardAssignments = useMemo(() => {
    const filtered =
      statusClassFilter === "all"
        ? assignments
        : assignments.filter((assignment) => assignment.className === statusClassFilter);

    return filtered.slice().sort((left, right) => {
      const leftDate = getSessionAssignedDate(left.sessions[0] ?? { assignedDate: left.dueDate, dueDate: left.dueDate });
      const rightDate = getSessionAssignedDate(
        right.sessions[0] ?? { assignedDate: right.dueDate, dueDate: right.dueDate }
      );
      return rightDate.localeCompare(leftDate) || right.createdAt.localeCompare(left.createdAt);
    });
  }, [assignments, statusClassFilter]);

  const draftColorClass = useMemo(
    () =>
      getPassageColorClass(
        getAssignmentColorKey({
          bookName: form.bookName,
          level: form.level,
          passageTitle: form.passageTitle || "새 본문"
        })
      ),
    [form.bookName, form.level, form.passageTitle]
  );

  const calendarDays = useMemo(() => {
    const monthStartDate = getMonthStart(calendarMonth);
    const gridStart = getWeekStart(monthStartDate);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateString = toDateInputValue(date);
      const daySessions = sessionsByDate.get(dateString) ?? [];
      const colorIndexes = Array.from(
        new Set(
          daySessions.map((item) => getPassageColorIndex(getAssignmentColorKey(item.assignment)))
        )
      ).slice(0, 4);
      return {
        date,
        dateString,
        isCurrentMonth: date.getMonth() === monthStartDate.getMonth(),
        sessionCount: daySessions.length,
        colorIndexes
      };
    });
  }, [calendarMonth, sessionsByDate]);

  const calendarTitle = useMemo(
    () => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(calendarMonth),
    [calendarMonth]
  );
  const todayDateString = useMemo(() => toDateInputValue(new Date()), []);
  const selectedTeacherDates = useMemo(
    () => getUniqueSortedDates(form.sessionDrafts.map(getDraftAssignedDate)),
    [form.sessionDrafts]
  );
  const teacherSelectedDateSet = useMemo(() => new Set(selectedTeacherDates), [selectedTeacherDates]);
  const teacherCalendarDays = useMemo(() => {
    const monthStartDate = getMonthStart(teacherCalendarMonth);
    const gridStart = getWeekStart(monthStartDate);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateString = toDateInputValue(date);
      const existing = classScheduleByDate.get(dateString) ?? [];
      const colorIndexes = Array.from(new Set(existing.map((item) => item.colorIndex))).slice(0, 4);
      return {
        date,
        dateString,
        isAssigned: teacherSelectedDateSet.has(dateString),
        isCurrentMonth: date.getMonth() === monthStartDate.getMonth(),
        existingCount: existing.length,
        colorIndexes
      };
    });
  }, [classScheduleByDate, teacherCalendarMonth, teacherSelectedDateSet]);
  const teacherCalendarTitle = useMemo(
    () =>
      new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" }).format(teacherCalendarMonth),
    [teacherCalendarMonth]
  );

  const homeworkListSessions = useMemo(
    () =>
      selectedCalendarDate
        ? visibleSessions.filter((item) => getSessionAssignedDate(item.session) === selectedCalendarDate)
        : visibleSessions,
    [selectedCalendarDate, visibleSessions]
  );

  const homeworkSummary = useMemo(() => {
    let remaining = 0;
    let cleared = 0;

    visibleSessions.forEach((item) => {
      const submission = submissions.find(
        (submissionItem) =>
          submissionItem.sessionId === item.session.id && submissionItem.studentId === selectedStudent?.id
      );
      const status = getHomeworkStatus(submission);
      if (status === "submitted" || status === "reviewed") {
        cleared += 1;
      } else {
        remaining += 1;
      }
    });

    return { remaining, cleared };
  }, [selectedStudent?.id, submissions, visibleSessions]);

  const templateBookNames = useMemo(
    () => Array.from(new Set(templates.map((template) => template.bookName))).sort(),
    [templates]
  );

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesSearch =
        !query ||
        template.bookName.toLowerCase().includes(query) ||
        template.passageTitle.toLowerCase().includes(query);
      const matchesBook = templateBookFilter === "all" || template.bookName === templateBookFilter;
      const matchesLevel = templateLevelFilter === "all" || template.level === templateLevelFilter;

      return matchesSearch && matchesBook && matchesLevel;
    });
  }, [templateBookFilter, templateLevelFilter, templateSearch, templates]);

  const submittedCount = submissions.filter((submission) => submission.status !== "resubmit").length;
  const assignedSubmissionSlots = assignments.reduce(
    (count, assignment) =>
      count +
      students.filter((student) => student.className === assignment.className).length *
        assignment.sessions.length,
    0
  );
  const completionRate =
    assignedSubmissionSlots === 0 ? 0 : Math.round((submittedCount / assignedSubmissionSlots) * 100);

  const calculateStudentAchievement = useCallback(
    (student: Student, periodStart?: Date) => {
      const now = new Date();
      const classAssignments = assignments.filter((assignment) => assignment.className === student.className);
      const relevantSessions = classAssignments
        .flatMap((assignment) =>
          assignment.sessions.map((session) => ({
            assignment,
            session
          }))
        )
        .filter(
          ({ session }) => !periodStart || new Date(`${session.dueDate}T23:59:59`) >= periodStart
        );
      const stats = {
        student,
        score: 0,
        submitted: 0,
        total: relevantSessions.length,
        completionRate: 0,
        aplus: 0,
        a: 0,
        b: 0,
        f: 0
      };

      relevantSessions.forEach(({ session }) => {
        const submission = submissions.find(
          (item) => item.sessionId === session.id && item.studentId === student.id
        );
        const submittedInPeriod =
          !periodStart || (submission && new Date(submission.submittedAt) >= periodStart);
        const duePassed = new Date(`${session.dueDate}T23:59:59`) <= now;

        if (submission && submittedInPeriod) {
          stats.submitted += 1;
          stats.score += gradePoints[submission.grade];
          if (submission.grade === "A+") stats.aplus += 1;
          if (submission.grade === "A") stats.a += 1;
          if (submission.grade === "B") stats.b += 1;
          return;
        }

        if (!periodStart || duePassed) {
          stats.f += 1;
        }
      });

      stats.completionRate = stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0;
      return stats;
    },
    [assignments, submissions]
  );

  const selectedClassStudents = useMemo(
    () => students.filter((student) => student.className === selectedAchievementClassName),
    [selectedAchievementClassName, students]
  );

  const selectedClassAchievements = useMemo(
    () =>
      selectedClassStudents
        .map((student) => calculateStudentAchievement(student))
        .sort((left, right) => right.score - left.score || right.aplus - left.aplus),
    [calculateStudentAchievement, selectedClassStudents]
  );

  const weekStart = useMemo(() => getWeekStart(new Date()), []);
  const monthStart = useMemo(() => getMonthStart(new Date()), []);

  const weeklyRankings = useMemo(
    () =>
      students
        .map((student) => calculateStudentAchievement(student, weekStart))
        .filter((stats) => stats.total > 0)
        .sort((left, right) => right.score - left.score || right.completionRate - left.completionRate)
        .slice(0, 10),
    [calculateStudentAchievement, students, weekStart]
  );

  const monthlyRankings = useMemo(
    () =>
      students
        .map((student) => calculateStudentAchievement(student, monthStart))
        .filter((stats) => stats.total > 0)
        .sort((left, right) => right.score - left.score || right.completionRate - left.completionRate)
        .slice(0, 10),
    [calculateStudentAchievement, monthStart, students]
  );

  const monthlyMvp = monthlyRankings[0];

  const loadState = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/state");
      if (response.status === 401) {
        const authResponse = await fetch("/api/auth/me");
        const authState = (await authResponse.json()) as {
          user: SessionUser | null;
          demoUsers: LoginDemoUser[];
        };
        setCurrentUser(null);
        setDemoUsers(authState.demoUsers);
        setAssignments([]);
        setSubmissions([]);
        setClasses([]);
        setTemplates([]);
        setStudents([]);
        return;
      }
      if (!response.ok) {
        throw new Error("state request failed");
      }

      const state = (await response.json()) as AuthenticatedHomeworkState;
      setCurrentUser(state.currentUser);
      setActiveRole(state.currentUser.role === "student" ? "student" : "teacher");
      setAssignments(state.assignments);
      setSubmissions(state.submissions);
      setClasses(state.classes);
      setTemplates(state.templates);
      setStudents(state.students);
      setForm((current) => ({
        ...current,
        className: state.classes.some((classGroup) => classGroup.name === current.className)
          ? current.className
          : (state.classes[0]?.name ?? current.className)
      }));
      setStudentForm((current) => ({
        ...current,
        className: state.classes.some((classGroup) => classGroup.name === current.className)
          ? current.className
          : (state.classes[0]?.name ?? current.className)
      }));
      setSelectedAchievementClassName((current) =>
        current && state.classes.some((classGroup) => classGroup.name === current)
          ? current
          : (state.classes[0]?.name ?? "")
      );
      setSelectedStudentId((current) =>
        state.currentUser.studentId &&
        state.students.some((student) => student.id === state.currentUser.studentId)
          ? state.currentUser.studentId
          : current && state.students.some((student) => student.id === current)
          ? current
          : (state.students[0]?.id ?? "")
      );
      setSelectedAssignmentId((current) =>
        current && state.assignments.some((assignment) => assignment.id === current)
          ? current
          : (state.assignments[0]?.id ?? "")
      );
      setSelectedSessionId((current) => {
        const allSessions = state.assignments.flatMap((assignment) => assignment.sessions);
        return current && allSessions.some((session) => session.id === current)
          ? current
          : (allSessions[0]?.id ?? "");
      });
    } catch {
      setNotice("서버 학습 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const rememberedStudentName = window.localStorage.getItem("power-repeat-student-name");
    if (rememberedStudentName) {
      setStudentLoginForm((current) => ({ ...current, studentName: rememberedStudentName }));
    }

    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (!visibleSessions.length) {
      if (selectedSessionId) {
        setSelectedSessionId("");
      }
      return;
    }

    const sessionStillVisible = visibleSessions.some((item) => item.session.id === selectedSessionId);
    const nextItem = sessionStillVisible
      ? visibleSessions.find((item) => item.session.id === selectedSessionId)
      : visibleSessions[0];

    if (nextItem && nextItem.session.id !== selectedSessionId) {
      setSelectedSessionId(nextItem.session.id);
    }
    if (nextItem && nextItem.assignment.id !== selectedAssignmentId) {
      setSelectedAssignmentId(nextItem.assignment.id);
    }
  }, [selectedAssignmentId, selectedSessionId, visibleSessions]);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    []
  );

  const resetRecording = () => {
    setRecordingState("idle");
    setRecordingSec(0);
    setAudioDataUrl("");
    setAudioBlob(null);
    stopNativePronunciation();
    chunksRef.current = [];
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("이 브라우저는 녹음을 지원하지 않습니다. 최신 Chrome, Edge, Safari를 사용해 주세요.");
      return;
    }

    try {
      resetRecording();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = "audio/webm;codecs=opus";
      const mimeType = MediaRecorder.isTypeSupported(preferredType) ? preferredType : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        stopTimer();
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioDataUrl(await blobToDataUrl(blob));
        setRecordingState("ready");
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecordingState("recording");
      timerRef.current = window.setInterval(() => {
        setRecordingSec((seconds) => seconds + 1);
      }, 1000);
    } catch {
      stopTimer();
      setRecordingState("idle");
      setNotice("마이크 권한을 확인해 주세요. 권한을 허용한 뒤 다시 녹음할 수 있습니다.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const playNativePronunciation = (text?: string, segmentId?: string) => {
    if (!selectedAssignment || !selectedSession) {
      return;
    }

    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setNotice("이 브라우저는 본문 듣기를 지원하지 않습니다. 최신 Chrome, Edge, Safari를 사용해 주세요.");
      return;
    }

    const nextSpeakingSegmentId = segmentId ?? "full";
    if (isSpeaking && speakingSegmentId === nextSpeakingSegmentId) {
      stopNativePronunciation();
      return;
    }

    const speechToken = speechTokenRef.current + 1;
    speechTokenRef.current = speechToken;
    window.speechSynthesis.cancel();

    const speechText = text ?? selectedSessionPassage;
    const utterance = new SpeechSynthesisUtterance(speechText);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => voice.lang === "en-US" && /google|samantha|zira|natural/i.test(voice.name)) ??
      voices.find((voice) => voice.lang === "en-US") ??
      voices.find((voice) => voice.lang.startsWith("en"));

    utterance.lang = "en-US";
    utterance.rate = SPEECH_RATE;
    utterance.pitch = 1;
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.onend = () => {
      if (speechTokenRef.current !== speechToken) {
        return;
      }

      setIsSpeaking(false);
      setSpeakingSegmentId(null);

      if (segmentId) {
        setCompletedPrepSegments((current) => {
          const currentSegments = current[selectedSession.id] ?? [];
          if (currentSegments.includes(segmentId)) {
            return current;
          }

          return {
            ...current,
            [selectedSession.id]: [...currentSegments, segmentId]
          };
        });
      }
    };
    utterance.onerror = () => {
      if (speechTokenRef.current !== speechToken) {
        return;
      }

      setIsSpeaking(false);
      setSpeakingSegmentId(null);
      setNotice("본문 듣기 재생에 실패했습니다. 브라우저 음성 설정을 확인해 주세요.");
    };

    setIsSpeaking(true);
    setSpeakingSegmentId(nextSpeakingSegmentId);
    window.speechSynthesis.speak(utterance);
  };

  const stopNativePronunciation = () => {
    speechTokenRef.current += 1;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setSpeakingSegmentId(null);
  };

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(loginForm)
      });

      if (!response.ok) {
        throw new Error("login failed");
      }

      await loadState();
      setNotice("로그인되었습니다.");
    } catch {
      setNotice("로그인에 실패했습니다. 데모 계정 정보를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const studentQuickLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentLoginForm.studentName.trim() || !/^\d{4}$/.test(studentLoginForm.loginCode)) {
      setNotice("학생 이름과 4자리 코드를 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(studentLoginForm)
      });

      if (!response.ok) {
        throw new Error("student login failed");
      }

      window.localStorage.setItem("power-repeat-student-name", studentLoginForm.studentName.trim());
      await loadState();
      setNotice("학생으로 로그인되었습니다.");
    } catch {
      setNotice("학생 로그인에 실패했습니다. 이름과 4자리 코드를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setAssignments([]);
    setSubmissions([]);
    setClasses([]);
    setTemplates([]);
    setStudents([]);
    setSelectedStudentId("");
    setSelectedAssignmentId("");
    setSelectedSessionId("");
    resetRecording();
    await loadState();
    setNotice("로그아웃되었습니다.");
  };

  const submitRecording = async () => {
    if (!selectedAssignment || !selectedSession || !selectedStudent || !audioBlob) {
      setNotice("제출할 녹음이 없습니다. 먼저 녹음하거나 파일을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("assignmentId", selectedAssignment.id);
      formData.append("sessionId", selectedSession.id);
      formData.append("durationSec", String(Math.max(recordingSec, 1)));
      formData.append("prepCompleted", String(prepCompleted));
      formData.append("completedPrepSegments", String(completedSegmentIds.length));
      formData.append("totalPrepSegments", String(prepSegments.length));
      formData.append("audio", audioBlob, `reading-${selectedSession.id}.webm`);

      const response = await fetch("/api/submissions", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error("submission request failed");
      }

      const submission = (await response.json()) as Submission;
      setSubmissions((current) => [
        submission,
        ...current.filter(
          (item) => !(item.sessionId === selectedSession.id && item.studentId === selectedStudent.id)
        )
      ]);
      resetRecording();
      setNotice("녹음 숙제가 서버에 제출되었습니다. 선생님 검토 후 피드백을 확인하세요.");
    } catch {
      setNotice("녹음 제출에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadFallback = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAudioBlob(file);
    setAudioDataUrl(await blobToDataUrl(file));
    setRecordingState("ready");
    setRecordingSec(0);
    setNotice("녹음 파일을 불러왔습니다. 미리듣기 후 제출하세요.");
  };

  const updateAssignmentForm = (
    changes: Partial<AssignmentForm>,
    options: { resetDates?: boolean; resetRanges?: boolean } = {}
  ) => {
    setForm((current) => {
      const nextForm: AssignmentForm = {
        ...current,
        ...changes,
        sessionCount:
          changes.sessionCount === undefined
            ? current.sessionCount
            : clampSessionCount(changes.sessionCount)
      };

      return {
        ...nextForm,
        sessionDrafts:
          current.sessionDrafts.length === 0 && !options.resetDates
            ? []
            : buildDraftsForForm(nextForm, options)
      };
    });
  };

  const updateSessionDraft = (index: number, changes: Partial<SessionDraft>) => {
    setForm((current) => {
      const lastSegmentIndex = Math.max(formPrepSegments.length - 1, 0);
      const nextDrafts = current.sessionDrafts.map((draft, draftIndex) => {
        if (draftIndex !== index) {
          return draft;
        }

        const draftWithChanges = {
          ...draft,
          ...changes
        };
        const segmentStart = Math.max(
          0,
          Math.min(Math.round(draftWithChanges.segmentStart), lastSegmentIndex)
        );
        const segmentEnd = Math.max(
          segmentStart,
          Math.min(Math.round(draftWithChanges.segmentEnd), lastSegmentIndex)
        );

        const assignedDate = draftWithChanges.assignedDate || draftWithChanges.dueDate;

        return {
          ...draftWithChanges,
          assignedDate,
          dueDate: assignedDate ? getWeekSunday(assignedDate) : draftWithChanges.dueDate,
          segmentStart,
          segmentEnd
        };
      });

      return {
        ...current,
        dueDate: nextDrafts[nextDrafts.length - 1]?.dueDate ?? current.dueDate,
        sessionDrafts: nextDrafts
      };
    });
  };

  const changeAssignmentMode = (mode: AssignmentMode) => {
    setForm((current) => {
      const dates = getUniqueSortedDates(current.sessionDrafts.map(getDraftAssignedDate));
      const nextForm: AssignmentForm = {
        ...current,
        mode,
        sessionCount: mode === "single" ? 1 : clampSessionCount(dates.length || current.sessionCount)
      };

      return buildFormWithAssignedDates(nextForm, mode === "single" ? dates.slice(0, 1) : dates, {
        resetRanges: true
      });
    });
  };

  const selectTeacherCalendarDate = (dateString: string) => {
    if (
      form.mode !== "single" &&
      !teacherSelectedDateSet.has(dateString) &&
      selectedTeacherDates.length >= MAX_SESSION_COUNT
    ) {
      setNotice("배정일은 최대 5개까지 선택할 수 있습니다.");
      return;
    }

    setForm((current) => {
      const currentDates = getUniqueSortedDates(current.sessionDrafts.map(getDraftAssignedDate));
      const nextDates =
        current.mode === "single"
          ? [dateString]
          : currentDates.includes(dateString)
            ? currentDates.filter((selectedDate) => selectedDate !== dateString)
            : [...currentDates, dateString];

      return buildFormWithAssignedDates(current, nextDates);
    });
  };

  const selectHomeworkSession = (item: VisibleSession) => {
    setSelectedSessionId(item.session.id);
    setSelectedAssignmentId(item.assignment.id);
    resetRecording();
  };

  const selectCalendarDate = (dateString: string) => {
    setSelectedCalendarDate((current) => (current === dateString ? "" : dateString));
    const firstSessionForDay = sessionsByDate.get(dateString)?.[0];
    if (firstSessionForDay) {
      selectHomeworkSession(firstSessionForDay);
    }
  };

  const moveCalendarMonth = (monthOffset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + monthOffset, 1));
  };

  const moveTeacherCalendarMonth = (monthOffset: number) => {
    setTeacherCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + monthOffset, 1)
    );
  };

  const createAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (assignStep !== 3) {
      return;
    }
    if (!form.bookName.trim() || !form.passageTitle.trim() || !form.passage.trim()) {
      setNotice("책이름, 본문제목, 본문은 필수입니다.");
      setAssignStep(1);
      return;
    }
    if (!form.className.trim()) {
      setNotice("배정할 반을 선택해 주세요.");
      setAssignStep(2);
      return;
    }
    if (!form.sessionDrafts.length || form.sessionDrafts.some((session) => !session.assignedDate)) {
      setNotice("달력에서 배정할 요일을 하나 이상 선택해 주세요.");
      setAssignStep(2);
      return;
    }

    setIsSaving(true);
    try {
      const sessionDrafts = buildDraftsForForm(form);
      const lastDueDate = sessionDrafts[sessionDrafts.length - 1]?.dueDate ?? form.dueDate;
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          mode: form.mode,
          dueDate: lastDueDate,
          sessions: sessionDrafts
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "assignment request failed");
      }

      const nextAssignment = (await response.json()) as Assignment;
      setSelectedAssignmentId(nextAssignment.id);
      setSelectedSessionId(nextAssignment.sessions[0]?.id ?? "");
      setAssignSuccessTitle(nextAssignment.passageTitle);
      setForm((current) => {
        const dueDate = getDefaultDueDate();
        const nextForm: AssignmentForm = {
          ...current,
          passageTitle: "",
          passage: "",
          dueDate,
          mode: current.mode,
          sessionCount: current.mode === "single" ? 1 : current.sessionCount,
          sessionDrafts: []
        };
        return nextForm;
      });
      setAssignStep(1);
      await loadState();
      setNotice(
        `"${nextAssignment.passageTitle}" 배정이 완료되었습니다. 아래에서 다른 본문을 이어서 배정할 수 있습니다.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setNotice(
        message
          ? `과제 배정에 실패했습니다: ${message}`
          : "과제 배정에 실패했습니다. 입력값을 확인하고 다시 시도해 주세요."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const continueAssigning = () => {
    setAssignSuccessTitle("");
    setAssignStep(1);
    setNotice("다른 본문을 입력하거나 템플릿을 불러와 이어서 배정하세요. 달력에 기존 배정이 색으로 표시됩니다.");
    window.requestAnimationFrame(() => {
      document.getElementById("assignment-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openAssignmentStatus = () => {
    setStatusClassFilter(form.className || "all");
    setTeacherCategory("roster");
    window.requestAnimationFrame(() => {
      document.getElementById("assignment-status")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goToAssignStep = (step: AssignStep) => {
    if (step > 1 && (!form.bookName.trim() || !form.passageTitle.trim() || !form.passage.trim())) {
      setNotice("1단계에서 책이름, 본문제목, 본문을 먼저 입력해 주세요.");
      setAssignStep(1);
      return;
    }
    if (
      step > 2 &&
      (!form.className.trim() ||
        !form.sessionDrafts.length ||
        form.sessionDrafts.some((session) => !session.assignedDate))
    ) {
      setNotice("2단계에서 반을 선택하고 달력에서 배정할 요일을 하나 이상 선택해 주세요.");
      setAssignStep(2);
      return;
    }
    setAssignStep(step);
  };

  const loadTemplateIntoForm = (template: PassageTemplate) => {
    setAssignSuccessTitle("");
    setForm((current) => {
      const nextForm: AssignmentForm = {
        ...current,
        bookName: template.bookName,
        level: template.level,
        passageTitle: template.passageTitle,
        passage: template.passage,
        instructions: template.instructions
      };

      return {
        ...nextForm,
        sessionDrafts: current.sessionDrafts.length
          ? buildDraftsForForm(nextForm, { resetRanges: true })
          : []
      };
    });
    setAssignStep(2);
    setTeacherCategory("content");
    setNotice("템플릿을 불러왔습니다. 반을 선택하고 달력에서 배정할 요일을 클릭하세요.");
    window.requestAnimationFrame(() => {
      document.getElementById("assignment-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const deleteAssignmentForClass = async (assignment: Assignment) => {
    const confirmed = window.confirm(
      `"${assignment.passageTitle}" 과제를 삭제할까요?\n제출 기록과 녹음 파일도 함께 삭제됩니다. 템플릿은 유지됩니다.`
    );
    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/assignments/${assignment.id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("delete assignment request failed");
      }

      if (selectedAssignmentId === assignment.id) {
        setSelectedAssignmentId("");
      }
      if (assignment.sessions.some((session) => session.id === selectedSessionId)) {
        setSelectedSessionId("");
      }
      await loadState();
      setNotice("과제가 삭제되었습니다. 템플릿은 보관함에 남아 있습니다.");
    } catch {
      setNotice("과제 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const createClass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classForm.name.trim()) {
      setNotice("반 이름을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(classForm)
      });

      if (!response.ok) {
        throw new Error("class request failed");
      }

      setClassForm({ name: "" });
      await loadState();
      setNotice("새 반이 등록되었습니다.");
    } catch {
      setNotice("반 등록에 실패했습니다. 이미 같은 이름의 반이 있는지 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const createStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!studentForm.name.trim()) {
      setNotice("학생 이름을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(studentForm)
      });

      if (!response.ok) {
        throw new Error("student request failed");
      }

      setStudentForm((current) => ({
        ...current,
        name: "",
        email: ""
      }));
      await loadState();
      setNotice("학생이 등록되었습니다. 자동 생성된 4자리 코드로 로그인할 수 있습니다.");
    } catch {
      setNotice("학생 등록에 실패했습니다. 이메일 중복이나 반 선택을 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const reviewSubmission = async (submission: Submission, status: Submission["status"]) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/submissions/${submission.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          feedback: feedbackDraft[submission.id]?.trim() || submission.feedback,
          score: scoreDraft[submission.id] ?? submission.score
        })
      });

      if (!response.ok) {
        throw new Error("review request failed");
      }

      const updatedSubmission = (await response.json()) as Submission;
      setSubmissions((current) =>
        current.map((item) => (item.id === updatedSubmission.id ? updatedSubmission : item))
      );
      setNotice(status === "resubmit" ? "재제출 요청을 보냈습니다." : "피드백을 저장했습니다.");
    } catch {
      setNotice("피드백 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Power Repeat MVP</p>
          <h1>리딩 숙제 녹음 제출 프로그램</h1>
          <p className="hero-copy">
            선생님은 본문을 올리고, 학생은 모바일과 PC에서 바로 녹음해 제출합니다. 제출 현황,
            피드백, 재제출 요청까지 한 화면에서 관리합니다.
          </p>
        </div>
        <div className="hero-card">
          <span>전체 제출률</span>
          <strong>{completionRate}%</strong>
          <small>
            {submittedCount}/{assignedSubmissionSlots} 제출 완료
          </small>
        </div>
      </section>

      {notice ? (
        <button className="notice" type="button" onClick={() => setNotice("")}>
          {notice}
        </button>
      ) : null}

      {isLoading ? <p className="empty">서버 학습 데이터를 불러오는 중입니다.</p> : null}

      {currentUser ? (
        <section className="session-bar">
          <div>
            <p className="eyebrow">
              {currentUser.role === "admin"
                ? "Super Admin"
                : currentUser.role === "teacher"
                  ? "Teacher"
                  : "Student"}{" "}
              session
            </p>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.email}</span>
          </div>
          <button type="button" onClick={logout}>
            로그아웃
          </button>
        </section>
      ) : null}

      {!currentUser && !isLoading ? (
        <section className="panel auth-panel">
          <div>
            <p className="eyebrow">Login</p>
            <h2>로그인</h2>
            <p>
              학생은 이름과 4자리 코드로 간편하게 들어가고, 선생님은 이메일과 비밀번호로
              로그인합니다.
            </p>
          </div>
          <div className="login-card-grid">
            <form className="stack login-card" onSubmit={studentQuickLogin}>
              <div>
                <p className="eyebrow">Student</p>
                <h3>학생 간편 로그인</h3>
              </div>
              <label>
                학생 이름
                <input
                  autoComplete="name"
                  value={studentLoginForm.studentName}
                  onChange={(event) =>
                    setStudentLoginForm((current) => ({ ...current, studentName: event.target.value }))
                  }
                  placeholder="예: 김민준"
                />
              </label>
              <label>
                4자리 코드
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={4}
                  value={studentLoginForm.loginCode}
                  onChange={(event) =>
                    setStudentLoginForm((current) => ({
                      ...current,
                      loginCode: event.target.value.replace(/\D/g, "").slice(0, 4)
                    }))
                  }
                  placeholder="예: 1234"
                />
              </label>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "로그인 중..." : "학생 로그인"}
              </button>
              <small>학생 이름은 이 브라우저에 기억됩니다.</small>
            </form>
            <form className="stack login-card" onSubmit={login}>
              <div>
                <p className="eyebrow">Teacher</p>
                <h3>선생님 로그인</h3>
              </div>
              <label>
                이메일
                <input
                  autoComplete="username"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                비밀번호
                <input
                  autoComplete="current-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "로그인 중..." : "선생님 로그인"}
              </button>
            </form>
          </div>
          <div className="demo-grid">
            {demoUsers.map((user) => (
              <button
                key={user.email}
                type="button"
                onClick={() => setLoginForm({ email: user.email, password: user.passwordHint })}
              >
                <strong>{user.name}</strong>
                <span>{user.role === "admin" ? "수퍼관리자" : user.role === "teacher" ? "선생님" : "학생"} 계정</span>
                <small>
                  {user.email} / {user.passwordHint}
                </small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {currentUser && activeRole === "teacher" ? (
        <>
          <nav className="teacher-category-tabs" aria-label="선생님 관리 카테고리">
            <button
              className={teacherCategory === "content" ? "active" : ""}
              type="button"
              onClick={() => setTeacherCategory("content")}
            >
              컨텐츠 관리
            </button>
            <button
              className={teacherCategory === "roster" ? "active" : ""}
              type="button"
              onClick={() => setTeacherCategory("roster")}
            >
              반/학생 관리
            </button>
          </nav>
          <section className={`grid teacher-grid teacher-category-${teacherCategory}`}>
            <aside className="panel teacher-side-panel">
              <p className="eyebrow">{teacherCategory === "content" ? "Content" : "Roster"}</p>
              <h2>{teacherCategory === "content" ? "컨텐츠 관리" : "반/학생 관리"}</h2>
              <nav>
                {teacherCategory === "content" ? (
                  <>
                    <a href="#assignment-create">과제 배정하기</a>
                    <a href="#template-library">템플릿 불러오기</a>
                  </>
                ) : (
                  <>
                    <a href="#class-achievements">반별 성취 현황</a>
                    <a href="#student-rankings">주간/월간 순위</a>
                    <a href="#assignment-status">과제 제출 현황</a>
                    <a href="#submission-review">녹음 제출 검토</a>
                    <a href="#roster-manage">반/학생 등록</a>
                    <a href="#roster-list">반별 학생 목록</a>
                  </>
                )}
              </nav>
            </aside>
          <article className="panel teacher-content-panel" id="assignment-create">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Teacher</p>
                <h2>리딩 과제 배정</h2>
              </div>
              <span className="badge">1→2→3 배정</span>
            </div>
            <div className="assign-steps" aria-label="과제 배정 단계">
              <button
                className={assignStep === 1 ? "active" : ""}
                type="button"
                onClick={() => goToAssignStep(1)}
              >
                <strong>1</strong>
                <span>본문 준비</span>
              </button>
              <button
                className={assignStep === 2 ? "active" : ""}
                type="button"
                onClick={() => goToAssignStep(2)}
              >
                <strong>2</strong>
                <span>반·배정일</span>
              </button>
              <button
                className={assignStep === 3 ? "active" : ""}
                type="button"
                onClick={() => goToAssignStep(3)}
              >
                <strong>3</strong>
                <span>확인 배정</span>
              </button>
            </div>
            <form className="stack" onSubmit={createAssignment}>
              {assignSuccessTitle ? (
                <div className="assign-success">
                  <div>
                    <strong>“{assignSuccessTitle}” 배정 완료</strong>
                    <p>같은 반에 다른 본문을 이어서 배정할 수 있습니다. 달력에는 본문별 색으로 표시됩니다.</p>
                  </div>
                  <div className="button-row">
                    <button className="primary-button" type="button" onClick={continueAssigning}>
                      이어서 다른 본문 배정
                    </button>
                    <button type="button" onClick={openAssignmentStatus}>
                      과제 배정 현황 보기
                    </button>
                  </div>
                </div>
              ) : null}
              {assignStep === 1 ? (
                <>
                  <p className="assign-step-copy">배정할 리딩 본문을 입력하거나 오른쪽 템플릿에서 불러오세요.</p>
                  <label>
                    책이름
                    <input
                      value={form.bookName}
                      onChange={(event) => setForm((current) => ({ ...current, bookName: event.target.value }))}
                      placeholder="예: Reading Explorer"
                    />
                  </label>
                  <label>
                    Level
                    <div className="level-picker">
                      {[1, 2, 3, 4, 5, 6].map((level) => (
                        <button
                          className={form.level === level ? "active" : ""}
                          key={level}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, level }))}
                        >
                          Level {level}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label>
                    본문제목
                    <input
                      value={form.passageTitle}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, passageTitle: event.target.value }))
                      }
                      placeholder="예: The Great White"
                    />
                  </label>
                  <label>
                    학생이 읽을 본문
                    <textarea
                      value={form.passage}
                      onChange={(event) =>
                        updateAssignmentForm({ passage: event.target.value }, { resetRanges: true })
                      }
                      placeholder="학생들이 녹음해야 할 영어 본문을 입력하세요."
                      rows={8}
                    />
                  </label>
                  <label>
                    제출 안내
                    <textarea
                      value={form.instructions}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, instructions: event.target.value }))
                      }
                      rows={3}
                    />
                  </label>
                  <div className="button-row">
                    <button className="primary-button" type="button" onClick={() => goToAssignStep(2)}>
                      다음: 반·배정일
                    </button>
                  </div>
                </>
              ) : null}

              {assignStep === 2 ? (
                <>
                  <p className="assign-step-copy">
                    달력에서 배정할 요일을 클릭하세요. 학생은 그날 하는 것이 원칙이고, 그 주
                    일요일까지 제출할 수 있습니다.
                  </p>
                  <div className="assign-summary">
                    <strong>
                      {form.bookName} / Level {form.level} / {form.passageTitle || "본문제목 없음"}
                    </strong>
                    <span>
                      본문 {form.passage.trim().length}자 · 준비 구간 {formPrepSegments.length}개
                    </span>
                  </div>
                  <label>
                    반
                    <select
                      value={form.className}
                      onChange={(event) => {
                        const nextClass = event.target.value;
                        setForm((current) => ({ ...current, className: nextClass }));
                        if (nextClass) {
                          setStatusClassFilter(nextClass);
                        }
                      }}
                    >
                      {classes.map((classGroup) => (
                        <option key={classGroup.id} value={classGroup.name}>
                          {classGroup.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="existing-homework-panel">
                    <div className="existing-homework-heading">
                      <strong>{form.className || "선택한 반"} 기 배정 숙제</strong>
                      <span>{classAssignedHomework.length}개</span>
                    </div>
                    {classAssignedHomework.length ? (
                      <div className="existing-homework-list">
                        {classAssignedHomework.map((assignment) => {
                          const firstSession = assignment.sessions[0];
                          const lastSession = assignment.sessions[assignment.sessions.length - 1];
                          const colorClass = getPassageColorClass(getAssignmentColorKey(assignment));

                          return (
                            <div className="existing-homework-item" key={assignment.id}>
                              <span className={`passage-swatch ${colorClass}`} aria-hidden="true" />
                              <div className="existing-homework-main">
                                <strong>{assignment.passageTitle}</strong>
                                <small>
                                  {assignment.bookName} / Level {assignment.level} ·{" "}
                                  {ASSIGNMENT_MODE_LABEL[assignment.mode]} · {assignment.sessions.length}회차
                                </small>
                                {firstSession && lastSession ? (
                                  <small>
                                    {assignment.sessions.length === 1
                                      ? formatSessionScheduleLabel(
                                          getSessionAssignedDate(firstSession),
                                          firstSession.dueDate
                                        )
                                      : `첫 배정 ${formatAssignedDateLabel(getSessionAssignedDate(firstSession))} · 최종 ~${formatAssignedDateLabel(lastSession.dueDate)}까지`}
                                  </small>
                                ) : null}
                              </div>
                              <button
                                className="assignment-delete-button"
                                disabled={isSaving}
                                type="button"
                                onClick={() => deleteAssignmentForClass(assignment)}
                              >
                                삭제
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="empty compact-empty">이 반에 아직 배정된 숙제가 없습니다.</p>
                    )}
                  </div>
                  <label>
                    배정 방식
                    <div className="mode-picker">
                      {assignmentModeOptions.map((option) => (
                        <button
                          className={form.mode === option.value ? "active" : ""}
                          key={option.value}
                          type="button"
                          onClick={() => changeAssignmentMode(option.value)}
                        >
                          <strong>{option.label}</strong>
                          <span>{option.helper}</span>
                        </button>
                      ))}
                    </div>
                  </label>
                  <div className="assign-mode-summary">
                    <strong>{ASSIGNMENT_MODE_LABEL[form.mode]}</strong>
                    <span>
                      {form.mode === "single"
                        ? "하루만 선택하면 전체 본문 1회차로 배정됩니다."
                        : form.mode === "split"
                          ? "선택한 요일 수만큼 회차가 생기고, 아래에서 구간을 미세 조정합니다."
                          : "선택한 각 요일에 전체 본문을 반복 제출합니다."}
                    </span>
                  </div>
                  <div className="homework-calendar assign-calendar">
                    <p className="calendar-guidance">
                      달력에서 배정할 요일을 클릭하세요. 이미 배정된 본문은 색 점으로 보입니다.
                    </p>
                    <div className="calendar-header">
                      <button type="button" onClick={() => moveTeacherCalendarMonth(-1)}>
                        이전
                      </button>
                      <strong>{teacherCalendarTitle}</strong>
                      <button type="button" onClick={() => moveTeacherCalendarMonth(1)}>
                        다음
                      </button>
                    </div>
                    <div className="calendar-grid">
                      {calendarWeekdayLabels.map((label) => (
                        <span className="calendar-weekday" key={label}>
                          {label}
                        </span>
                      ))}
                      {teacherCalendarDays.map((day) => (
                        <button
                          aria-pressed={day.isAssigned}
                          className={[
                            "calendar-day",
                            day.isAssigned ? `assigned ${draftColorClass}` : "",
                            day.existingCount ? "has-existing" : "",
                            todayDateString === day.dateString ? "today" : "",
                            day.isCurrentMonth ? "" : "muted"
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={day.dateString}
                          type="button"
                          onClick={() => selectTeacherCalendarDate(day.dateString)}
                        >
                          <span>{day.date.getDate()}</span>
                          {day.colorIndexes.length ? (
                            <span className="color-dots" aria-hidden="true">
                              {day.colorIndexes.map((colorIndex) => (
                                <i className={`color-dot passage-color-${colorIndex}`} key={colorIndex} />
                              ))}
                            </span>
                          ) : day.isAssigned ? (
                            <small>선택</small>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    {classPassageLegend.length ? (
                      <div className="passage-legend">
                        {classPassageLegend.map((item) => (
                          <span className="passage-legend-item" key={`${item.colorClass}-${item.title}`}>
                            <i className={`color-dot ${item.colorClass}`} />
                            {item.title}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="calendar-guidance">이 반에 아직 배정된 본문이 없습니다.</p>
                    )}
                  </div>
                  <div className="session-editor assigned-session-list">
                    {form.sessionDrafts.length ? (
                      form.sessionDrafts.map((draft, index) => {
                        const assignedDate = getDraftAssignedDate(draft);

                        return (
                          <div className="session-editor-row" key={`${form.mode}-${assignedDate}-${index}`}>
                            <strong>{index + 1}회차</strong>
                            <span>{formatSessionScheduleLabel(assignedDate, draft.dueDate)}</span>
                            {form.mode === "split" ? (
                              <>
                                <label>
                                  시작 구간
                                  <input
                                    max={Math.max(formPrepSegments.length, 1)}
                                    min={1}
                                    type="number"
                                    value={draft.segmentStart + 1}
                                    onChange={(event) =>
                                      updateSessionDraft(index, {
                                        segmentStart: Number(event.target.value) - 1
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  끝 구간
                                  <input
                                    max={Math.max(formPrepSegments.length, 1)}
                                    min={1}
                                    type="number"
                                    value={draft.segmentEnd + 1}
                                    onChange={(event) =>
                                      updateSessionDraft(index, {
                                        segmentEnd: Number(event.target.value) - 1
                                      })
                                    }
                                  />
                                </label>
                              </>
                            ) : (
                              <span>전체 본문</span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="empty">아직 선택한 배정일이 없습니다. 달력에서 요일을 클릭하세요.</p>
                    )}
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={() => goToAssignStep(1)}>
                      이전
                    </button>
                    <button className="primary-button" type="button" onClick={() => goToAssignStep(3)}>
                      다음: 확인 배정
                    </button>
                  </div>
                </>
              ) : null}

              {assignStep === 3 ? (
                <>
                  <p className="assign-step-copy">아래 내용으로 반에 과제를 배정합니다. 템플릿도 함께 저장됩니다.</p>
                  <div className="assign-confirm">
                    <div>
                      <span>본문</span>
                      <strong>
                        {form.bookName} / Level {form.level} / {form.passageTitle}
                      </strong>
                    </div>
                    <div>
                      <span>반</span>
                      <strong>{form.className}</strong>
                    </div>
                    <div>
                      <span>최종 제출 기한</span>
                      <strong>
                        {form.sessionDrafts[form.sessionDrafts.length - 1]
                          ? formatAssignedDateLabel(
                              form.sessionDrafts[form.sessionDrafts.length - 1].dueDate
                            )
                          : "배정일 미선택"}
                      </strong>
                    </div>
                    <div>
                      <span>배정 방식</span>
                      <strong>{ASSIGNMENT_MODE_LABEL[form.mode]}</strong>
                    </div>
                    <div>
                      <span>세션</span>
                      <div className="session-editor">
                        {form.sessionDrafts.map((draft, index) => (
                          <div className="session-editor-row" key={`confirm-${index}`}>
                            <strong>{index + 1}회차</strong>
                            <span>{formatSessionScheduleLabel(getDraftAssignedDate(draft), draft.dueDate)}</span>
                            <span>{getDraftSummary(form.mode, draft)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span>본문 미리보기</span>
                      <p>
                        {form.passage.trim().slice(0, 180)}
                        {form.passage.trim().length > 180 ? "…" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="button-row">
                    <button type="button" onClick={() => goToAssignStep(2)}>
                      이전
                    </button>
                    <button className="primary-button" disabled={isSaving} type="submit">
                      {isSaving ? "배정 중..." : "이 내용으로 배정하기"}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          </article>

          <article className="panel teacher-content-panel" id="template-library">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Templates</p>
                <h2>본문 템플릿 보관함</h2>
              </div>
              <span className="badge">
                {filteredTemplates.length}/{templates.length}개
              </span>
            </div>
            <div className="template-filters">
              <label>
                검색
                <input
                  value={templateSearch}
                  onChange={(event) => setTemplateSearch(event.target.value)}
                  placeholder="책이름 또는 본문제목 검색"
                />
              </label>
              <label>
                책이름
                <select
                  value={templateBookFilter}
                  onChange={(event) => setTemplateBookFilter(event.target.value)}
                >
                  <option value="all">전체 교재</option>
                  {templateBookNames.map((bookName) => (
                    <option key={bookName} value={bookName}>
                      {bookName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Level
                <select
                  value={templateLevelFilter}
                  onChange={(event) =>
                    setTemplateLevelFilter(event.target.value === "all" ? "all" : Number(event.target.value))
                  }
                >
                  <option value="all">전체 Level</option>
                  {[1, 2, 3, 4, 5, 6].map((level) => (
                    <option key={level} value={level}>
                      Level {level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="template-list">
              {filteredTemplates.length ? (
                filteredTemplates.map((template) => (
                  <button
                    className="template-card"
                    key={template.id}
                    type="button"
                    onClick={() => loadTemplateIntoForm(template)}
                  >
                    <strong>{template.passageTitle}</strong>
                    <span>
                      {template.bookName} / Level {template.level}
                    </span>
                    <small>불러와서 다른 반이나 날짜로 다시 배정</small>
                  </button>
                ))
              ) : (
                <p className="empty">
                  {templates.length
                    ? "검색 조건에 맞는 템플릿이 없습니다."
                    : "아직 저장된 본문 템플릿이 없습니다. 과제를 만들면 자동 저장됩니다."}
                </p>
              )}
            </div>
          </article>

          <article className="panel wide teacher-roster-panel teacher-roster-achievements" id="class-achievements">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Achievement</p>
                <h2>반별 성취 현황</h2>
              </div>
              <span className="badge">{selectedAchievementClassName || "반 선택"}</span>
            </div>
            <div className="achievement-layout">
              <div className="class-list-panel">
                <strong>반 목록</strong>
                <div className="class-list">
                  {classes.map((classGroup) => {
                    const classStudents = students.filter((student) => student.className === classGroup.name);
                    const classAssignments = assignments.filter(
                      (assignment) => assignment.className === classGroup.name
                    );
                    const classSubmissions = submissions.filter((submission) =>
                      classAssignments.some((assignment) => assignment.id === submission.assignmentId)
                    );

                    return (
                      <button
                        className={selectedAchievementClassName === classGroup.name ? "active" : ""}
                        key={classGroup.id}
                        type="button"
                        onClick={() => setSelectedAchievementClassName(classGroup.name)}
                      >
                        <span>{classGroup.name}</span>
                        <small>
                          {classStudents.length}명 · 제출 {classSubmissions.length}건
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="achievement-table-wrap">
                <div className="achievement-summary">
                  <strong>{selectedAchievementClassName || "반을 선택하세요"}</strong>
                  <span>{selectedClassAchievements.length}명</span>
                </div>
                {selectedClassAchievements.length ? (
                  <div className="achievement-table">
                    <div className="achievement-row heading">
                      <span>순위</span>
                      <span>학생</span>
                      <span>제출률</span>
                      <span>A+</span>
                      <span>A</span>
                      <span>B</span>
                      <span>F</span>
                      <span>점수</span>
                    </div>
                    {selectedClassAchievements.map((stats, index) => (
                      <div className="achievement-row" key={stats.student.id}>
                        <span>{index + 1}</span>
                        <strong>{stats.student.name}</strong>
                        <span>{stats.completionRate}%</span>
                        <span>{stats.aplus}</span>
                        <span>{stats.a}</span>
                        <span>{stats.b}</span>
                        <span>{stats.f}</span>
                        <strong>{stats.score}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty">이 반에는 아직 학생이나 과제가 없습니다.</p>
                )}
              </div>
            </div>
          </article>

          <article className="panel wide teacher-roster-panel teacher-roster-rankings" id="student-rankings">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Rankings</p>
                <h2>주간 전체 순위 / 월간 MVP</h2>
              </div>
            </div>
            <div className="ranking-grid">
              <div className="ranking-card">
                <strong>이번 주 전체 학생 순위</strong>
                {weeklyRankings.length ? (
                  weeklyRankings.map((stats, index) => (
                    <div className="ranking-row" key={stats.student.id}>
                      <span>{index + 1}</span>
                      <strong>{stats.student.name}</strong>
                      <small>{stats.student.className}</small>
                      <b>{stats.score}점</b>
                    </div>
                  ))
                ) : (
                  <p className="empty">이번 주 집계할 제출 기록이 아직 없습니다.</p>
                )}
              </div>
              <div className="ranking-card">
                <strong>이번 달 전체 순위</strong>
                {monthlyRankings.length ? (
                  monthlyRankings.map((stats, index) => (
                    <div className="ranking-row" key={stats.student.id}>
                      <span>{index + 1}</span>
                      <strong>{stats.student.name}</strong>
                      <small>{stats.student.className}</small>
                      <b>{stats.score}점</b>
                    </div>
                  ))
                ) : (
                  <p className="empty">이번 달 집계할 제출 기록이 아직 없습니다.</p>
                )}
              </div>
              <div className="ranking-card mvp-card">
                <strong>한 달 전체 MVP</strong>
                {monthlyMvp ? (
                  <>
                    <h3>{monthlyMvp.student.name}</h3>
                    <p>{monthlyMvp.student.className}</p>
                    <span>{monthlyMvp.score}점</span>
                    <small>
                      A+ {monthlyMvp.aplus}회 · 제출률 {monthlyMvp.completionRate}%
                    </small>
                  </>
                ) : (
                  <p className="empty">이번 달 MVP 후보가 아직 없습니다.</p>
                )}
              </div>
            </div>
            <p className="helper-note">
              기본 점수 기준: A+ 5점, A 4점, B 2점, F 0점입니다. 추후 운영 기준에 따라 성실상,
              성장상, 연속 제출 보너스도 추가할 수 있습니다.
            </p>
          </article>

          <article className="panel wide teacher-roster-panel teacher-roster-manage" id="roster-manage">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Roster</p>
                <h2>반/학생 관리</h2>
              </div>
              <span className="badge">
                {classes.length}개 반 · {students.length}명
              </span>
            </div>
            <div className="roster-grid">
              <form className="stack roster-form" onSubmit={createClass}>
                <h3>반 등록</h3>
                <label>
                  반 이름
                  <input
                    value={classForm.name}
                    onChange={(event) => setClassForm({ name: event.target.value })}
                    placeholder="예: 월수금 4시 Reading A"
                  />
                </label>
                <button disabled={isSaving} type="submit">
                  반 추가
                </button>
              </form>
              <form className="stack roster-form" onSubmit={createStudent}>
                <h3>학생 등록</h3>
                <div className="two-columns">
                  <label>
                    학생 이름
                    <input
                      value={studentForm.name}
                      onChange={(event) =>
                        setStudentForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="예: 홍길동"
                    />
                  </label>
                  <label>
                    반
                    <select
                      value={studentForm.className}
                      onChange={(event) =>
                        setStudentForm((current) => ({ ...current, className: event.target.value }))
                      }
                    >
                      {classes.map((classGroup) => (
                        <option key={classGroup.id} value={classGroup.name}>
                          {classGroup.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  이메일 또는 메모, 선택
                  <input
                    value={studentForm.email}
                    onChange={(event) =>
                      setStudentForm((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="선택사항: 학생/학부모 이메일"
                  />
                </label>
                <p className="helper-note">
                  학생을 추가하면 4자리 로그인 코드가 자동 생성됩니다. 학생은 이름과 코드로 로그인합니다.
                </p>
                <button disabled={isSaving} type="submit">
                  학생 추가 및 코드 생성
                </button>
              </form>
            </div>
            <div className="roster-list" id="roster-list">
              {classes.map((classGroup) => {
                const classStudents = students.filter((student) => student.className === classGroup.name);

                return (
                  <div className="roster-class" key={classGroup.id}>
                    <strong>{classGroup.name}</strong>
                    <span>{classStudents.length}명</span>
                    <div>
                      {classStudents.length ? (
                        classStudents.map((student) => (
                          <small className="student-login-row" key={student.id}>
                            <span>{student.name}</span>
                            <strong>코드 {student.loginCode}</strong>
                            {student.email ? <span>{student.email}</span> : null}
                          </small>
                        ))
                      ) : (
                        <small>아직 등록된 학생이 없습니다.</small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel wide teacher-roster-panel teacher-roster-status" id="assignment-status">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Management</p>
                <h2>과제별 제출 현황</h2>
              </div>
              <label className="status-class-filter">
                반 선택
                <select
                  value={statusClassFilter}
                  onChange={(event) => setStatusClassFilter(event.target.value)}
                >
                  <option value="all">전체 반</option>
                  {classes.map((classGroup) => (
                    <option key={classGroup.id} value={classGroup.name}>
                      {classGroup.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="assignment-list">
              {statusBoardAssignments.length ? (
                statusBoardAssignments.map((assignment) => {
                const assignedStudents = students.filter(
                  (student) => student.className === assignment.className
                );
                const firstSession = assignment.sessions[0];
                const lastSession = assignment.sessions[assignment.sessions.length - 1];
                const relatedSubmissions = submissions.filter(
                  (submission) => submission.assignmentId === assignment.id
                );
                const submittedCount = relatedSubmissions.filter(
                  (submission) => submission.status !== "resubmit"
                ).length;
                const totalSlots = assignedStudents.length * assignment.sessions.length;
                return (
                  <div className="assignment-card" key={assignment.id}>
                    <div>
                      <h3>
                        <span
                          className={`passage-swatch ${getPassageColorClass(getAssignmentColorKey(assignment))}`}
                          aria-hidden="true"
                        />
                        {assignment.passageTitle}
                      </h3>
                      <p>
                        {assignment.bookName} / Level {assignment.level} · {assignment.className}
                      </p>
                      <p>
                        {ASSIGNMENT_MODE_LABEL[assignment.mode]} · {assignment.sessions.length}회차
                      </p>
                      {firstSession && lastSession ? (
                        <p>
                          첫 배정 {formatAssignedDateLabel(getSessionAssignedDate(firstSession))} · 최종 ~
                          {formatAssignedDateLabel(lastSession.dueDate)}까지
                        </p>
                      ) : null}
                    </div>
                    <div className="metrics">
                      <span>최종 제출 {formatAssignedDateLabel(assignment.dueDate)}까지</span>
                      <strong>
                        {submittedCount}/{totalSlots}
                      </strong>
                    </div>
                    <button
                      className="assignment-delete-button"
                      disabled={isSaving}
                      type="button"
                      onClick={() => deleteAssignmentForClass(assignment)}
                    >
                      과제 삭제
                    </button>
                    <div className="student-grade-list">
                      {assignedStudents.map((student) => {
                        const sessionStatuses = assignment.sessions.map((session) => {
                          const submission = relatedSubmissions.find(
                            (item) => item.studentId === student.id && item.sessionId === session.id
                          );
                          return {
                            session,
                            submission,
                            status: getHomeworkStatus(submission)
                          };
                        });
                        const clearedCount = sessionStatuses.filter(
                          (item) => item.status === "submitted" || item.status === "reviewed"
                        ).length;
                        const latestSubmission = sessionStatuses
                          .map((item) => item.submission)
                          .filter((submission): submission is Submission => Boolean(submission))
                          .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
                        const aggregateStatus =
                          clearedCount === assignment.sessions.length
                            ? "reviewed"
                            : sessionStatuses.some((item) => item.status === "resubmit")
                              ? "resubmit"
                              : sessionStatuses.some((item) => item.status === "submitted")
                                ? "submitted"
                                : "pending";
                        const grade = latestSubmission?.grade ?? "F";

                        return (
                          <span className="student-grade-row" key={student.id}>
                            <span className="student-grade-name">{student.name}</span>
                            {assignment.sessions.length > 1 ? (
                              <span className="session-status-list">
                                <strong>
                                  {clearedCount}/{assignment.sessions.length} 클리어
                                </strong>
                                {sessionStatuses.map((item) => (
                                  <small className={`status ${item.status}`} key={item.session.id}>
                                    {item.session.index}회 {formatAssignedDateLabel(getSessionAssignedDate(item.session))}{" "}
                                    {homeworkStatusLabel[item.status]}
                                  </small>
                                ))}
                              </span>
                            ) : (
                              <span className={`status ${aggregateStatus}`}>
                                {homeworkStatusLabel[aggregateStatus]}
                              </span>
                            )}
                            <strong className={getGradeClassName(grade)}>{grade}</strong>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })
              ) : (
                <p className="empty">
                  {statusClassFilter === "all"
                    ? "아직 배정된 과제가 없습니다."
                    : `${statusClassFilter}에 배정된 과제가 없습니다.`}
                </p>
              )}
            </div>
          </article>

          <article className="panel wide teacher-roster-panel teacher-roster-review" id="submission-review">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Review</p>
                <h2>녹음 제출 검토</h2>
              </div>
              <span className="badge">{submissions.length}개 제출</span>
            </div>
            <div className="review-list">
              {submissions.length ? (
                submissions.map((submission) => {
                  const assignment = assignments.find((item) => item.id === submission.assignmentId);
                  const session = assignment?.sessions.find((item) => item.id === submission.sessionId);
                  return (
                    <div className="review-card" key={submission.id}>
                      <div className="review-meta">
                        <div>
                          <h3>{submission.studentName}</h3>
                          <p>
                            {assignment
                              ? `${assignment.bookName} / Level ${assignment.level} / ${assignment.passageTitle}${
                                  session ? ` / ${session.index}회차` : ""
                                }`
                              : "삭제된 과제"}
                          </p>
                        </div>
                        <span className={`status ${submission.status}`}>
                          {homeworkStatusLabel[submission.status]}
                        </span>
                        <strong className={getGradeClassName(submission.grade)}>{submission.grade}</strong>
                      </div>
                      <audio controls src={submission.audioUrl} />
                      <div className="submission-details">
                        <span>제출 {formatDateTime(submission.submittedAt)}</span>
                        <span>길이 {formatDuration(submission.durationSec)}</span>
                        <span>
                          구간 듣기 {submission.completedPrepSegments ?? 0}/
                          {submission.totalPrepSegments ?? 0}
                        </span>
                      </div>
                      <div className="two-columns">
                        <label>
                          점수
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={scoreDraft[submission.id] ?? submission.score ?? ""}
                            onChange={(event) =>
                              setScoreDraft((current) => ({
                                ...current,
                                [submission.id]: Number(event.target.value)
                              }))
                            }
                            placeholder="100"
                          />
                        </label>
                        <label>
                          피드백
                          <input
                            value={feedbackDraft[submission.id] ?? submission.feedback ?? ""}
                            onChange={(event) =>
                              setFeedbackDraft((current) => ({
                                ...current,
                                [submission.id]: event.target.value
                              }))
                            }
                            placeholder="발음, 속도, 억양 피드백"
                          />
                        </label>
                      </div>
                      <div className="button-row">
                        <button
                          disabled={isSaving}
                          type="button"
                          onClick={() => reviewSubmission(submission, "reviewed")}
                        >
                          피드백 저장
                        </button>
                        <button
                          className="secondary-danger"
                          disabled={isSaving}
                          type="button"
                          onClick={() => reviewSubmission(submission, "resubmit")}
                        >
                          재제출 요청
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="empty">아직 제출된 녹음이 없습니다. 학생 모드에서 녹음을 제출해 보세요.</p>
              )}
            </div>
          </article>
        </section>
        </>
      ) : currentUser ? (
        <section className="grid student-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Student</p>
                <h2>내 숙제</h2>
              </div>
            </div>
            <label>
              학생 선택
              <select
                value={selectedStudentId}
                onChange={(event) => {
                  setSelectedStudentId(event.target.value);
                  setSelectedSessionId("");
                  setSelectedCalendarDate("");
                  resetRecording();
                }}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} - {student.className}
                  </option>
                ))}
              </select>
            </label>
            <div className="homework-calendar">
              <p className="calendar-guidance">
                배정된 요일에 하는 것이 원칙이며, 그 주 일요일까지 완료하면 됩니다.
              </p>
              <div className="calendar-header">
                <button type="button" onClick={() => moveCalendarMonth(-1)}>
                  이전
                </button>
                <strong>{calendarTitle}</strong>
                <button type="button" onClick={() => moveCalendarMonth(1)}>
                  다음
                </button>
              </div>
              <div className="calendar-grid">
                {calendarWeekdayLabels.map((label) => (
                  <span className="calendar-weekday" key={label}>
                    {label}
                  </span>
                ))}
                {calendarDays.map((day) => (
                  <button
                    className={[
                      "calendar-day",
                      day.sessionCount ? "has-homework" : "",
                      selectedCalendarDate === day.dateString ? "selected" : "",
                      todayDateString === day.dateString ? "today" : "",
                      day.isCurrentMonth ? "" : "muted"
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={day.dateString}
                    type="button"
                    onClick={() => selectCalendarDate(day.dateString)}
                  >
                    <span>{day.date.getDate()}</span>
                    {day.colorIndexes.length ? (
                      <span className="color-dots" aria-hidden="true">
                        {day.colorIndexes.map((colorIndex) => (
                          <i className={`color-dot passage-color-${colorIndex}`} key={colorIndex} />
                        ))}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="homework-summary">
                <span>남은 숙제 {homeworkSummary.remaining}</span>
                <span>클리어 {homeworkSummary.cleared}</span>
              </div>
              {selectedCalendarDate ? (
                <button className="calendar-clear" type="button" onClick={() => setSelectedCalendarDate("")}>
                  전체 숙제 보기
                </button>
              ) : null}
            </div>
            <div className="assignment-list compact">
              {homeworkListSessions.map((item) => {
                const { assignment, session } = item;
                const assignedDate = getSessionAssignedDate(session);
                const submission = submissions.find(
                  (submissionItem) =>
                    submissionItem.sessionId === session.id && submissionItem.studentId === selectedStudent?.id
                );
                const status = getHomeworkStatus(submission);
                const isMultiSession = assignment.sessions.length > 1;
                return (
                  <button
                    className={session.id === selectedSession?.id ? "assignment-card selected" : "assignment-card"}
                    key={session.id}
                    type="button"
                    onClick={() => selectHomeworkSession(item)}
                  >
                    <span
                      className={`passage-swatch ${getPassageColorClass(getAssignmentColorKey(assignment))}`}
                      aria-hidden="true"
                    />
                    <span className="assignment-card-main">
                      <span>
                        {assignment.passageTitle}
                        {isMultiSession ? ` ${session.index}/${assignment.sessions.length}` : ""}
                      </span>
                      <small>
                        {assignment.bookName} / Level {assignment.level}
                      </small>
                      <small>
                        {formatSessionScheduleLabel(assignedDate, session.dueDate)} ·{" "}
                        {getSessionSummary(assignment, session)}
                      </small>
                      <small>{ASSIGNMENT_MODE_LABEL[assignment.mode]}</small>
                    </span>
                    <span className={`status ${status}`}>{homeworkStatusLabel[status]}</span>
                  </button>
                );
              })}
              {!homeworkListSessions.length ? (
                <p className="empty">
                  {selectedCalendarDate ? "선택한 날짜에는 숙제가 없습니다." : "현재 배정된 숙제가 없습니다."}
                </p>
              ) : null}
            </div>
          </article>

          <article className="panel wide">
            {selectedAssignment && selectedSession ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{selectedAssignment.className}</p>
                    <h2>{selectedAssignment.passageTitle}</h2>
                    <p>
                      {selectedAssignment.bookName} / Level {selectedAssignment.level} ·{" "}
                      {selectedAssignment.sessions.length > 1
                        ? `${selectedSession.index}/${selectedAssignment.sessions.length}회차`
                        : "1회차"}{" "}
                      · {getSessionSummary(selectedAssignment, selectedSession)}
                    </p>
                  </div>
                  <div className="heading-status">
                    <span className={`status ${getHomeworkStatus(currentSubmission)}`}>
                      {homeworkStatusLabel[getHomeworkStatus(currentSubmission)]}
                    </span>
                    <span className="badge">
                      {formatSessionScheduleLabel(getSessionAssignedDate(selectedSession), selectedSession.dueDate)}
                    </span>
                  </div>
                </div>
                <div className="student-workspace">
                  <div className="student-reading-column">
                    <div className="passage-box">
                      <p>{selectedSessionPassage}</p>
                    </div>
                    <div className="listening-tools">
                      <div>
                        <strong>먼저 듣고 따라 읽기</strong>
                        <p>
                          본문을 약 150자 기준으로 고르게 나누고, 긴 글도 최대 15개 구간까지만
                          표시합니다. 모든 구간을 끝까지 들으면 A+ 준비 표시가 됩니다.
                        </p>
                      </div>
                      <div className="button-row">
                        <button className="primary-button" type="button" onClick={() => playNativePronunciation()}>
                          전체 원어민 발음으로 듣기
                        </button>
                        {isSpeaking ? (
                          <button type="button" onClick={stopNativePronunciation}>
                            듣기 중지
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="prep-panel">
                      <div className="prep-summary">
                    <div>
                      <strong>구간 듣기 완료</strong>
                      <span>
                        {completedSegmentIds.length}/{prepSegments.length}
                      </span>
                    </div>
                    <span className={`grade-pill ${prepCompleted ? "grade-aplus" : "grade-a"}`}>
                      {prepCompleted ? "A+ 준비 완료" : "듣기 없이 제출하면 A"}
                    </span>
                  </div>
                  <div className="prep-segments">
                    {prepSegments.map((segment, index) => {
                      const isCompleted = completedSegmentIds.includes(segment.id);
                      const isActive = speakingSegmentId === segment.id;

                      return (
                        <button
                          className={`prep-segment ${isCompleted ? "completed" : ""} ${
                            isActive ? "active" : ""
                          }`}
                          key={segment.id}
                          type="button"
                          onClick={() => playNativePronunciation(segment.text, segment.id)}
                        >
                          <span>{index + 1}번 구간 듣기</span>
                          <p>{segment.text}</p>
                          <small>
                            {isActive
                              ? "재생 중 - 다시 누르면 멈춤"
                              : isCompleted
                                ? "완료 - A+ 준비에 반영됨"
                                : "클릭해서 끝까지 듣기"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                    </div>
                    <div className="instructions">
                      <strong>선생님 안내</strong>
                      <p>{selectedAssignment.instructions}</p>
                    </div>

                    {currentSubmission ? (
                      <div className={`feedback-box ${currentSubmission.status}`}>
                        <strong>{homeworkStatusLabel[currentSubmission.status]}</strong>
                        <p>
                          {currentSubmission.feedback ||
                            "녹음이 제출되었습니다. 선생님이 검토하면 피드백이 표시됩니다."}
                        </p>
                        {currentSubmission.score ? <span>점수 {currentSubmission.score}/100</span> : null}
                        <strong className={getGradeClassName(currentSubmission.grade)}>
                          제출 등급 {currentSubmission.grade}
                        </strong>
                        <span>
                          구간 듣기 {currentSubmission.completedPrepSegments ?? 0}/
                          {currentSubmission.totalPrepSegments ?? 0}
                        </span>
                        <audio controls src={currentSubmission.audioUrl} />
                      </div>
                    ) : (
                      <div className="feedback-box pending">
                        <strong>미제출</strong>
                        <p>아직 녹음을 제출하지 않았습니다. 듣고 연습한 뒤 녹음해 제출하세요.</p>
                      </div>
                    )}
                  </div>

                  <aside className="student-recorder-sticky">
                    <div className="recorder">
                  <div>
                    <p className="eyebrow">Recorder</p>
                    <h3>
                      {recordingState === "recording"
                        ? `녹음 중 ${formatDuration(recordingSec)}`
                        : recordingState === "ready"
                          ? "제출 전 미리듣기"
                          : "녹음 준비"}
                    </h3>
                  </div>
                  <div className="button-row">
                    {recordingState === "recording" ? (
                      <button className="danger-button" type="button" onClick={stopRecording}>
                        녹음 끝내기
                      </button>
                    ) : (
                      <button className="primary-button" type="button" onClick={startRecording}>
                        녹음 시작
                      </button>
                    )}
                    <label className="upload-button">
                      파일로 제출
                      <input accept="audio/*" type="file" onChange={handleUploadFallback} />
                    </label>
                  </div>
                  {audioDataUrl ? <audio controls src={audioDataUrl} /> : null}
                  <div className="button-row">
                    <button type="button" onClick={resetRecording}>
                      다시 녹음
                    </button>
                    <button className="submit-button" disabled={isSaving} type="button" onClick={submitRecording}>
                      {isSaving ? "제출 중..." : "최종 제출"}
                    </button>
                  </div>
                  <p className="helper-text">
                    제출 인정 기준: 본문 전체를 한 번에 녹음하고, 미리듣기로 음성이 들리는지 확인하세요.
                    모든 구간 듣기 후 충분히 녹음하면 A+, 듣기 없이 정상 녹음하면 A, 녹음이 지나치게
                    짧으면 B, 미제출은 선생님 화면에서 F로 표시됩니다.
                  </p>
                    </div>
                  </aside>
                </div>
              </>
            ) : (
              <p className="empty">현재 배정된 과제가 없습니다.</p>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}
