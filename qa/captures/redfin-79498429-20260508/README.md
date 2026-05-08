# Redfin capture — 2026-05-08, listing 79498429

Per BIZ-81. Snapshot of the HTTP response Redfin returned for one listing URL fetched with the production scheduled scraper's exact headers and timeout.

## Files

- `body.html` — raw response body (UTF-8, 2 KB)
- `status.txt` — HTTP status line
- `headers.json` — response headers as JSON; any `set-cookie` value redacted
- `meta.json` — URL, capture time, host info, exact request headers sent
- `sanity.txt` — stdout from running `extractPhotoUrls(body)` on the captured body
- `DIAGNOSIS.md` — failure-mode classification + Step 4 fix-shape recommendation

## How to re-run

```sh
npx tsx scripts/capture-redfin.ts <listing-url>
```

The script writes a sibling directory `qa/captures/redfin-{listingId}-{YYYYMMDD-UTC}/` with the same five files. Running twice produces functionally equivalent output — only `meta.json:fetchedAtUtc`, `meta.json:durationMs`, the response `date` header, and the AWS WAF challenge token values inside `body.html` (`window.gokuProps`) will differ run-to-run.

To reproduce the exact capture in this directory:

```sh
npx tsx scripts/capture-redfin.ts "https://www.redfin.com/OH/Grove-City/2590-Medora-Dr-43123/home/79498429"
```
