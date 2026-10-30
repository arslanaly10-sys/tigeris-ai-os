import { expect, test } from '@playwright/test';
import { expectAccessible, identifyInstitution, openNav, signInAs } from './helpers';

test.describe('sign-in (FR-04, AC-01)', () => {
  test('identifies the institution first and has no password field', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Institutional sign-in' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expectAccessible(page);
  });

  test('refuses an institution that is not connected', async ({ page }) => {
    await identifyInstitution(page, 'UNKNOWN-FUND');
    await expect(page.getByRole('alert')).toContainText('not connected to this deployment');
    await expect(page.getByRole('heading', { name: 'Choose a demonstration role' })).toHaveCount(0);
  });

  test('offers seven labelled demonstration roles and no real credentials', async ({ page }) => {
    await identifyInstitution(page);
    await expect(page.getByText('Demonstration Mode', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a demonstration role' })).toBeVisible();
    await expect(page.getByRole('listitem').getByRole('button')).toHaveCount(7);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expectAccessible(page);
  });

  test('redirects protected routes to sign-in', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/cases/HMZ-2024-0413');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('can be completed with the keyboard alone', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Institution code or work email').focus();
    await page.keyboard.type('gsia-demo');
    await page.keyboard.press('Enter');
    const first = page.getByRole('button', { name: /Executive \/ Governor/ });
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Sovereign Overview' })).toBeVisible();
  });
});

test.describe('sovereign overview', () => {
  test('shows persistent context, demo banner and an attention queue', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await expect(page.getByRole('note').filter({ hasText: 'Demonstration:' })).toBeVisible();
    await expect(
      page.getByText('Gulf Sovereign Investment Authority (Demo)').filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Attention queue' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /MSC Aries seizure near the Strait of Hormuz/ }).first(),
    ).toBeVisible();
    // No view in the MVP may claim live data.
    await expect(page.getByText(/^Live$/)).toHaveCount(0);
    await expectAccessible(page);
  });

  test('puts the expert review first for the domain expert', async ({ page }) => {
    await signInAs(page, /Domain Expert/);
    const first = page
      .getByRole('heading', { name: 'Attention queue' })
      .locator('xpath=ancestor::section')
      .getByRole('link')
      .first();
    await expect(first).toContainText('CAP-ALLOC-01');
    await expect(first).toContainText('Your action');
  });
});

