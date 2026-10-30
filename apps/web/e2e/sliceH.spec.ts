import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, openNav, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('audit and administration (slice H)', () => {
  test('an auditor reads the audit log, verifies the chain and sees access read-only', async ({
    page,
  }, info) => {
    await signInAs(page, /Auditor/);
    await openNav(page);
    await page.getByRole('link', { name: 'Audit & Administration' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Audit & Administration' })).toBeVisible();
    const events = page.getByRole('table', { name: /Audit events/ });
    await expect(events.getByRole('row').nth(1)).toBeVisible();
    await page.getByRole('button', { name: 'Verify the chain' }).click();
    await expect(page.getByRole('status')).toContainText('Intact');
    await shot(page, 'audit', info.project.name);
    await expectAccessible(page);

    await page.getByRole('tab', { name: 'Administration' }).click();
    await expect(page.getByRole('table', { name: /People, roles/ })).toContainText(
      'Governance Administrator',
    );
    await expect(page.getByRole('button', { name: /Change access/ })).toHaveCount(0);
    await expectAccessible(page);
  });

  test('an administrator provisions a person and assigns a workspace, with reasons', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    await signInAs(page, /Governance Administrator/);
    await page.goto('/oversight?tab=admin');
    const name = `Provisioned analyst ${Date.now().toString(36)} (e2e)`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Title').fill('Utilities analyst');
    await page.getByLabel(/Identity-provider subject/).fill(`${Date.now().toString(36)}@institution.example`);
    await page
      .getByLabel(/^Reason/)
      .last()
      .fill('New joiner in the utilities team, approved by the head of risk.');
    await page.getByRole('button', { name: 'Provision person' }).click();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('Intelligence Analyst');

    await row.getByRole('button', { name: /Change access/ }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Change').selectOption('grant_workspace');
    await sheet.getByLabel(/^Sector workspace/).selectOption('utilities');
    await sheet.getByLabel(/^Reason/).fill('Limited to the utilities workspace for the first quarter.');
    await sheet.getByRole('button', { name: 'Record change' }).click();
    await expect(sheet).toBeHidden();
    await expect(row).toContainText('Infrastructure & Utilities');
    await shot(page, 'admin', info.project.name);
    await expectAccessible(page);

    await page.getByRole('tab', { name: 'Audit log' }).click();
    await page.getByLabel('Action').selectOption({ label: 'Administration' });
    await expect(page.getByRole('table', { name: /Audit events/ })).toContainText('admin.workspace_granted');
  });

  test('roles without audit access are told who reads it', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/oversight');
    await expect(page.getByText('The audit log is read by the Auditor')).toBeVisible();
    await expectAccessible(page);
  });
});
