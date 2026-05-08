# Redfin response capture — diagnosis

Per BIZ-81 (Step 2 of the parent strategy on BIZ-78). Investigation only — no production code change in this capture.

## Capture metadata

| Field | Value |
| --- | --- |
| URL | `https://www.redfin.com/OH/Grove-City/2590-Medora-Dr-43123/home/79498429` |
| Listing id (from `/home/{N}`) | `79498429` |
| Capture timestamp (UTC) | `2026-05-08T05:38:42.584Z` |
| Host (`os.hostname()`) | `5294e1eca0a1` |
| Platform (`process.platform`) | `linux` |
| Node version | `v24.15.0` |
| Network | This Paperclip agent's machine — a containerised Linux/WSL host. Outbound public IP belongs to the agent host's network, not necessarily the user's residential IP. |

### Exact request headers sent

These match `RedfinSource.extractPhotoUrls` (`server/scrapers/redfinSource.ts:30-37`) verbatim:

```json
{
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
```

The User-Agent is the value defined in `REDFIN_FETCH_HEADERS` at `server/scrapers/redfinAdapter.ts:27-30`. Timeout was `AbortSignal.timeout(15_000)` (15 s), matching production. No cookies were sent.

## Response observed

| Field | Value |
| --- | --- |
| HTTP status | **`202 Accepted`** |
| `content-type` | `text/html; charset=UTF-8` |
| `content-length` | `2049` |
| Body bytes (measured) | `2049` |
| `<title>` | empty (`""`) |
| Fetch duration | 867 ms |

### Smoking-gun response headers

```
server: CloudFront
x-amzn-waf-action: challenge
access-control-expose-headers: x-amzn-waf-action
cache-control: no-store, max-age=0
x-cache: Error from cloudfront
via: 1.1 ...cloudfront.net (CloudFront)
```

Full headers (sanitized) are in `headers.json` next to this file.

### Body content (verbatim)

The 2 KB body is an AWS WAF JavaScript challenge page. Key snippets:

```html
<script type="text/javascript">
window.awsWafCookieDomainList = ['redfin.ca','www.redfin.ca','redfin.com','www.redfin.com'];
window.gokuProps = {
"key":"AQIDAHjcYu/...",
  "iv":"D54eJQEu6wAARYbZ",
  "context":"2w5bQLCgTzZI0..."};
</script>
<script src="https://22af5ed32a4a.a4ba5a65.eu-north-1.token.awswaf.com/22af5ed32a4a/939b6cb0e48b/706c5833cd6f/challenge.js"></script>
```

```html
<noscript>
    <h1>JavaScript is disabled</h1>
    In order to continue, we need to verify that you're not a robot.
    This requires JavaScript. Enable JavaScript and then reload the page.
</noscript>
```

Full body is in `body.html` next to this file.

## Marker presence

Pattern counts measured in `body.html`:

| Pattern | Count |
| --- | --- |
| `<meta property="og:image"` (canonical attribute order) | **0** |
| `<meta content="..." property="og:image"` (reversed attribute order) | **0** |
| `"photoUrl":` | **0** |
| `"url":"https://ssl.cdn-redfin.com/...` | **0** |

WAF / challenge-page indicators:

| String (case-insensitive) | Present? |
| --- | --- |
| `awswaf` | **yes** |
| `AwsWafIntegration` | **yes** |
| `verify that you're not a robot` | **yes** |
| `challenge` | **yes** |
| `Access Denied` | no |
| `captcha` | no |
| `cloudflare` | no |
| `pardon our interruption` | no |

## Sanity check — production extractor against this body

The capture script imports the production `extractPhotoUrls` from `server/scrapers/redfinAdapter.ts` (no shimming) and runs it on the captured body:

```
URL:           https://www.redfin.com/OH/Grove-City/2590-Medora-Dr-43123/home/79498429
Status:        202 Accepted
Body bytes:    2049
Duration ms:   867
Out dir:       qa/captures/redfin-79498429-20260508
extractPhotoUrls(body) count: 0
extractPhotoUrls(body) error: none
extractPhotoUrls first 3:    []
```

