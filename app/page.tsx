"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type {
  Assignment,
  ClassGroup,
  HomeworkState,
  PassageTemplate,
  Student,
  Submission
} from "@/lib/homework-data";

type RecordingState = "idle" | "recording" | "ready";
type LoginDemoUser = Pick<SessionUser, "email" | "name" | "role"> & {
  passwordHint: string;
};
type AuthenticatedHomeworkState = HomeworkState & {
  currentUser: SessionUser;
};
type PrepSegment = {
  id: string;
  text: string;
};

const DEFAULT_FORM_DUE_DATE = "2026-06-24";
const TARGET_PREP_SEGMENT_LENGTH = 150;
const MAX_PREP_SEGMENTS = 15;
const SPEECH_RATE = 0.88;

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

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const splitPassageIntoPrepSegments = (passage: string): PrepSegment[] => {
  const normalizedPassage = passage.replace(/\s+/g, " ").trim();
  const targetLength = Math.max(
    TARGET_PREP_SEGMENT_LENGTH,
    Math.ceil(normalizedPassage.length / MAX_PREP_SEGMENTS)
  );
  const sentences = passage
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [passage.trim()].filter(Boolean);

  const segments: string[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > targetLength) {
      segments.push(current);
      current = sentence;
    } else {
      current = next;
    }
  });

  if (current) {
    segments.push(current);
  }

  while (segments.length > MAX_PREP_SEGMENTS) {
    const last = segments.pop();
    if (!last) {
      break;
    }

    segments[segments.length - 1] = `${segments[segments.length - 1]} ${last}`;
  }

  return segments.map((text, index) => ({
    id: `segment-${index}`,
    text
  }));
};

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
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioDataUrl, setAudioDataUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingSegmentId, setSpeakingSegmentId] = useState<string | null>(null);
  const [completedPrepSegments, setCompletedPrepSegments] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    bookName: "Reading Explorer",
    level: 2,
    passageTitle: "",
    className: "CHESS Reading A",
    dueDate: DEFAULT_FORM_DUE_DATE,
    passage: "",
    instructions: "본문 전체를 또렷하게 읽고, 제출 전 반드시 미리듣기로 확인하세요."
  });
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

  const selectedAssignment = useMemo(
    () =>
      visibleAssignments.find((assignment) => assignment.id === selectedAssignmentId) ??
      visibleAssignments[0] ??
      assignments[0],
    [assignments, selectedAssignmentId, visibleAssignments]
  );

  const currentSubmission = useMemo(
    () =>
      submissions.find(
        (submission) =>
          submission.assignmentId === selectedAssignment?.id &&
          submission.studentId === selectedStudent?.id
      ),
    [selectedAssignment?.id, selectedStudent?.id, submissions]
  );

  const prepSegments = useMemo(
    () => splitPassageIntoPrepSegments(selectedAssignment?.passage ?? ""),
    [selectedAssignment?.passage]
  );

  const completedSegmentIds = useMemo(() => {
    if (!selectedAssignment) {
      return [];
    }

    return completedPrepSegments[selectedAssignment.id] ?? [];
  }, [completedPrepSegments, selectedAssignment]);

  const prepCompleted =
    prepSegments.length > 0 && completedSegmentIds.length >= prepSegments.length;

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
      count + students.filter((student) => student.className === assignment.className).length,
    0
  );
  const completionRate =
    assignedSubmissionSlots === 0 ? 0 : Math.round((submittedCount / assignedSubmissionSlots) * 100);

  const calculateStudentAchievement = useCallback(
    (student: Student, periodStart?: Date) => {
      const now = new Date();
      const classAssignments = assignments.filter((assignment) => assignment.className === student.className);
      const relevantAssignments = periodStart
        ? classAssignments.filter((assignment) => new Date(`${assignment.dueDate}T23:59:59`) >= periodStart)
        : classAssignments;
      const stats = {
        student,
        score: 0,
        submitted: 0,
        total: relevantAssignments.length,
        completionRate: 0,
        aplus: 0,
        a: 0,
        b: 0,
        f: 0
      };

      relevantAssignments.forEach((assignment) => {
        const submission = submissions.find(
          (item) => item.assignmentId === assignment.id && item.studentId === student.id
        );
        const submittedInPeriod =
          !periodStart || (submission && new Date(submission.submittedAt) >= periodStart);
        const duePassed = new Date(`${assignment.dueDate}T23:59:59`) <= now;

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
        current && state.students.some((student) => student.id === current)
          ? current
          : (state.students[0]?.id ?? "")
      );
      setSelectedAssignmentId((current) =>
        current && state.assignments.some((assignment) => assignment.id === current)
          ? current
          : (state.assignments[0]?.id ?? "")
      );
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
    if (visibleAssignments.length && !visibleAssignments.some((item) => item.id === selectedAssignmentId)) {
      setSelectedAssignmentId(visibleAssignments[0].id);
    }
  }, [selectedAssignmentId, visibleAssignments]);

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
    if (!selectedAssignment) {
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

    const speechText = text ?? selectedAssignment.passage;
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
          const currentSegments = current[selectedAssignment.id] ?? [];
          if (currentSegments.includes(segmentId)) {
            return current;
          }

          return {
            ...current,
            [selectedAssignment.id]: [...currentSegments, segmentId]
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
    resetRecording();
    await loadState();
    setNotice("로그아웃되었습니다.");
  };

  const submitRecording = async () => {
    if (!selectedAssignment || !selectedStudent || !audioBlob) {
      setNotice("제출할 녹음이 없습니다. 먼저 녹음하거나 파일을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("assignmentId", selectedAssignment.id);
      formData.append("durationSec", String(Math.max(recordingSec, 1)));
      formData.append("prepCompleted", String(prepCompleted));
      formData.append("completedPrepSegments", String(completedSegmentIds.length));
      formData.append("totalPrepSegments", String(prepSegments.length));
      formData.append("audio", audioBlob, `reading-${selectedAssignment.id}.webm`);

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
          (item) => !(item.assignmentId === selectedAssignment.id && item.studentId === selectedStudent.id)
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

  const createAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.bookName.trim() || !form.passageTitle.trim() || !form.passage.trim() || !form.dueDate) {
      setNotice("책이름, 본문제목, 본문, 마감일은 필수입니다.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/assignments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        throw new Error("assignment request failed");
      }

      const nextAssignment = (await response.json()) as Assignment;
      setSelectedAssignmentId(nextAssignment.id);
      setForm((current) => ({
        ...current,
        passage: ""
      }));
      await loadState();
      setNotice("새 리딩 녹음 과제가 배정되고 템플릿으로 저장되었습니다.");
    } catch {
      setNotice("과제 배정에 실패했습니다. 입력값을 확인하고 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadTemplateIntoForm = (template: PassageTemplate) => {
    setForm((current) => ({
      ...current,
      bookName: template.bookName,
      level: template.level,
      passageTitle: template.passageTitle,
      passage: template.passage,
      instructions: template.instructions
    }));
    setNotice("저장된 본문 템플릿을 불러왔습니다. 반과 마감일을 확인한 뒤 배정하세요.");
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
                    <a href="#assignment-create">과제 할당하기</a>
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
                <h2>리딩 과제 만들기</h2>
              </div>
              <span className="badge">수업 연계</span>
            </div>
            <form className="stack" onSubmit={createAssignment}>
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
                  onChange={(event) => setForm((current) => ({ ...current, passageTitle: event.target.value }))}
                  placeholder="예: The Great White"
                />
              </label>
              <div className="two-columns">
                <label>
                  반
                  <select
                    value={form.className}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, className: event.target.value }))
                    }
                  >
                    {classes.map((classGroup) => (
                      <option key={classGroup.id} value={classGroup.name}>
                        {classGroup.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  마감일
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, dueDate: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label>
                학생이 읽을 본문
                <textarea
                  value={form.passage}
                  onChange={(event) => setForm((current) => ({ ...current, passage: event.target.value }))}
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
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "저장 중..." : "과제 배정하기"}
              </button>
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
            </div>
            <div className="assignment-list">
              {assignments.map((assignment) => {
                const assignedStudents = students.filter(
                  (student) => student.className === assignment.className
                );
                const relatedSubmissions = submissions.filter(
                  (submission) => submission.assignmentId === assignment.id
                );
                return (
                  <div className="assignment-card" key={assignment.id}>
                    <div>
                      <h3>{assignment.passageTitle}</h3>
                      <p>
                        {assignment.bookName} / Level {assignment.level} · {assignment.className}
                      </p>
                    </div>
                    <div className="metrics">
                      <span>마감 {assignment.dueDate}</span>
                      <strong>
                        {relatedSubmissions.length}/{assignedStudents.length}
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
                        const submission = relatedSubmissions.find((item) => item.studentId === student.id);
                        const grade = submission?.grade ?? "F";

                        return (
                          <span className="student-grade-row" key={student.id}>
                            {student.name}
                            <strong className={getGradeClassName(grade)}>{grade}</strong>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
                  return (
                    <div className="review-card" key={submission.id}>
                      <div className="review-meta">
                        <div>
                          <h3>{submission.studentName}</h3>
                          <p>
                            {assignment
                              ? `${assignment.bookName} / Level ${assignment.level} / ${assignment.passageTitle}`
                              : "삭제된 과제"}
                          </p>
                        </div>
                        <span className={`status ${submission.status}`}>
                          {submission.status === "submitted"
                            ? "검토 대기"
                            : submission.status === "reviewed"
                              ? "피드백 완료"
                              : "재제출 요청"}
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
            <div className="assignment-list compact">
              {visibleAssignments.map((assignment) => {
                const submission = submissions.find(
                  (item) => item.assignmentId === assignment.id && item.studentId === selectedStudent?.id
                );
                return (
                  <button
                    className={assignment.id === selectedAssignment?.id ? "assignment-card selected" : "assignment-card"}
                    key={assignment.id}
                    type="button"
                    onClick={() => {
                      setSelectedAssignmentId(assignment.id);
                      resetRecording();
                    }}
                  >
                    <span>{assignment.passageTitle}</span>
                    <small>
                      {assignment.bookName} / Level {assignment.level} / {assignment.passageTitle}
                    </small>
                    <small>
                      {submission
                        ? submission.status === "resubmit"
                          ? "재제출 필요"
                          : `제출 완료 - ${submission.grade}`
                        : `마감 ${assignment.dueDate}`}
                    </small>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="panel wide">
            {selectedAssignment ? (
              <>
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{selectedAssignment.className}</p>
                    <h2>{selectedAssignment.passageTitle}</h2>
                    <p>
                      {selectedAssignment.bookName} / Level {selectedAssignment.level}
                    </p>
                  </div>
                  <span className="badge">마감 {selectedAssignment.dueDate}</span>
                </div>
                <div className="student-workspace">
                  <div className="student-reading-column">
                    <div className="passage-box">
                      <p>{selectedAssignment.passage}</p>
                    </div>
                    <div className="listening-tools">
                      <div>
                        <strong>먼저 듣고 따라 읽기</strong>
                        <p>
                          본문을 약 150자 전후 듣기 구간으로 나누고, 긴 글도 최대 15개 구간까지만
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
                        <strong>
                          {currentSubmission.status === "resubmit"
                            ? "재제출 요청"
                            : currentSubmission.status === "reviewed"
                              ? "선생님 피드백"
                              : "제출 완료"}
                        </strong>
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
                    ) : null}
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
