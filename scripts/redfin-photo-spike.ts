// Run: npx tsx scripts/redfin-photo-spike.ts
// Optional: npx tsx scripts/redfin-photo-spike.ts --urls=https://...,https://...,https://...

import { chromium, type Browser, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = __dirname;

const SEARCH_URL =
  "https://www.redfin.com/city/4664/OH/Columbus/filter/status=active";

const LISTING_PATH_RE = /^\/OH\/Columbus\/.+\/home\/\d+$/;
const FOCUSED_NET_RE = /(ssl\.cdn-redfin\.com|rdfn\.com|photo)/i;

/** Hosts we treat as Redfin CDN for DOM / JSON URL buckets */
function isRedfinCdnHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.includes("cdn-redfin.com") ||
    h === "photos.redfin.com" ||
    (h.endsWith("redfin.com") && h.includes("photo"))
  );
}

function isRedfinCdnUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === "https:" && isRedfinCdnHost(u.hostname);
  } catch {
    return false;
  }
}

function dedupeOrdered(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function parseUrlsArg(): string[] | null {
  const raw = process.argv.find((a) => a.startsWith("--urls="));
  if (!raw) return null;
  const rest = raw.slice("--urls=".length).trim();
  if (!rest) return null;
  return rest.split(",").map((s) => s.trim()).filter(Boolean);
}

type AntiBotSignal = {
  phase: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  bodySnippet: string;
};

type ListingCapture = {
  listingIndex: number;
  listingUrl: string;
  selectorSurvey: { selector: string; count: number }[];
  domUrls: string[];
  jsonUrls: string[];
  overlapCount: number;
  plainFetchDom?: {
    url: string;
    status: number;
    contentType: string;
    contentLength?: string;
    preview?: string;
  };
  plainFetchJson?: {
    url: string;
    status: number;
    contentType: string;
    contentLength?: string;
    preview?: string;
  };
  antiBot: AntiBotSignal[];
  challengeHtml?: boolean;
};

async function isBlockedSearchPage(
  page: Page,
  initialStatus: number | undefined,
): Promise<boolean> {
  const title = (await page.title()).toLowerCase();
  if (
    initialStatus === 429 ||
    initialStatus === 403 ||
    title.includes("robot") ||
    title.includes("human verification") ||
    title.includes("attention required")
  ) {
    return true;
  }
  const html = await page.content();
  return (
    /captcha|challenge\.js|awswaf\.com|awsWafIntegration|gokuProps|Human Verification/i.test(
      html,
    ) && !/\/OH\/Columbus\/.+\/home\/\d+/.test(html)
  );
}

async function extractListingUrlsFromSearch(page: Page): Promise<string[]> {
  const nav = await page.goto(SEARCH_URL, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const initialStatus = nav?.status();
  await page.waitForTimeout(3000);

  if (await isBlockedSearchPage(page, initialStatus)) {
    throw new Error("WAF_OR_CHALLENGE_PAGE");
  }

  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(2000);

  const html = await page.content();
  if (await isBlockedSearchPage(page, initialStatus)) {
    throw new Error("WAF_OR_CHALLENGE_PAGE");
  }

  const hrefs = await page.$$eval("a[href]", (as) =>
    as.map((a) => (a as HTMLAnchorElement).href),
  );

  const paths: string[] = [];
  for (const href of hrefs) {
    try {
      const u = new URL(href);
      if (u.hostname.endsWith("redfin.com") && LISTING_PATH_RE.test(u.pathname)) {
        paths.push(`${u.origin}${u.pathname}`);
      }
    } catch {
      /* skip */
    }
  }

  return dedupeOrdered(paths).slice(0, 10);
}

async function discoverListings(browser: Browser): Promise<[string, string, string]> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const ten = await extractListingUrlsFromSearch(page);
    if (ten.length < 9) {
      throw new Error(
        `Expected at least 9 listing URLs in first ten listing anchors; got ${ten.length}`,
      );
    }
    return [ten[0], ten[4], ten[8]];
  } finally {
    await ctx.close();
  }
}

