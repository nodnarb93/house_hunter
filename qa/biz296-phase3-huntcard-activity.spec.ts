import { test, expect } from '@playwright/test'
import type { HouseHunt } from '../src/api'

function stubHunt(overrides: Partial<HouseHunt> & Pick<HouseHunt, 'id' | 'name'>): HouseHunt {
  return {
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
    ...overrides,
  }
}

test.describe('BIZ-296 Phase 3 hunt card activity', () => {
  test('new badge and activity strip render independently', async ({ page }) => {
    const hunts: HouseHunt[] = [
      stubHunt({
        id: 1,
        name: 'Hunt A',
        unviewed_count: 3,
        recent_listing_images: [
          'https://example.com/a.jpg',
          'https://example.com/b.jpg',
          'https://example.com/c.jpg',
        ],
      }),
      stubHunt({
        id: 2,
        name: 'Hunt B',
        unviewed_count: 0,
        recent_listing_images: [],
      }),
    ]

    await page.route('**/api/house-hunts', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(hunts),
      })
    })

    await page.goto('/hunts')

    await expect(page.getByTestId('hunt-card-new-badge-1')).toBeVisible()
    await expect(page.getByTestId('hunt-card-new-badge-1')).toContainText('3')
    await expect(page.getByTestId('hunt-card-activity-strip-1')).toBeVisible()
    await expect(page.getByTestId('hunt-card-activity-thumb-1-0')).toBeVisible()
    await expect(page.getByTestId('hunt-card-activity-thumb-1-1')).toBeVisible()
    await expect(page.getByTestId('hunt-card-activity-thumb-1-2')).toBeVisible()

    await expect(page.getByTestId('hunt-card-new-badge-2')).toHaveCount(0)
    await expect(page.getByTestId('hunt-card-activity-strip-2')).toHaveCount(0)
  })
})
