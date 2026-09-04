# Project status

Current state of the application, kept short. Setup, deployment and troubleshooting live in
`README.md`. Rules for AI agents live in `AGENTS.md`.

## Done

**Domain (`shared/`)** — 67 passing tests
- Round scoring in integer tenths, punishment override, round validation (tricks total 13)
- Settlement with base bid, below-zero doubling, 20-point winner doubling, always nets to zero
- Ranking with explicit tie detection (never invents a winner)
- Multi-device roles, per-player submissions, reveal state, server-side redaction

**Backend (`backend/`)** — 12 Lambda handlers
- Create / read / list / delete games, game codes with collision retry
- Host-authorised round entry, punishment, completion
- Join with atomic seat claiming, per-player submit, host reveal
- DynamoDB single-table design with conditional writes for concurrency

**Frontend (`frontend/`)** — static export
- Home with active game and history, game setup, lobby with shareable code
- Single-device scoring with live score preview and trick-total validation
- Multi-device live screen: private entry, submission status, host reveal, connection status
- Ranked standings, results with final settlement, dark mode

**Infrastructure (`infra/`)**
- DynamoDB, Lambda, API Gateway, S3, CloudFront, ACM certificate, Route 53 alias records
- Custom domain live at https://callbreak.kharelutsab.com

## Not done

- **No version control.** The working tree is not a git repository. This is the highest-priority
  gap: there is no history, no rollback and no diffing.
- **No automated tests for backend handlers or frontend components.** Only `shared/` is covered.
- **No CI pipeline.** Build, test and deploy are all manual.
- **No E2E tests.** The multi-device flow has never been exercised by an automated browser test.
- **Realtime is 4-second polling**, not WebSockets.
- **No authentication.** The game code is a shareable access token, by design for V1.
- **Frontend deploy is manual** (`npm run build` + `s3 sync` + invalidation); CDK does not
  upload the site.
- **Two scoring surfaces coexist**: `/game` (single device) and `/game/live` (multi device).
  They share the domain layer but are separate UIs.
- **Duplicate ACM certificates** may exist in `us-east-1` from earlier manual attempts; only the
  CDK-managed one is referenced.

## Suggested next steps

1. `git init`, commit, and push to a remote.
2. Add handler-level tests for authorisation and redaction.
3. Add a GitHub Actions workflow: install → build shared → test → build frontend.
4. Decide whether `/game` and `/game/live` should merge into one experience.