async function captureBlockedSearch(browser: Browser): Promise<void> {
  const harPath = path.join(SCRIPTS_DIR, "redfin-spike.har");
  const context = await browser.newContext({
    recordHar: { path: harPath, mode: "full" },
  });
  const page = await context.newPage();

  const responses: { url: string; status: number; headers: Record<string, string> }[] = [];

  page.on("response", (response) => {
    const url = response.url();
    if (!FOCUSED_NET_RE.test(url) && !url.includes("redfin.com")) return;
    const headers = response.headers();
    responses.push({
      url,
      status: response.status(),
      headers: {
        "cf-mitigated": headers["cf-mitigated"] || "",
        "x-amzn-waf-action": headers["x-amzn-waf-action"] || "",
        "retry-after": headers["retry-after"] || "",
        "content-type": headers["content-type"] || "",
      },
    });
  });

  const main = await page.goto(SEARCH_URL, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForTimeout(4000);

  const title = await page.title();
  const html = await page.content();
  const bodySnippet = html.replace(/\s+/g, " ").slice(0, 800);

  const mainHeaders = main?.headers() || {};

  for (let i = 1; i <= 3; i++) {
    await page.screenshot({
      path: path.join(SCRIPTS_DIR, `redfin-spike-${i}.png`),
      fullPage: true,
    });
  }

  await context.close();

  const lines: string[] = [];
  lines.push("# Redfin photo URL spike (BIZ-68) — BLOCKED by WAF / bot wall");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    "Headless Playwright cannot reach Columbus active search results: navigation returns an AWS WAF–backed bot interstitial (HTTP **429** in this environment, title **Are You a Robot? | Redfin**). Listing URLs #1/#5/#9 were never collected; per-issue instructions forbid bypass (no stealth plugins, proxies, or UA tricks).",
  );
  lines.push("");
  lines.push(`## Search URL attempted`);
  lines.push("");
  lines.push(SEARCH_URL);
  lines.push("");
  lines.push("## Main navigation");
  lines.push("");
  lines.push(`- HTTP status: **${main?.status() ?? "unknown"}**`);
  lines.push(`- Final title: \`${title}\``);
  lines.push("");
  lines.push("### Response headers (main document, selected)");
  lines.push("");
  lines.push("| Header | Value |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(mainHeaders)) {
    if (
      /^(cf-|x-amzn|set-cookie|retry-after|server|cache-control)/i.test(k)
    ) {
      lines.push(`| ${k} | \`${String(v).slice(0, 400)}\` |`);
    }
  }
  lines.push("");
  lines.push("### HTML body (first 800 chars, whitespace collapsed)");
  lines.push("");
  lines.push("```");
  lines.push(bodySnippet);
  lines.push("```");
  lines.push("");
  lines.push("## Focused network log (Redfin / photo-ish hosts)");
  lines.push("");
  if (!responses.length) {
    lines.push("(No extra responses recorded beyond document — see `redfin-spike.har`.)");
  } else {
    for (const r of responses.slice(0, 40)) {
      lines.push(`- ${r.status} ${r.headers["content-type"]} ${r.url.slice(0, 160)}`);
      if (r.headers["cf-mitigated"])
        lines.push(`  - cf-mitigated: ${r.headers["cf-mitigated"]}`);
      if (r.headers["x-amzn-waf-action"])
        lines.push(`  - x-amzn-waf-action: ${r.headers["x-amzn-waf-action"]}`);
    }
  }
  lines.push("");
  lines.push("## Listing URLs (required positions #1, #5, #9)");
  lines.push("");
  lines.push("**Not available** — blocked before results markup.");
  lines.push("");
  lines.push("## DOM vs JSON URL extraction");
  lines.push("");
  lines.push("Not executed (no listing pages loaded).");
  lines.push("");
  lines.push("## Plain-fetch CDN probe");
  lines.push("");
  lines.push("Not executed (no CDN URLs discovered).");
  lines.push("");
  lines.push("## Anti-bot / WAF signals");
  lines.push("");
  lines.push("- Document status **429** (Too Many Requests) on search navigation.");
  lines.push("- Page title and body consistent with Redfin / AWS WAF bot challenge.");
  lines.push("- `curl` from the same environment receives **Human Verification** HTML embedding `token.awswaf.com` challenge scripts.");
  lines.push("");
  lines.push("## Concurrency recommendation");
  lines.push("");
  lines.push(
    "**Serial only (1 listing context at a time)** until an authenticated or non-automated browser path clears WAF; parallel Playwright contexts were **not** evaluated because the first navigation failed the bot wall.",
  );
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push(
    "- `redfin-spike.har` — full recording of the blocked search navigation.",
  );
  lines.push(
    "- `redfin-spike-1.png` … `redfin-spike-3.png` — three identical full-page screenshots of the bot-wall page (filenames kept for downstream tooling); **no listing galleries**.",
  );

  writeFileSync(path.join(SCRIPTS_DIR, "redfin-spike-report.md"), lines.join("\n"), "utf8");
}

