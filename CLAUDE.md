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

## Branch and commit conventions

- Do not push directly to `main`. Use a feature branch.
- Branch naming: `feat/…`, `fix/…`, `chore/…`, `refactor/…`.
- For Paperclip issues, include the issue ID in the branch name and commits when applicable.
- One logical change per PR where possible.

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
