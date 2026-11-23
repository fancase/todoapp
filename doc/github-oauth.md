# GitHub OAuth 로그인 설정 가이드

앱은 GitHub OAuth(authorization code flow)로 로그인합니다. 로그인한 사용자는 자기 데이터만 볼 수 있습니다.

## 1. GitHub OAuth App 만들기

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**

| 항목 | 로컬 개발 | 운영(Vercel) |
| --- | --- | --- |
| Homepage URL | `http://localhost:3000` | `https://<운영 도메인>` |
| Authorization callback URL | `http://localhost:3000/auth/github/callback` | `https://<운영 도메인>/auth/github/callback` |

- 로컬과 운영은 **OAuth App을 따로** 만드세요. App 하나에는 callback URL이 하나만 등록됩니다.
- 만든 뒤 **Client ID**를 복사하고 **Generate a new client secret**으로 시크릿을 발급합니다. 시크릿은 발급 직후에만 전체가 보입니다.

## 2. 환경변수

`.env.local`(로컬) 또는 Vercel 환경변수(운영)에 넣습니다. 값은 코드나 git에 두지 않습니다.

| 이름 | 설명 |
| --- | --- |
| `GITHUB_CLIENT_ID` | OAuth App의 Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App의 Client secret (서버에서만 사용, 클라이언트 번들에 포함되지 않음) |
| `SESSION_SECRET` | 세션 쿠키 서명용 32자 이상 임의 문자열 |
| `APP_URL` | 선택. 앱의 공개 주소. 비우면 요청 주소를 사용 |

Vercel에 넣을 때:

```
vercel env add GITHUB_CLIENT_ID production
vercel env add GITHUB_CLIENT_SECRET production --sensitive
```

### 주의

- `APP_URL`을 설정했다면 사용자는 반드시 그 주소로 접속해야 합니다. 다른 주소(예: `*.vercel.app` 기본 도메인)로 열면 로그인 쿠키가 다른 도메인에 저장되어 `?error=state`가 납니다.
- Vercel 미리보기 배포는 주소가 매번 달라 등록한 callback URL과 맞지 않으므로 GitHub 로그인이 되지 않습니다. 미리보기용 OAuth App을 따로 두거나 미리보기에서는 로그인을 쓰지 않습니다.
- `GITHUB_URL`, `GITHUB_API_URL`은 테스트용 가짜 GitHub 주소를 위한 값입니다. 실제 배포에서는 비워 두세요. 값이 있으면 클라이언트 시크릿이 그 주소로 전송됩니다.

## 3. 인덱스와 기존 데이터

첫 로그인 **전에** 먼저 실행하세요. `githubId` 고유 인덱스가 있어야 첫 로그인이 동시에 들어와도 사용자가 중복 생성되지 않고, 세션 TTL 인덱스가 있어야 만료된 세션이 자동으로 지워집니다.

```
npm run db:indexes
```

로그인 기능이 생기기 전에 만든 할 일·주간 계획·목표에는 소유자(`userId`)가 없어서 아무에게도 보이지 않습니다.
본인 GitHub 계정으로 **한 번 로그인한 뒤** 아래 명령으로 소유자를 지정하세요.

```
npm run db:migrate-user -- <github-username> --dry-run   # 건수만 확인
npm run db:migrate-user -- <github-username>             # 실제 반영
```

- 이미 소유자가 있는 데이터는 건드리지 않아서 여러 번 실행해도 결과가 같습니다.
- 해당 사용자가 아직 로그인한 적이 없으면 아무것도 바꾸지 않고 실패합니다.

## 4. 동작 방식

- `GET /auth/github`: 무작위 `state`를 HttpOnly 쿠키(10분)에 저장하고 GitHub 승인 화면으로 보냅니다.
- `GET /auth/github/callback`: `state`가 쿠키와 같을 때만 `code`를 토큰으로 교환하고, `username`과 `avatar_url`을 읽어 `users`에 저장합니다. GitHub 액세스 토큰은 저장하지 않습니다.
- 세션은 서버(`sessions` 컬렉션)에 저장되고 쿠키에는 서명된 참조만 있습니다. 로그아웃하면 서버의 세션이 삭제되어 쿠키를 복사해 둔 사람도 더 이상 쓸 수 없습니다. 세션은 7일 뒤 자동 만료됩니다.
