import { expect, test } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const CSV = [
  'key,name,asset_class,sector,country,currency,market_value,nav_share_pct,route_dependent,as_of',
  'E2E-POS-1,Terminal stake (e2e sample),Infrastructure equity,energy,AE,USD,1200,1.2,true,2026-09-30',
  'E2E-POS-2,Overweight row (e2e sample),Listed equity,energy,AE,USD,10,140,false,2026-09-30',
].join('\n');

test.describe('data & integrations (FR-06, FR-10, AC-02, AC-05)', () => {
  test('an administrator registers a connector, approves its source, imports a file and sees row-level issues', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    await signInAs(page, /Governance Administrator/);
    await page.goto('/sources');
    await expect(page.getByRole('heading', { name: 'Connector registry' })).toBeVisible();
    // The seeded public feed is configured, never connected, and its source awaits approval.
    const feed = page.getByRole('listitem').filter({ hasText: 'CON-EIA-RSS' });
    await expect(feed).toContainText('Configured');
    await expect(feed).toContainText('Source pending approval');
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Register connector' }).click();
    const dialog = page.getByRole('dialog', { name: 'Register a connector' });
    await dialog.getByLabel('Provider').fill('Portfolio system export (e2e)');
    await dialog.getByLabel('Name').fill('Quarterly positions (e2e)');
    await dialog.getByLabel(/Sector workspace/).selectOption('energy');
    await dialog.getByRole('button', { name: 'Register connector' }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole('listitem').filter({ hasText: 'Quarterly positions (e2e)' });
    await expect(row).toContainText('Source pending approval');
    await row.getByRole('button', { name: 'Approve source' }).click();
    await expect(row).toContainText('Source approved');

    await page.getByRole('tab', { name: 'Import' }).click();
    const select = page.getByLabel('Connector', { exact: true });
    const value = await select
      .locator('option', { hasText: 'Quarterly positions (e2e)' })
      .getAttribute('value');
    await select.selectOption(value!);
    await page
      .getByLabel('File', { exact: true })
      .setInputFiles({ name: 'positions.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByRole('button', { name: 'Import file' }).click();
    const issues = page.getByRole('table', { name: 'Row-level issues' });
    await expect(issues).toContainText('nav_share_pct');
    await expect(issues.getByRole('row').nth(1)).toContainText('3');
    await expect(page.getByText('Partial').first()).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('tab', { name: 'Records' }).click();
    await expect(page.getByText('Terminal stake (e2e sample)')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Terminal stake (e2e sample)' })).toContainText(
      'Imported',
    );

    await page.getByRole('tab', { name: 'Data quality' }).click();
    await expect(page.getByRole('heading', { name: 'Records by quality and mode' })).toBeVisible();
    await expectAccessible(page);
  });

  test('connectors, records and quality read clearly for every role', async ({ page }) => {
    await signInAs(page, /Auditor/);
    for (const tab of ['connectors', 'runs', 'records', 'quality', 'sources']) {
      await page.goto(`/sources?tab=${tab}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Data & Sources' })).toBeVisible();
      await expectAccessible(page);
    }
    await page.goto('/sources?tab=import');
    await expect(page.getByText('Only the Governance Administrator imports files.')).toBeVisible();
  });
});
