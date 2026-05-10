# Redfin CDN success artifact (BIZ-94 Deliverable B)

This folder holds evidence that MLS-keyed CDN cover URLs resolve for a Columbus listing (`pid=79708871`, MLS `226013015` per the spike in `qa/captures/redfin-cdn-pattern-20260509/PATTERN.md`). The `extracted_urls.json` file lists the inferred cover URL that returned **200** with **`image/jpeg`** when probed with `HEAD` on 2026-05-09.

## Manual dashboard verification

1. Run `npm start` with a database that includes a Redfin scraper for Columbus (or insert a fresh row via the UI) so a scheduled or manual scrape can populate `listings` with `mls_number` from gis-csv.
2. Open the dashboard, locate a listing card that should have loaded a cover from the CDN, and confirm the card shows a real photo rather than **No image**.
3. Optionally capture a screenshot of that card and place it beside this README for Board-visible proof.

## Re-checking the JSON URL

```bash
curl -sI "https://ssl.cdn-redfin.com/photo/160/bigphoto/015/226013015_0.jpg" | head -n 5
```

Expect HTTP **200** and a `Content-Type` of **`image/jpeg`**. Redfin may change CDN layout without notice; if this URL stops working, refresh the JSON from a current gis-csv row while preserving the MLS-keyed inference code path.
