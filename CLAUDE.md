# House Hunter — Repo Context for AI Agents

This file is read by Claude Code, Cursor, and other agents working in the repo. It describes the stack, conventions, and commands you need before making changes.

## Stack

- **Frontend**: Vite + React + TypeScript SPA (`src/`)
- **Backend**: Node.js + Hono (`server/`) — single HTTP server for `/api/*` and static files from `dist/` after build
- **Database**: SQLite via **better-sqlite3** (default file `data/house_hunter.sqlite`). Migrations in `migrations/` run on startup.
- **Scheduling**: **node-cron** in-process while the server runs; reads `schedule` (interval + active). **`npm run scrape`** for one-shot / external cron.
- **Testing**: Playwright (`playwright.config.ts`, specs in `qa/`) against the local server (`npm start`).

## Project purpose

An RSS-based listing scraper that monitors feeds (Redfin, generic RSS/Atom), filters listings against user-defined presets, and posts matches to a webhook (Discord/Slack).

## Commands

```text
npm install              # dependencies
npm run dev              # Vite only, :5173
npm run server:dev       # API + static (after build) with watch, :3001
npm start                # vite build + Node server on :3001
npm run build            # Vite production build → dist/
npm run scrape           # one full pipeline run, then exit
npm test                 # Playwright
npm run test:list        # Playwright, list reporter
```

## Git Workflow

**Agents operating in this repository MUST follow this branch policy:**

- **Coder agents**: Only push to feature branches. Branch naming: `feat/BIZ-N-short-description` where N is the Paperclip issue number. NEVER push to main directly. Commit messages must reference the issue ID (e.g., "feat: implement X per BIZ-9").
- **CTO agent**: Has authority to merge feature branches to main via `git merge` and `git push origin main` after QA has verified the work. CTO should delete the feature branch after merging (`git push origin --delete feat/BIZ-N-...` and `git branch -d feat/BIZ-N-...`).
- **QA agent**: Does not commit. Ever. QA only reads, runs tests, and reports.
- **Human (Board)**: May push directly to main for emergency fixes or doc-only changes. Expected to use this authority sparingly; prefer the pipeline when feasible.

This policy is enforced through agent instructions (each agent's [AGENTS.md](AGENTS.md) describes its git boundaries). It is not enforced at the git permission level since all agents share a single GitHub PAT. A pre-push hook safety net is a planned future enhancement.

**All tests must pass before any merge to main.** No skipping tests. No commenting out failing tests. If a test is wrong, fix the test via the normal pipeline; don't bypass it.

## Files you must not modify without explicit instruction

- `migrations/` — append-only. Never edit an existing migration; add a new numbered file (`0002_*.sql`, …).
- `package-lock.json` — only change via `npm install`, never hand-edit.

## Secrets and environment

- Configure webhooks and app data through the UI; persisted in SQLite.
- Use `.env` / shell env for `PORT`, `DATABASE_PATH`, `DISABLE_SCHEDULED_SCRAPES` as documented in `README.md`.
- Never commit real credentials.

## Testing expectations

- Meaningful feature changes should include or update Playwright coverage for the happy path when practical.
- `npm run test:list` is preferred for CI-style output.
- Console errors (uncaught exceptions, 5xx on navigation) should be treated as failures when writing tests.

## Local full-stack notes

- Vite on :5173 proxies `/api` to :3001. For UI work against a live API, run **`npm run server:dev`** (and **`npm run build`** once if you need the SPA served from the Node app instead of Vite).
- Playwright starts **`npm start`** with `DISABLE_SCHEDULED_SCRAPES=1` so the scraper does not run in the background during tests.

## When stuck

If a task cannot be completed because of missing information or ambiguous requirements, do not guess. Document the blocker and escalate.
