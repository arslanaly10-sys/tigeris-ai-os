import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 AA scan (D-27). Fails the test on any violation and prints what failed. */
export async function expectAccessible(page: Page, include?: string) {
  // Let transitions settle so contrast is measured on the final state, not a mid-fade frame. Chained
  // transitions (exit then enter) can leave a brief gap with nothing running, so require a quiet streak.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quiet?: number };
      const busy = document
        .getAnimations()
        .some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
      w.__quiet = busy ? 0 : (w.__quiet ?? 0) + 1;
      return w.__quiet >= 4;
    },
    undefined,
    { polling: 100 },
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
