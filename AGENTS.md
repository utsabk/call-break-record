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
npm test                 # 67 tests in shared/
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
   recomputed from round data.
5. **Redaction happens on the server.** `createGameView()` strips other players' bids and tricks
   before reveal. Never send private values and hide them in the UI.
6. **The frontend must stay statically exportable.** `output: "export"`. No server components
   doing I/O, no API routes, no server actions, no middleware.
7. **All HTTP goes through `ApiGameRepository`.** Components never call `fetch` directly.

## Where things live

| Task                              | File                                                    |
|-----------------------------------|---------------------------------------------------------|
| Change scoring or settlement math | `shared/src/scoring.ts`, `shared/src/settlement.ts`      |
| Change what a role may see        | `shared/src/multiplayer.ts` (`createGameView`)           |
| Add/modify a business rule        | `backend/src/services/GameService.ts`                    |
| Add an API endpoint               | `backend/src/handlers/*.ts` **and** wire it in `infra/lib/CallBreakStack.ts` |
| Change persistence                | `backend/src/repositories/GameRepository.ts`             |
| Change AWS resources              | `infra/lib/CallBreakStack.ts`                            |
| Design tokens / theme             | `frontend/src/app/globals.css`                           |
| Client API calls, tokens, session | `frontend/src/lib/repositories/ApiGameRepository.ts`     |

## Domain rules (do not change without being asked)

- Made bid: `bid * 10 + (tricks - bid)`. Missed bid: `-bid * 10`. Punished: `-bid * 10`.
- Tricks across four players must total exactly 13. Bids 1–13, tricks 0–13.
- Settlement: ranks 2/3/4 pay 1×/2×/3× base bid; winner collects the **sum of what others pay**.
- Payments double if the payer finished **below zero** (0.0 is not negative), and double again
  if the winner finished on **20.0+**. The two stack.
- Settlement must always net to zero — assert with `verifySettlementBalance`.
- Ties are marked `"TIE"`. Never invent a winner or settle an unresolved tie.

## Traps discovered the hard way

Each of these cost real debugging time. Check them before re-diagnosing.

- **Adding an endpoint to the backend alone does nothing.** It must be wired in
  `CallBreakStack.ts`. An unwired path returns `403 Missing Authentication Token`, and because
  API Gateway's own errors historically lacked CORS headers, the browser reported it as a CORS
  failure. `DEFAULT_4XX`/`DEFAULT_5XX` gateway responses now carry CORS headers.
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

## Code style

- Strict TypeScript. No `any`.
- Comments explain *why*, only where the code cannot. No narration of what the next line does.
- Errors shown to users are plain language and actionable — say what is wrong and how to fix
  it, never expose raw AWS errors.
- Accessibility: never signal status with colour alone; label inputs; keep touch targets large.
- Mobile-first — score entry must be fast on a phone.

## Testing

`shared/src/__tests__/` is the meaningful suite (67 tests): scoring, settlement, ranking,
schemas, multiplayer redaction. Any change to a domain rule needs a test. Backend handlers and
frontend components currently have no automated coverage — verify those changes by building and,
where useful, by exercising the deployed API with `curl`.
