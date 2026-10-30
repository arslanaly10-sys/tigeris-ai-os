import { expect, test } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

test.describe('learning loop (Phase 5D)', () => {
  test('a domain expert sees proposals and calibration with counts, never a bare rate', async ({ page }) => {
    await signInAs(page, /Domain Expert/);
    await page.goto('/memory');
    await page.getByRole('tab', { name: 'Learning' }).click();
    await expect(page).toHaveURL(/view=learning/);
    await expect(page.getByRole('region', { name: 'Proposed assumption versions' })).toContainText(
      'learning-loop 1.0.0',
    );
    const calibration = page.getByRole('region', { name: 'Calibration' });
    await expect(calibration).toContainText('valuation_elasticity');
    await expect(calibration).toContainText(/No reviews yet|held \/ /);
    await expectAccessible(page);
  });
});
