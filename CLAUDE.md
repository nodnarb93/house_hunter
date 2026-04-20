# House Hunter — Repo Context for AI Agents

This file is read by Claude Code, Cursor, and any other agent working in this repo. It describes the stack, conventions, and commands you need to know before making changes.

## Stack

- **Frontend**: Vite + React + TypeScript SPA
- **Backend**: Single Cloudflare Worker (built to `dist/_worker.js`) serving `/api/*` and static assets
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Hosting**: Cloudflare Pages with a Cron Trigger for scheduled runs
- **Testing**: Playwright (E2E, config at `playwright.config.ts`, specs in `qa/`)

## Project purpose

An RSS-based listing scraper that monitors real estate feeds (Redfin, generic RSS/Atom) on a 6-hour cron, filters listings against user-defined presets, and posts matches to a webhook (Discord/Slack).

## Commands you should know
npm install                               # install deps
npm run dev                               # Vite dev server on :5173 (frontend only)
npm run build                             # builds to dist/
npm run pages:dev                         # full local stack on :8788 (build first)
npx playwright test                       # run E2E tests
npx playwright test --reporter=list       # preferred for agent runs (machine-readable)
npx wrangler d1 execute house_hunter_db --local --file=./migrations/<name>.sql
npx wrangler d1 execute house_hunter_db --remote --file=./migrations/<name>.sql

## Branch & commit conventions

- Never push directly to `main`. Always use a feature branch.
- Branch naming: `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- When working on a Paperclip issue, include the issue ID in the branch name and every commit message: `feat/pc-42-scraper-retry`, commit `pc-42: add exponential backoff to fetch loop`.
- One logical change per PR. Do not bundle unrelated fixes.

## Files you must not modify without explicit instruction

- `wrangler.toml` — the `database_id` field is environment-bound; changing it breaks the deploy. Config changes here must be specified by the CTO.
- `migrations/` — migrations are append-only. Never edit an existing migration; always add a new numbered file (`0002_*.sql`, `0003_*.sql`).
- `package-lock.json` — only modify via `npm install <pkg>`, never hand-edit.

## Secrets and environment

- Production secrets live in Cloudflare Pages settings, set via `npx wrangler pages secret put <NAME>`. They are not in the repo.
- Local dev secrets go in `.dev.vars` (Wrangler convention). This file is gitignored. Use stub/test values only.
- Never commit real credentials. If you see what looks like a real key or token in a diff, stop and escalate.

## Testing expectations

- Every feature change should come with at least one Playwright test covering the happy path.
- The QA agent runs `npx playwright test --reporter=list` against the Cloudflare Pages preview URL for the commit. If tests fail there, the ticket fails QA.
- Console errors (uncaught exceptions, 401s, 500s, D1 errors) are test failures by default, even if assertions pass.

## Deploy flow

1. Push to feature branch → Cloudflare Pages builds a preview deploy at a unique URL.
2. QA agent verifies the preview.
3. CTO reviews, Board (human) merges the PR.
4. Merge to `main` → Cloudflare deploys to production.

Agents do not merge to main. Ever.

## Known gotchas

- The Vite dev server on :5173 proxies `/api` to :8788. If :8788 isn't running, API calls fail silently. Always start `npm run pages:dev` in a second terminal when doing full-stack work.
- D1 has separate local and remote databases. Running a migration `--local` does not affect production. Running `--remote` does. Be explicit about which you're targeting.
- Cloudflare Pages preview deploys take 30–90 seconds to build. If QA hits the URL too fast, it'll get a stale version or a 404. Add a retry loop or a short wait if that happens.

## When stuck

If a task cannot be completed because of missing information, missing access, or ambiguous requirements: do not guess. Stop, comment on the Paperclip issue with the specific blocker, and set the issue to `blocked`. Escalation is always preferred to shipping wrong work.