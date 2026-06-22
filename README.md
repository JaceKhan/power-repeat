# Power Repeat

학생 리딩 숙제 녹음 제출 웹앱 MVP입니다.

## 기능

- 로그인/권한
  - HttpOnly 쿠키 기반 데모 세션
  - 선생님/학생 역할별 화면 분리
  - 선생님 전용 과제 생성/피드백 API 권한 검사
  - 학생 본인 녹음 제출만 허용
- 선생님 모드
  - 반별 리딩 본문 과제 생성
  - 제출률과 과제별 제출 현황 확인
  - 학생 녹음 재생
  - 점수/피드백 저장
  - 재제출 요청
- 학생 모드
  - 학생/반별 과제 확인
  - 본문과 제출 안내 확인
  - 브라우저 음성 합성으로 원어민 발음 듣기
  - 본문을 약 150자 전후 문단으로 나누어 문단별 듣기 완료 체크
  - 브라우저 마이크로 녹음
  - 녹음 미리듣기
  - 오디오 파일 업로드 대체 제출
  - 제출 상태와 선생님 피드백 확인
  - 제출 등급 A+/A/B 확인

## 벤치마킹 방향

정상어학원 MY TREE처럼 단순 파일 제출함이 아니라 수업과 연결된 과제 관리 흐름을 지향합니다.

- 담임/선생님이 직접 관리하는 과제
- 반별 리딩, 듣기, 발표 준비와 연결되는 숙제
- 제출/미제출/재제출 상태 관리
- 학생별 학습 이력과 피드백 축적

## 제출 등급

- `A+`: 모든 듣기 문단을 끝까지 들은 뒤 정상 녹음 제출
- `A`: 듣기 문단 완료 없이 정상 녹음 제출
- `B`: 녹음 길이가 예상 읽기 시간의 절반보다 짧은 경우
- `F`: 미제출

현재 `B`는 음성 내용을 AI로 분석하는 방식이 아니라 녹음 길이 기반의 쉬운 버전입니다. 실제 발음 정확도, 본문 일치 여부, 불성실 여부를 더 정교하게 보려면 추후 음성 인식/발음 평가 API를 연결해야 합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 데모 계정

| 역할 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 선생님 | `teacher@powerrepeat.test` | `teacher123` |
| 학생 | `minjun@powerrepeat.test` | `student123` |
| 학생 | `jiwoo@powerrepeat.test` | `student123` |

데모 세션 서명에는 `AUTH_SECRET` 환경 변수를 사용할 수 있습니다. 설정하지 않으면 개발용 기본값을 사용합니다.

## 검증

```bash
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=moderate
```

## 현재 저장 방식

현재 MVP는 Next.js API 라우트가 서버 파일 시스템에 데이터를 저장합니다.

- 과제/제출 메타데이터: `.data/power-repeat.json`
- 제출 오디오 파일: `.data/uploads`
- 오디오 재생: `/api/audio/[fileName]`
- 전체 상태 조회: `/api/state`
- 현재 사용자/데모 계정: `GET /api/auth/me`
- 로그인: `POST /api/auth/login`
- 로그아웃: `POST /api/auth/logout`
- 과제 생성: `POST /api/assignments`
- 녹음 제출: `POST /api/submissions`
- 제출 검토: `PATCH /api/submissions/[submissionId]`

`.data`는 개발/시연용 로컬 저장소이며 Git에는 포함하지 않습니다. 실제 운영 버전에서는 인증, 데이터베이스, 오디오 파일 스토리지(S3/Supabase Storage 등)를 연결해야 합니다.
