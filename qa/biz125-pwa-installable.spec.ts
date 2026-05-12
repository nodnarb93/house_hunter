import { test, expect } from '@playwright/test'

test.describe('BIZ-125 / BIZ-126 PWA installability', () => {
  test('manifest, head tags, SW, icons, and service worker registration', async ({ page, baseURL }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message)
    })

    await page.goto('/')

    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink).toHaveAttribute('href', /.*/)
    const manifestHref =
      (await manifestLink.getAttribute('href')) ?? '/manifest.webmanifest'
    expect(manifestHref === '/manifest.webmanifest' || manifestHref.endsWith('/manifest.webmanifest')).toBe(true)

    const themeColor = page.locator('meta[name="theme-color"]')
    await expect(themeColor).toHaveCount(1)
    await expect(themeColor).toHaveAttribute('content', /.+/)

    await expect(page.locator('meta[name="mobile-web-app-capable"][content="yes"]')).toHaveCount(1)

    const viewport = page.locator('meta[name="viewport"]')
    await expect(viewport).toHaveAttribute('content', /viewport-fit=cover/)

    const manifestRes = await page.request.get(new URL(manifestHref, baseURL).href)
    expect(manifestRes.status()).toBe(200)
    const manifestCt = manifestRes.headers()['content-type'] ?? ''
    expect(manifestCt).toMatch(/application\/(manifest\+)?json/i)
    const manifest = (await manifestRes.json()) as Record<string, unknown>
    expect(manifest.name).toBe('House Hunter')
    expect(manifest.short_name).toBe('Hunter')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(typeof manifest.theme_color).toBe('string')
    expect((manifest.theme_color as string).length).toBeGreaterThan(0)
    expect(typeof manifest.background_color).toBe('string')
    expect((manifest.background_color as string).length).toBeGreaterThan(0)
    const icons = manifest.icons as Array<{ sizes?: string; purpose?: string; src: string }>
    expect(icons.some((i) => i.sizes === '192x192')).toBe(true)
    expect(icons.some((i) => i.sizes === '512x512')).toBe(true)
    expect(icons.some((i) => String(i.purpose ?? '').includes('maskable'))).toBe(true)

    for (const icon of icons) {
      const iconUrl = new URL(icon.src, baseURL).href
      const iconRes = await page.request.get(iconUrl)
      expect(iconRes.status()).toBe(200)
      const ct = iconRes.headers()['content-type'] ?? ''
      expect(ct.startsWith('image/png')).toBe(true)
    }

    const swRes = await page.request.get(new URL('/sw.js', baseURL).href)
    expect(swRes.status()).toBe(200)
    const swCt = swRes.headers()['content-type'] ?? ''
    expect(swCt).toMatch(/(application|text)\/javascript/)
    const swBody = await swRes.text()
    expect(swBody).toContain('skipWaiting')
    expect(swBody).toContain('clients.claim')
    expect(swBody).toMatch(/addEventListener\(\s*['"]fetch['"]/)

    const hasActive = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready
      return Boolean(r.active)
    })
    expect(hasActive).toBe(true)

    // Cross-origin fetches must not be handled by this SW's fetch listener; otherwise
    // Playwright's page.route never sees them (BIZ-69 CDN counting regression).
    await page.route('https://example.com/pwa-cross-origin-probe*', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'pwa-probe-ok',
      })
    })
    const probeText = await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      const res = await fetch('https://example.com/pwa-cross-origin-probe')
      return await res.text()
    })
    expect(probeText).toBe('pwa-probe-ok')

    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([])
  })
})
