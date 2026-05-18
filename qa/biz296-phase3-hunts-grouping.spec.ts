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

test.describe('BIZ-296 Phase 3 hunts overview grouping', () => {
  test('mixed active and paused hunts render section headers', async ({ page }) => {
    const hunts: HouseHunt[] = [
      stubHunt({ id: 10, name: 'Active One', is_paused: false }),
      stubHunt({ id: 11, name: 'Active Two', is_paused: false }),
      stubHunt({ id: 12, name: 'Paused One', is_paused: true }),
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

    const activeSection = page.getByTestId('hunts-overview-section-active')
    const pausedSection = page.getByTestId('hunts-overview-section-paused')
    await expect(activeSection).toBeVisible()
    await expect(pausedSection).toBeVisible()
    await expect(activeSection.locator('[data-testid="hunt-card-10"]')).toBeVisible()
    await expect(activeSection.locator('[data-testid="hunt-card-11"]')).toBeVisible()
    await expect(pausedSection.locator('[data-testid="hunt-card-12"]')).toBeVisible()
  })

  test('all active hunts render flat list without section headers', async ({ page }) => {
    const hunts: HouseHunt[] = [
      stubHunt({ id: 20, name: 'Alpha', is_paused: false }),
      stubHunt({ id: 21, name: 'Beta', is_paused: false }),
      stubHunt({ id: 22, name: 'Gamma', is_paused: false }),
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

    await expect(page.getByTestId('hunts-overview-section-active')).toHaveCount(0)
    await expect(page.getByTestId('hunts-overview-section-paused')).toHaveCount(0)
    await expect(page.getByTestId('hunt-card-20')).toBeVisible()
    await expect(page.getByTestId('hunt-card-21')).toBeVisible()
    await expect(page.getByTestId('hunt-card-22')).toBeVisible()
  })
})
