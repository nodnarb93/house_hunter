import { test, expect, type APIRequestContext } from '@playwright/test'

async function createHunt(request: APIRequestContext, name: string) {
  const res = await request.post('/api/house-hunts', { data: { name } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: number }).id
}

test.describe('BIZ-295 Phase 2 hunts search', () => {
  const createdHuntIds: number[] = []

  test.afterEach(async ({ request }) => {
    for (const id of createdHuntIds) {
      await request.delete(`/api/house-hunts/${id}`).catch(() => {})
    }
    createdHuntIds.length = 0
  })

  test('filters by hunt name and location text', async ({ page, request }) => {
    const suffix = Date.now()
    const seattleName = `Seattle Houses ${suffix}`
    const portlandName = `Portland Condos ${suffix}`
    const bayName = `Bay Area Lofts ${suffix}`
    const seattleId = await createHunt(request, seattleName)
    const portlandId = await createHunt(request, portlandName)
    const bayId = await createHunt(request, bayName)
    createdHuntIds.push(seattleId, portlandId, bayId)

    const put = await request.put(`/api/house-hunts/${seattleId}`, {
      data: { filters: { location_text: 'Seattle, WA' } },
    })
    expect(put.status()).toBe(200)

    await page.goto('/hunts')
    await expect(page.getByTestId(`hunt-card-${seattleId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${portlandId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${bayId}`)).toBeVisible()

    const search = page.getByTestId('hunts-overview-search')
    await search.fill('port')
    await expect(page.getByTestId(`hunt-card-${portlandId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${seattleId}`)).toHaveCount(0)
    await expect(page.getByTestId(`hunt-card-${bayId}`)).toHaveCount(0)

    await search.fill('')
    await expect(page.getByTestId(`hunt-card-${seattleId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${portlandId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${bayId}`)).toBeVisible()

    await search.fill('WA')
    await expect(page.getByTestId(`hunt-card-${seattleId}`)).toBeVisible()
    await expect(page.getByTestId(`hunt-card-${portlandId}`)).toHaveCount(0)
    await expect(page.getByTestId(`hunt-card-${bayId}`)).toHaveCount(0)
  })
})
