# 할 일 관리 앱 v1 구현 계획

- 상태: **approved** (2026-11-23, team으로 실행. 운영 배포 전 사용자 재확인 필요)
- 작성일: 2026-11-23
- 근거: `doc/prd.md`, 사용자 인터뷰

## 1. 요구사항 요약

### 확정된 결정

| 항목 | 결정 |
| --- | --- |
| 데이터베이스 | MongoDB Atlas 무료 클러스터 |
| 인증 | 1인용 비밀번호 (환경변수), 앱 전체 보호 |
| 배포 | Vercel |
| 릴리스 범위 | PRD P0 전체 + 1년 목표 진행률 (`doc/prd.md:30-59`) |

### 이번 범위에서 제외

필터, 컬럼 내 순서 변경, 미완료 이월, 진행률 히스토리 (`doc/prd.md:60-63`), 회원가입과 다중 사용자.

### PRD 해석 (구현 기준)

| 모호한 지점 | 구현 기준 |
| --- | --- |
| Flow는 "연결"로 쓰였지만(`:20-21`) 할 일의 연결은 선택이고(`:33`) 상위 삭제 시 해제됨(`:49`) | `weeklyPlanId`, `goalId` 모두 null 허용 |
| 할 일 0개인 주간 계획의 연간 평균 반영 | 0%로 평균에 포함 (`:54`를 그대로 적용) |
| 연결된 주간 계획이 없는 목표 | 0% |
| 반올림 | 계산은 원값 유지, 표시할 때만 정수 반올림. 연간 평균은 반올림 전 값으로 계산 |
| 주간 계획 기간 | 시작일 ≤ 종료일만 강제. 7일 고정 아님 |
| 할 일 날짜가 주간 계획 기간 밖 | 저장은 허용, 화면에 경고 표시 |
| 주간 계획 기간이 목표 연도 밖 | 저장은 허용, 화면에 경고 표시 |
| "오늘"의 기준 | `Asia/Seoul` |
| 같은 컬럼에 드롭 | 변경 없음, API 호출 없음 |
| 컬럼 내 정렬 | `createdAt` 오름차순 고정 |

## 2. 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | Next.js App Router + TypeScript | 화면과 API를 한 번에 Vercel 배포 |
| DB 접근 | 공식 `mongodb` 드라이버 + Zod | 컬렉션 3개 규모에 ODM 불필요, 입력 검증은 Zod로 통일 |
| 서버 상태 | TanStack Query | 낙관적 업데이트와 롤백(`doc/prd.md:41-42`) 지원 |
| 드래그 앤 드롭 | dnd-kit | 터치, 키보드 입력 지원 |
| UI | Tailwind CSS + shadcn/ui | 다이얼로그, 폼, 진행률 바 재사용 |
| 세션 | `jose` 서명 JWT, HttpOnly 쿠키 | 별도 세션 저장소 불필요 |
| 테스트 | Vitest, mongodb-memory-server, Playwright | 단위, API 통합, E2E |

## 3. 데이터 모델

```ts
type TodoStatus = 'todo' | 'doing' | 'done';

interface Goal { _id: ObjectId; title: string; year: number; createdAt: Date; updatedAt: Date }

interface WeeklyPlan {
  _id: ObjectId; title: string;
  startDate: string; endDate: string; // YYYY-MM-DD
  goalId: ObjectId | null;
  createdAt: Date; updatedAt: Date;
}

interface Todo {
  _id: ObjectId; title: string;
  date: string; // YYYY-MM-DD, 시간대 밀림 방지
  status: TodoStatus;
  weeklyPlanId: ObjectId | null;
  createdAt: Date; updatedAt: Date;
}
```

인덱스: `todos{date:1,status:1}`, `todos{weeklyPlanId:1,status:1}`, `weeklyPlans{goalId:1}`, `weeklyPlans{startDate:1}`, `goals{year:1}`, `loginAttempts{expiresAt:1}` (TTL).

