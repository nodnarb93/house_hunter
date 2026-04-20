import { test, expect } from '@playwright/test';

test('hello world', async ({ page }) => {
  await page.goto('data:text/html,<h1>Hello World</h1>');
  await expect(page.locator('h1')).toHaveText('Hello World');
});
