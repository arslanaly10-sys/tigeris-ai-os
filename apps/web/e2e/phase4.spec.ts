import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const CASE = 'CAP-HEDGE-02';

async function switchTo(page: Page, role: RegExp) {
  await page.context().clearCookies();
  await signInAs(page, role);
  await page.goto(`/cases/${CASE}?tab=decision`);
}

test.describe('governance: recommendation to institutional memory (Phase 4)', () => {
  test('five named people take one recommendation from scenario to memory', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    test.setTimeout(120_000);

    // Analyst: run a scenario, then recommend the two-person Hedge option for review.
    await signInAs(page, /Intelligence Analyst/);
    await page.goto(`/scenarios/new?case=${CASE}`);
    await page.getByRole('button', { name: 'Run scenario' }).click();
    await expect(page).toHaveURL(/\/scenarios\/SCN-\d{8}-\d{2}$/);
    await page.goto(`/cases/${CASE}?tab=decision`);
    await expect(page.getByRole('heading', { name: 'Recommend an option' })).toBeVisible();
    await page.getByRole('radio', { name: /Hedge exposure/ }).check();
    await page
      .getByLabel(/Why this option/)
      .fill('Hedging keeps the mandate intact at lower cost than reallocating.');
    await page.getByRole('button', { name: 'Route for expert review' }).click();
    await expect(page.getByRole('heading', { name: 'Awaiting expert review' })).toBeVisible();
    await expect(page.getByText('Only a Domain Expert can review a recommendation.')).toBeVisible();
    await expectAccessible(page);

    // Domain expert: mandatory review.
    await switchTo(page, /Domain Expert/);
    await page.getByLabel(/^Rationale/).fill('Sources and assumptions hold; the hedge sizing is reasonable.');
    await page.getByRole('button', { name: 'Record review' }).click();
    await expect(page.getByRole('heading', { name: 'Awaiting decision' })).toBeVisible();

    // Auditor: records a disagreement. It stays on the record and every approver must acknowledge it (FR-24).
    await switchTo(page, /Auditor/);
    const notes = page.getByRole('region', { name: /Review notes/ });
    await notes.getByRole('radio', { name: 'Disagree' }).check();
    await notes
      .getByLabel(/Why you disagree/)
      .fill('The valuation elasticity is assumed, not observed; the hedge size rests on it.');
    await notes.getByRole('button', { name: 'Record disagreement' }).click();
    await expect(notes).toContainText('1 recorded disagreement');
    await expectAccessible(page);

    // Approver: blocked until the disagreement is acknowledged, then the policy holds the first of two approvals.
    await switchTo(page, /Expert Approver/);
    const check = page.getByRole('region', { name: 'Policy check' });
    await expect(check).toContainText('Read and acknowledge it before approving');
    await expect(page.getByRole('button', { name: 'Blocked by policy' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /I have read the recorded disagreement/ }).check();
    await expect(check).toContainText('Hold');
    await expect(check).toContainText('waits for a second, different approver');
    await expectAccessible(page);
    await page
      .getByLabel(/^Rationale/)
      .fill('Within the synthetic hedge budget; approve as the first approver.');
    await page.getByRole('button', { name: 'Record first approval' }).click();
    await expect(page.getByText('Awaiting second approval').first()).toBeVisible();

    // Executive: the second, different approver completes it and creates the handoff.
    await switchTo(page, /Executive \/ Governor/);
    await page.getByRole('checkbox', { name: /I have read the recorded disagreement/ }).check();
    await expect(page.getByRole('region', { name: 'Policy check' })).toContainText('Pass');
    await page.getByLabel(/^Rationale/).fill('Second approval: proportionate response under the mandate.');
    await page.getByRole('button', { name: 'Record: Approve' }).click();
    await expect(page.getByRole('heading', { name: 'Handoff to operations' })).toBeVisible();
    await expect(
      page.getByText('Only the Operations Owner records acknowledgement, progress and outcome.'),
    ).toBeVisible();

    // Operations owner: acknowledge, start and record the outcome on Governed Execution.
    await page.context().clearCookies();
    await signInAs(page, /Operations Owner/);
    await page.goto('/execution');
    await page.getByRole('button', { name: 'Acknowledge handoff' }).click();
    await page.getByRole('button', { name: 'Mark as started' }).click();
    await page
      .getByLabel(/What happened/)
      .fill('Hedge placed within the synthetic budget; exposure reduced.');
    await page
      .getByLabel(/Lesson for institutional memory/)
      .fill('Pre-agree hedge budgets so two-person approval takes hours, not days.');
    await page.getByRole('button', { name: 'Record outcome and close' }).click();
    await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
    await expectAccessible(page);

    // Memory: the lesson is searchable, with what the scenario expected and who decided. The capital case is
    // confidential, above the operations owner's clearance, so an executive reads it.
    await page.context().clearCookies();
    await signInAs(page, /Executive \/ Governor/);
    await page.goto('/memory');
    await page.getByLabel('Search memory').fill('hedge budgets');
    const entry = page.getByRole('article').filter({ hasText: CASE });
    await expect(entry).toContainText('Pre-agree hedge budgets');
    await expect(entry).toContainText('What the scenario expected');
    await expect(entry).toContainText('Huda Al-Rashid');
    await expectAccessible(page);

    // Decision log: the hold and the pass, each with its policy result.
    await page.goto('/decisions');
    const log = page.getByRole('table', { name: 'Recorded decisions' });
    await expect(log.getByText('First of two approvals')).toBeVisible();
    await expect(log.getByText('Pass')).toBeVisible();
  });

  test('memory, decisions and execution read well on any screen', async ({ page }) => {
    await signInAs(page, /Auditor/);
    for (const path of ['/memory', '/decisions', '/execution']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }
  });
});
