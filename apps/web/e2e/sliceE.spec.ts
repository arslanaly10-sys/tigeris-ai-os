import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('entity and dependency explorer (slice E, FR-16)', () => {
  test('shows what a chokepoint exposes and what a holding relies on, and moves between entities', async ({
    page,
  }, info) => {
    await signInAs(page, /Analyst/);
    await page.goto('/graph?view=entities&entity=cp-hormuz');
    await expect(page.getByRole('tab', { name: 'Entities & dependencies' })).toHaveAttribute(
      'data-state',
      'active',
    );
    const detail = page.getByRole('region', { name: 'Entity detail' });
    await expect(detail.getByRole('heading', { level: 2 })).toContainText('Hormuz');
    const exposed = detail.getByRole('region', { name: 'Exposed if disrupted' });
    await expect(exposed).toContainText('Ras Tanura');
    await expect(exposed).toContainText('4 steps');
    await expect(detail.getByRole('region', { name: 'Context and alternatives' })).toContainText('seizure');
    await shot(page, 'entities-hormuz', info.project.name);
    await expectAccessible(page);

    await exposed
      .getByRole('button', { name: /utility/i })
      .first()
      .click();
    await expect(page).toHaveURL(/entity=hold-utility/);
    await expect(detail.getByRole('region', { name: 'Relies on' })).toContainText('Strait of Hormuz');
    await expect(detail.getByRole('table', { name: /Positions held through/ })).toBeVisible();
    await shot(page, 'entities-utility', info.project.name);
    await expectAccessible(page);
  });

  test('filters by sector workspace and links from a sector command centre', async ({ page }, info) => {
    await signInAs(page, /Analyst/);
    await page.goto('/sectors/supply_chain');
    const records = page.getByRole('region', { name: 'Records in this workspace' });
    await expect(records).toBeVisible();
    await expect(records).toContainText('% NAV');
    await shot(page, 'sector-records', info.project.name);
    await records.getByRole('link', { name: 'Entities and dependencies' }).click();
    await expect(page.getByLabel('Sector workspace')).toHaveValue('supply_chain');
    const list = page.getByRole('list', { name: 'Entity list' });
    await expect(list).toContainText('Jebel Ali');
    await expect(list).not.toContainText('Ras Tanura');
    await expectAccessible(page);
  });
});
