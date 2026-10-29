import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 AA scan (D-27). Fails the test on any violation and prints what failed. */
export async function expectAccessible(page: Page, include?: string) {
  // Let entrance transitions settle so contrast is measured on the final state, not a mid-fade frame.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

/** Step 1 of sign-in: identify the institution by code (FR-01). Reveals the demonstration role picker. */
export async function identifyInstitution(page: Page, identifier = 'GSIA-DEMO') {
  await page.goto('/sign-in');
  await page.getByLabel('Institution code or work email').fill(identifier);
  await page.getByRole('button', { name: 'Continue with institutional identity' }).click();
}

export async function signInAs(page: Page, roleLabel: RegExp) {
  await identifyInstitution(page);
  await page.getByRole('button', { name: roleLabel }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sovereign Overview' })).toBeVisible();
}

export async function openNav(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
}
