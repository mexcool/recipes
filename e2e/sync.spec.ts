import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two phones, one household, through the sync service. Runs only when SYNC_URL points at a running
 * service (locally: `pnpm worker:migrate:local && pnpm worker:dev`, then SYNC_URL=http://localhost:8787).
 */
const SYNC_URL = process.env.SYNC_URL;

test.skip(!SYNC_URL, 'SYNC_URL not set');

async function phone(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  return context.newPage();
}

test('phone B joins phone A; ticks travel both ways; a plan change is pulled', async ({ browser }) => {
  const a = await phone(browser);
  await a.goto('/');
  await a.getByRole('button', { name: /Plan this week/ }).click();
  await expect(a.getByRole('button', { name: /^Cook$/ })).toBeVisible();
  const firstLunchA = await a.getByRole('heading', { level: 2 }).first().textContent();

  // Connect A.
  await a.goto('/#/settings');
  await a.getByLabel('Service URL').fill(SYNC_URL!);
  await a.getByRole('button', { name: /Connect this phone/ }).click();
  await expect(a.getByText('Connected').first()).toBeVisible();
  await a.getByRole('button', { name: /Join on another phone/ }).click();
  await a.getByRole('button', { name: /Copy link/ }).click();
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('#/join?');
  await a.keyboard.press('Escape');

  // B joins through the link; the secret leaves the address bar and history at once.
  const b = await phone(browser);
  await b.goto(link);
  await expect(b.getByText(new URL(SYNC_URL!).host)).toBeVisible();
  expect(await b.evaluate(() => window.location.hash)).toBe('#/join');
  await b.getByRole('button', { name: /Join and replace my data/ }).click();
  await expect(b.getByRole('button', { name: /^Cook$/ })).toBeVisible();
  const firstLunchB = await b.getByRole('heading', { level: 2 }).first().textContent();
  expect(firstLunchB).toBe(firstLunchA);
  await b.goBack();
  await expect(b.getByRole('button', { name: /Join and replace my data/ })).toHaveCount(0);
  expect(await b.evaluate(() => window.location.hash)).not.toContain('t=');
  await b.goto('/');

  // Requests from here on: ticks travel as operations, never as a document push.
  const putsB: string[] = [];
  b.on('request', (r) => {
    if (r.method() === 'PUT') putsB.push(r.url());
  });

  // B ticks an item; A pulls it.
  await b.goto('/#/shopping');
  const row = b.getByRole('checkbox').first();
  const name = await row.getAttribute('aria-label');
  await row.click();
  await expect(b.getByRole('region', { name: 'In the cart' })).toBeVisible();
  await b.waitForTimeout(2500); // debounced push
  expect(putsB).toEqual([]);
  await a.goto('/#/settings');
  await a.getByRole('button', { name: /Sync now/ }).click();
  await a.goto('/#/shopping');
  await expect(
    a.getByRole('region', { name: 'In the cart' }).getByRole('checkbox', { name: name ?? undefined }),
  ).toHaveCount(1);

  // A changes the plan (regenerates); B pulls the new document.
  await a.goto('/#/week');
  await a.getByRole('button', { name: /Regenerate unlocked/ }).click();
  await a.waitForTimeout(2500);
  const weekA = await a
    .getByRole('button', { name: /^Dinner: / })
    .first()
    .getAttribute('aria-label');
  await b.goto('/#/settings');
  await b.getByRole('button', { name: /Sync now/ }).click();
  await b.goto('/#/week');
  await expect(b.getByRole('button', { name: /^Dinner: / }).first()).toHaveAttribute('aria-label', weekA!);

  // Both phones edit the plan while apart: the later push loses, sees the other version, and the notice
  // stays until dismissed.
  await b.goto('/#/week');
  await b.getByRole('button', { name: /Regenerate unlocked/ }).click();
  await b.waitForTimeout(2500);
  await a.context().setOffline(true);
  await a.goto('/#/week');
  await a.getByRole('button', { name: /Regenerate unlocked/ }).click();
  await a.context().setOffline(false);
  await a.goto('/#/settings');
  await a.getByRole('button', { name: /Sync now/ }).click();
  await expect(a.getByText(/changed on the other phone/)).toBeVisible();
  await a.waitForTimeout(4000); // several rounds later it is still there
  await expect(a.getByText(/changed on the other phone/)).toBeVisible();
  await a.getByRole('button', { name: /Got it/ }).click();
  await expect(a.getByText(/changed on the other phone/)).toHaveCount(0);
});
