import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('reports, overdue actions and Arabic (slice I)', () => {
  test('an executive opens the governance case report, with every section and a download', async ({
    page,
  }, info) => {
    await signInAs(page, /Executive \/ Governor/);
    await expect(page.getByRole('heading', { name: 'Overdue actions' })).toBeVisible();
    await page.goto('/cases/HMZ-2024-0413');
    await page.getByRole('link', { name: 'Case report' }).click();
    await expect(page).toHaveURL(/\/cases\/HMZ-2024-0413\/report$/);
    await expect(
      page.getByRole('note').filter({ hasText: 'No action has been executed by TIGERIS' }),
    ).toBeVisible();
    for (const title of [
      'Executive summary',
      'What changed and when',
      'Affected entities and dependency paths',
      'Evidence and timestamps',
      'Assumptions and gaps',
      'Scenario impacts',
      'Options, mandate and policy checks',
      'Reviews, disagreements and decisions',
      'Actions and outcome',
    ])
      await expect(page.getByRole('heading', { level: 2, name: new RegExp(title) })).toBeVisible();
    await expect(page.getByText(/Content SHA-256 [0-9a-f]{64}/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Download evidence pack/ })).toHaveAttribute(
      'href',
      /\/api\/cases\/HMZ-2024-0413\/report\?format=json&download=true/,
    );
    await shot(page, 'report', info.project.name);
    await expectAccessible(page);
  });

  test('roles without export rights are told who exports', async ({ page }) => {
    await signInAs(page, /Operations Owner/);
    await page.goto('/cases/HMZ-2024-0413/report');
    await expect(page.getByText('Case reports are exported by')).toBeVisible();
  });

  test('new screens read in the drafted Arabic interface, right to left', async ({ page }, info) => {
    await signInAs(page, /Auditor/);
    await page.getByRole('button', { name: 'العربية' }).filter({ visible: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.goto('/oversight');
    await expect(page.getByRole('tab', { name: 'سجل التدقيق' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'الإدارة' })).toBeVisible();
    await page.goto('/graph?view=entities');
    await expect(page.getByRole('tab', { name: 'الكيانات والاعتماديات' })).toBeVisible();
    await page.goto('/sources');
    await expect(page.getByRole('tab', { name: 'جودة البيانات' })).toBeVisible();
    await page.goto('/cases/RES-EW-01?tab=analysis');
    await expect(page.getByRole('heading', { name: 'تحليل الحالة' })).toBeVisible();
    await shot(page, 'arabic-analysis', info.project.name);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'EN' }).filter({ visible: true }).first().click();
  });
});
