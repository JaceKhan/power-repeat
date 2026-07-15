# Power Repeat 배포 안내

정식 운영은 **Supabase + Vercel** 조합을 사용합니다.

- Supabase: 반, 학생, 템플릿, 과제, 제출 기록, 녹음 파일 저장
- Vercel: Next.js 홈페이지와 API 배포
- GitHub: 코드 저장소

## 1. Supabase 준비

Supabase에서 아래 작업을 먼저 완료합니다.

1. 새 프로젝트 생성
2. SQL Editor에서 테이블 생성 SQL 실행
3. Storage에서 `recordings` 버킷 확인
4. Project URL 확인
5. API Keys에서 service role key 확인

회차(세션) 배정을 쓰려면 아래 마이그레이션도 실행합니다.

```sql
alter table assignments
  add column if not exists mode text default 'single',
  add column if not exists sessions jsonb default '[]'::jsonb;

alter table submissions
  add column if not exists session_id text;

create index if not exists submissions_session_student_idx
  on submissions (session_id, student_id);
```

학생 개인 배정(반에서 일부 학생만 선택)은 `sessions` JSON에 대상 학생을 함께 저장하므로 **추가 컬럼 없이도 동작**합니다.

선택적으로 `student_ids` 컬럼을 추가하면 전용 컬럼으로도 저장됩니다.

```sql
alter table assignments
  add column if not exists student_ids jsonb;
```

이 SQL을 아직 실행하지 않으면:
- **통 배정(1회)** 은 기존 컬럼만으로도 동작합니다.
- **구간 분할 / 통 반복** 은 실패하며, 화면에 마이그레이션 안내가 표시됩니다.
- **학생 개인 배정** 은 `sessions` 컬럼이 있으면 추가 마이그레이션 없이 동작합니다.

## 2. Vercel 환경변수

Vercel 프로젝트 Settings > Environment Variables에 아래 값을 추가합니다.

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AUTH_SECRET=충분히-긴-랜덤-문자열
```

주의:

- `SUPABASE_SERVICE_ROLE_KEY`는 절대 공개하면 안 됩니다.
- GitHub 코드에 직접 넣으면 안 됩니다.
- Vercel 환경변수에만 넣습니다.

## 3. Vercel 배포 순서

1. <https://vercel.com> 접속
2. GitHub 계정으로 로그인
3. `Add New...` 또는 `New Project` 클릭
4. GitHub 저장소 `JaceKhan/power-repeat` 선택
5. Framework는 Next.js로 자동 감지
6. Environment Variables에 위 3개 값 입력
7. Deploy 클릭

배포가 끝나면 Vercel이 주소를 만들어줍니다.

예상 주소 형태:

```text
https://power-repeat.vercel.app
```

실제 주소는 Vercel 화면에서 확인합니다.

## 4. 배포 후 확인

1. 수퍼관리자 로그인
2. 반 생성
3. 학생 생성
4. 템플릿 저장
5. 과제 배정
6. 학생 이름 + 4자리 코드 로그인
7. 녹음 제출
8. 선생님/관리자 화면에서 제출 확인

## 5. 앞으로 더 안전하게 바꿀 부분

현재 MVP는 빠른 운영 검증을 우선합니다. 장기 운영 전에는 아래 개선을 권장합니다.

1. Supabase Auth 기반 선생님/수퍼관리자 로그인
2. 선생님 초대/비밀번호 재설정
3. 학생 코드 재발급
4. 녹음 파일 보관 기간 정책
5. 백업 정책
6. 정식 도메인 연결
