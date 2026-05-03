# House Hunter

A local RSS-based listing scraper. You configure filter presets (feed URLs, price range, keywords, locations), scraper sources, and how often runs should happen; when listings match, the app can POST to a webhook (Discord, Slack, or similar). **There are no cloud services or deployment targets** — everything runs on your machine with Node.js and a SQLite file.

[![Port](https://img.shields.io/badge/port-3001-blue)](http://localhost:3001)

## Architecture

- **Frontend**: Vite + React SPA in `src/` for scrapers, filter presets, schedule, settings, and run history.
- **Backend**: A single **Node.js + Hono** app in `server/` listens on port **3001** by default (`PORT` overrides). It serves the built SPA from `dist/`, handles `/api/*`, and uses **better-sqlite3** with a file database (default `data/house_hunter.sqlite`, override with `DATABASE_PATH`).
- **Schema**: SQL files in `migrations/` are applied automatically on server startup (tracked in `schema_migrations`).
- **Scheduling**: While the server process is running, **node-cron** checks every minute against the `schedule` table (same interval and on/off flag as the Schedule UI). For one-off or OS-level automation, use **`npm run scrape`** from cron, Task Scheduler, or systemd.
- **Notifications**: When the pipeline finds matches, it POSTs JSON to the webhook URL from Settings (if webhooks are enabled).

Data flow: **timer or `npm run scrape`** → pipeline loads filter presets from SQLite → fetches each RSS/Atom feed (and configured Redfin sources) → parses and applies filters → stores runs in SQLite → if there are matches, POSTs to the webhook.

## Prerequisites

- **Node.js** 18+
- **Native build toolchain** for **better-sqlite3** (e.g. Xcode CLI tools on macOS, `build-essential` on Linux, or Visual Studio Build Tools on Windows) if `npm install` fails while compiling the native module

## Local development

### UI + API (two terminals)

1. Install dependencies: `npm install`
2. API: `npm run server:dev`
3. UI: `npm run dev` — open http://localhost:5173. Vite proxies `/api` to http://localhost:3001 (`vite.config.ts`).

The Node server creates `data/house_hunter.sqlite` if needed and applies migrations from `migrations/`.

### Production-style single port (Playwright uses this)

Builds the SPA into `dist/`, then serves UI + API on **3001**:

```bash
npm start
```

Open http://localhost:3001.

### Manual / external scheduling

Run the full pipeline once (opens DB, migrates, runs all presets, exits):

```bash
npm run scrape
```

Use your OS scheduler to invoke that command on whatever cadence you want, or rely on the in-process scheduler when `npm start` or `npm run server:dev` is running.

### Always-on with PM2

[PM2](https://pm2.keymetrics.io/) is a dev dependency. Build the SPA once, then start the server under PM2 (port **3001** is set in `ecosystem.config.cjs` so an ambient `PORT` such as `3100` does not override it).

```bash
npm run build
npm run pm2:start   # npx tsx server/index.ts
npm run pm2:status
npm run pm2:logs
npm run pm2:stop
```

Optional: `pm2 save` and `pm2 startup` so processes survive reboot (see PM2 docs). Set `DATABASE_PATH` or `DISABLE_SCHEDULED_SCRAPES` in `ecosystem.config.cjs` `env` or via `pm2 start … --update-env` if needed.

**Environment**

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `3001`) |
| `DATABASE_PATH` | SQLite file path (default `data/house_hunter.sqlite`) |
| `DISABLE_SCHEDULED_SCRAPES` | Set to `1` to disable the node-cron scheduler (e.g. Playwright sets this for `npm start`) |

## Testing

End-to-end tests use **Playwright** (`playwright.config.ts`, specs under `qa/`). With nothing on port 3001, tests start the app via `npm start`.

```bash
npm test
npm run test:list
```

## Run and Debug (VS Code)

`.vscode/launch.json` includes:

1. **House Hunter: Frontend (GUI refinement)** — Vite on :5173. Run **`npm run server:dev`** in another terminal for `/api`.
2. **House Hunter: Local full stack** — runs the **Build frontend** task (`npm run build`), then starts `server/index.ts` with the debugger; app at http://localhost:3001.

## Adding feeds and sources

1. **Scrapers**: Open **Scrapers**. Under **Websites**, configure Redfin (stingray) params and add sources; under **RSS Feeds**, add URLs. See `REDFIN_API_GUIDE.md` for Redfin parameters.
2. **Filters**: Create presets with feed URLs and price/keyword/location rules. The pipeline uses those URLs when it runs.

## License

ISC (see `package.json`).
