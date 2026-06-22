"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Assignment, HomeworkState, Student, Submission } from "@/lib/homework-data";

type RecordingState = "idle" | "recording" | "ready";

const DEFAULT_FORM_DUE_DATE = "2026-06-24";

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

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export default function Home() {
  const [activeRole, setActiveRole] = useState<"teacher" | "student">("teacher");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioDataUrl, setAudioDataUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: "Storybook Reading",
    className: "CHESS Reading A",
    dueDate: DEFAULT_FORM_DUE_DATE,
    passage: "",
    instructions: "본문 전체를 또렷하게 읽고, 제출 전 반드시 미리듣기로 확인하세요."
  });
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [scoreDraft, setScoreDraft] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

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

  const submittedCount = submissions.filter((submission) => submission.status !== "resubmit").length;
  const assignedSubmissionSlots = assignments.reduce(
    (count, assignment) =>
      count + students.filter((student) => student.className === assignment.className).length,
    0
  );
  const completionRate =
    assignedSubmissionSlots === 0 ? 0 : Math.round((submittedCount / assignedSubmissionSlots) * 100);

  useEffect(() => {
    const loadState = async () => {
      try {
        const response = await fetch("/api/state");
        if (!response.ok) {
          throw new Error("state request failed");
        }

        const state = (await response.json()) as HomeworkState;
        setAssignments(state.assignments);
        setSubmissions(state.submissions);
        setStudents(state.students);
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
    };

    void loadState();
  }, []);

  useEffect(() => {
    if (visibleAssignments.length && !visibleAssignments.some((item) => item.id === selectedAssignmentId)) {
      setSelectedAssignmentId(visibleAssignments[0].id);
    }
  }, [selectedAssignmentId, visibleAssignments]);

  const resetRecording = () => {
    setRecordingState("idle");
    setRecordingSec(0);
    setAudioDataUrl("");
    setAudioBlob(null);
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

  const submitRecording = async () => {
    if (!selectedAssignment || !selectedStudent || !audioBlob) {
      setNotice("제출할 녹음이 없습니다. 먼저 녹음하거나 파일을 선택해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("assignmentId", selectedAssignment.id);
      formData.append("studentId", selectedStudent.id);
      formData.append("durationSec", String(Math.max(recordingSec, 1)));
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
    if (!form.title.trim() || !form.passage.trim() || !form.dueDate) {
      setNotice("제목, 본문, 마감일은 필수입니다.");
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
      setAssignments((current) => [nextAssignment, ...current]);
      setSelectedAssignmentId(nextAssignment.id);
      setForm((current) => ({
        ...current,
        title: "Storybook Reading",
        passage: ""
      }));
      setNotice("새 리딩 녹음 과제가 서버에 배정되었습니다.");
    } catch {
      setNotice("과제 배정에 실패했습니다. 입력값을 확인하고 다시 시도해 주세요.");
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

      <nav className="role-switch" aria-label="사용자 역할">
        <button
          className={activeRole === "teacher" ? "active" : ""}
          type="button"
          onClick={() => setActiveRole("teacher")}
        >
          선생님 모드
        </button>
        <button
          className={activeRole === "student" ? "active" : ""}
          type="button"
          onClick={() => setActiveRole("student")}
        >
          학생 모드
        </button>
      </nav>

      {activeRole === "teacher" ? (
        <section className="grid teacher-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Teacher</p>
                <h2>리딩 과제 만들기</h2>
              </div>
              <span className="badge">수업 연계</span>
            </div>
            <form className="stack" onSubmit={createAssignment}>
              <label>
                과제 제목
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="예: Storybook Reading Unit 3"
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
                    <option>CHESS Reading A</option>
                    <option>CHESS Reading B</option>
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

          <article className="panel">
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
                      <h3>{assignment.title}</h3>
                      <p>{assignment.className}</p>
                    </div>
                    <div className="metrics">
                      <span>마감 {assignment.dueDate}</span>
                      <strong>
                        {relatedSubmissions.length}/{assignedStudents.length}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel wide">
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
                          <p>{assignment?.title ?? "삭제된 과제"}</p>
                        </div>
                        <span className={`status ${submission.status}`}>
                          {submission.status === "submitted"
                            ? "검토 대기"
                            : submission.status === "reviewed"
                              ? "피드백 완료"
                              : "재제출 요청"}
                        </span>
                      </div>
                      <audio controls src={submission.audioUrl} />
                      <div className="submission-details">
                        <span>제출 {formatDateTime(submission.submittedAt)}</span>
                        <span>길이 {formatDuration(submission.durationSec)}</span>
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
      ) : (
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
                  (item) => item.assignmentId === assignment.id && item.studentId === selectedStudent.id
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
                    <span>{assignment.title}</span>
                    <small>
                      {submission
                        ? submission.status === "resubmit"
                          ? "재제출 필요"
                          : "제출 완료"
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
                    <h2>{selectedAssignment.title}</h2>
                  </div>
                  <span className="badge">마감 {selectedAssignment.dueDate}</span>
                </div>
                <div className="passage-box">
                  <p>{selectedAssignment.passage}</p>
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
                    <audio controls src={currentSubmission.audioUrl} />
                  </div>
                ) : null}

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
                    문제가 있으면 파일 제출을 사용할 수 있습니다.
                  </p>
                </div>
              </>
            ) : (
              <p className="empty">현재 배정된 과제가 없습니다.</p>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
