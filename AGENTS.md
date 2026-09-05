# AGENTS.md

Operating guide for AI agents working in this repository. Read this before changing code.
`README.md` holds the full human documentation — setup, deployment, troubleshooting.

## What this is

Call Break scorekeeper. npm workspaces monorepo: `shared` (domain), `backend` (Lambda),
`frontend` (static Next.js), `infra` (CDK). Deployed to AWS at
https://callbreak.kharelutsab.com.

## Commands that matter

```bash
npm install
npm run build:shared     # REQUIRED before backend/frontend type-check
npm test                 # 73 tests in shared/
npm run build            # all workspaces, correct dependency order
npm run build --workspace=@call-break/frontend    # static export to frontend/out
cd infra && npx cdk synth                          # validate infra without deploying
```

Verify a change with the narrowest command that proves it, then the build. Do not deploy to AWS
unless the user explicitly asks — `cdk deploy` and `s3 sync` affect live infrastructure.

## Architecture invariants

These are load-bearing. Breaking one causes subtle, hard-to-trace bugs.

1. **Domain logic lives in `shared/` as pure functions.** `scoring.ts`, `settlement.ts`,
   `ranking.ts`, `multiplayer.ts`. No React, no AWS, no browser APIs. Components and handlers
   call them; they never reimplement a formula.
2. **Scores are integer tenths.** `4.1` is stored as `41`. Never use floats for scores.
3. **The backend is authoritative.** It recalculates scores from stored bid/tricks. Never trust
   a score from a client.
4. **Derived values are never stored as truth.** Totals, rankings and settlement are always
   recomputed from round data. Round phase is likewise derived from stored entries — never keep
   it in component state or `localStorage`.
5. **The server decides what each role sees.** `createGameView()` builds the payload. Entered
   calls and tricks are shared with everyone by design; unentered values are simply absent.
   Never send a value you intend to hide in the UI.
6. **A seat comes from the session, never the request body.** Only the host may pass a
   `playerId` or set `punished`.
7. **The frontend must stay statically exportable.** `output: "export"`. No server components
   doing I/O, no API routes, no server actions, no middleware.
8. **All HTTP goes through `ApiGameRepository`.** Components never call `fetch` directly.

## Where things live

| Task                              | File                                                    |
|-----------------------------------|---------------------------------------------------------|
| Change scoring or settlement math | `shared/src/scoring.ts`, `shared/src/settlement.ts`      |
| Change round phase or visibility  | `shared/src/multiplayer.ts` (`getRoundPhase`, `createGameView`) |
| Change who may enter what         | `backend/src/services/GameService.ts` (`setRoundEntry`)  |
| Add/modify a business rule        | `backend/src/services/GameService.ts`                    |
| Add an API endpoint               | `backend/src/handlers/*.ts` **and** wire it in `infra/lib/CallBreakStack.ts` |
| Change persistence                | `backend/src/repositories/GameRepository.ts`             |
| Change AWS resources              | `infra/lib/CallBreakStack.ts`                            |
| Design tokens / theme             | `frontend/src/app/globals.css`                           |
| The scoring screen (all roles)    | `frontend/src/app/game/live/page.tsx`                    |
| Client API calls, tokens, session | `frontend/src/lib/repositories/ApiGameRepository.ts`     |

## Domain rules (do not change without being asked)

- Made bid: `bid * 10 + (tricks - bid)`. Missed bid: `-bid * 10`. Punished: `-bid * 10`.
- Tricks across four players must total exactly 13. Bids 1–13, tricks 0–13.
- Settlement: ranks 2/3/4 pay 1×/2×/3× base bid; winner collects the **sum of what others pay**.
- Payments double if the payer finished **below zero** (0.0 is not negative), and double again
  if the winner finished on **20.0+**. The two stack.
- Settlement must always net to zero — assert with `verifySettlementBalance`.
- Ties are marked `"TIE"`. Never invent a winner or settle an unresolved tie.
## How a round is filled

