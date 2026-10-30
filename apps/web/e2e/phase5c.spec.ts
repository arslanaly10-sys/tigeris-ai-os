import { expect, test } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

test.describe('decision guardrails (Phase 5C)', () => {
  test('the executive sees the guardrails register and how to record one', async ({ page }) => {
    await signInAs(page, /Executive \//);
    await page.goto('/mandates?view=guardrails');
    const register = page.getByRole('region', { name: 'Decision guardrails' });
    await expect(register).toContainText('decision-policy 1.2.0');
    await expect(page.getByRole('region', { name: 'Record a guardrail from a decision' })).toBeVisible();
    await expectAccessible(page);
  });

  test('an auditor reads guardrails but cannot record or lift them', async ({ page }) => {
    await signInAs(page, /Auditor/);
    await page.goto('/mandates?view=guardrails');
    await expect(page.getByRole('region', { name: 'Decision guardrails' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Record a guardrail from a decision' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lift guardrail' })).toHaveCount(0);
    await expectAccessible(page);
  });
});
