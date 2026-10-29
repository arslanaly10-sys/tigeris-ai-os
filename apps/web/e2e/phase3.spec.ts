import { expect, test } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

test.describe('foresight & scenarios (FR-14..FR-18)', () => {
  test('an analyst runs a scenario and gets ranges, lineage and draft options', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/scenarios/new?case=HMZ-2024-0413');
    await expect(page.getByRole('heading', { level: 1, name: 'Hormuz disruption' })).toBeVisible();
    await expect(page.getByLabel('Disruption duration', { exact: true })).toHaveValue('21');
    await expectAccessible(page);

    await page.getByLabel('Transit capacity lost', { exact: true }).fill('60');
    await page.getByRole('button', { name: 'Run scenario' }).click();
    await expect(page).toHaveURL(/\/scenarios\/SCN-\d{8}-\d{2}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /60% capacity lost for 21 days/ }),
    ).toBeVisible();
    await expect(page.getByText('Reproducible: re-computed from stored inputs')).toBeVisible();
    await expect(page.getByText(/Uses unverified input: Average oil flow, 2023/)).toBeVisible();

    // Horizon switch changes the view without changing the run.
    await page.getByRole('button', { name: '72 hours' }).click();
    await expect(page.getByRole('button', { name: '72 hours' })).toHaveAttribute('aria-pressed', 'true');

    // Four drafts, none approved, each naming the authority it would need.
    const options = page.getByRole('region', { name: 'Draft options' }).getByRole('article');
    await expect(options).toHaveCount(4);
    await expect(options.first()).toContainText('Draft · expert review required');
    await expect(options.first()).toContainText('Self-approval blocked');
    await expect(page.getByText(/^Live$/)).toHaveCount(0);
    await expectAccessible(page);

    await page
      .getByRole('button', { name: 'How calculated for Oil flow disrupted (average while disrupted)' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'How this is calculated' });
    await expect(sheet.getByText(/baseline flow × capacity lost/)).toBeVisible();
    await expect(sheet.getByText('Average oil flow, 2023', { exact: true })).toBeVisible();
    await expectAccessible(page, '[role="dialog"]');
    await sheet.getByRole('button', { name: /Source lineage for Average oil flow, 2023/ }).click();
    const lineage = page.getByRole('dialog', { name: 'Lineage' });
    await expect(lineage.getByText('20.9 million b/d')).toBeVisible();
    await page.keyboard.press('Escape');

    // The case carries the run and its draft options.
    await page.goto('/cases/HMZ-2024-0413');
    await page.getByRole('tab', { name: 'Draft options' }).click();
    await expect(page.getByRole('article')).toHaveCount(4);
    await page.getByRole('tab', { name: 'Scenarios' }).click();
    await expect(page.getByRole('link', { name: /60% capacity lost/ }).first()).toBeVisible();

    // Specialist drafts are recorded and grounded.
    await page.goto('/ai');
    await expect(page.getByText('Deterministic stub only')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Impact summary' }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test('non-analysts can read scenarios but cannot run them', async ({ page }) => {
    await signInAs(page, /Executive/);
    await page.goto('/scenarios');
    await expect(page.getByRole('heading', { level: 1, name: 'Foresight & Scenarios' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New scenario' })).toHaveCount(0);
    await expect(page.getByText('Not yet modelled')).toBeVisible();
    await expectAccessible(page);
    await page.goto('/scenarios/new');
    await expect(page.getByText('Only an Intelligence Analyst can run scenarios.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run scenario' })).toBeDisabled();
  });
});
