import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('semantic registry (Phase 5A)', () => {
  test('codified rules show the measure, threshold, evaluation and lineage', async ({ page }, info) => {
    await signInAs(page, /Executive \//);
    await page.goto('/mandates');
    await page.getByRole('tab', { name: 'Codified rules' }).click();
    await expect(page).toHaveURL(/view=rules/);
    const rules = page.getByRole('region', { name: 'Codified rules' });
    await expect(rules).toContainText('M-RISK-02');
    await expect(rules).toContainText('Route-dependent holdings <= 15 holdings');
    await expect(rules).toContainText('CPTY-LIMIT-01');
    await expect(rules).toContainText('semantic-rules 1.0.0');
    await expect(rules).toContainText('From Sector models sector-models 1.0.0');
    await expectAccessible(page);
    await shot(page, 'semantic-rules', info.project.name);

    await page.getByRole('tab', { name: 'Definitions' }).click();
    await expect(page.getByRole('region', { name: /System definitions/ })).toContainText(
      'situation:fuel_buffer_days',
    );
    await expect(page.getByRole('region', { name: 'Institution definitions' })).toContainText(
      'Route-dependent holding',
    );
    await expectAccessible(page);

    await page.getByRole('tab', { name: 'Export' }).click();
    await expect(page.getByRole('region', { name: 'Export the registry as JSON-LD' })).toContainText(
      'urn:tigeris:vocab:',
    );
    await expectAccessible(page);
  });

  test('a rule version drafted by the analyst is evaluated only after a domain expert approves it', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    const key = `E2E-${Date.now().toString(36).toUpperCase()}`;
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/mandates?view=rules');
    const form = page.getByRole('region', { name: 'Draft a rule or a new version' });
    await form.getByLabel(/^Rule key/).fill(key);
    await form.getByLabel('Label').fill('Fuel buffer watch (e2e)');
    await form.getByLabel('Measure judged').selectOption('situation:fuel_buffer_days');
    await form.getByLabel('Must be').selectOption('>=');
    await form.getByLabel(/^Threshold/).fill('10');
    await form.getByLabel('Rationale (recorded)').fill('An earlier warning than the mandate minimum (e2e).');
    await form.getByRole('button', { name: 'Draft rule for approval' }).click();
    await expect(form.getByRole('status')).toContainText('Draft recorded');
    const rules = page.getByRole('region', { name: 'Codified rules' });
    const row = rules.getByRole('listitem').filter({ hasText: key });
    await expect(row).toContainText('Not evaluated until approved.');
    await expect(row.getByRole('button', { name: /Approve/ })).toHaveCount(0);

    await signInAs(page, /Domain Expert/);
    await page.goto('/mandates?view=rules');
    const draft = page
      .getByRole('region', { name: 'Codified rules' })
      .getByRole('listitem')
      .filter({ hasText: key });
    await draft.getByRole('button', { name: 'Approve version 1' }).click();
    await expect(draft).toContainText('Approved');
    await expect(draft).toContainText('semantic-rules 1.0.0');
    await expectAccessible(page);
  });
});
