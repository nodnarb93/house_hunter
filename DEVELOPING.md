# Developing House Hunter

Hard-won setup notes for developers and AI agents, especially in the Paperclip Docker environment. If something here drifts from the code or infra, update this file in the same change.

## Agent Pipeline Conventions

This repo is operated by an agent pipeline (see [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) for the full architecture). The notes below are the operational details every agent and human contributor needs.

### Branch policy

- **CTO** may push directly to `main` after QA has reported `PASS`. CTO is also responsible for deleting the feature branch (local + remote) after merge.
- **Coder** must only push to feature branches named `feat/BIZ-N-description`, where `N` is the Paperclip issue number. Never push to `main`.
- **QA** does not commit or push at all — read-only role.
- **Enforcement is by instructions, not by git permissions.** All agents share a single `GITHUB_TOKEN` in the container, so git itself cannot distinguish between them. Each agent's `AGENTS.md` describes its boundaries; violating those boundaries is a process bug, not a permission error.
- A pre-push hook safety net is a **future** enhancement. It is not currently deployed — do not assume it will catch a bad push.

### PORT convention

- The House Hunter app runs on **port 3001**.
- Paperclip's own server runs on **port 3100**, and agents inherit `PORT=3100` from the container environment by default.
- When running `npm start` manually inside the container, override with **`PORT=3001 npm start`**, otherwise the Node server will bind to 3100 and collide with Paperclip.
- Playwright's `playwright.config.ts` already injects `PORT=3001` on its `webServer` block, so test runs do not need a manual override.

### Shell user discipline

- The container base runs Paperclip as **root**, but agents execute as the **`node`** user (UID 1000).
- **Always enter the container as `node`** when doing repo work:
  ```bash
  docker exec -u node -it paperclip-server-personal bash
  ```
- If you land as root and create files (or run `npm install`), they end up root-owned. Agents running as `node` will then hit `EACCES` when they try to write to the same paths.

### Test artifacts

- `test-results/` is gitignored.
- If it becomes root-owned (typically from a stray root-shell `npm test`), fix from a root shell with:
  ```bash
  rm -rf test-results && chown -R node:node /paperclip/workspaces/house_hunter
  ```

### Playwright browsers

- Pre-installed to **`/opt/playwright-browsers`** via the Dockerfile. The path is baked into the `PLAYWRIGHT_BROWSERS_PATH` environment variable.
- **Don't reinstall browsers** unless you are intentionally upgrading the Playwright version.

### node_modules

- Managed as a **named Docker volume**, not a bind mount. The Windows-side `node_modules` and the container-side `node_modules` are separate trees.
- **Install from inside the container** with:
  ```bash
  npm install --include=dev
  ```
- The `--include=dev` flag matters because `NODE_ENV=production` in the container would otherwise skip `devDependencies` (including Vite, Playwright, tsx).

## Running the app locally

- The app listens on port **3001** (Node + Hono server; `vite build` writes the frontend to `dist/`, one process serves API and static assets).
- **`npm start`** is the canonical run command (`vite build` then `tsx server/index.ts`).
- Playwright’s `playwright.config.ts` uses `http://localhost:3001`, starts the app with **`npm start`** via `webServer`, and points tests at that URL.
- **`PORT` must be `3001`** for Playwright and local parity. It is set explicitly in `playwright.config.ts` so container or host environments that export a different `PORT` do not break the test server URL.

## Redfin image backfill limitations

- The backfill pipeline (`POST /api/listings/backfill-images`) tries **Redfin CDN inference first** (derived from `/home/<id>`), then falls back to **listing HTML scraping**.
- In practice, some real Redfin listings return **HTTP 404** for the inferred CDN URL pattern, and Redfin listing HTML requests may return an **AWS WAF challenge**, preventing scrape-based discovery of `ssl.cdn-redfin.com` image URLs.
- When this happens, you should expect server logs like `[redfin-cdn] probe failed — ... HTTP 404` and `[backfill] ... no images retrieved`.
- Workaround: ensure your upstream feed/source includes image URLs (or use a test-seeded listing images flow in Playwright) so the UI can display images without relying on Redfin HTML.

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
