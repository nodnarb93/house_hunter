import { test, expect } from '@playwright/test'

test('BIZ-26 phase 7: primary nav cleanup and System Logs reachable', async ({ page }) => {
  const errors: string[] = []
  const allConsole: string[] = []
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`
    allConsole.push(line)
    if (msg.type() === 'error') errors.push(line)
  })

  await page.goto('/')
  await page.waitForFunction(
    () => (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 0
  )

  const sidebar = page.getByTestId('sidebar')
  const primaryNav = sidebar.locator('nav[aria-label="House hunts"], nav[aria-label="Triage"]')

  for (const label of ['Last Runs', 'Filters', 'Schedule']) {
    await expect(primaryNav.getByText(label, { exact: true })).toHaveCount(0)
  }

  const pipelineNav = sidebar.getByRole('navigation', { name: 'Pipeline configuration' })
  await pipelineNav.getByRole('link', { name: 'System Logs' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'System Logs' })).toBeVisible()
  await expect(
    page.getByText(/Recent pipeline runs|No runs yet/u).first()
  ).toBeVisible()

  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([])
})