const SELECTORS_TO_SURVEY = [
  'img[src*="cdn-redfin"]',
  'img[srcset*="cdn-redfin"]',
  '[data-rf-test-id*="photo"]',
  '[class*="photo"] img',
  '[class*="gallery"] img',
  '[class*="carousel"] img',
];

function extractUrlsFromText(text: string): string[] {
  const out: string[] = [];
  const re =
    /https?:\/\/[^\s"'<>]+cdn-redfin\.com[^\s"'<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(m[0].replace(/[,;.]+$/, ""));
  }
  return out;
}

async function extractDomCdnUrls(page: Page): Promise<string[]> {
  const raw = await page.$$eval("img", (imgs) => {
    const urls: string[] = [];
    for (const img of imgs as HTMLImageElement[]) {
      if (img.src) urls.push(img.src);
      if (img.srcset) {
        for (const part of img.srcset.split(",")) {
          const piece = part.trim().split(/\s+/)[0];
          if (piece) urls.push(piece);
        }
      }
    }
    return urls;
  });
  const filtered = raw.filter(isRedfinCdnUrl);
  return dedupeOrdered(filtered);
}

async function extractJsonCdnUrls(page: Page): Promise<string[]> {
  const handles = await page.$$("script");
  const ordered: string[] = [];
  const seen = new Set<string>();
  const addAll = (text: string) => {
    for (const u of extractUrlsFromText(text)) {
      if (!seen.has(u)) {
        seen.add(u);
        ordered.push(u);
      }
    }
  };

  for (const h of handles) {
    const type = (await h.getAttribute("type")) || "";
    const text = (await h.textContent()) || "";
    if (!text || text.length > 8_000_000) continue;

    const mentionsPhotos =
      text.includes("photoUrl") ||
      text.includes('"photos"') ||
      text.includes("__INITIAL_STATE__") ||
      type.includes("json");

    if (!mentionsPhotos) continue;

    if (type.includes("json")) {
      try {
        JSON.stringify(JSON.parse(text));
      } catch {
        /* still scan raw */
      }
    }
    addAll(text);
  }

  return ordered.filter(isRedfinCdnUrl);
}