Same output is recorded in `sanity.txt` next to this file. `extractPhotoUrls` did not throw; it returned `[]`.

## Failure-mode classification

### WAF block (failure mode #1)

The response is an AWS WAF challenge:

- `x-amzn-waf-action: challenge` is the AWS WAF Bot Control header that explicitly declares this request was challenged.
- HTTP status `202 Accepted` is the conventional code AWS WAF emits for a challenge interstitial — it deliberately stays in the 2xx range to keep clients reading the body.
- The body loads `challenge.js` from `*.token.awswaf.com` and calls `AwsWafIntegration.getToken()` → `window.location.reload(true)`. A real browser obtains a token cookie and retries; a plain `fetch` without a JS runtime sees only the 2 KB challenge page.
- The `<noscript>` block confirms it: "we need to verify that you're not a robot."
- The body contains zero of the listing markers (`og:image`, `"photoUrl":`, `"url":"https://ssl.cdn-redfin.com/`). There is no listing HTML to extract from.

This rules out failure mode #2 (hydration boundary — a hydration page would still serve full HTML chrome) and failure mode #3 (pattern drift — there is no listing data here under any key).

### Why the production code returns `[]` instead of erroring

`server/scrapers/redfinSource.ts:38` does:

```ts
if (!res.ok) return []
const html = await res.text()
return extractPhotoUrls(html)
```

`Response.ok` is `true` for any status in the 200–299 range, so a `202` challenge passes the gate. The 2 KB challenge body is then handed to `extractPhotoUrls`, which finds none of the three patterns and returns `[]`. From the caller's perspective the request "succeeded" with zero photos — exactly the symptom the user observes.

This also explains why the existing `listing_image_urls` rows in `data/house_hunter.sqlite` all share the photo IDs from a single listing (`79708871_*_o.jpg`): those rows are residue from an earlier test-shimmed run before the BIZ-79/BIZ-80 isolation work landed. Real production scrapes since the WAF began challenging requests have produced no rows. The fix landing in BIZ-79/BIZ-80 exposed the underlying WAF block; it didn't cause it.

## Step 4 fix-shape recommendation

**`switch to headless browser rendering`** — the WAF challenge requires executing `AwsWafIntegration.getToken()` in a JavaScript runtime to obtain the clearance cookie, then refetching with that cookie. A plain `fetch` with hardened headers cannot satisfy this regardless of User-Agent quality. Header/UA hardening + retry is unlikely to bypass this challenge category; AWS WAF Bot Control specifically gates on JS-execution-capable clients. Pattern-update is moot since there is no listing HTML in the response.

If the team prefers to avoid running a headless browser in the scheduler, a viable alternative for Step 4 is to keep using the `stingray/api/gis-csv` endpoint we already use successfully for listing discovery (`fetchRedfinGisCsvListings`) and **either** drop the per-listing photo fetch entirely **or** replace it with a WAF-bypassing source — e.g., `og:image` from a listing-aggregator endpoint, or a residential-IP-fronted fetch service. Step 4's design discussion should weigh these against the headless-browser path; this issue's deliverable is the diagnosis, not the fix.

## Network conditions caveat

The capture was run from this Paperclip agent's containerised Linux host, not from the user's machine. AWS WAF rules can be IP-reputation-sensitive — it is theoretically possible (though unlikely given how stable WAF challenge behavior is for datacenter ranges) that a residential IP would receive a `200` with full HTML for the same URL/UA. If the user wants to verify, they can re-run `npx tsx scripts/capture-redfin.ts <url>` from the same machine that runs the scheduler and compare the resulting `status.txt` and `body.html` against the artifacts here. The README in this directory documents the re-run command.

Either way the diagnosis is unambiguous for the network the production scheduled scraper currently runs on (it shares this agent's host network in the Paperclip workspace setup), so Step 4 must address WAF challenges before any extraction-side change can matter.
