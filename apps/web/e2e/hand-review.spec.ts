import { expect, test, type Page } from '@playwright/test';

/** Plays one hand as cheaply as possible: check when free, otherwise fold. */
async function playOneHand(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: 'Почати роздачу' });
  await start.click();
  await expect(start).toBeHidden();

  const check = page.getByRole('button', { name: 'Чек', exact: true });
  const fold = page.getByRole('button', { name: 'Фолд', exact: true });
  // Bots act with a cosmetic delay; keep acting whenever it is our turn until the hand is over.
  await expect(async () => {
    if (await start.isVisible()) return;
    if (await check.isVisible()) await check.click();
    else if (await fold.isVisible()) await fold.click();
    await expect(start).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
}

test('play a hand, then open its review with the worker-computed analysis', async ({ page }) => {
  await page.goto('/table');
  await playOneHand(page);

  await page
    .getByRole('navigation', { name: 'Головна навігація' })
    .getByRole('link', { name: 'Історія роздач' })
    .click();
  await expect(page.getByRole('heading', { name: 'Історія роздач' })).toBeVisible();

  const hand = page.getByRole('link', { name: /Роздача №1\b/ });
  await expect(hand).toBeVisible();
  await hand.click();

  await expect(page.getByRole('heading', { name: 'Розбір роздачі №1' })).toBeVisible();
  // The analysis arrives from the Web Worker; the page updates by itself.
  await expect(page.getByRole('heading', { name: 'Результат' })).toBeVisible({ timeout: 30_000 });

  // Keyboard control of the replayer.
  const slider = page.getByRole('slider', { name: 'Крок роздачі' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', /Банк забирає/);
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '1');
});

test('stats and glossary are reachable from the navigation', async ({ page }) => {
  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: 'Статистика' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Головна навігація' })
    .getByRole('link', { name: 'Глосарій' })
    .click();
  await expect(page.locator('#vpip')).toContainText('VPIP');
});