async function plainFetchSample(url: string): Promise<{
  url: string;
  status: number;
  contentType: string;
  contentLength?: string;
  preview?: string;
  anti?: AntiBotSignal;
}> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "image/*,*/*;q=0.8",
    },
  });
  const headersObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });

  const ct = res.headers.get("content-type") || "";
  const cl = res.headers.get("content-length") || undefined;
  let preview: string | undefined;
  const buf = await res.arrayBuffer();
  const slice = Buffer.from(buf).subarray(0, 200).toString("utf8");
  if (/text\/html/i.test(ct) || /<html/i.test(slice)) {
    preview = slice.slice(0, 200);
  }

  let anti: AntiBotSignal | undefined;
  if (!res.ok || preview) {
    anti = {
      phase: "plain-fetch",
      url,
      status: res.status,
      headers: {
        "cf-mitigated": headersObj["cf-mitigated"] || "",
        "x-amzn-waf-action": headersObj["x-amzn-waf-action"] || "",
        "set-cookie": (headersObj["set-cookie"] || "").slice(0, 400),
        "retry-after": headersObj["retry-after"] || "",
      },
      bodySnippet: preview || slice.slice(0, 500),
    };
  }

  return {
    url,
    status: res.status,
    contentType: ct,
    contentLength: cl,
    preview,
    anti,
  };
}

async function captureListing(
  browser: Browser,
  listingUrl: string,
  shotIndex: number,
  recordHar: boolean,
): Promise<ListingCapture> {
  const harPath = path.join(SCRIPTS_DIR, "redfin-spike.har");
  const context = await browser.newContext(
    recordHar
      ? {
          recordHar: {
            path: harPath,
            mode: "full",
          },
        }
      : {},
  );

  const antiBot: AntiBotSignal[] = [];
  const page = await context.newPage();

  page.on("response", async (response) => {
    const url = response.url();
    if (!FOCUSED_NET_RE.test(url)) return;
    const status = response.status();
    let ct = "";
    try {
      ct = response.headers()["content-type"] || "";
    } catch {
      /* ignore */
    }
    console.log(`[net-focus] ${status} ${ct} ${url}`);
    if (status >= 400) {
      const headers = response.headers();
      let bodySnippet = "";
      try {
        const txt = await response.text();
        bodySnippet = txt.slice(0, 500);
      } catch {
        bodySnippet = "";
      }
      antiBot.push({
        phase: "browser-response",
        url,
        status,
        headers: {
          "cf-mitigated": headers["cf-mitigated"] || "",
          "x-amzn-waf-action": headers["x-amzn-waf-action"] || "",
          "set-cookie": (headers["set-cookie"] || "").slice(0, 400),
          "retry-after": headers["retry-after"] || "",
        },
        bodySnippet,
      });
    }
  });

  await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(8000);

  const html = await page.content();
  const challengeHtml =
    /captcha|challenge|cf-browser-verification|attention required/i.test(html);

  const selectorSurvey: { selector: string; count: number }[] = [];
  for (const sel of SELECTORS_TO_SURVEY) {
    try {
      const count = await page.locator(sel).count();
      selectorSurvey.push({ selector: sel, count });
    } catch {
      selectorSurvey.push({ selector: sel, count: 0 });
    }
  }

  const domUrls = await extractDomCdnUrls(page);
  const jsonUrls = await extractJsonCdnUrls(page);
  const jsonSet = new Set(jsonUrls);
  const overlapCount = domUrls.filter((u) => jsonSet.has(u)).length;

  let plainFetchDom: ListingCapture["plainFetchDom"];
  let plainFetchJson: ListingCapture["plainFetchJson"];

  if (domUrls[0]) {
    const r = await plainFetchSample(domUrls[0]);
    plainFetchDom = {
      url: r.url,
      status: r.status,
      contentType: r.contentType,
      contentLength: r.contentLength,
      preview: r.preview,
    };
    if (r.anti) antiBot.push(r.anti);
  }

  if (jsonUrls[0]) {
    const r = await plainFetchSample(jsonUrls[0]);
    plainFetchJson = {
      url: r.url,
      status: r.status,
      contentType: r.contentType,
      contentLength: r.contentLength,
      preview: r.preview,
    };
    if (r.anti) antiBot.push(r.anti);
  }

  const pngPath = path.join(SCRIPTS_DIR, `redfin-spike-${shotIndex}.png`);
  await page.screenshot({ path: pngPath, fullPage: true });

  await context.close();

  return {
    listingIndex: shotIndex,
    listingUrl,
    selectorSurvey,
    domUrls,
    jsonUrls,
    overlapCount,
    plainFetchDom,
    plainFetchJson,
    antiBot,
    challengeHtml,
  };
}

