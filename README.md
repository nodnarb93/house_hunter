# House Hunter

An RSS-based listing scraper that runs on Cloudflare Pages. You configure filter presets (feed URLs, price range, keywords, locations), set a schedule, and get webhook notifications when listings match your criteria.

## Architecture

- **Frontend**: Vite + React SPA for scrapers, filter presets, schedule, settings, and last-run results. Deployed as static assets on Cloudflare Pages.
- **Production backend**: A single Worker (bundled to `dist/_worker.js` by `scripts/build-worker.mjs`) handles all `/api/*` requests and serves static assets. It uses **D1** for scraper sources, filter presets, schedule, settings, and run history.
- **Local backend**: A **Node + Hono** app in `server/` listens on port **3001** (override with `PORT`). It uses **better-sqlite3** with a file database (default `data/house_hunter.sqlite`, override with `DATABASE_PATH`). On startup it applies every `migrations/*.sql` file that has not yet been applied (ledger table `schema_migrations`). The HTTP surface mirrors the Worker; handlers live in parallel under `worker/` (Cloudflare) and `server/` (Node).
- **Scheduling**: A Cron Trigger in `wrangler.toml` runs the pipeline every 6 hours (UTC). You can add up to 3 cron expressions on the free tier.
- **Notifications**: When the pipeline finds matches, it POSTs a JSON payload to your configured webhook URL (e.g. Discord or Slack).

Data flow (production): **Cron** → Worker runs pipeline → loads presets from D1 → fetches each RSS/Atom feed (and configured Redfin sources) → parses and applies filters → stores run in D1 → if matches, POSTs to webhook.

## Scrapers (data sources)

The **Scrapers** tab appears first in the nav. It has two sections:

- **Websites** (first): Selectable/deselectable buttons for sites (e.g. **Redfin**; all start selected). When Redfin is selected, a full params form lets you build the stingray API call from scratch: `region_id`, `region_type`, `market`, `min_price`, `max_price`, `min_beds`, `max_beds`, `min_baths`, `max_baths`, `uipt`, `num_homes`, `page_number`, `status`, `v`. See `REDFIN_API_GUIDE.md`. Click **Add Redfin source** to add an entry; each has **Test** and **Remove**.
- **RSS Feeds** (second): Add feed URLs; each row has **Test** and **Remove**. Use Test sparingly (rate limits).

## Prerequisites

- **Node.js** 18+
- **Wrangler** CLI (`npm i -g wrangler` or use `npx wrangler`) when using Cloudflare Pages dev or deploying
- **Cloudflare account** (for deploy and D1)
- **Native build toolchain** for **better-sqlite3** (e.g. Xcode CLI tools on macOS, `build-essential` on Linux, or Visual Studio Build Tools on Windows) if `npm install` fails compiling the native module

## Local development

### Fast UI + API (recommended)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run API and Vite together** (two terminals):
   ```bash
   npm run server:dev
   ```
   ```bash
   npm run dev
   ```
   Open http://localhost:5173. The Vite dev server proxies `/api` to **http://localhost:3001** (see `vite.config.ts`). The Node server creates `data/house_hunter.sqlite` if needed and applies migrations from `migrations/` automatically.

### Static build + Node (matches Playwright)

Used by `playwright.config.ts` (`npm start`): builds the SPA into `dist/`, then serves it from the same process as `/api` on port 3001.

```bash
npm start
```

Open http://localhost:3001.

### Cloudflare Pages + D1 locally

To exercise the real Worker and Wrangler’s D1 (instead of file SQLite on 3001):

1. **Create D1 database and run migrations** (once per database):
   ```bash
   npx wrangler d1 create house_hunter_db
   ```
   Copy the `database_id` from the output into `wrangler.toml` under `[[d1_databases]]` → `database_id`.
   Then apply the schema (run migrations in lexical order):
   ```bash
   npx wrangler d1 execute house_hunter_db --remote --file=./migrations/0000_initial.sql
   npx wrangler d1 execute house_hunter_db --remote --file=./migrations/0001_scraper_sources.sql
   ```
   For Wrangler’s **local** D1 during `pages dev`, use `--local` instead of `--remote`.

2. **Build and run Pages dev**
   ```bash
   npm run build && npm run pages:dev
   ```
   Open http://localhost:8788 (or the port Wrangler prints). For this mode, keep using Wrangler to manage local/remote D1; the file DB under `data/` is not used by the Worker.

## Testing

End-to-end tests use **Playwright** (`playwright.config.ts`, specs under `qa/`). With nothing listening on port 3001, tests start the app via `npm start`.

```bash
npm test
```

For CI-style machine-readable output:

```bash
npm run test:list
```

## Run and Debug (VS Code)

Two launch configurations are in `.vscode/launch.json`:

1. **House Hunter: Frontend (GUI refinement)**  
   Runs Vite on :5173. Start **`npm run server:dev`** in another terminal so `/api` calls succeed (proxied to :3001).

2. **House Hunter: Local full stack**  
   Runs the **Build frontend** task (`npm run build` — Vite + Worker bundle), then starts **`server/index.ts`** with the Node debugger. The app is served from **http://localhost:3001** (static `dist/` + API). Adjust `runtimeExecutable` in `launch.json` if your Node install path differs.

Use **Run and Debug** (Ctrl+Shift+D / Cmd+Shift+D), select one of the configs above, and press F5 (or the green play button).

## Deploy to Cloudflare

1. **Connect the repo** to Cloudflare Pages (GitHub/GitLab). Build command: `npm run build`. Build output directory: `dist`.

2. **Create D1 and bind it**  
   In the dashboard: Workers & Pages → D1 → Create database (`house_hunter_db`). In your Pages project → Settings → Functions → D1 bindings, add a binding named `DB` to this database.  
   Or use Wrangler: set `database_id` in `wrangler.toml` (see above). Run the migrations once (e.g. in CI or manually), in order:
   ```bash
   npx wrangler d1 execute house_hunter_db --remote --file=./migrations/0000_initial.sql
   npx wrangler d1 execute house_hunter_db --remote --file=./migrations/0001_scraper_sources.sql
   ```

3. **Cron**  
   The Worker’s scheduled handler is configured in `wrangler.toml` under `[triggers]` (e.g. every 6 hours). Pages uses the same config when the Worker is deployed with the project.

4. **Subdomain**  
   In Pages → Custom domains, add e.g. `househunter.yourdomain.com` so the app is available at that subdomain of your Cloudflare-hosted site.

5. **Secrets (optional)**  
   If you want to override webhook URL via env: `npx wrangler pages secret put WEBHOOK_URL` (and read it in the Worker). By default, the webhook URL is stored in D1 and set in the app’s Settings page.

## Adding feeds and sources

1. **Scrapers**: Go to **Scrapers**. In **Websites**, select Redfin and fill the params form (region_id, region_type, market, price/beds/baths, etc.) to build the stingray API call from scratch; click **Add Redfin source**. In **RSS Feeds**, add feed URLs and click **Add**. For Redfin parameter details, see `REDFIN_API_GUIDE.md`.
2. **Filters**: In **Filters**, create or edit a preset and add one or more feed URLs (these can match your Scrapers list or be entered here). The pipeline fetches each URL, parses entries (RSS/Atom or Redfin CSV when applicable), and applies your price/keyword/location filters.

## License

ISC (see `package.json`).
