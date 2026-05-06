import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'
import path from 'path'

test('BIZ-49/BIZ-50: favicon + hunt detail gear icon', async ({ page, request }) => {
  expect(
    existsSync(path.join(process.cwd(), 'public', 'favicon.ico')),
    'public/favicon.ico should exist',
  ).toBe(true)
  expect(
    existsSync(path.join(process.cwd(), 'resources', 'icons', 'settings_icon.svg')),
    'resources/icons/settings_icon.svg should exist',
  ).toBe(true)
  expect(
    existsSync(path.join(process.cwd(), 'resources', 'icons', 'House_Hunter_Favicon.svg')),
    'resources/icons/House_Hunter_Favicon.svg should exist',
  ).toBe(true)

  const errors: string[] = []
  const allConsole: string[] = []
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    allConsole.push(line)
    if (msg.type() === 'error') errors.push(line)
  })

  await page.goto('/')
  await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1)

  const faviconResp = await page.request.get('/favicon.ico')
  expect(faviconResp.status(), 'favicon should be served from static root').toBe(200)

  const suffix = Date.now()
  const name = `Icon Test Hunt ${suffix}`
  const post = await request.post('/api/house-hunts', { data: { name } })
  expect(post.status()).toBe(201)
  const created = (await post.json()) as { id: number }

  await page.goto(`/hunts/${created.id}`)
  const gearButton = page.getByTestId('open-config-drawer')
  await expect(gearButton).toBeVisible()

  const gearSvg = gearButton.locator('svg')
  await expect(gearSvg).toHaveAttribute('viewBox', '0 0 512 512')

  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([])
})