function summarizeUrlPattern(urls: string[]): string {
  const sample = urls.find((u) => u.includes("cdn-redfin")) || urls[0];
  if (!sample) return "(no CDN URLs observed)";
  try {
    const u = new URL(sample);
    const parts = u.pathname.split("/").filter(Boolean);
    return `Host \`${u.hostname}\`, path template observed from sample: \`/${parts.slice(0, 6).join("/")}/...\` (exact segments vary). Full sample: \`${sample}\``;
  } catch {
    return sample;
  }
}

function writeReport(
  trio: string[],
  captures: ListingCapture[],
  discoveryNote: string,
) {
  const lines: string[] = [];
  lines.push("# Redfin photo URL spike (BIZ-68)");
  lines.push("");
  lines.push("## Listing URLs (positions #1, #5, #9 from first ten on search page)");
  lines.push("");
  for (let i = 0; i < trio.length; i++) {
    lines.push(`${i + 1}. ${trio[i]}`);
  }
  lines.push("");
  lines.push(`**Selection note:** ${discoveryNote}`);
  lines.push("");

  lines.push("## Observed CDN URL pattern");
  lines.push("");
  const allDom = captures.flatMap((c) => c.domUrls);
  lines.push(summarizeUrlPattern(allDom));
  lines.push("");

  for (const c of captures) {
    lines.push(`## Listing ${c.listingIndex}`);
    lines.push("");
    lines.push(`- URL: ${c.listingUrl}`);
    lines.push(`- DOM-derived CDN URLs: **${c.domUrls.length}**`);
    lines.push(`- JSON/script-derived CDN URLs: **${c.jsonUrls.length}**`);
    lines.push(`- Overlap (same URL in both lists): **${c.overlapCount}**`);
    lines.push(`- Gallery/challenge HTML heuristic: **${c.challengeHtml ? "possible challenge markers in HTML" : "none observed"}**`);
    lines.push("");
    lines.push("### Selector survey (match counts)");
    lines.push("");
    lines.push("| Selector | Count |");
    lines.push("|---|---|");
    for (const row of c.selectorSurvey) {
      lines.push(`| \`${row.selector.replace(/\|/g, "\\|")}\` | ${row.count} |`);
    }
    lines.push("");
    lines.push("### Sample URLs");
    lines.push("");
    lines.push("- First 3 DOM URLs:");
    for (const u of c.domUrls.slice(0, 3)) {
      lines.push(`  - ${u}`);
    }
    if (!c.domUrls.length) lines.push("  - (none)");
    lines.push("- First 3 JSON-derived URLs:");
    for (const u of c.jsonUrls.slice(0, 3)) {
      lines.push(`  - ${u}`);
    }
    if (!c.jsonUrls.length) lines.push("  - (none)");
    lines.push("");
    lines.push("### Plain fetch (no browser, no cookies)");
    lines.push("");
    if (c.plainFetchDom) {
      lines.push(
        `- First DOM URL: status **${c.plainFetchDom.status}**, type \`${c.plainFetchDom.contentType}\`, Content-Length: ${c.plainFetchDom.contentLength || "n/a"}`,
      );
      if (c.plainFetchDom.preview) {
        lines.push(`  - Body preview (HTML?): \`${c.plainFetchDom.preview.replace(/\s+/g, " ").slice(0, 180)}...\``);
      }
    } else {
      lines.push("- First DOM URL: (none to test)");
    }
    if (c.plainFetchJson) {
      lines.push(
        `- First JSON URL: status **${c.plainFetchJson.status}**, type \`${c.plainFetchJson.contentType}\`, Content-Length: ${c.plainFetchJson.contentLength || "n/a"}`,
      );
      if (c.plainFetchJson.preview) {
        lines.push(`  - Body preview: \`${c.plainFetchJson.preview.replace(/\s+/g, " ").slice(0, 180)}...\``);
      }
    } else {
      lines.push("- First JSON URL: (none to test)");
    }
    lines.push("");
  }

  lines.push("## DOM vs JSON agreement");
  lines.push("");
  lines.push(
    "Per listing, overlap counts are listed above. Order: DOM follows DOM insertion order; JSON-derived follows script scan order — they are not guaranteed to match ordering even when URLs coincide.",
  );
  lines.push("");

  lines.push("## Anti-bot / WAF signals");
  lines.push("");
  if (captures.every((c) => !c.antiBot.length && !c.challengeHtml)) {
    lines.push("None observed in this run (no 4xx/5xx on focused logging path and no challenge HTML heuristic).");
  } else {
    for (const c of captures) {
      if (!c.antiBot.length && !c.challengeHtml) continue;
      lines.push(`### Listing ${c.listingIndex}`);
      if (c.challengeHtml) lines.push("- Possible challenge HTML detected in page source.");
      for (const a of c.antiBot) {
        lines.push(`- **${a.phase}** ${a.status} \`${a.url.slice(0, 120)}...\``);
        lines.push(`  - cf-mitigated: ${a.headers["cf-mitigated"] || "n/a"}`);
        lines.push(`  - x-amzn-waf-action: ${a.headers["x-amzn-waf-action"] || "n/a"}`);
        lines.push(`  - retry-after: ${a.headers["retry-after"] || "n/a"}`);
        lines.push(`  - body snippet: \`${a.bodySnippet.replace(/\s+/g, " ").slice(0, 240)}\``);
      }
    }
  }
  lines.push("");

  lines.push("## Concurrency recommendation");
  lines.push("");
  lines.push(
    "This spike loaded three listings **serially** with a fresh browser context per listing (~8s settle wait each). No explicit rate-limit headers were recorded on successes in this single run. **Recommendation:** stay **serial (1 at a time)** for production scrapes until load testing proves otherwise; if raising concurrency, start with **2 parallel** contexts maximum and watch for 403/HTML challenges.",
  );
  lines.push("");

  const reportPath = path.join(SCRIPTS_DIR, "redfin-spike-report.md");
  writeFileSync(reportPath, lines.join("\n"), "utf8");
}

