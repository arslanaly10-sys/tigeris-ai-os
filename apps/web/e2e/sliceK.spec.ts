import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, signInAs } from './helpers';

const shot = async (page: Page, name: string, project: string) => {
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${project}-${name}.png`, fullPage: true });
};

test.describe('sector datasets and models (slice K)', () => {
  test('labelled sample records drive the sector models and are marked as samples', async ({ page }) => {
    await signInAs(page, /Executive \/ Governor/);
    await page.goto('/sectors/insurance');
    const panel = page.getByRole('region', { name: 'Sector models' });
    await expect(panel).toContainText('Largest peril and region accumulation');
    await expect(panel).toContainText('USD 480,000,000');
    await expect(panel).toContainText('Sample');
    await expectAccessible(page);
  });

  test('an imported sample of utility assets drives the utilities models, labelled as imported', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'Mutating journey runs once, on desktop');
    await signInAs(page, /Governance Administrator/);
    const tag = Date.now().toString(36).toUpperCase();
    const reg = await page.request.post('/api/connectors', {
      data: {
        provider: 'Utility operations system (e2e sample)',
        name: `Utility assets (e2e ${tag})`,
        connectionType: 'file',
        authType: 'none',
        datasets: ['utility_assets'],
        classification: 'restricted',
        sourceClass: 'client',
      },
    });
    expect(reg.status()).toBe(201);
    const key: string = (await reg.json()).key;
    expect(
      (await page.request.post(`/api/sources/${key.toLowerCase()}/approve`, { data: {} })).status(),
    ).toBe(200);
    const csv = [
      'key,name,asset_type,capacity_mw,fuel_buffer_days,gas_dependent,as_of',
      `UA-${tag}-1,Coastal power (e2e sample),power,700,9,true,2026-09-30`,
      `UA-${tag}-2,Desalination A (e2e sample),desalination,300,3,true,2026-09-30`,
      `UA-${tag}-3,Solar park (e2e sample),power,1000,0,false,2026-09-30`,
    ].join('\n');
    const up = await page.request.post(`/api/connectors/${key}/uploads`, {
      multipart: {
        dataset: 'utility_assets',
        file: { name: 'utility_assets.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });
    expect(up.status()).toBe(201);

    await page.goto('/sectors/utilities');
    const panel = page.getByRole('region', { name: 'Sector models' });
    await expect(panel).toContainText('Shortest fuel buffer, gas-dependent assets');
    await expect(panel).toContainText('3 days');
    await expect(panel).toContainText('Imported');
    await panel.getByText('How this is calculated').first().click();
    await expect(panel).toContainText(`determined by UA-${tag}-2`);
    await shot(page, 'sector-models', info.project.name);
    await expectAccessible(page);
  });
});
