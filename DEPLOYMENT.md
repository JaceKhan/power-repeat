# Power Repeat 배포 안내

이 앱은 로그인, API, 녹음 파일 업로드가 있으므로 GitHub Pages 같은 정적 호스팅에는 맞지 않습니다.

GitHub는 코드를 보관하는 곳이고, 실제 홈페이지 주소는 Render, Railway, Vercel 같은 배포 서비스에서 만들어집니다.

## 추천: Render로 배포

현재 구조에서는 Render가 가장 단순합니다.

- Next.js 서버 실행 가능
- 녹음 파일과 데이터 저장용 영구 디스크 연결 가능
- GitHub 저장소와 연결 가능

## Render 배포 순서

1. <https://render.com> 접속
2. GitHub 계정으로 로그인
3. `New +` 클릭
4. `Blueprint` 선택
5. GitHub 저장소 `JaceKhan/power-repeat` 선택
6. Render가 `render.yaml` 파일을 자동으로 읽음
7. 서비스 이름이 `power-repeat`인지 확인
8. `Apply` 또는 `Create` 클릭
9. 배포 완료 후 Render가 제공하는 주소로 접속

예상 주소 형태:

```text
https://power-repeat.onrender.com
```

실제 주소는 Render가 만들어주는 주소를 사용합니다.

## 중요한 설정

`render.yaml`에는 아래 설정이 들어 있습니다.

- `AUTH_SECRET`: 로그인 쿠키 서명용 비밀값
- `POWER_REPEAT_DATA_DIR=/var/data`: 과제, 학생, 템플릿, 녹음 저장 위치
- `/var/data`: Render 영구 디스크

## 왜 Vercel보다 Render를 먼저 추천하나요?

Vercel은 Next.js 배포에는 좋지만, 현재 MVP처럼 서버 파일 시스템에 녹음 파일과 데이터를 저장하는 방식에는 적합하지 않습니다.

Vercel로 정식 운영하려면 먼저 아래를 연결하는 것이 좋습니다.

- 데이터베이스: Supabase/PostgreSQL
- 녹음 저장소: Supabase Storage, S3, Cloudflare R2 등

## 지금 단계의 한계

Render 배포는 실제 사용 테스트에는 충분하지만, 장기 운영 전에는 아래 작업을 권장합니다.

1. 실제 데이터베이스 연결
2. 녹음 파일 전용 스토리지 연결
3. 학생 비밀번호 암호화
4. 백업 정책
5. 정식 도메인 연결
