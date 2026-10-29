import { expect, test } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const desktopOnly = (name: string) => test.skip(name === 'mobile', 'Mutating journey runs once, on desktop');

test.describe('signal review (App Flow step 3)', () => {
  test('shows signals with source, times and status, and is accessible', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/signals');
    await expect(page.getByRole('heading', { level: 1, name: 'Signal Review' })).toBeVisible();
    await expect(
      page.getByRole('row', { name: /Container ship boarded near the Strait of Hormuz/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Energy/ }).click();
    await expect(page.getByRole('row', { name: /LNG departure schedule/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Container ship boarded/ })).toHaveCount(0);
    await expectAccessible(page);
  });

  test('requires a rationale and records the disposition', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/signals?selected=SIG-SYN-0003');
    await page.getByRole('button', { name: 'Monitor', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Monitor: SIG-SYN-0003/ });
    await expect(dialog.getByRole('button', { name: 'Record monitor' })).toBeDisabled();
    await dialog.getByLabel(/Rationale/).fill('Watch for corroboration from a second source.');
    await dialog.getByRole('button', { name: 'Record monitor' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Watch for corroboration from a second source.')).toBeVisible();
  });

  test('opens a case from a signal', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/signals?selected=SIG-SYN-0007');
    await page.getByRole('button', { name: 'Open case', exact: true }).click();
    await page.getByLabel(/Rationale/).fill('Concentration threshold matters for the capital slice.');
    await page.getByRole('button', { name: 'Record open case' }).click();
    await expect(page).toHaveURL(/\/cases\/CASE-\d{8}-\d{2}$/);
    await expect(
      page.getByRole('heading', { level: 1, name: /counterparty concentration threshold/ }),
    ).toBeVisible();
  });

  test('offers experts only the challenge action', async ({ page }) => {
    await signInAs(page, /Domain Expert/);
    await page.goto('/signals?selected=SIG-SYN-0004');
    await expect(page.getByRole('button', { name: 'Challenge', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0);
  });
});

test.describe('intelligence graph (FR-16)', () => {
  test('lists every link with its class in the table view and opens rationale', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/graph');
    await expect(page.getByText('Strait of Hormuz').first()).toBeVisible();
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    const table = page.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(17);
    await expectAccessible(page);
    await table.getByRole('button', { name: 'carries' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Causal link' });
    await expect(sheet.getByText('Rationale')).toBeVisible();
    await expect(sheet.getByText(/EIA reports/)).toBeVisible();
  });

  test('shows the case impact graph from the origin event', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/cases/HMZ-2024-0413');
    await page.getByRole('tab', { name: 'Impact graph' }).click();
    await expect(page.getByText('MSC Aries seizure', { exact: true })).toBeVisible();
    await expect(page.getByText('Origin', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(page.getByRole('heading', { name: 'Case timeline' })).toBeVisible();
  });
});

test.describe('map (map spec §6)', () => {
  test('labels movement as illustrative and lets the user pause the replay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await signInAs(page, /Executive/);
    await expect(page.getByText('Illustrative simulation').first()).toBeVisible();
    await expect(page.getByText(/Live/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Pause replay' }).click();
    await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible();
    await page.getByText('Map contents as a list').click();
    await expect(page.getByText(/Illustrative tanker A/)).toBeVisible();
  });

  test('starts paused when the user prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAs(page, /Executive/);
    await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible();
  });
});

test.describe('data & sources (FR-09)', () => {
  test('shows rejected and quarantined ingestion with reasons', async ({ page }) => {
    await signInAs(page, /Auditor/);
    await page.goto('/sources');
    await expect(page.getByText('gcc-stat-trial-extract')).toBeVisible();
    await expect(page.getByText('Only governance administrators can import packages.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quarantine' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Quarantine' })
        .getByText(/Content altered or corrupted/)
        .first(),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test('lets an administrator import a sample package', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await signInAs(page, /Governance Administrator/);
    await page.goto('/sources');
    // Count from the panel's recorded total once it has loaded, not from whatever has rendered so far.
    const total = page.getByText(/^\d+ ingestion runs recorded$/);
    await expect(total).toBeVisible();
    const before = Number.parseInt((await total.textContent()) ?? '', 10);
    await page.getByRole('button', { name: 'Import synthetic sample package' }).click();
    await expect(total).toHaveText(`${before + 1} ingestion runs recorded`);
    await expect(page.getByText(/^demo-sample-/).first()).toBeVisible();
  });
});

test.describe('search', () => {
  test('finds a case and navigates to it', async ({ page }, info) => {
    desktopOnly(info.project.name);
    await signInAs(page, /Intelligence Analyst/);
    await page.getByRole('combobox', { name: 'Search signals, cases and entities' }).fill('aries');
    await page.getByRole('option', { name: /MSC Aries seizure near the Strait of Hormuz/ }).click();
    await expect(page).toHaveURL(/\/cases\/HMZ-2024-0413$/);
  });
});
