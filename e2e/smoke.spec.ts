import { expect, test } from '@playwright/test';

test('the app loads, is installable, and plans a week', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Stasera' })).toBeVisible();
  const manifest = page.locator('link[rel="manifest"]');
  await expect(manifest).toHaveCount(1);
  await page.getByRole('button', { name: /Plan this week/ }).click();
  await expect(page.getByRole('button', { name: /^Cook$/ })).toBeVisible();
  // No horizontal scroll on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
