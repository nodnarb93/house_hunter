import { test, expect, type APIRequestContext } from '@playwright/test'

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

test.describe('BIZ-293 Phase 1 hunts overview', () => {
  test('lists hunts, navigates to detail, opens create modal', async ({ page, request }) => {
    const suffix = Date.now()
    const nameA = `Overview Hunt A ${suffix}`
    const nameB = `Overview Hunt B ${suffix}`
    const idA = await createHunt(request, nameA)
    const idB = await createHunt(request, nameB)

    await page.goto('/hunts')
    await expect(page.getByTestId('hunts-overview')).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${idA}`)).toContainText(nameA)
    await expect(page.getByTestId(`hunt-card-${idB}`)).toContainText(nameB)

    await page.getByTestId(`hunt-card-${idA}`).click()
    await expect(page).toHaveURL(new RegExp(`/hunts/${idA}$`))

    await page.goto('/hunts')
    await page.getByTestId('hunts-overview-new-button').click()
    await expect(page.getByTestId('hunt-form-modal')).toBeVisible()

    await request.delete(`/api/house-hunts/${idA}`)
    await request.delete(`/api/house-hunts/${idB}`)
  })

  test('empty state when no hunts', async ({ page }) => {
    await page.route('**/api/house-hunts', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        return
      }
      await route.continue()
    })

    await page.goto('/hunts')
    await expect(page.getByTestId('hunts-overview-empty')).toBeVisible()
    await expect(page.getByText('No hunts yet — create one')).toBeVisible()
  })
})