`BIDDING` → `TRICKS` → `COMPLETED`, derived by `getRoundPhase` from stored entries.

- Bidding ends when all four seats have a call, whoever entered it.
- A player enters only their own value, only once, and cannot enter tricks before every call is in.
- The host may enter or correct any value for any seat at any point before the round is scored,
  and is not held to the two-step order.
- The host may delete the game at any time, finished or not.
- The host scores the round; the backend recomputes from stored entries and enforces 13 tricks.
- `/game/live` serves host, player and watcher from the same state. Do not add a second scoring
  screen — that split is exactly what caused host and players to drift out of sync before.
## Traps discovered the hard way

Each of these cost real debugging time. Check them before re-diagnosing.

- **Adding an endpoint to the backend alone does nothing.** It must be wired in
  `CallBreakStack.ts`. An unwired path returns `403 Missing Authentication Token`, and because
  API Gateway's own errors historically lacked CORS headers, the browser reported it as a CORS
  failure. `DEFAULT_4XX`/`DEFAULT_5XX` gateway responses now carry CORS headers.
- **A direct load of a nested route returning the home page is not a routing bug.** S3 behind an
  origin access identity serves no directory index, so `/game/results/` 404s and the
  404 → `/index.html` mapping renders home with status 200. A CloudFront viewer-request function
  rewrites directory paths to `index.html`. Clicking a link hides this, because that is
  client-side routing with no origin request.
- **Never read a whole game from a global secondary index.** The index lags writes, so a
  finished game comes back looking unfinished for a moment. Resolve the code to an id via
  `GameCodeIndex`, then read the base table with `ConsistentRead`.
- **Round phase must not live in the browser.** It was once a `localStorage` draft on the host
  screen, which is why player entries never reached the host.
- **Deleting a game must clear the whole partition.** Seats, sessions and entries are separate
  items and will outlive the metadata row otherwise.
- **"CORS error" in the browser is usually not CORS.** Reproduce with `curl -X OPTIONS` and a
  real `Origin` header first. If the returned `access-control-allow-origin` does not echo your
  origin, the origin is missing from `allowOrigins`.
- **New request headers need adding to `allowHeaders`.** `X-Host-Token` and `X-Session-Id` are
  already there; anything new must be added or preflight fails.
- **`@import` in `globals.css` after `@tailwind` is silently ignored** by browsers. Fonts use
  `next/font` for this reason. Do not reintroduce a CSS font import.
- **Tailwind cannot apply opacity to a CSS variable** — `ring-[var(--primary)]/20` fails the
  build. Use a token holding an `rgba()` value.
- **`sessionStorage` dies with the tab.** Host tokens and sessions belong in `localStorage`.
- **CloudFront rewrites 404 → `index.html` with status 200.** A "missing" asset returns HTML,
  which produces confusing MIME errors rather than a clean 404.
- **Never reintroduce a service worker** without a retirement plan. A cache-first worker
  serving stale HTML that references deleted hashed assets caused an unstyled site, and a
  CloudFront invalidation cannot remove a registered worker.
- **`shared` must be built first.** Otherwise `Cannot find module '@call-break/shared'`.
- **`ENVIRONMENT=prod` sets `RETAIN`** on DynamoDB and S3. Those resources survive
  `cdk destroy`.
- **Games self-destruct after 24 hours** via table TTL. A game missing the next day is expected,
  not a bug.

## Code style

- Strict TypeScript. No `any`.
- Comments explain *why*, only where the code cannot. No narration of what the next line does.
- Errors shown to users are plain language and actionable — say what is wrong and how to fix
  it, never expose raw AWS errors.
- Accessibility: never signal status with colour alone; label inputs; keep touch targets large.
- Mobile-first — score entry must be fast on a phone.

## Testing

`shared/src/__tests__/` is the meaningful suite (73 tests): scoring, settlement, ranking,
schemas, round phase and game view. Any change to a domain rule needs a test. Backend handlers and
frontend components currently have no automated coverage — verify those changes by building and,
where useful, by exercising the deployed API with `curl`.
