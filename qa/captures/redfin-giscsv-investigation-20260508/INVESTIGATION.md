# GIS-CSV photo URL investigation

## Capture metadata

| Field | Value |
| --- | --- |
| Search URL hit | `https://www.redfin.com/city/4664/OH/Columbus` |
| GIS-CSV URL | `https://www.redfin.com/stingray/api/gis-csv?al=1&market=columbus&num_homes=350&page_number=1&region_id=4664&region_type=6&status=9&v=8` |
| HTTP status | 200 OK |
| Body bytes | 92,685 |
| Fetched at (UTC) | See `meta.json` → `fetchedAtUtc` |
| Artifact | `body.csv` in this directory |

## Schema observed

CSV columns (header row only; row 2 is a disclaimer line, then listing rows):

`SALE TYPE`, `SOLD DATE`, `PROPERTY TYPE`, `ADDRESS`, `CITY`, `STATE OR PROVINCE`, `ZIP OR POSTAL CODE`, `PRICE`, `BEDS`, `BATHS`, `LOCATION`, `SQUARE FEET`, `LOT SIZE`, `YEAR BUILT`, `DAYS ON MARKET`, `$/SQUARE FEET`, `HOA/MONTH`, `STATUS`, `NEXT OPEN HOUSE START TIME`, `NEXT OPEN HOUSE END TIME`, `URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)`, `SOURCE`, `MLS#`, `FAVORITE`, `INTERESTED`, `LATITUDE`, `LONGITUDE`

Full-file search for `ssl.cdn-redfin.com`, case-insensitive `PHOTO`, `IMAGE`, `THUMBNAIL`, `photoUrl`, and `media` found **no matches**. The only URL-shaped field in each row is the Redfin listing page URL in the long `URL (...)` column, not CDN image URLs.

## Answer: **NO**

The gis-csv response for this capture does **not** contain photo or thumbnail URLs (no `ssl.cdn-redfin.com/` or similar image columns). Photo URLs are not available from this endpoint for use during list ingest; obtaining images still requires a per-listing fetch or another source.

## Rationale for Option A (headless browser)

Because the working Stingray gis-csv payload is listing metadata and deep links only, there is nothing in the CSV parse path today that could replace `RedfinSource.extractPhotoUrls` without a separate HTTP interaction. AWS WAF already blocks naive HTML fetches for listing pages (see BIZ-81). A headless browser session is the straightforward way to obtain the same document a user sees, including image URLs, until Redfin exposes an authenticated or non-challenged API that includes media. The operational cost (Chromium, latency) is acceptable compared to having no images at all.
