import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

// Its own case: no other browser test changes RES-EW-01.
const CASE = 'RES-EW-01';
const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('case analysis and scenario sensitivity (slices F/G)', () => {
  test('an analyst runs the agents, sees answers and gaps, then reads what the scenario rests on', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    test.setTimeout(90_000);
    await signInAs(page, /Intelligence Analyst/);
    await page.goto(`/cases/${CASE}?tab=analysis`);
    await expect(page.getByRole('heading', { name: 'Case analysis' })).toBeVisible();
    await expect(page.getByText('not configured', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: /Run analysis|Run again/ }).click();
    const steps = page.getByRole('region', { name: 'Analysis steps' });
    await expect(steps.getByRole('listitem').filter({ hasText: 'Step 8' })).toBeVisible();
    await expect(steps).toContainText('Red-team critic');
    await expect(steps).toContainText('Gap reported');
    await shot(page, 'analysis-gaps', info.project.name);
    await expectAccessible(page);

    await page.goto(`/scenarios/new?case=${CASE}`);
    await page.getByRole('button', { name: 'Run scenario' }).click();
    await expect(page).toHaveURL(/\/scenarios\/SCN-\d{8}-\d{2}$/);
    await page.getByRole('tab', { name: 'Sensitivity' }).click();
    const table = page.getByRole('table', { name: /with one input at a time/ });
    await expect(table).toBeVisible();
    await expect(table.getByRole('rowheader').first()).toContainText(/valuation/i);
    await shot(page, 'sensitivity', info.project.name);
    await expectAccessible(page);
    await page.getByLabel('Metric').selectOption({ label: 'Utility fuel cost increase (horizon average)' });
    await expect(
      page.getByText(/Utility fuel cost increase \(horizon average\), 90 days: central estimate/),
    ).toBeVisible();

    await page.goto(`/cases/${CASE}?tab=analysis`);
    await page.getByRole('button', { name: 'Run again' }).click();
    await expect(page.getByText(/reads SCN-\d{8}-\d{2}/)).toBeVisible();
    await expect(
      steps.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Scenario analyst' }) }),
    ).toContainText('Answered');
    await shot(page, 'analysis-answered', info.project.name);
  });

  test('the analysis tab reads clearly on any screen for a role that cannot run it', async ({ page }) => {
    await signInAs(page, /Expert Approver/);
    await page.goto(`/cases/${CASE}?tab=analysis`);
    await expect(page.getByRole('heading', { name: 'Case analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run analysis|Run again/ })).toHaveCount(0);
    await expectAccessible(page);
  });
});
