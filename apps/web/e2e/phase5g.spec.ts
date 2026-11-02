import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('Ask TIGERIS and alert channels (Phase 5G)', () => {
  test('a question is answered from cited records, and an unanswerable one is not guessed', async ({
    page,
  }, info) => {
    await signInAs(page, /Intelligence Analyst/);
    await page.goto('/ai');
    const ask = page.getByRole('region', { name: 'Ask TIGERIS' });
    await ask.getByLabel('Your question').fill('Hormuz seizure tanker');
    await ask.getByRole('button', { name: 'Ask' }).click();
    await expect(ask).toContainText('HMZ-2024-0413');
    await expect(ask).toContainText('no model called');
    await expectAccessible(page);
    await shot(page, 'ask', info.project.name);
    await ask.getByLabel('Your question').fill('zzqx quantum giraffe');
    await ask.getByRole('button', { name: 'Ask' }).click();
    await expect(ask).toContainText('does not guess');
  });

  test('alert channels show Teams and email off until configured', async ({ page }) => {
    await signInAs(page, /Governance Administrator/);
    await page.goto('/interventions?view=rules');
    const channels = page.getByRole('region', { name: 'Alert channels' });
    await expect(channels).toContainText('In-app intervention inbox');
    await expect(channels).toContainText('Off until TEAMS_WEBHOOK_URL is set');
    await expectAccessible(page);
  });
});
