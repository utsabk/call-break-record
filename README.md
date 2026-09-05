# Call Break Scorekeeper

A mobile-first web app for scoring the Nepali card game **Call Break**. One host creates a game,
shares an 8-character code, and players and spectators follow the scoring live from their own devices.

- **Live site:** https://callbreak.kharelutsab.com
- **API:** API Gateway → Lambda → DynamoDB (`eu-west-1`)
- **Hosting:** static Next.js export → S3 → CloudFront → Route 53

---

## Table of contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Prerequisites](#prerequisites)
4. [First-time setup](#first-time-setup)
5. [Local development](#local-development)
6. [Environment variables](#environment-variables)
7. [Domain rules](#domain-rules)
8. [Multi-device model](#multi-device-model)
9. [API reference](#api-reference)
10. [Data model](#data-model)
11. [Deploying the infrastructure](#deploying-the-infrastructure)
12. [Deploying the frontend](#deploying-the-frontend)
13. [Verifying a deployment](#verifying-a-deployment)
14. [Troubleshooting](#troubleshooting)
15. [Conventions](#conventions)

---

## Architecture

```
Browser
  │
  ├── https://callbreak.kharelutsab.com ──> Route 53 ──> CloudFront ──> S3 (static export)
  │
  └── NEXT_PUBLIC_API_BASE_URL ──> API Gateway ──> Lambda ──> DynamoDB
```

Four npm workspaces:

| Workspace  | Purpose                                                                 |
|------------|-------------------------------------------------------------------------|
| `shared`   | Pure domain logic and types. No React, no AWS. Fully unit tested.        |
| `backend`  | Thin Lambda handlers → `GameService` → `GameRepository` (DynamoDB).      |
| `frontend` | Next.js App Router, static export only.                                  |
| `infra`    | AWS CDK. Two stacks.                                                     |

The backend is authoritative: it recalculates every score from stored input and never trusts a
score sent by a client.

---

## Repository layout

```
call-break/
├── shared/src/
│   ├── types.ts          Game, Round, Player, PlayerRound, GameStatus
│   ├── scoring.ts        calculateRoundScore, validateRound, calculateGameTotals
│   ├── settlement.ts     calculateFinalSettlement (base bid + doubling rules)
│   ├── ranking.ts        calculateRankings, hasRankingTie
│   ├── multiplayer.ts    roles, round entries, phase state, view projection
│   └── __tests__/        73 tests
│
├── backend/src/
│   ├── handlers/         one file per API route (12)
│   ├── services/         GameService — all business rules
│   ├── repositories/     GameRepository — DynamoDB access
│   ├── validation/       request validation + ValidationError
│   └── utils/            responses.ts, requestContext.ts
│
├── frontend/src/
│   ├── app/              routes (see below)
│   └── lib/
│       ├── repositories/ ApiGameRepository — the only place fetch() is called
│       ├── hooks/        useGameStore (zustand)
│       └── validation/
│
└── infra/lib/
    ├── index.ts              CDK app entry, reads infra/.env
    ├── CallBreakStack.ts     DynamoDB, Lambda, API Gateway, S3, CloudFront, Route 53
    └── CertificateStack.ts   ACM certificate, pinned to us-east-1
```

**Frontend routes**

| Route            | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `/`              | Home: active game, history, create/join                     |
| `/game/setup`    | Create a game (4 names + base bid)                          |
| `/game/lobby`    | Shows the game code to share after creating                 |
| `/game`          | Redirect to `/game/live` — kept for older links             |
| `/game/live`     | The scoring screen, for host, players and watchers alike    |
| `/game/results`  | Final ranking and settlement                                |
| `/join`          | Enter a code, then join as player or watch                  |

---

## Prerequisites

- Node.js 22 (developed on 22.21.1), npm 10+
- AWS CLI v2, authenticated with a profile that can deploy CloudFormation, Lambda,
  DynamoDB, S3, CloudFront, ACM and Route 53
- AWS CDK v2 (`npx cdk` works; no global install needed)
- Network access at build time — `next/font` downloads fonts during `npm run build`

---

## First-time setup

```bash
git clone <repo> call-break
cd call-break
npm install                 # installs all workspaces
npm run build:shared        # other workspaces import shared/dist
npm test                    # 73 tests should pass
```

`shared` **must** be built before `backend` or `frontend` type-check, because both import
`@call-break/shared` from its compiled `dist/`. The root `npm run build` handles the ordering.

---

## Local development

```bash
# Frontend dev server on http://localhost:3000
npm run dev

# Tests (builds shared first)
npm test
npm test --workspace=@call-break/shared

# Type-check everything
npm run type-check

# Production build of the static site into frontend/out
npm run build --workspace=@call-break/frontend
```

The dev server talks to whichever API `NEXT_PUBLIC_API_BASE_URL` points at — by default the
deployed one. `http://localhost:3000` and `:3001` are already in the API's CORS allow-list.

---

## Environment variables

### `frontend/.env.local`

```bash
NEXT_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.eu-west-1.amazonaws.com/prod
```

Read at **build time** and inlined into the static export. Changing it requires a rebuild and
re-upload — editing it on the server does nothing. Never put secrets in `NEXT_PUBLIC_*`; the
browser can read all of them.

### `infra/.env`

```bash
ENVIRONMENT=prod                          # prod keeps data on stack deletion
DOMAIN_NAME=callbreak.kharelutsab.com     # CloudFront alias + API CORS origin
HOSTED_ZONE_ID=Z01809651YQNR8FJNNIW       # Route 53 zone holding the alias records
HOSTED_ZONE_NAME=                         # optional; defaults to the parent of DOMAIN_NAME
```

Loaded by `infra/lib/index.ts` via `dotenv`. Values can be overridden inline
(`DOMAIN_NAME=... npx cdk deploy`) or with `--context domainName=...`.
`infra/.env` is gitignored; `infra/.env.example` is the committed template.

`ENVIRONMENT=prod` sets `RemovalPolicy.RETAIN` on DynamoDB and the S3 bucket and enables
point-in-time recovery. Those resources survive `cdk destroy` and must be removed by hand.

### Backend (set by CDK, not by you)

`DYNAMODB_TABLE`, `AWS_REGION`.

---

## Domain rules

All rules live in `shared/` as pure functions and are covered by tests. Never duplicate them in
a component or a handler.

### Round scoring

Scores are stored as **integer tenths** to avoid floating-point drift (`4.1` → `41`).

| Case                | Formula                       | Example              |
|---------------------|-------------------------------|----------------------|
| Made the bid        | `bid * 10 + (tricks - bid)`   | bid 4, won 5 → `+4.1`|
| Missed the bid      | `-bid * 10`                   | bid 4, won 3 → `-4.0`|
| Punished            | `-bid * 10` (overrides)       | bid 5, won 7 → `-5.0`|

A round is valid only when all four tricks sum to exactly **13**. Bids are 1–13, tricks 0–13.
Punishment never rewrites the recorded `tricksWon`, so the original entry stays auditable.

### Final settlement

Separate from round scoring. Ranks 2, 3 and 4 pay 1×, 2× and 3× the base bid; the winner
collects the pot.

Two penalties **double** a payment, and they stack:

1. The paying player finished **below zero** (exactly `0.0` is not negative).
2. The winner finished on **20.0 points or more** — then every payment doubles.

Example, base bid 2: 4th place normally pays 6; below zero pays 12; below zero with a
20-point winner pays 24.

The winner's amount is the **sum of what the others actually pay**, not a fixed multiplier.
That is what keeps the settlement at zero once payments double — `verifySettlementBalance`
asserts this in every test.

### Ties

Tied cumulative scores are marked `"TIE"`. The app never invents a winner and never generates a
settlement while a tie is unresolved.

---

## Multi-device model

A game is identified by an 8-character code (alphabet `ABCDEFGHJKLMNPQRTUVWXYZ2346789` —
no `I`, `O`, `S`, `Z`). The code is an **access token, not authentication**: anyone holding it
can watch.

**Roles**

| Role     | Credential                    | Can do                                             |
|----------|-------------------------------|----------------------------------------------------|
| `HOST`   | `X-Host-Token` header         | Enter or correct any value for any seat at any time, score, punish, delete |
| `PLAYER` | `X-Session-Id` header         | Enter their own call and their own tricks, once each |
| `VIEWER` | none (code only)              | Follow along, read-only                            |

- The **host token** is issued once at creation and stored in `localStorage`
  (`call-break:host-token:<gameId>`). It is the only proof of host identity — there is no recovery.
- A **player session** is created by `POST /games/join`, which atomically claims a seat so two
  devices cannot control the same player.

**One screen, three roles.** `/game/live` serves everyone from the same server state. The host
sees an editable field for all four players; a player sees their own field plus everyone else's
values as they arrive; a watcher sees the same board read-only.

**Two phases per round.** A round is assembled incrementally and the phase is derived on the
server, never held in the browser:

1. `BIDDING` — every seat needs a call. Players enter their own; the host enters for anyone who
   has not joined.
2. `TRICKS` — begins automatically once all four calls are in. Same pattern.
3. `COMPLETED` — the host presses *Score round*. The backend recomputes every score from the
   stored entries and enforces the 13-trick rule.

The two steps constrain players, not the host: a player cannot enter tricks before every call is
in, while the host sees a call and a tricks field for all four seats from the start and may fill
a seat in one pass.

**Who wins a conflict.** A player's call stands once made — resubmitting is rejected. The host
may overwrite any value at any time before the round is scored, and may delete the game at any
time. Every value records whether a player or the host supplied it, and the UI says so.

**Visibility.** Calls and tricks are shared with everyone following the game as soon as they are
entered, mirroring a real table where calls are announced aloud. Only values nobody has entered
yet are absent from the payload. Scores stay server-side until the round is completed.

Each entry is written as an individual field update, so a call and a trick count arriving at the
same instant from different devices cannot overwrite each other. Completion is a conditional
DynamoDB write, so simultaneous attempts produce exactly one state transition.

**Live updates** use 3-second polling plus a refresh on window focus. There is no WebSocket.
Text being typed is held locally, so a refresh never overwrites a field mid-edit.

---

## API reference

Base URL: `https://<api-id>.execute-api.eu-west-1.amazonaws.com/prod`

| Method   | Path                                                              | Auth       | Purpose                        |
|----------|-------------------------------------------------------------------|------------|--------------------------------|
| `POST`   | `/games`                                                          | none       | Create a game; returns host token |
| `GET`    | `/games`                                                          | none       | List games                     |
| `POST`   | `/games/join`                                                     | none       | Join as player or viewer       |
| `GET`    | `/games/code/{gameCode}`                                          | optional   | The game view for the caller   |
| `GET`    | `/games/{gameId}`                                                 | none       | Fetch by id                    |
| `DELETE` | `/games/{gameId}`                                                 | host       | Delete a game and everything it owns |
| `PUT`    | `/games/{gameId}/rounds/{n}`                                      | host       | Replace a whole round (legacy) |
| `POST`   | `/games/{gameId}/rounds/{n}/submit`                               | session or host | Set a call, tricks or disqualification |
| `POST`   | `/games/{gameId}/rounds/{n}/reveal`                               | host       | Score the round                |
| `POST`   | `/games/{gameId}/rounds/{n}/players/{playerId}/punishment`        | host       | Apply punishment               |
| `DELETE` | `/games/{gameId}/rounds/{n}/players/{playerId}/punishment`        | host       | Remove punishment              |
| `POST`   | `/games/{gameId}/complete`                                        | host       | Finish the game                |

`submit` takes any subset of `{ playerId, bid, tricksWon, punished }`. A player may omit
`playerId` — the seat comes from their session, so nobody can enter a score for someone else.
Only the host may pass `playerId` or `punished`.

The `reveal` path keeps its original name because it is already wired in API Gateway; it now
scores the round rather than lifting a curtain on hidden values.

Responses are always `{ success, data }` or `{ success, error: { message, code } }`.

Allowed CORS headers: `Content-Type`, `Authorization`, `X-Host-Token`, `X-Session-Id`.
Allowed origins: `http://localhost:3000`, `http://localhost:3001`, the CloudFront domain, and
`DOMAIN_NAME`.

---

## Data model

Single DynamoDB table, `PK` / `SK`:

| Item        | PK               | SK                        | Notes                                  |
|-------------|------------------|---------------------------|----------------------------------------|
| Game        | `GAME#<gameId>`  | `METADATA#<gameId>`       | players, rules, rounds, hostToken      |
| Seat claim  | `GAME#<gameId>`  | `SEAT#<playerId>`         | conditional write prevents double-claim|
| Session     | `GAME#<gameId>`  | `SESSION#<sessionId>`     | role + playerId                        |
| Round entry | `GAME#<gameId>`  | `SUB#<round>#<playerId>`  | optional `bid` / `tricksWon` + source  |

A round entry is one item per player per round, updated field by field. `bidSource` and
`tricksSource` record whether the value came from the player or the host.

**Retention.** Every item carries an `expiresAt` epoch-second attribute and the table has TTL
enabled, so a game is removed roughly 24 hours after it was created. DynamoDB deletes on a
best-effort basis — usually promptly, but AWS only guarantees within 48 hours of expiry. Items
written before TTL was introduced have no `expiresAt` and will not be collected.

Deleting a game removes every item in its partition, not just the metadata row.

**Reads.** A game is resolved by code through `GameCodeIndex` to get its id, then read from the
base table with a consistent read. Reading the whole game from the index would serve a stale
copy for a moment after each write.

**Indexes:** `GameCodeIndex` (join by code), `StatusIndex`, `AllGamesIndex` (list).

---

## Deploying the infrastructure

Two stacks. `CallBreakCertificateStack` lives in `us-east-1` because CloudFront only accepts
certificates from that region; `CallBreakStack` lives in `eu-west-1`. They are linked with
`crossRegionReferences`.

```bash
cd infra
export AWS_PROFILE=nc-sandbox

# First time in a fresh account/region only
npx cdk bootstrap aws://<account-id>/eu-west-1
npx cdk bootstrap aws://<account-id>/us-east-1

npx cdk diff --all        # review changes first
npx cdk deploy --all      # certificate stack first, then the main stack
```

Use `--all`. Deploying only `CallBreakStack` can leave the certificate stack out of sync.

Backend Lambda code is bundled from TypeScript source by `NodejsFunction` (esbuild) during
`cdk deploy` — there is no separate backend deploy step.

Useful outputs after deploy: `APIURL`, `FrontendURL`, `SiteURL`, `GamesTableName`.

**Notes**

- Certificate validation can pause the deploy for several minutes while DNS propagates.
- CDK owns the `A` and `AAAA` alias records. Manually created records for the same name will
  cause a conflict — delete them before the first deploy.
- CloudFront allows only one viewer-certificate change at a time; if a previous change is still
  propagating the deploy fails, and retrying once the distribution reports `Deployed` succeeds.

---

## Deploying the frontend

The static export is **not** uploaded by CDK. Build and sync it yourself.

```bash
cd frontend
npm run build              # writes frontend/out

export AWS_PROFILE=nc-sandbox
export AWS_REGION=eu-west-1

export FRONTEND_BUCKET=$(aws cloudformation describe-stack-resources \
  --stack-name CallBreakStack \
  --region "$AWS_REGION" \
  --query 'StackResources[?ResourceType==`AWS::S3::Bucket`].PhysicalResourceId' \
  --output text)

export DISTRIBUTION_ID=$(aws cloudformation describe-stack-resources \
  --stack-name CallBreakStack \
  --region "$AWS_REGION" \
  --query 'StackResources[?ResourceType==`AWS::CloudFront::Distribution`].PhysicalResourceId' \
  --output text)

# Hashed assets first, so newly uploaded HTML never points at files that are missing.
aws s3 sync out/ "s3://$FRONTEND_BUCKET" --exclude "*.html" \
  --cache-control "public,max-age=31536000,immutable"

# HTML must revalidate, otherwise browsers keep serving a previous deploy.
aws s3 sync out/ "s3://$FRONTEND_BUCKET" --delete --exclude "*" --include "*.html" \
  --cache-control "no-cache"

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*'
```

A plain `aws s3 sync out/ "s3://$FRONTEND_BUCKET" --delete` also works, but the two-step order
above avoids the window where a cached `index.html` references a hashed asset that `--delete`
has already removed.

Deploy the backend **before** the frontend when a change touches `shared/`, so the API is never
older than the site calling it.

---

## Verifying a deployment

```bash
API=https://<api-id>.execute-api.eu-west-1.amazonaws.com/prod

# CORS preflight for the real origin
curl -s -i -X OPTIONS "$API/games" \
  -H "Origin: https://callbreak.kharelutsab.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin

# The site serves current HTML
curl -s https://callbreak.kharelutsab.com/ | grep -o '/_next/static/css/[^"]*\.css' | head -1
```

The returned `access-control-allow-origin` must echo the origin you sent. If it returns a
different origin, that origin is not in the allow-list and the browser will block the request.

---

## Troubleshooting

**"Unable to reach the game server" in the browser, but `curl` works.**
A CORS rejection. Either the origin is missing from `allowOrigins` in `CallBreakStack.ts`, or
the route is not wired in API Gateway — an unwired path returns `403 Missing Authentication
Token`, and API Gateway's own error responses would carry no CORS headers. `DEFAULT_4XX` and
`DEFAULT_5XX` gateway responses now add them, so the real error surfaces instead.

**Styling missing / page looks like plain HTML.**
Historically caused by a stale service worker serving old HTML that referenced a deleted CSS
hash. The service worker has been removed. If a browser still has one registered, clear it via
DevTools → Application → Storage → Clear site data. A CloudFront invalidation cannot remove a
service worker; it only clears the edge cache.

**Fonts not applied.**
Fonts are loaded through `next/font` and self-hosted. Do not add `@import url(...)` to
`globals.css` — an `@import` after the `@tailwind` directives is ignored by browsers, which
silently drops the fonts.

**A direct load or refresh of a nested route shows the home page.**
The export writes every route as `<route>/index.html`, but S3 behind an origin access identity
serves no directory index, so `/game/results/` 404s — and the 404 → `/index.html` error mapping
turns that into the home page with status 200. A CloudFront viewer-request function rewrites
directory-style paths to their `index.html`. Clicking a link in the app hides the problem,
because that is client-side routing with no origin request.

**A finished game still looks unfinished, then fixes itself minutes later.**
A stale read from a global secondary index. Resolve the code to an id through the index, then
read the game from the base table with `ConsistentRead`.

**A game vanished overnight.**
Expected. Table TTL removes each game about 24 hours after it was created.

**"Only the host can change this game" (403).**
That browser has no host token for the game. Tokens live in `localStorage` on the creating
device and are not transferable.

**"Only one viewer certificate change may be in progress."**
Wait until the CloudFront distribution reports `Deployed`, then redeploy.

**A Tailwind `@apply` fails on a CSS-variable colour.**
Opacity modifiers such as `ring-[var(--primary)]/20` are not supported. Use a dedicated token
(`--focus-ring`) holding an `rgba()` value.

**`Cannot find module '@call-break/shared'`.**
Run `npm run build:shared`.

---

## Conventions

- Scoring, settlement and ranking live in `shared/` as pure functions. UI and handlers call
  them; they never reimplement them.
- The backend recalculates scores from stored input. A client-supplied score is never trusted.
- Round phase is derived on the server from stored entries. The browser never decides which
  phase a round is in.
- What each role may see is decided in `createGameView()`, not in the UI. Entered calls and
  tricks are shared with everyone; the server still decides that, and a component never receives
  a value it is meant to hide.
- Derived values (totals, rankings, settlement) are computed from round data, never stored as
  the source of truth.
- Strict TypeScript everywhere. No `any`.
- Components never call `fetch` directly — everything goes through `ApiGameRepository`.
- Status is never conveyed by colour alone; pair it with text or an icon.
- Frontend must remain statically exportable: no server components doing I/O, no API routes,
  no server actions.
