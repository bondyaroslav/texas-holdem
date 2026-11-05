import { expect, test } from '@playwright/test';

test('opens the lobby page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Лобі' })).toBeVisible();
});
