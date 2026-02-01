# House Hunter

An RSS-based listing scraper that runs on Cloudflare Pages. You configure filter presets (feed URLs, price range, keywords, locations), set a schedule, and get webhook notifications when listings match your criteria.

## Architecture

- **Frontend**: Vite + React SPA for filter presets, schedule, settings, and last-run results. Deployed as static assets on Cloudflare Pages.
- **Backend**: A single Worker (built to `dist/_worker.js`) handles all `/api/*` requests and serves static assets. It uses **D1** for filter presets, schedule, settings, and run history.
- **Scheduling**: A Cron Trigger in `wrangler.toml` runs the pipeline every 6 hours (UTC). You can add up to 3 cron expressions on the free tier.
- **Notifications**: When the pipeline finds matches, it POSTs a JSON payload to your configured webhook URL (e.g. Discord or Slack).

Data flow: **Cron** → Worker runs pipeline → loads presets from D1 → fetches each RSS/Atom feed → parses and applies filters → stores run in D1 → if matches, POSTs to webhook.

## Scrapers (data sources)

The **Scrapers** tab appears first in the nav. It has two sections:

- **Websites** (first): Selectable/deselectable buttons for sites (e.g. **Redfin**; all start selected). When Redfin is selected, a full params form lets you build the stingray API call from scratch: `region_id`, `region_type`, `market`, `min_price`, `max_price`, `min_beds`, `max_beds`, `min_baths`, `max_baths`, `uipt`, `num_homes`, `page_number`, `status`, `v`. See `redfin_api_guide.md`. Click **Add Redfin source** to add an entry; each has **Test** and **Remove**.
- **RSS Feeds** (second): Add feed URLs; each row has **Test** and **Remove**. Use Test sparingly (rate limits).

## Prerequisites

- **Node.js** 18+
- **Wrangler** CLI (`npm i -g wrangler` or use `npx wrangler`)
- **Cloudflare account** (for deploy and D1)

## Local development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create D1 database and run migrations**
   ```bash
   npx wrangler d1 create house_hunter_db
   ```
   Copy the `database_id` from the output into `wrangler.toml` under `[[d1_databases]]` → `database_id`.
   Then apply the schema (run both migrations in order):
   ```bash
   npx wrangler d1 execute house_hunter_db --remote --file=./migrations/0000_initial.sql
   npx wrangler d1 execute house_hunter_db --remote --file=./migrations/0001_scraper_sources.sql
   ```
   For local dev, use the same DB or create a separate one and run:
   ```bash
   npx wrangler d1 execute house_hunter_db --local --file=./migrations/0000_initial.sql
   npx wrangler d1 execute house_hunter_db --local --file=./migrations/0001_scraper_sources.sql
   ```

3. **GUI refinement (frontend only)**  
   Run the Vite dev server; `/api` is proxied to `http://localhost:8788`, so start the full stack in another terminal if you need the real API:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173. To use the real API, in a second terminal run:
   ```bash
   npm run build && npx wrangler pages dev dist
   ```
   Keep that running so the proxy from the Vite server can reach the Worker at 8788.

4. **Full local stack**  
   Build the frontend and Worker, then run Pages locally (serves the app + API + D1):
   ```bash
   npm run build && npm run pages:dev
   ```
   Open http://localhost:8788 (or the port Wrangler prints).

## Run and Debug (VS Code)

Two launch configurations are in `.vscode/launch.json`:

1. **House Hunter: Frontend (GUI refinement)**  
   Runs `npm run dev` (Vite). Use this for fast UI iteration. The app will try to call `/api`; proxy to a separately running `wrangler pages dev` if you need live API/D1.

2. **House Hunter: Local full stack**  
   Runs the **Build frontend** task (from `.vscode/tasks.json`), then `npx wrangler pages dev dist`. Opens the app in the browser when the server is ready. Use this to test the full app locally before deploying to Cloudflare.

Use **Run and Debug** (Ctrl+Shift+D / Cmd+Shift+D), select one of the configs above, and press F5 (or the green play button).

## Deploy to Cloudflare

1. **Connect the repo** to Cloudflare Pages (GitHub/GitLab). Build command: `npm run build`. Build output directory: `dist`.

2. **Create D1 and bind it**  
   In the dashboard: Workers & Pages → D1 → Create database (`house_hunter_db`). In your Pages project → Settings → Functions → D1 bindings, add a binding named `DB` to this database.  
   Or use Wrangler: set `database_id` in `wrangler.toml` (see Local development).    Run the migrations once (e.g. in CI or manually), in order:
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

1. **Scrapers**: Go to **Scrapers**. In **Websites**, select Redfin and fill the params form (region_id, region_type, market, price/beds/baths, etc.) to build the stingray API call from scratch; click **Add Redfin source**. In **RSS Feeds**, add feed URLs and click **Add**. For Redfin parameter details, see `redfin_api_guide.md`.
2. **Filters**: In **Filters**, create or edit a preset and add one or more feed URLs (these can match your Scrapers list or be entered here). The pipeline fetches each URL, parses entries (RSS/Atom or Redfin CSV when applicable), and applies your price/keyword/location filters.

## License

MIT
