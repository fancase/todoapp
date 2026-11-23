# 프로젝트 가이드

할 일 관리 앱 (Next.js App Router + MongoDB Atlas + Vercel). 계획: `.omc/plans/todo-app-v1.md`, 요구사항: `doc/prd.md`.

## 실행 명령

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:3000) |
| `npm run build` / `npm start` | 운영 빌드 / 실행 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (mongodb-memory-server 사용, 첫 실행 시 mongod 다운로드) |
| `npm run test:e2e` | Playwright E2E |
| `npm run db:indexes` | 인덱스 생성 (idempotent) |
| `npm run db:check` | DB 연결 확인 (성공/실패만 출력) |
| `npm run db:migrate-user -- <github-username> [--dry-run]` | 소유자 없는 기존 데이터를 해당 GitHub 사용자에게 귀속 |

환경변수는 `.env.example`을 복사해 `.env.local`에 채운다. Node는 `engines`(24.x)를 따른다.

## 프로젝트 규칙

- 날짜는 `YYYY-MM-DD` 문자열로 저장한다. `Date`로 변환해 시간대가 밀리지 않게 한다. "오늘"의 기준은 `Asia/Seoul`.
- 진행률은 저장하지 않고 조회 시 계산한다. 계산은 원값으로, 표시할 때만 정수 반올림.
- 비밀값(`MONGODB_URI`, `SESSION_SECRET`, `GITHUB_CLIENT_SECRET`)은 git, 로그, 클라이언트 번들에 두지 않는다. `.env.local`은 커밋하지 않는다.
- 서버 전용 모듈(`src/lib/env.ts`, `src/lib/db.ts`)은 `server-only`를 import한다. 환경변수는 `getEnv()`로만 읽는다.
- `src/domain/types.ts`가 Goal, WeeklyPlan, Todo의 공유 타입이다.
- 오류 응답 형식: `{ error: { code, message } }`.
- 로그인은 GitHub OAuth만 쓴다(설정: `doc/github-oauth.md`). 모든 API 핸들러는 `requireUserId(req)`로 사용자를 얻고, 서버 함수는 항상 `userId` 조건으로 조회·수정·삭제한다.
- 세션은 서버(`sessions`)에 저장된다. 쿠키의 JWT 서명만으로는 유효하지 않고, 로그아웃은 세션 문서를 삭제한다.
