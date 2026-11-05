import { expect, test, type Page } from '@playwright/test';

/**
 * The phone journey from PLAN.md §12: set up (demo plan) → generate a week → lock and replace a meal →
 * add a dish → shop offline with persistence → open cooking instructions. Screenshots (demo data only)
 * are written to docs/screenshots on the iPhone project.
 */

const shot = async (page: Page, name: string) => {
  if (test.info().project.name !== 'iphone') return;
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
};

test.describe.configure({ mode: 'serial' });

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test('plan, swap, add a dish, shop offline, cook', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- Tonight: empty state → plan the week -------------------------------------------------------
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Stasera' })).toBeVisible();
  await page.getByRole('button', { name: /Plan this week/ }).click();
  await expect(page.getByRole('link', { name: /^Cook$/ })).toBeVisible();
  await expect(page.getByText(/oil for this meal/)).toBeVisible();
  await shot(page, 'tonight');

  // --- Week: lock the first lunch, replace a dinner, regenerate the rest -----------------------------
  await tab(page, 'Week').click();
  await expect(page.getByRole('heading', { name: 'Week', level: 1 })).toBeVisible();
  const dayCards = page.getByRole('region', {
    name: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/,
  });
  await expect(dayCards).toHaveCount(7);
  const lunchRow = page.getByRole('button', { name: /^Lunch: / }).first();
  const lunchTitle = (await lunchRow.getAttribute('aria-label'))!.replace(/^Lunch: /, '');
  await lunchRow.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /^Lock$/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Lunch: / }).first()).toHaveAttribute(
    'aria-label',
    `Lunch: ${lunchTitle}`,
  );
  await expect(page.getByText('Locked').first()).toBeVisible();

  const dinnerRow = page.getByRole('button', { name: /^Dinner: / }).nth(1);
  const dinnerTitle = (await dinnerRow.getAttribute('aria-label'))!;
  await dinnerRow.click();
  const another = page.getByRole('dialog').getByRole('button', { name: /Another dish/ });
  if (await another.isVisible()) {
    await another.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Dinner: / }).nth(1)).not.toHaveAttribute(
      'aria-label',
      dinnerTitle,
    );
  } else {
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: /Regenerate unlocked/ }).click();
  await expect(page.getByRole('button', { name: /^Lunch: / }).first()).toHaveAttribute(
    'aria-label',
    `Lunch: ${lunchTitle}`,
  );
  await expect(page.getByText('Weekly counts')).toBeVisible();
  await shot(page, 'week');

  // --- Recipes: add a dish and read its verdict ------------------------------------------------------
  await tab(page, 'Recipes').click();
  await page.getByRole('button', { name: /New dish/ }).click();
  await page
    .getByPlaceholder('Couscous with chickpeas and cherry tomatoes')
    .fill('Farro bowl with chickpeas and spinach');
  await page.getByPlaceholder('Cous cous con ceci e pomodorini').fill('Farro con ceci e spinaci');
  const grainSwitch = page.getByRole('switch', { name: /^Grain / });
  if ((await grainSwitch.getAttribute('aria-checked')) !== 'true') await grainSwitch.click();
  await page
    .getByRole('button', { name: /Any (cereal|grain)/ })
    .first()
    .click();
  await page.getByRole('switch', { name: /^Protein / }).click();
  await page
    .getByRole('group', { name: /Legumes/ })
    .getByRole('button', { name: /canned chickpeas/ })
    .click();
  await page
    .getByRole('group', { name: 'Free vegetables' })
    .getByRole('button', { name: /^spinach/ })
    .click();
  await page
    .getByRole('group', { name: 'Condiments' })
    .getByRole('button', { name: /extra-virgin olive oil/ })
    .click();
  await page
    .getByRole('group', { name: 'Cooking' })
    .getByRole('button', { name: /boiled/ })
    .click();
  await page
    .locator('textarea')
    .first()
    .fill(
      'Boil the grain until tender.\nWarm the chickpeas with garlic and wilt in the spinach.\nCombine and dress with the oil allowance.',
    );
  await expect(page.getByText(/Fits Day \d lunch/).first()).toBeVisible();
  await page
    .getByRole('button', { name: /^Save$/ })
    .last()
    .click();
  await expect(page.getByRole('heading', { name: 'Farro bowl with chickpeas and spinach' })).toBeVisible();
  await expect(page.getByText(/Fits Day \d lunch/).first()).toBeVisible();
  await shot(page, 'recipe-verdict');

  // The draft that is missing its protein shows the honest verdict.
  await page.goto('/#/recipes/pasta-aubergine-parmigiano');
  await expect(page.getByText(/protein slot unfilled/i).first()).toBeVisible();
  await shot(page, 'recipe-unfilled');

  // --- Shopping: tick offline, reload, still ticked ---------------------------------------------------
  await page.goto('/#/shopping');
  const rows = page.getByRole('checkbox');
  const before = await rows.count();
  expect(before).toBeGreaterThan(20);
  await shot(page, 'shopping');
  await context.setOffline(true);
  await expect(page.getByText(/Offline/)).toBeVisible();
  const first = rows.first();
  const firstName = await first.getAttribute('aria-label');
  await first.click();
  await expect(page.getByRole('region', { name: 'In the cart' })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('region', { name: 'In the cart' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'In the cart' }).getByRole('checkbox', { name: firstName ?? undefined }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: /Copy list/ }).click();

  // --- Cook view ---------------------------------------------------------------------------------------
  await page.goto('/');
  await page.getByRole('link', { name: /^Cook$/ }).click();
  await expect(page.getByRole('heading', { name: 'Steps' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Pot' })).toBeVisible();
  await shot(page, 'cook');
  await page.getByRole('button', { name: /Done 👍/ }).click();
  await expect(page.getByText(/Marked as eaten/)).toBeVisible();

  // --- Settings and plan amounts --------------------------------------------------------------------
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await shot(page, 'settings');
  await page.goto('/#/settings/plan');
  await expect(page.getByText(/Day 1/).first()).toBeVisible();
  await shot(page, 'plan-amounts');

  // No horizontal scroll anywhere visited, no page errors.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
