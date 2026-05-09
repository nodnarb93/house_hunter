# Redfin CDN photo URL pattern — BIZ-94 spike

## Answer: **YES** (revised 2026-05-09 PM after Board user supplied a 2nd ground-truth listing)

The previous PATTERN.md on this branch (commit `3e7d282`) said NO. That answer was wrong; the revision below explains why and supplies a correct pattern.

## Date confirmed: 2026-05-09 (later same day; CTO re-probe)

## Parameterized template

```
https://ssl.cdn-redfin.com/photo/160/bigphoto/{mls_number % 1000:03d}/{mls_number}_{version}.jpg          (cover)
https://ssl.cdn-redfin.com/photo/160/bigphoto/{mls_number % 1000:03d}/{mls_number}_{photo_index}_{version}.jpg   (gallery)
```

The cover photo is `_{version}.jpg`; gallery photos are `_{photo_index}_{version}.jpg` with `photo_index` starting at 1.

## What changed from the NO writeup

The original NO conclusion assumed the URL was keyed by the **property URL ID** (the digits in `/home/{id}`, e.g. `79708871`). It is not — those URLs always 404 on the CDN. The correct key is the listing's **MLS#** (a different identifier, e.g. `226013015` for the same property), which the gis-csv response already exposes in the `MLS#` column.

That is why the original probe scored 1/12 (the only "hit" was the one ID from a Board-user URL that happened to coincide with an MLS#, not a property URL ID). With the MLS# correction the hit rate is **19/20** for cover photos on currently-active Columbus listings.

## Evidence URLs — 3+ distinct currently-active listings

All probed at 2026-05-09 from the gis-csv export of Columbus (`market=columbus, region_id=4664, region_type=6, status=9` — active only). Full machine-readable evidence: `probe-output-mls-keyed.txt` and `probe-output-gallery.txt` in this directory. Selected hits (cover photos):

1. `https://ssl.cdn-redfin.com/photo/160/bigphoto/015/226013015_0.jpg` — 200, image/jpeg — Columbus listing pid=79708871 (mls=226013015)
2. `https://ssl.cdn-redfin.com/photo/160/bigphoto/189/226012189_0.jpg` — 200, image/jpeg — Dublin listing pid=100777905 (mls=226012189)
3. `https://ssl.cdn-redfin.com/photo/160/bigphoto/487/226010487_0.jpg` — 200, image/jpeg — Columbus listing pid=169640058 (mls=226010487)
4. `https://ssl.cdn-redfin.com/photo/160/bigphoto/222/226016222_0.jpg` — 200, image/jpeg — Blacklick listing pid=79641287 (mls=226016222)
5. `https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_0.jpg` — 200, image/jpeg — Board-user supplied (a 2nd listing)
6. `https://ssl.cdn-redfin.com/photo/160/bigphoto/463/226013463_1.jpg` — 200, image/jpeg — Board-user supplied (the original ground-truth listing; cover at v=1)

Gallery hits (proving the `_{idx}_{v}.jpg` shape):

1. `https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_1_0.jpg` — 200 (Board)
2. `https://ssl.cdn-redfin.com/photo/160/bigphoto/925/226015925_2_0.jpg` — 200 (Board)
3. `https://ssl.cdn-redfin.com/photo/160/bigphoto/222/226016222_1_0.jpg` — 200 (CTO probe)
4. `https://ssl.cdn-redfin.com/photo/160/bigphoto/222/226016222_2_0.jpg` — 200 (CTO probe)
5. `https://ssl.cdn-redfin.com/photo/160/bigphoto/487/226010487_1_1.jpg` — 200 (CTO probe; uses v=1)

## Per-listing version variability

The trailing `_{version}` digit is **NOT** always 0. Within the 5-listing gallery probe sample we saw three regimes:

- **v=0 throughout** — newer listings, e.g. mls=226015925, 226016222, 226016215.
- **v=1 throughout** — slightly older listings, e.g. mls=226013463, 226010487. Cover may be `_1.jpg` (Board sample) or `_0.jpg` (mls=226010487 cover hits at v=0 here).
- **v varies per-photo** — e.g. mls=226004191: `_1_5.jpg`, `_2_4.jpg`, `_3_3.jpg`. Likely per-photo replacement after the listing was published.

Implications for Deliverable B (the implementation):

- **Cover photo**: probe `_0.jpg` first; fall back to `_1.jpg` only on 404. Two probes max. ~95% hit at `_0.jpg` for fresh listings.
- **Gallery photos**: cannot be inferred with a fixed `version` value. To find each gallery photo you must probe `_{idx}_{0..N}.jpg`. For Deliverable B's "≥1 live URL" merge gate, the cover alone clears the bar; gallery harvesting can be a separate follow-up if we want richer card images.

## What the `/photo/160/` prefix means

`/photo/{X}/` did not enumerate to other working values in the prefix sweep `1..200` — only `160` returned hits in this market. This may correspond to the MLS source (CBRMLS = Columbus / Central Ohio MLS). Listings sourced from a different MLS may use a different prefix; the implementation should treat `160` as a default that **may need to expand** when we add markets outside CBRMLS.

## What the spike does NOT prove

- Whether the prefix `160` works for other MLS sources / markets. All 20 probed listings were CBRMLS. **Mitigation**: when the implementation lands, the BIZ-83 WAF detection logger doubles as a "extractor returns 0 URLs" canary — repeated zero-URL runs against a market would surface a prefix-mismatch quickly.
- Whether the CDN ever 404s for legitimate reasons (e.g. very-fresh listing without photos uploaded yet). Sample showed 1 such case in 20 (mls=226016218). Acceptable.
- Whether `ssl.cdn-redfin.com` will remain WAF-free indefinitely. Today it is (no `x-amzn-waf-action`). The BIZ-83 defensive logger should be ported into the new fetcher as a regression guard.

## Architectural change required for Deliverable B

The current pipeline does not capture MLS# anywhere. The CDN URL pattern depends on MLS#, so Deliverable B must include:

1. New migration `0011_listings_mls_number.sql` adding `mls_number TEXT` column to `listings`.
2. Update `parseRedfinCsvListings` (in `server/scrapers/redfinAdapter.ts`) to extract the `MLS#` column and surface it on `RedfinParsedListing`.
3. Extend `RawListing` (in `server/scrapers/listingSource.ts`) to include `mls_number?: string | null`.
4. Update the scheduler insert SQL to persist `mls_number`.
5. New `server/scrapers/redfinCdnPhotoFetcher.ts` that, given an MLS#, builds and HEAD-checks the cover URL (and, if scope permits, gallery URLs).
6. Update `RedfinSource.extractPhotoUrls` signature to accept an optional `{ mlsNumber }` hint and delegate to the new CDN fetcher when MLS# is present. Naive HTML fetch removed.

The "MLS# is the right key" finding is what made this spike's previous NO answer wrong. Plumbing it through is the bulk of the implementation work.
