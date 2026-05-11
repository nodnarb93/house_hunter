import { test, expect } from '@playwright/test'

test.describe('BIZ-110 Active Scrapers auto-expand after create', () => {
  async function pickRss(page: import('@playwright/test').Page) {
    await page.getByTestId('scraper-source-type-dropdown').click()
    await page.getByRole('option', { name: /^RSS Feed$/i }).click()
  }

  async function deleteScraperByUrl(request: import('@playwright/test').APIRequestContext, url: string) {
    const list = await request.get('/api/scrapers')
    expect(list.ok()).toBeTruthy()
    const rows = (await list.json()) as Array<{ id: number; url?: string | null }>
    for (const row of rows) {
      if (row.url === url) {
        await request.delete(`/api/scrapers/${row.id}`).catch(() => {})
      }
    }
  }

  test('RSS create expands collapsed Active Scrapers and shows new row', async ({ page, request }) => {
    const feedUrl = `https://biz110-collapsed-${Date.now()}.example.com/feed.xml`
    try {
      await page.goto('/scrapers')
      const toggle = page.getByTestId('scrapers-active-toggle')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')

      await pickRss(page)
      await page.getByLabel('Feed URL').fill(feedUrl)
      await page.getByRole('button', { name: 'Add feed' }).click()

      await expect(page.getByText('Feed added.')).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('#scrapers-active-list')).toBeVisible()
      await expect(page.locator('#scrapers-active-list').getByText(feedUrl)).toBeVisible()
    } finally {
      await deleteScraperByUrl(request, feedUrl)
    }
  })

  test('RSS create keeps Active Scrapers expanded when already open', async ({ page, request }) => {
    const feedUrl = `https://biz110-expanded-${Date.now()}.example.com/feed.xml`
    try {
      await page.goto('/scrapers')
      const toggle = page.getByTestId('scrapers-active-toggle')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')

      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')

      await pickRss(page)
      await page.getByLabel('Feed URL').fill(feedUrl)
      await page.getByRole('button', { name: 'Add feed' }).click()

      await expect(page.getByText('Feed added.')).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('#scrapers-active-list').getByText(feedUrl)).toBeVisible()
    } finally {
      await deleteScraperByUrl(request, feedUrl)
    }
  })
})
