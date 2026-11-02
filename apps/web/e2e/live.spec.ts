import { expect, test } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

test.describe('live data (D-127)', () => {
  test('lists the public feeds with source and fetch state, and nothing is Live before a fetch', async ({
    page,
  }) => {
    await signInAs(page, /Governance Administrator/);
    await page.goto('/sources?tab=live');
    const fred = page.getByRole('region', { name: 'Brent and WTI crude oil spot prices, daily' });
    await expect(fred).toContainText('Federal Reserve Bank of St. Louis');
    await expect(fred).toContainText(/Last successful fetch: never|Last successful fetch:/);
    await expect(page.getByRole('region', { name: 'EIA Open Data: Brent spot price, daily' })).toContainText(
      /EIA_API_KEY|Last successful fetch/,
    );
    await expect(page.getByRole('button', { name: /Fetch now/ }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test('roles other than the administrator read feeds but cannot fetch', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/sources?tab=live');
    await expect(
      page.getByRole('region', { name: 'Daily transit calls through maritime chokepoints' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Fetch now/ })).toHaveCount(0);
    await expectAccessible(page);
  });
});
