import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'
import path from 'path'

test('BIZ-56: dark and light favicon directories exist with all required assets', () => {
  const darkDir = path.join(process.cwd(), 'public', 'favicons', 'dark')
  const lightDir = path.join(process.cwd(), 'public', 'favicons', 'light')
  const requiredFiles = [
    'favicon.ico',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'manifest.json',
  ]
  for (const f of requiredFiles) {
    expect(existsSync(path.join(darkDir, f)), `dark/${f} should exist`).toBe(true)
    expect(existsSync(path.join(lightDir, f)), `light/${f} should exist`).toBe(true)
  }
  expect(
    existsSync(path.join(process.cwd(), 'public', 'favicon.ico')),
    'old public/favicon.ico should be gone',
  ).toBe(false)
  expect(
    existsSync(path.join(process.cwd(), 'resources', 'icons', 'House_Hunter_Favicon.svg')),
    'old House_Hunter_Favicon.svg should be gone',
  ).toBe(false)
})

test('BIZ-56: favicon link elements present and dark favicon files served', async ({ page, request }) => {
  const errors: string[] = []
  const allConsole: string[] = []
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    allConsole.push(line)
    if (msg.type() === 'error') errors.push(line)
  })

  await page.goto('/')

  await expect(page.locator('#favicon-32')).toHaveCount(1)
  await expect(page.locator('#favicon-16')).toHaveCount(1)
  await expect(page.locator('#favicon-ico')).toHaveCount(1)
  await expect(page.locator('#apple-touch-icon')).toHaveCount(1)

  const darkFavicon = await request.get('/favicons/dark/favicon.ico')
  expect(darkFavicon.status(), 'dark favicon.ico should be served').toBe(200)

  const lightFavicon = await request.get('/favicons/light/favicon.ico')
  expect(lightFavicon.status(), 'light favicon.ico should be served').toBe(200)

  const darkPng32 = await request.get('/favicons/dark/favicon-32x32.png')
  expect(darkPng32.status(), 'dark favicon-32x32.png should be served').toBe(200)

  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([])
})

test('BIZ-49/BIZ-50: hunt detail gear icon still works', async ({ page, request }) => {
  expect(
    existsSync(path.join(process.cwd(), 'resources', 'icons', 'settings_icon.svg')),
    'resources/icons/settings_icon.svg should still exist',
  ).toBe(true)

  const errors: string[] = []
  const allConsole: string[] = []
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    allConsole.push(line)
    if (msg.type() === 'error') errors.push(line)
  })

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
