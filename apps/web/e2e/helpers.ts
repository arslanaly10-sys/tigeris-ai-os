import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 AA scan (D-27). Fails the test on any violation and prints what failed. */
export async function expectAccessible(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

export async function signInAs(page: Page, roleLabel: RegExp) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: roleLabel }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Command Centre' })).toBeVisible();
}

export async function openNav(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
}
