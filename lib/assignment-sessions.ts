import { randomUUID } from "node:crypto";
import { splitPassageIntoPrepSegments } from "@/lib/passage-segments";

export type AssignmentMode = "single" | "split" | "repeat";

export type AssignmentSession = {
  id: string;
  index: number;
  assignedDate: string;
  dueDate: string;
  segmentStart: number;
  segmentEnd: number;
};

export type SessionDraft = {
  assignedDate: string;
  dueDate: string;
  segmentStart: number;
  segmentEnd: number;
};

export const ASSIGNMENT_MODE_LABEL: Record<AssignmentMode, string> = {
  single: "통 배정 (1회)",
  split: "구간 분할",
  repeat: "통 반복"
};

/**
 * An assignment targets the whole class by default; when studentIds is set,
 * only those students in the class receive it.
 */
export const isStudentAssignmentTarget = (
  assignment: { className: string; studentIds?: string[] },
  student: { id: string; className: string }
) =>
  assignment.className === student.className &&
  (!assignment.studentIds?.length || assignment.studentIds.includes(student.id));

export const normalizeStudentIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const ids = Array.from(
    new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))
  );
  return ids.length ? ids : undefined;
};

export const addDaysToDateString = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Soft deadline: Sunday of the week that contains the assigned day (Mon–Sun week). */
export const getWeekSunday = (dateString: string) => {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? 0 : 7 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
};

export const formatAssignedDateLabel = (dateString: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(new Date(`${dateString}T12:00:00`));

export const buildEqualSegmentRanges = (segmentCount: number, sessionCount: number) => {
  const safeSegments = Math.max(segmentCount, 1);
  const safeSessions = Math.max(1, Math.min(sessionCount, safeSegments));
  const ranges: Array<{ segmentStart: number; segmentEnd: number }> = [];
  let cursor = 0;

  for (let index = 0; index < safeSessions; index += 1) {
    const remainingSessions = safeSessions - index;
    const remainingSegments = safeSegments - cursor;
    const take = Math.max(1, Math.ceil(remainingSegments / remainingSessions));
    const segmentStart = cursor;
    const segmentEnd = Math.min(safeSegments - 1, cursor + take - 1);
    ranges.push({ segmentStart, segmentEnd });
    cursor = segmentEnd + 1;
  }

  return ranges;
};

const toDraft = (
  assignedDate: string,
  segmentStart: number,
  segmentEnd: number
): SessionDraft => ({
  assignedDate,
  dueDate: getWeekSunday(assignedDate),
  segmentStart,
  segmentEnd
});

export const buildSessionDrafts = ({
  mode,
  passage,
  startDate,
  sessionCount,
  sessionDates,
  segmentRanges
}: {
  mode: AssignmentMode;
  passage: string;
  startDate: string;
  sessionCount: number;
  sessionDates?: string[];
  segmentRanges?: Array<{ segmentStart: number; segmentEnd: number }>;
}): SessionDraft[] => {
  const segments = splitPassageIntoPrepSegments(passage);
  const lastSegment = Math.max(segments.length - 1, 0);

  if (mode === "single") {
    const assignedDate = sessionDates?.[0] || startDate;
    return [toDraft(assignedDate, 0, lastSegment)];
  }

  const count = Math.max(1, Math.min(sessionCount, 7));
  const dates =
    sessionDates && sessionDates.length >= count
      ? sessionDates.slice(0, count)
      : Array.from({ length: count }, (_, index) => addDaysToDateString(startDate, index));

  if (mode === "repeat") {
    return dates.map((assignedDate) => toDraft(assignedDate, 0, lastSegment));
  }

  const ranges = segmentRanges?.length
    ? segmentRanges.slice(0, count)
    : buildEqualSegmentRanges(segments.length || 1, count);

  return dates.map((assignedDate, index) => {
    const range = ranges[index] ?? { segmentStart: 0, segmentEnd: lastSegment };
    const segmentStart = Math.max(0, Math.min(range.segmentStart, lastSegment));
    const segmentEnd = Math.max(segmentStart, Math.min(range.segmentEnd, lastSegment));
    return toDraft(assignedDate, segmentStart, segmentEnd);
  });
};

export const materializeSessions = (drafts: SessionDraft[], assignmentId?: string): AssignmentSession[] =>
  drafts.map((draft, index) => {
    const assignedDate = draft.assignedDate || draft.dueDate;
    return {
      id: assignmentId ? `${assignmentId}-s${index + 1}` : `s-${randomUUID()}`,
      index: index + 1,
      assignedDate,
      dueDate: draft.dueDate || getWeekSunday(assignedDate),
      segmentStart: draft.segmentStart,
      segmentEnd: draft.segmentEnd
    };
  });

export const getSessionPassage = (passage: string, session: AssignmentSession) => {
  const segments = splitPassageIntoPrepSegments(passage);
  if (!segments.length) {
    return passage;
  }

  const start = Math.max(0, Math.min(session.segmentStart, segments.length - 1));
  const end = Math.max(start, Math.min(session.segmentEnd, segments.length - 1));
  return segments
    .slice(start, end + 1)
    .map((segment) => segment.text)
    .join(" ");
};

export const getSessionPrepSegments = (passage: string, session: AssignmentSession) => {
  const segments = splitPassageIntoPrepSegments(passage);
  if (!segments.length) {
    return [];
  }

  const start = Math.max(0, Math.min(session.segmentStart, segments.length - 1));
  const end = Math.max(start, Math.min(session.segmentEnd, segments.length - 1));
  return segments.slice(start, end + 1).map((segment, index) => ({
    ...segment,
    id: `session-segment-${index}`
  }));
};

export const normalizeSession = (
  session: Partial<AssignmentSession> & { dueDate: string },
  index: number,
  assignmentId: string
): AssignmentSession => {
  const assignedDate = session.assignedDate || session.dueDate;
  return {
    id: session.id || `${assignmentId}-s${index + 1}`,
    index: session.index || index + 1,
    assignedDate,
    dueDate: session.dueDate || getWeekSunday(assignedDate),
    segmentStart: Number.isFinite(session.segmentStart) ? Number(session.segmentStart) : 0,
    segmentEnd: Number.isFinite(session.segmentEnd) ? Number(session.segmentEnd) : 0
  };
};

export const ensureAssignmentSessions = <
  T extends {
    id: string;
    dueDate: string;
    passage: string;
    mode?: AssignmentMode;
    sessions?: AssignmentSession[];
  }
>(
  assignment: T
): T & { mode: AssignmentMode; sessions: AssignmentSession[] } => {
  if (assignment.sessions?.length) {
    return {
      ...assignment,
      mode: assignment.mode ?? (assignment.sessions.length > 1 ? "split" : "single"),
      sessions: assignment.sessions.map((session, index) =>
        normalizeSession(session, index, assignment.id)
      )
    };
  }

  const segments = splitPassageIntoPrepSegments(assignment.passage);
  const lastSegment = Math.max(segments.length - 1, 0);
  const assignedDate = assignment.dueDate;
  return {
    ...assignment,
    mode: "single",
    sessions: [
      {
        id: `${assignment.id}-s1`,
        index: 1,
        assignedDate,
        dueDate: getWeekSunday(assignedDate),
        segmentStart: 0,
        segmentEnd: lastSegment
      }
    ]
  };
};
