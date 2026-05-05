import { test, expect } from '@playwright/test'

test('GET /api/house-hunts returns 200 with a JSON array', async ({ request }) => {
  const r = await request.get('/api/house-hunts')
  expect(r.status()).toBe(200)
  const body = await r.json()
  expect(Array.isArray(body)).toBe(true)
})

test('POST /api/house-hunts creates hunt and GET lists it; DELETE returns 204', async ({ request }) => {
  const suffix = Date.now()
  const name = `Test Hunt ${suffix}`
  const post = await request.post('/api/house-hunts', { data: { name } })
  expect(post.status()).toBe(201)
  const created = (await post.json()) as { id: number; name: string; created_at: string }
  expect(created.name).toBe(name)
  expect(typeof created.created_at).toBe('string')

  const list = await request.get('/api/house-hunts')
  expect(list.status()).toBe(200)
  const hunts = (await list.json()) as { id: number; name: string }[]
  expect(hunts.some((h) => h.id === created.id && h.name === name)).toBe(true)

  const del = await request.delete(`/api/house-hunts/${created.id}`)
  expect(del.status()).toBe(204)
})

test('House Hunts sidebar: create and delete via UI without console errors', async ({ page, request }) => {
  const errors: string[] = []
  const allConsole: string[] = []
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    allConsole.push(line)
    if (msg.type() === 'error') errors.push(line)
  })

  const suffix = Date.now()
  const huntName = `UI Hunt ${suffix}`

  await page.goto('/scrapers')
  await expect(page.getByTestId('house-hunts-section')).toBeVisible()

  await page.getByTestId('new-hunt-button').click()
  await expect(page.getByTestId('hunt-form-modal')).toBeVisible()
  await page.getByTestId('hunt-name-input').fill(huntName)
  await page.getByTestId('hunt-save-button').click()
  await expect(page.getByTestId('hunt-form-modal')).toBeHidden({ timeout: 15_000 })

  const huntLink = page.getByRole('link', { name: huntName })
  await expect(huntLink).toBeVisible()
  const href = await huntLink.getAttribute('href')
  const idMatch = href?.match(/\/hunts\/(\d+)/)
  expect(idMatch).toBeTruthy()
  const huntId = Number(idMatch![1])

  page.once('dialog', (d) => d.accept())
  await page.getByTestId(`hunt-edit-${huntId}`).click()
  await expect(page.getByTestId('hunt-form-modal')).toBeVisible()
  await page.getByTestId('hunt-delete-button').click()
  await expect(page.getByTestId('hunt-form-modal')).toBeHidden({ timeout: 15_000 })
  await expect(huntLink).toHaveCount(0)

  const verify = await request.get('/api/house-hunts')
  const remaining = (await verify.json()) as { id: number }[]
  expect(remaining.some((h) => h.id === huntId)).toBe(false)

  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([])
})
