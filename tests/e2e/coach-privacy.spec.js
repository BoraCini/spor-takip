import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('Coach gizlilik: paylaşım satırı, ayar sayfası ve mevcut kurulum bilgisi', async ({ page }) => {
  const errors = await onboard(page);
  await go(page, 'danisman', 1500);
  // yeni kurulum: tahlil/tansiyon/ilaç kapalı
  await expect(page.locator('.share-line')).toContainText('Profil · Beslenme · Antrenman · Vücut');
  await expect(page.locator('.share-line')).not.toContainText('Tahlil');
  await page.click('.share-line');
  await expect(page.getByRole('dialog', { name: 'Coach neleri görebilir' })).toBeVisible();
  await expect(page.locator('#ais-tahlil')).not.toBeChecked();
  await page.locator('label[for="ais-tahlil"]').click();
  await page.locator('#ais-tahlil').check({ force: true });
  await page.click('.sheet [data-sheet-close]');
  await expect(page.locator('.share-line')).toContainText('Tahlil');
  expect(await page.evaluate(async () => (await (await import('./js/db.js')).getSetting('ai_share')).tahlil)).toBe(true);

  // Ayarlar'da da görünür
  await go(page, 'ayarlar', 1500);
  await expect(page.locator('[data-act="ai-share"]')).toContainText('Kan tahlilleri');
  expect(errors).toEqual([]);
});

test('önceden Coach kullanan kurulumda bir kerelik bilgi gösterilir', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.setSetting('api_key', 'sk-ant-e2e');
    await db.setSetting('ai_share', null);
  });
  await go(page, 'danisman', 1500);
  await expect(page.getByText('Coach artık yalnızca izin verdiğin verileri görüyor')).toBeVisible();
  await expect(page.locator('.share-line')).toContainText('İlaç/protokol');
  await page.click('[data-banner="ai-share-ok"]');
  await expect(page.getByText('Coach artık yalnızca izin verdiğin verileri görüyor')).toHaveCount(0);
  expect(errors).toEqual([]);
});
