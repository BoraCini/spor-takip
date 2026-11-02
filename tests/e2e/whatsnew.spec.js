import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('Yenilikler: yeni kurulumda çıkmaz; güncellemeden sonra bir kez çıkar; Ayarlar\'dan açılır', async ({ page }) => {
  const errors = await onboard(page);
  const app = await page.evaluate(async () => (await import('./js/app.js')).APP_VERSION);
  expect(await page.evaluate(async () => (await import('./js/db.js')).getSetting('seen_version'))).toBe(app);
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.locator('.sheet', { hasText: 'Yenilikler' })).toHaveCount(0);

  // bir önceki sürümden güncellenmiş gibi (sürüm numaraları notlardan okunur, test her sürümde geçerli kalır)
  const { prev, total } = await page.evaluate(async () => {
    const { CHANGELOG } = await import('./js/changelog.js');
    return { prev: CHANGELOG[1].version, total: CHANGELOG.length };
  });
  await page.evaluate(async (v) => (await import('./js/db.js')).setSetting('seen_version', v), prev);
  await page.reload();
  const sheet = page.locator('.sheet', { hasText: 'Uygulama güncellendi' });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.locator('.wn-entry')).toHaveCount(1);
  await expect(sheet.locator('.wn-ver').first()).toHaveText(app);
  await sheet.locator('[data-wn-all]').click();
  await expect(sheet.locator('.wn-entry')).toHaveCount(total);
  await sheet.locator('[data-wn-ok]').click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('./js/db.js')).getSetting('seen_version'))).toBe(app);
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page.locator('.sheet', { hasText: 'Uygulama güncellendi' })).toHaveCount(0);

  await go(page, 'ayarlar', 1200);
  await page.click('[data-act="whatsnew"]');
  const all = page.locator('.sheet', { hasText: 'Sürüm notları' });
  await expect(all.locator('.wn-entry')).toHaveCount(total);
  await expect(all).toContainText('Öğün şablonları');
  expect(errors).toEqual([]);
});
