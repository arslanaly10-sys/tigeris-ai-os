import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('oil price shock and scenario room (Phase 5F)', () => {
  test('the template lists its drivers and register assumptions; read-only roles cannot run it', async ({
    page,
  }) => {
    await signInAs(page, /Executive \//);
    await page.goto('/scenarios?view=oil');
    const panel = page.getByRole('region', { name: 'Oil price shock on the portfolio' });
    await expect(panel).toContainText('oil-shock 1.0.0');
    await expect(panel).toContainText('An Intelligence Analyst runs this template');
    await expect(page.getByRole('region', { name: 'Assumptions this template uses' })).toContainText(
      'oil_beta_energy',
    );
    await expectAccessible(page);
  });

  test('an analyst runs two oil shocks and compares them in the scenario room', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    test.slow();
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/scenarios?view=oil');
    const panel = page.getByRole('region', { name: 'Oil price shock on the portfolio' });
    await panel.getByLabel(/^Oil price change/).fill('60');
    await panel.getByRole('button', { name: 'Run oil price shock' }).click();
    await expect(panel).toContainText('Change in NAV (central)');
    await expect(panel).toContainText('output hash verified');
    const first = (await panel
      .getByText(/^TR-\d{8}-\d{2}/)
      .first()
      .textContent())!.slice(0, 14);
    await panel.getByLabel(/^Oil price change/).fill('-30');
    await panel.getByRole('button', { name: 'Run oil price shock' }).click();
    await expect(panel).not.toContainText(first, { timeout: 10_000 });
    await shot(page, 'oil-shock', info.project.name);

    await page.getByRole('tab', { name: 'Scenario room' }).click();
    const room = page.getByRole('region', { name: 'Scenario room' });
    const boxes = room.getByRole('checkbox');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(room.getByRole('table')).toContainText('Change in NAV');
    await expect(room.getByRole('table')).toContainText('(differs)');
    await expectAccessible(page);
    await shot(page, 'scenario-room', info.project.name);
  });
});
