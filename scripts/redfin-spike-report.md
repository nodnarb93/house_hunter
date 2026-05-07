# Redfin photo URL spike (BIZ-68) — BLOCKED by WAF / bot wall

## Summary

Headless Playwright cannot reach Columbus active search results: navigation returns an AWS WAF–backed bot interstitial (HTTP **429** in this environment, title **Are You a Robot? | Redfin**). Listing URLs #1/#5/#9 were never collected; per-issue instructions forbid bypass (no stealth plugins, proxies, or UA tricks).

## Search URL attempted

https://www.redfin.com/city/4664/OH/Columbus/filter/status=active

## Main navigation

- HTTP status: **429**
- Final title: `Are You a Robot? | Redfin`

### Response headers (main document, selected)

| Header | Value |
|---|---|
| cache-control | `no-cache, no-store, must-revalidate` |
| server | `CloudFront` |

### HTML body (first 800 chars, whitespace collapsed)

```
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Are You a Robot? | Redfin</title><style>body {font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;margin: 0;text-align: left;font-size: 16px;color: #333;}#header {min-width: 300px;height: 60px;width: 100%;background-color: #fff;}#header .logo {padding: 1rem 0;display: inline-block;}#header.WhiteHeaderContainer .Header {box-shadow: 0 0 1px rgba(0, 0, 0, .3);padding: 0 10px;height: 60px;}#main {max-width: 100%;width: 650px;margin: 0 auto;text-align: center;}#sub {text-align: left;background-color: #e2e2e2;padding: 0.1em 1em;border-radius: 0.5em;}h2 {font-size: 28px;font-weight: 300;}p {font-weight: 200;}li:not(:last-child) {margin-bottom: 0.5em;}textarea {width: 100%;height: 15em;overflow: auto;}</style></head><body><div id="hea
```

## Focused network log (Redfin / photo-ish hosts)

- 302  https://www.redfin.com/city/4664/OH/Columbus/filter/status=active
- 429 text/html https://ratelimited.redfin.com/
- 200 image/png https://ratelimited.redfin.com/graphic.png
- 200 image/png https://ratelimited.redfin.com/logo.png

## Listing URLs (required positions #1, #5, #9)

**Not available** — blocked before results markup.

## DOM vs JSON URL extraction

Not executed (no listing pages loaded).

## Plain-fetch CDN probe

Not executed (no CDN URLs discovered).

## Anti-bot / WAF signals

- Document status **429** (Too Many Requests) on search navigation.
- Page title and body consistent with Redfin / AWS WAF bot challenge.
- `curl` from the same environment receives **Human Verification** HTML embedding `token.awswaf.com` challenge scripts.

## Concurrency recommendation

**Serial only (1 listing context at a time)** until an authenticated or non-automated browser path clears WAF; parallel Playwright contexts were **not** evaluated because the first navigation failed the bot wall.

## Artifacts

- `redfin-spike.har` — full recording of the blocked search navigation.
- `redfin-spike-1.png` … `redfin-spike-3.png` — three identical full-page screenshots of the bot-wall page (filenames kept for downstream tooling); **no listing galleries**.