import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('intervention inbox (Phase 5B)', () => {
  test('each intervention names its rule, inputs and who it is routed to', async ({ page }, info) => {
    await signInAs(page, /Executive \//);
    await page.goto('/interventions');
    await expect(page.getByRole('heading', { level: 1, name: 'Intervention Inbox' })).toBeVisible();
    const inbox = page.getByRole('region', { name: 'Interventions' });
    const cpty = inbox.getByRole('listitem').filter({ hasText: 'CPTY-LIMIT-01' }).first();
    await expect(cpty).toContainText('Breach');
    await expect(cpty).toContainText('Rule W-RULES');
    await expect(cpty).toContainText('CP-S01');
    await expect(cpty).toContainText('intervention-engine 1.0.0');
    await expectAccessible(page);
    await shot(page, 'interventions', info.project.name);

    await page.getByRole('tab', { name: 'Watch rules' }).click();
    const rules = page.getByRole('region', { name: 'Watch rules' });
    await expect(rules).toContainText('W-SIGNALS');
    await expect(rules).toContainText('Urgent signal not triaged in time');
    await expectAccessible(page);
  });

  test('an analyst acknowledges and resolves an untriaged-signal intervention with a reason', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/interventions');
    const inbox = page.getByRole('region', { name: 'Interventions' });
    const item = inbox.getByRole('listitem').filter({ hasText: 'Rule W-SIGNALS' }).first();
    const key = (await item.locator('.tabular').first().textContent())!.trim();
    await item.getByRole('button', { name: 'Acknowledge' }).click();
    const same = inbox.getByRole('listitem').filter({ hasText: key });
    await expect(same).toContainText('Acknowledged by');
    await same.getByLabel('Reason for closing (recorded)').fill('Triaged in the morning review (e2e).');
    await same.getByRole('button', { name: 'Resolve' }).click();
    await expect(inbox.getByRole('listitem').filter({ hasText: key })).toHaveCount(0);

    await page.getByLabel('Status').selectOption('resolved');
    await expect(inbox.getByRole('listitem').filter({ hasText: key })).toContainText(
      'Triaged in the morning review (e2e).',
    );
    await expectAccessible(page);
  });
});
