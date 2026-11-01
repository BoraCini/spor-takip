import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('tüm ana ekranlar hatasız açılır', async ({ page }) => {
  const errors = await onboard(page);
  for (const h of ['danisman', 'beslenme', 'antrenman', 'antrenman?tab=progress', 'kur', 'kan', 'profil', 'ayarlar']) {
    await go(page, h);
    await expect(page.locator('#view')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('besin arayıp ekler', async ({ page }) => {
  const errors = await onboard(page);
  await go(page, 'beslenme');
  await page.locator('.meal-add').first().click();
  await page.locator('.sheet input[type="search"]').first().fill('havuç tarator');
  await page.waitForTimeout(500);
  await expect(page.locator('.sheet .row-title').first()).toContainText('Havuç tarator');
  expect(errors).toEqual([]);
});

test('bulut yedeği arayüzden açılır ve başka cihazda geri yüklenir', async ({ page, browser }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'E2E yemeği', grams: 100, kcal: 100 });
  });
  await go(page, 'ayarlar', 1500);
  const pass = 'e2e test sifresi ' + Date.now();
  await page.fill('#cl-pass', pass);
  await page.fill('#cl-pass2', pass);
  await page.click('[data-act="cloud-on"]');
  await expect(page.locator('#toast')).toContainText('Bulut yedeği açıldı', { timeout: 20_000 });

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await onboard(p2);
  await go(p2, 'ayarlar', 1500);
  await p2.click('[data-act="cloud-restore"]');
  await p2.fill('#cr-pass', pass);
  await p2.click('.sheet-hd [data-sheet-right]');
  await p2.waitForTimeout(3000);
  await p2.click('.sheet .btn.primary >> nth=-1');
  await p2.waitForTimeout(1500);
  const names = await p2.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((f) => f.name));
  expect(names).toContain('E2E yemeği');
  expect(errors).toEqual([]);
  await ctx2.close();
});
