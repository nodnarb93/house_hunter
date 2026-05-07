import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { extractPhotoUrls } from '../server/scrapers/redfinAdapter'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.describe('BIZ-69 Redfin extractPhotoUrls (pure)', () => {
  test('fixture yields deduped https URLs with deterministic repeats', () => {
    const html = readFileSync(path.join(__dirname, 'fixtures', 'redfin-listing.html'), 'utf8')
    const once = extractPhotoUrls(html)
    expect(Array.isArray(once)).toBe(true)
    expect(once.length).toBeGreaterThanOrEqual(1)
    for (const u of once) {
      expect(u.startsWith('https://ssl.cdn-redfin.com/')).toBe(true)
    }
    expect(new Set(once).size).toBe(once.length)

    const twice = extractPhotoUrls(html)
    expect(twice).toEqual(once)
  })
})
