import { test, expect } from '@playwright/test'
import type { HouseHunt } from '../src/api'

function stubHunt(id: number, name: string): HouseHunt {
  return {
    id,
    name,
    created_at: '2026-01-01T00:00:00.000Z',
    total_listings: 0,
    active_listings_count: 0,
    last_scraped_at: null,
    cover_image_url: null,
    is_paused: false,
    location_text: null,
    min_price: null,
    max_price: null,
    min_beds: null,
    min_baths: null,
    unviewed_count: 0,
    recent_listing_images: [],
  }
}

test.describe('BIZ-296 Phase 3 hunts overview skeleton', () => {
  test('shows skeleton while loading then hunt cards after resolve', async ({ page }) => {
    const hunts = [stubHunt(30, 'Loaded Hunt')]

    await page.route('**/api/house-hunts', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await new Promise((r) => setTimeout(r, 1500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(hunts),
      })
    })

    await page.goto('/hunts')

    await expect(page.getByTestId('hunts-overview-skeleton')).toBeVisible()
    await expect(page.getByTestId('hunts-overview-skeleton-card').first()).toBeVisible()

    await expect(page.getByTestId('hunts-overview-skeleton')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByTestId('hunt-card-30')).toBeVisible()
  })
})