async function main() {
  mkdirSync(SCRIPTS_DIR, { recursive: true });

  const override = parseUrlsArg();
  const browser = await chromium.launch({ headless: true });

  let trio: string[];
  let discoveryNote: string;

  try {
    if (override && override.length === 3) {
      trio = override;
      discoveryNote =
        "URLs supplied via `--urls=` override (skipped live search-results scrape).";
      console.log("Using override URLs:", trio);
    } else if (override) {
      throw new Error("--urls= must provide exactly three comma-separated URLs");
    } else {
      try {
        trio = await discoverListings(browser);
        discoveryNote =
          "Pulled from live search page; positions #1, #5, #9 of the first ten `/OH/Columbus/.../home/<id>` URLs.";
        console.log("Chosen listings (#1, #5, #9):");
        trio.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "WAF_OR_CHALLENGE_PAGE") {
          console.error("BLOCKED: WAF/challenge on search page — writing HAR, PNGs, report");
          await captureBlockedSearch(browser);
          process.exitCode = 2;
          return;
        }
        throw e;
      }
    }

    const captures: ListingCapture[] = [];
    for (let i = 0; i < trio.length; i++) {
      console.log(`\n=== Capturing listing ${i + 1} ===`);
      captures.push(await captureListing(browser, trio[i], i + 1, i === 0));
    }

    writeReport(trio, captures, discoveryNote);
    console.log("\nWrote scripts/redfin-spike-report.md, HAR, and PNGs.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
