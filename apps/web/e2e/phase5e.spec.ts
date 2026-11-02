import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('validation and desk roll-up (Phase 5E)', () => {
  test('desks and the roll-up read clearly on any screen', async ({ page }, info) => {
    await signInAs(page, /Executive \//);
    await page.goto('/interventions?view=rollup');
    const structure = page.getByRole('region', { name: 'Desks and committee' });
    await expect(structure).toContainText('Investment Committee');
    await expect(structure).toContainText('Infrastructure desk');
    await expect(page.getByRole('region', { name: 'Desk roll-up' })).toContainText('nothing is averaged');
    await expectAccessible(page);
    await shot(page, 'rollup', info.project.name);
  });

  test('the approver asks a desk, a desk member answers with an assumption, the executive sees it rolled up', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    test.slow(); // Three people sign in and act in turn.
    const question = `Does the bypass ramp-up still hold for your book? (e2e ${Date.now().toString(36)})`;
    await signInAs(page, /Expert Approver/);
    await page.goto('/interventions?view=validation');
    const form = page.getByRole('region', { name: 'Ask desks to validate a finding' });
    await form.getByLabel('Its key').fill('HMZ-2024-0413');
    await form.getByLabel('Question').fill(question);
    await form.getByLabel('Infrastructure desk').check();
    await form.getByRole('button', { name: 'Send for validation' }).click();
    await expect(form.getByRole('status')).toContainText('Sent as VB-');

    await signInAs(page, /Domain Expert/);
    await page.goto('/interventions?view=validation');
    const row = page
      .getByRole('region', { name: 'Validation requests' })
      .getByRole('listitem')
      .filter({ hasText: question });
    await row.getByLabel('Your answer').selectOption('disputed');
    await row
      .getByLabel('Reasoning (recorded)')
      .fill('Pipeline bypass ramps slower than assumed for our assets.');
    await row.getByLabel('Assumption relied on (optional)').fill('Bypass ramp-up');
    await row.getByLabel('Value').fill('21 days');
    await row.getByLabel('Basis').fill('Operator maintenance notice (synthetic).');
    await row.getByRole('button', { name: 'Record answer' }).click();
    await expect(row).toContainText('Disputed');

    await signInAs(page, /Executive \//);
    await page.goto('/interventions?view=rollup');
    const batch = page
      .getByRole('region', { name: 'Desk roll-up' })
      .getByRole('listitem')
      .filter({ hasText: question });
    await expect(batch).toContainText('1 disputed');
    await expect(batch).toContainText('Bypass ramp-up: 21 days');
    await expectAccessible(page);
  });
});
