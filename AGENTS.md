# AGENTS.md

## Cursor Cloud specific instructions

Power Repeat is a single Next.js 16 (App Router, Turbopack) app — there is one service.

- Run dev server: `npm run dev` (serves on `http://localhost:3000`).
- Lint: `npm run lint`. Typecheck: `npm run typecheck`. Build: `npm run build`.
- Storage: with no Supabase env vars set, the app uses a local file store under `.data/` (`.data/power-repeat.json` + `.data/uploads`), so no external database is needed for development or testing. Setting `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` switches it to Supabase.
- Demo/seed accounts for manual testing (from README): super admin `admin@powerrepeat.test` / `jace3000khan!!`, teacher `teacher@powerrepeat.test` / `teacher123`, student name `김민준` code `1234`. Sessions are HttpOnly-cookie based via `POST /api/auth/login`.
- The UI is Korean. Teacher flow: log in, then use the 반학생 관리 tab to register classes (반 등록 / 반 추가) and students (auto-generates a 4-digit code).
- `AUTH_SECRET` is optional in dev (a default is used); set it for production session signing.
