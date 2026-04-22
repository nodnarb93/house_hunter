import { test, expect } from '@playwright/test';

test('app smoke', async ({ page }) => {
  const errors: string[] = [];
  const allConsole: string[] = [];
  page.on('console', (msg) => {
    const line = `[${msg.type()}] ${msg.text()}`;
    allConsole.push(line);
    if (msg.type() === 'error') errors.push(line);
  });

  await page.goto('/');
  await page.waitForFunction(
    () => (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 0
  );

  const title = (await page.title()).trim();
  expect(title.length, 'page title should be non-empty').toBeGreaterThan(0);
  expect(errors, `console output:\n${allConsole.join('\n')}`).toEqual([]);
});