**진행률은 저장하지 않고 조회 시 집계한다.** 저장값이 없으므로 할 일 변경 후 값이 어긋날 수 없고, PRD의 재계산 시점(`:53`)을 모두 자동으로 충족한다.

## 4. API와 화면

| 메서드와 경로 | 설명 |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout` | 로그인, 로그아웃 |
| `GET, POST /api/todos` | `?date=` 조회, 생성 |
| `PATCH, DELETE /api/todos/:id` | 수정(상태 포함), 삭제 |
| `GET, POST /api/weekly-plans` | 진행률 포함 목록, 생성 |
| `GET, PATCH, DELETE /api/weekly-plans/:id` | 상세(연결 할 일 포함), 수정, 삭제 후 연결 해제 |
| `GET, POST /api/goals` | 진행률 포함 목록, 생성 |
| `GET, PATCH, DELETE /api/goals/:id` | 상세(연결 주간 계획 포함), 수정, 삭제 후 연결 해제 |

화면: `/login`, `/board/[date]` (`/`는 오늘 날짜로 이동), `/weekly`, `/weekly/[id]`, `/goals`, `/goals/[id]`.

## 5. 구현 단계

### 1단계: 프로젝트 기반

- `git init`, Next.js 스캐폴딩, 린트, Vitest, Playwright 설정
- `.env.example` 작성 (`MONGODB_URI`, `MONGODB_DB`, `APP_PASSWORD`, `SESSION_SECRET`), `.env*.local`은 git 제외
- `src/lib/db.ts`: 재사용 MongoClient, 작은 커넥션 풀
- `scripts/ensure-indexes.ts`: 인덱스 생성
- `doc/claude.md`: 실행 명령과 프로젝트 규칙 기록

완료 기준: `npm run build`, `npm test` 통과, Atlas 연결 확인 스크립트 성공.

### 2단계: 인증

- `src/lib/auth.ts`: 상수 시간 비밀번호 비교, 세션 발급과 검증 (7일 만료)
- `src/proxy.ts`: 미인증 페이지는 `/login`으로, API는 401
- 쿠키: `HttpOnly`, `Secure`(운영), `SameSite=Lax`
- 변경 요청은 `Origin` 검증
- 로그인 실패 5회 시 15분 차단 (`loginAttempts`)

완료 기준: 세션 없는 모든 API가 401, 다른 Origin의 변경 요청이 403, 6번째 실패 시도가 429.

### 3단계: 도메인과 API

- `src/domain/progress.ts`: 주간, 연간 진행률 순수 함수
- `src/domain/schemas.ts`: Zod 스키마
- `src/server/{todos,weeklyPlans,goals}.ts`: 저장소와 집계
- 상위 삭제와 하위 연결 해제는 **MongoDB 트랜잭션**으로 처리
- 존재하지 않는 상위 ID로 연결하면 400
- 오류 응답 형식 통일: `{ error: { code, message } }`

완료 기준: 4개 절의 모든 엔드포인트 통합 테스트 통과.

### 4단계: 일일 보드와 드래그 앤 드롭

- `/board/[date]`: 날짜 이동, 3개 컬럼, 할 일 생성, 수정, 삭제 확인
- 드롭 즉시 낙관적 이동 → `PATCH` → 실패 시 원래 컬럼으로 복귀하고 토스트 표시
- 같은 카드의 연속 드래그는 요청을 순서대로 처리해 마지막 상태가 남도록 보장
- 성공 시 해당 할 일, 주간, 목표 쿼리 무효화

완료 기준: 새로고침 후 상태 유지, API 500을 주입하면 카드가 원위치로 복귀하고 오류 표시.

### 5단계: 주간 계획과 1년 목표

- 목록, 상세, 생성, 수정, 삭제, 상위와 하위 연결 항목 조회 (`doc/prd.md:45-50`)
- 진행률 바와 수치 표시 (`:55`)
- 상위 삭제 확인창에 연결 해제될 하위 항목 수 표시

완료 기준: 7절의 진행률 시나리오 E2E 통과.

### 6단계: 배포

- Atlas 운영 DB 전용 계정 생성 (해당 DB 읽기/쓰기만)
- Vercel 프로젝트 연결, 환경변수 등록, 인덱스 적용
- 미리보기 배포 검증 후 운영 배포 (**운영 배포 전 사용자 확인**)

완료 기준: 운영 URL에서 7절의 스모크 테스트 통과.

## 6. 인수 기준

1. 제목이나 날짜가 없는 할 일은 저장되지 않고 필드 오류가 표시된다.
2. 새 할 일의 기본 상태는 `todo`이고, `todo/doing/done` 외의 값은 API가 400으로 거부한다.
3. 삭제는 확인 후에만 실행되고 진행률이 다시 계산된다.
4. 카드를 다른 컬럼으로 옮기면 상태가 저장되어 새로고침 후에도 유지된다.
5. 저장 실패 시 카드가 원래 컬럼으로 돌아가고 오류가 표시된다.
6. 할 일 4개 중 1개가 `done`이면 주간 진행률은 25%, 2개면 50%이다.
7. 연결된 할 일이 없는 주간 계획은 0%이다.
8. 주간 계획이 100%와 0%이면 연결된 목표는 50%이다.
9. 주간 계획을 삭제하면 연결된 할 일은 남고 `weeklyPlanId`가 null이 된다.
10. 목표를 삭제하면 연결된 주간 계획은 남고 `goalId`가 null이 된다.
11. 로그인하지 않은 요청은 어떤 데이터도 읽거나 변경할 수 없다.
12. `MONGODB_URI`, `APP_PASSWORD`, `SESSION_SECRET`이 클라이언트 번들과 git 이력에 없다.

## 7. 검증

| 수준 | 내용 |
| --- | --- |
| 단위 | 진행률 경계값(0개, 전부 done, 반올림, 연간 평균), Zod 스키마, 세션 검증 |
| 통합 | 전체 API, 삭제 시 연결 해제, 트랜잭션 실패 시 부분 반영 없음, 인증 거부 (복제 세트 모드의 mongodb-memory-server) |
| E2E | 로그인 → 목표 → 주간 계획 → 할 일 → 드래그 → 주간/연간 진행률 → 수정/삭제 → 재계산 |
| E2E 실패 | API 500 주입 시 롤백 |
| 스모크 (운영) | 로그인, 할 일 생성, 드래그, 진행률 반영, 비로그인 API 401, 테스트 데이터 삭제 |
| 정적 | `npm run lint`, `tsc --noEmit`, `npm run build`, 빌드 결과물 비밀값 검색 |

## 8. 위험과 대응

| 위험 | 대응 |
| --- | --- |
| Vercel의 유동 IP 때문에 Atlas 네트워크를 `0.0.0.0/0`으로 열어야 할 수 있음 | 긴 무작위 비밀번호의 전용 DB 계정, 해당 DB 최소 권한, URI는 Vercel 환경변수에만 저장 |
| 앱 비밀번호 무차별 대입 | 로그인 실패 제한, 16자 이상 비밀번호를 시작 시 검증 |
| 서버리스 환경의 연결 수 증가 | 전역 클라이언트 재사용, 작은 `maxPoolSize` |
| Atlas 무료 등급의 용량, 성능 제한과 백업 부재 | 인덱스 적용, 진행률 집계 범위 제한, 필요 시 JSON 내보내기를 후속 작업으로 |
| 빠른 연속 드래그로 상태 역전 | 카드별 요청 직렬화 |
| 날짜의 시간대 밀림 | `YYYY-MM-DD` 문자열 저장, `Asia/Seoul` 기준 |
| 로컬 Node 26과 Vercel 런타임 차이 | `engines`를 Vercel 지원 LTS로 고정, 1단계에서 해당 버전 빌드 확인 |

## 9. 사용자 준비 사항

1. MongoDB Atlas 계정과 무료 클러스터, `MONGODB_URI`
2. Vercel 계정과 로그인 (6단계, 현재 CLI 미설치)
3. 앱 비밀번호 (16자 이상)
