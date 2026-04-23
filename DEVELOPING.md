# Developing House Hunter

Hard-won setup notes for developers and AI agents, especially in the Paperclip Docker environment. If something here drifts from the code or infra, update this file in the same change.

## Running the app locally

- The app listens on port **3001** (Node + Hono server; `vite build` writes the frontend to `dist/`, one process serves API and static assets).
- **`npm start`** is the canonical run command (`vite build` then `tsx server/index.ts`).
- Playwright’s `playwright.config.ts` uses `http://localhost:3001`, starts the app with **`npm start`** via `webServer`, and points tests at that URL.
- **`PORT` must be `3001`** for Playwright and local parity. It is set explicitly in `playwright.config.ts` so container or host environments that export a different `PORT` do not break the test server URL.

## Paperclip container specifics

If you run inside the Paperclip Docker container at `/paperclip/workspaces/house_hunter`, these apply:

- **`node_modules` is a Docker-managed volume**, not a bind mount, so dependencies are Linux-native regardless of the host OS.
- If **`npm install` installs only ~50 packages and `vite` is missing**, the environment likely has `NODE_ENV=production` (or similar), which skips devDependencies. Use **`npm install --include=dev`** to install devDependencies.
- **Prefer the `node` user** (e.g. `docker exec -u node -it paperclip-server-personal bash`). Running as **root** creates files the `node` user cannot edit later.
- **`EACCES` on `test-results/` or other paths** usually means a prior root run left root-owned files. Fix: `chown -R node:node /paperclip/workspaces/house_hunter`.

## Git line endings

- The repo enforces **LF** via `.gitattributes` (`* text=auto eol=lf`).
- In the container, git is typically configured with **`core.autocrlf=false`** and **`core.filemode=false`** to avoid noisy diffs.
- If **the entire repo shows as modified**, it is often a CRLF issue — run **`git reset --hard HEAD`** to normalize (drops uncommitted changes).

## Git push from the container (for agents)

- The container sets **`GIT_ASKPASS=/usr/local/bin/git-askpass-github`**.
- That helper reads **`$GITHUB_TOKEN`** (often injected from the host `.env` through docker-compose) and supplies it as the password for HTTPS Git.
- **Username** for HTTPS is handled via URL rewrite (e.g. `https://github.com/` → `https://x-access-token@github.com/`) so pushes are non-interactive.
- **`git push`** should not prompt. A **“Username for 'https://github.com'”** prompt usually means **`GITHUB_TOKEN` is missing, empty, or invalid**.

## Testing

- **`npm test`** runs the full Playwright suite.
- **`npm run test:list`** uses a list reporter (better for agents parsing output).
- Tests live under **`qa/`**.
- Playwright **starts the app** with `npm start`, **waits for** `http://localhost:3001`, runs tests, then tears down the server process.
- **`DISABLE_SCHEDULED_SCRAPES=1`** is set on the Playwright `webServer` env so the scheduler does not run during tests.

## Scheduler

- **`server/scheduler.ts`** uses **node-cron** with a **once-per-minute** job to read the schedule row and decide whether to run.
- When **`active`** is enabled and **`interval_hours`** has elapsed since the last run, it calls **`runAllPresets`** inline (with a re-entrancy guard so overlapping runs do not stack).
- For **external** scheduling (OS cron, Task Scheduler, etc.), use **`npm run scrape`** for a one-shot pipeline run instead of relying on the in-process scheduler.
