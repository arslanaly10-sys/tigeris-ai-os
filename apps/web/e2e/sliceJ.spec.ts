import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, openNav, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('competitive intelligence (slice J, AC-14, AC-15, AC-16)', () => {
  test('every role reads the five vendor domains, none shown as collected before a crawl succeeds', async ({
    page,
  }, info) => {
    await signInAs(page, /Auditor/);
    await openNav(page);
    await page.getByRole('link', { name: 'Competitive Intelligence' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Competitive Intelligence' })).toBeVisible();
    for (const v of ['Palantir', 'BlackRock Aladdin', 'AlternativeSoft', 'Dasseti', 'V7'])
      await expect(page.getByRole('heading', { level: 3, name: v, exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'BlackRock Aladdin' })).toContainText('/aladdin only');
    await expect(page.getByText(/^Collected/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Crawl now/ })).toHaveCount(0);
    await shot(page, 'ci-vendors', info.project.name);
    await expectAccessible(page);

    await page.getByRole('tab', { name: 'Claims' }).click();
    await expect(page.getByText(/Claims appear only after a crawl fetches a vendor page/)).toBeVisible();
    await page.getByRole('tab', { name: 'Report' }).click();
    await expect(
      page.getByRole('note').filter({ hasText: 'Competitive intelligence from vendor-public' }),
    ).toContainText('separate from cases, portfolios and decision reports');
    await expectAccessible(page);
  });

  test('an administrator adds a domain, which waits for approval, then approves it with a reason', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    await signInAs(page, /Governance Administrator/);
    await page.goto('/competitive');
    const tag = Date.now().toString(36);
    await page.getByLabel('Vendor', { exact: true }).fill(`Example vendor ${tag}`);
    await page.getByLabel(/^Key/).fill(`example-${tag}`);
    await page.getByLabel('Category').fill('Test only');
    await page.getByLabel(/^Host/).fill(`www.example-${tag}.example`);
    await page.getByLabel(/^Reason \(recorded\)/).fill('Added by the browser test to exercise approval.');
    await page.getByRole('button', { name: 'Add domain for approval' }).click();
    const card = page.getByRole('article', { name: `Example vendor ${tag}` });
    await expect(card).toContainText('Awaiting approval');
    await expect(card.getByRole('button', { name: /Crawl now/ })).toHaveCount(0);
    await card
      .getByLabel(/Reason for a status change/)
      .fill('Public product pages only; approved for research.');
    await card.getByRole('button', { name: /Approve domain/ }).click();
    await expect(card).toContainText('Approved · never crawled');
    await expect(card.getByRole('button', { name: /Crawl now/ })).toBeVisible();
    await expectAccessible(page);
  });
});