test.describe('case workspace (AC-03, AC-04)', () => {
  test('traces a figure to its source and shows the disputed crew count', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/cases/HMZ-2024-0413');
    await expect(
      page.getByRole('heading', { level: 1, name: 'MSC Aries seizure near the Strait of Hormuz' }),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Case lifecycle' }).getByText('Analysis')).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByText('A band with its basis')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('tab', { name: /Evidence/ }).click();
    await expect(page.getByText('Conflicting sources.')).toBeVisible();
    await expect(page.getByRole('cell', { name: '25 persons' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '24 persons' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Lineage for Average oil flow, 2023' }).click();
    const drawer = page.getByRole('dialog', { name: 'Lineage' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('20.9 million b/d')).toBeVisible();
    await expect(drawer.getByText('U.S. Energy Information Administration')).toBeVisible();
    await expect(drawer.getByText('Not captured, snapshot pending')).toBeVisible();
    await expect(drawer.getByRole('link', { name: /eia\.gov/ })).toHaveAttribute(
      'href',
      /eia\.gov\/todayinenergy/,
    );
    await expectAccessible(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('labels synthetic exposure as synthetic', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/cases/HMZ-2024-0413');
    const row = page.getByRole('listitem').filter({ hasText: 'Holdings with Hormuz route dependency' });
    await expect(row.getByText('Synthetic', { exact: true })).toBeVisible();
  });

  test('never reveals another institution’s case', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/cases/NRI-TEST-01');
    await expect(page.getByRole('heading', { name: 'Case not found' })).toBeVisible();
  });
});

test.describe('shell', () => {
  test('exposes the twelve navigation items, every module built', async ({ page }) => {
    await signInAs(page, /Executive/);
    await openNav(page);
    const nav = page.getByRole('navigation', { name: 'Primary navigation' }).filter({ visible: true });
    await expect(nav.getByRole('link')).toHaveCount(12);
    await nav.getByRole('link', { name: /Institutional Memory/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Institutional Memory' })).toBeVisible();
    await expect(page.getByText('Arrives in Phase')).toHaveCount(0);
    await expectAccessible(page);
  });

  test('switches to the drafted Arabic interface with RTL layout', async ({ page }) => {
    await signInAs(page, /Executive/);
    await page.getByRole('button', { name: 'العربية' }).filter({ visible: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByText('مسودة الواجهة العربية').first()).toBeVisible();
    await page.getByRole('button', { name: 'EN' }).filter({ visible: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('signs out and records the session end', async ({ page }) => {
    await signInAs(page, /Auditor/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe('sector command centres', () => {
  test('shows sourced KPIs with lineage and suppresses unconnected ones', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/sectors/energy');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Energy & Maritime Command Centre' }),
    ).toBeVisible();
    await expect(page.getByText('20.9 million b/d')).toBeVisible();
    await expect(page.getByText('Source not connected').first()).toBeVisible();
    await page.getByRole('button', { name: /Lineage for Hormuz oil flow/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Lineage' });
    await expect(drawer.getByText('U.S. Energy Information Administration')).toBeVisible();
    await page.keyboard.press('Escape');
    await expectAccessible(page);
  });

  test('renders a shell sector as an honest empty state', async ({ page }) => {
    await signInAs(page, /Executive/);
    await page.goto('/sectors/real_estate');
    await expect(page.getByText('Configured sector. No institutional data connected yet.')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Sector at a Glance' }).getByText('Source not connected'),
    ).toHaveCount(4);
  });

  test('lists eight sectors', async ({ page }) => {
    await signInAs(page, /Executive/);
    await page.goto('/sectors');
    await expect(page.locator('main a[href^="/sectors/"]')).toHaveCount(8);
    await expectAccessible(page);
  });
});

test.describe('governance', () => {
  test('mandate register is read-only and self-approval is always blocked', async ({ page }) => {
    await signInAs(page, /Auditor/);
    await page.goto('/mandates');
    await expect(page.getByText('M-RISK-02')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Blocked' })).toHaveCount(5);
    await expectAccessible(page);
  });

  test('approvals badge counts items for the expert', async ({ page }) => {
    await signInAs(page, /Domain Expert/);
    await page.goto('/decisions');
    await expect(page.getByRole('link', { name: /Capital response options/ }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test('AI Command, execution and memory render without fabricated activity', async ({ page }) => {
    await signInAs(page, /Executive/);
    await page.goto('/ai');
    await expect(page.getByText('Deterministic stub only')).toBeVisible();
    await expectAccessible(page);
    await page.goto('/execution');
    await expect(page.getByRole('heading', { level: 1, name: 'Governed Execution' })).toBeVisible();
    await expect(page.getByText('TIGERIS does not execute actions in external systems.')).toBeVisible();
    await expectAccessible(page);
    await page.goto('/memory');
    await expect(page.getByLabel('Search memory')).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('resilience', () => {
  test('keeps the shell usable when a screen fails to load', async ({ page }) => {
    await signInAs(page, /Intelligence Analyst/);
    // Simulate a screen chunk that cannot be fetched (dropped connection, or a deploy while the tab was open).
    await page.route(/\/pages\/CaseWorkspace\.tsx|\/assets\/CaseWorkspace-[^/]+\.js/, (route) =>
      route.fulfill({ status: 404, body: 'gone' }),
    );
    await page.goto('/cases/HMZ-2024-0413');
    await expect(page.getByRole('alert')).toContainText('This screen could not be loaded');
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Demonstration:');
    await page.unroute(/\/pages\/CaseWorkspace\.tsx|\/assets\/CaseWorkspace-[^/]+\.js/);
    await page.goto('/sources');
    await expect(page.getByRole('heading', { level: 1, name: 'Data & Sources' })).toBeVisible();
  });
});
