# Project status

Current state of the application, kept short. Setup, deployment and troubleshooting live in
`README.md`. Rules for AI agents live in `AGENTS.md`.

## Done

**Domain (`shared/`)** — 73 passing tests
- Round scoring in integer tenths, punishment override, round validation (tricks total 13)
- Settlement with base bid, below-zero doubling, 20-point winner doubling, always nets to zero
- Ranking with explicit tie detection (never invents a winner)
- Multi-device roles, two-phase round entries, derived phase state, view projection

**Backend (`backend/`)** — 12 Lambda handlers
- Create / read / list / delete games, game codes with collision retry
- Per-field round entries from players or the host, punishment, round scoring, completion
- Join with atomic seat claiming
- Consistent reads by game code; deleting a game clears its whole partition
- DynamoDB single-table design with conditional writes for concurrency
- 24-hour retention through table TTL

**Frontend (`frontend/`)** — static export
- Home with active game and history, game setup, lobby with shareable code
- One live scoring screen shared by host, players and watchers, with 3-second polling
- Players enter their own call and tricks; the host can correct anything and scores the round
- Host can abandon a game mid-scoring
- Ranked standings, results with base bid and final settlement, dark mode

**Infrastructure (`infra/`)**
- DynamoDB, Lambda, API Gateway, S3, CloudFront, ACM certificate, Route 53 alias records
- CloudFront function rewriting directory paths so nested routes load directly
- Custom domain live at https://callbreak.kharelutsab.com

## Not done

- **No automated tests for backend handlers or frontend components.** Only `shared/` is covered.
  Authorisation and the entry priority rules are the biggest untested gap.
- **No CI pipeline.** Build, test and deploy are all manual.
- **No E2E tests.** The multi-device flow has never been exercised by an automated browser test.
- **Realtime is 3-second polling**, not WebSockets.
- **No authentication.** The game code is a shareable access token, by design for V1.
- **Calls are public once entered.** A late bidder can see earlier calls. This matches a real
  table, where calls are announced aloud, but it is a deliberate change from the earlier blind
  bidding and is not configurable.
- **TTL cleanup is best-effort.** DynamoDB usually deletes promptly but only guarantees within
  48 hours of expiry, and games created before TTL existed are never collected.
- **Frontend deploy is manual** (`npm run build` + `s3 sync` + invalidation); CDK does not
  upload the site.
- **`PUT /rounds/{n}` is unused.** The old whole-round replacement endpoint is still wired.
- **Duplicate ACM certificates** may exist in `us-east-1` from earlier manual attempts; only the
  CDK-managed one is referenced.

## Suggested next steps

1. Add handler-level tests for authorisation and the player/host entry priority rules.
2. Add a GitHub Actions workflow: install → build shared → test → build frontend.
3. Retire `PUT /rounds/{n}` once nothing depends on it.
4. Consider replacing polling with WebSockets if round entry starts to feel laggy.
