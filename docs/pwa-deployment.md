# PWA Deployment Notes

Reference for anyone working on House Hunter's PWA install/manifest behavior.
Captures lessons learned from BIZ-125 / BIZ-126 / BIZ-128 and a multi-app
WebAPK collision investigation done jointly with the Paperclip team in May 2026.

## TL;DR

- House Hunter's web app manifest lives at **`/manifest.webmanifest`** and is
  linked from `index.html` with `<link rel="manifest" href="/manifest.webmanifest">`.
- Paperclip — the other PWA installed by the same user on the same Tailscale
  host (`desktop-ognems2.porcupine-logarithm.ts.net:8443`) — serves its
  manifest at a **different path** (`/paperclip.webmanifest`).
- **Distinct manifest paths between co-hosted PWAs is load-bearing on Android
  Chrome.** Do not rename or move House Hunter's manifest without coordinating
  with the Paperclip team, and if a third app ever joins this host, that app
  must use yet another distinct manifest path (e.g. `/<app-name>.webmanifest`).

## The Android Chrome WebAPK identity rule

When Chrome on Android installs a PWA, it creates a WebAPK. Each WebAPK is
keyed by an internal app id that the browser mints from:

- the device platform,
- the browser,
- the **normalized manifest URL**.

This is documented in
[Chrome's PWA manifest-id docs](https://developer.chrome.com/docs/capabilities/pwa-manifest-id):

> "On Android Chromium-based browsers, PWAs are uniquely identified using
> `manifest_url`, with an app id minted using platform, browser, and
> normalized_manifest_url. This differs from desktop Chrome, where an app id
> is minted using `start_url`."

Two practical consequences:

1. **The W3C `id` manifest field does not disambiguate WebAPKs on Android.**
   Setting `"id": "/?pwa=house-hunter"` (which we do, see
   `public/manifest.webmanifest`) is correct and useful for desktop Chrome and
   for spec compliance, but Android Chrome's installability machinery
   predates the `id` field and ignores it.
2. **Two apps that serve their manifests at the same path will collide.**
   Chrome's URL normalization can collapse port differences in this context,
   so `host:8443/site.webmanifest` and `host:3001/site.webmanifest` can
   normalize to the same identifier. Distinct paths are the reliable fix.

## What collision looks like

Symptom: installing one app via Android Chrome's "Install app" dialog causes
the other app's install button to fail with **"This app is already installed."**

If you see this, the first thing to check is whether the two apps' manifests
are reachable at distinct paths. If they are not, the apps will be treated as
the same WebAPK regardless of `id`, `start_url`, or any other field.

## What we tried that did NOT fix it

Adding `"id"` fields to both manifests (House Hunter:
`/?pwa=house-hunter`, Paperclip: `/?pwa=paperclip`) did not resolve the
collision on Android Chrome. The `id` change is still in House Hunter's
manifest because it costs nothing and is correct per spec — but it is not
what made coexistence work.

## What actually worked

Paperclip moved its manifest from `/site.webmanifest` to
`/paperclip.webmanifest`. House Hunter's manifest path stayed put. Distinct
paths produced distinct `normalized_manifest_url` values, and Android Chrome
began treating the two apps as separate WebAPKs.

After Paperclip's fix shipped, the user uninstalled the existing Paperclip
WebAPK on their phone and reinstalled both apps fresh. Both coexisted.

## Rules for future PWA work on this host

1. **Don't change House Hunter's manifest path.** If you must rename it
   (e.g. as part of a larger refactor), coordinate with the Paperclip team
   and pick a path that does not collide with any other app deployed on the
   same Tailscale host.
2. **If a third app is deployed on this host, give it yet another distinct
   manifest path** (e.g. `/<app-name>.webmanifest`). Generic names like
   `manifest.webmanifest` or `site.webmanifest` are higher-risk because
   other apps are likely to also pick them.
3. **Keep the `id` field set** in `public/manifest.webmanifest`. It does not
   fix Android Chrome but it disambiguates desktop Chrome and is the
   spec-defined identifier — future browser versions are more likely to
   honor it than to revert.
4. **Theme color and background color are app-distinguishing UI choices,
   not collision fixes.** House Hunter uses `theme_color: #14532d`
   (hunter green) and `background_color: #09090b` (matches the dark body
   background). Keep them visually distinct from Paperclip's
   `#18181b` so a user can tell at a glance which app's splash screen
   they're looking at.

## Where to look in the code

- `public/manifest.webmanifest` — the manifest itself.
- `index.html` — `<link rel="manifest">` and the matching `<meta name="theme-color">`.
- `public/sw.js` — service worker (required for installability; network-first).
- `src/main.tsx` — service-worker registration (production-only).
- `qa/biz125-pwa-installable.spec.ts` — Playwright tests that assert the
  manifest is served with the right content type, that it parses, that the
  required fields are present, that the icons resolve, and that the service
  worker registers.

## When to revisit this doc

- Adding any third PWA to the same Tailscale host.
- Renaming or moving the manifest file.
- Upgrades to Chrome that change WebAPK identity behavior (watch for
  Chrome release notes mentioning `manifest_id` adoption on Android).
- Reports from the Board user that install behavior is broken or that one
  app is masquerading as the other.
