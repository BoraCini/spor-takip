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

test('bulut yedeği (v3) arayüzden açılır; yeni cihazda adla ve kurtarma koduyla geri yüklenir', async ({ page, browser }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'E2E yemeği', grams: 100, kcal: 100 });
  });
  await go(page, 'ayarlar', 1500);
  const name = 'e2e-' + Date.now() + '@ornek.com';
  const pass = 'e2e test sifresi ' + Date.now();
  await page.fill('#cl-name', name);
  await page.fill('#cl-pass', pass);
  await page.fill('#cl-pass2', pass);
  await page.click('[data-act="cloud-on"]');
  await expect(page.locator('.sheet .rc-code')).toContainText('PC3-', { timeout: 30_000 });
  await expect(page.locator('.sheet [data-qr] svg')).toBeVisible();
  const code = (await page.locator('.sheet .rc-code').textContent()).trim();
  await page.click('.sheet [data-done]');
  await expect(page.locator('.kv', { hasText: 'Yedek adı' })).toContainText(name.toLowerCase());
  expect(await page.evaluate(async () => (await import('./js/db.js')).getSetting('cloud_pass'))).toBeNull();

  for (const who of [name, code]) {
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await onboard(p2);
    await go(p2, 'ayarlar', 1500);
    await p2.click('[data-act="cloud-restore"]');
    await p2.fill('#cr-who', who);
    await p2.fill('#cr-pass', pass);
    await p2.click('.sheet-hd [data-sheet-right]');
    await expect(p2.locator('.sheet [data-ok]')).toBeVisible({ timeout: 30_000 });
    await p2.click('.sheet [data-ok]');
    await expect(p2.locator('#toast')).toContainText('Yedek geri yüklendi');
    const names = await p2.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((f) => f.name));
    expect(names).toContain('E2E yemeği');
    expect(await p2.evaluate(async () => !!(await (await import('./js/db.js')).getSetting('cloud_v3')))).toBe(true);
    await ctx2.close();
  }
  expect(errors).toEqual([]);
});

test('eski (PC02) bulut yedeği Ayarlar\'dan yeni biçime taşınır', async ({ page }) => {
  const errors = await onboard(page);
  const pass = 'eski bicim sifresi ' + Date.now();
  await page.evaluate(async (p) => {
    const db = await import('./js/db.js');
    const c = await import('./js/cloud.js');
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Eski', grams: 1, kcal: 1 });
    await db.setSetting('cloud_pass', p);
    await c.cloudUpload(p);
  }, pass);
  await go(page, 'ayarlar', 1500);
  await expect(page.getByText('Yedeğini yeni güvenli biçime taşı.')).toBeVisible();
  await page.fill('#cl-up-name', 'tasima-' + Date.now());
  await page.click('[data-act="cloud-upgrade"]');
  await expect(page.locator('.sheet .rc-code')).toContainText('PC3-', { timeout: 30_000 });
  expect(await page.evaluate(async () => (await import('./js/cloud.js')).cloudMode())).toBe('v3');
  expect(errors).toEqual([]);
});

test('ilk açılışta service worker kurulunca sayfa yenilenmez (kurulum yarıda kalmaz)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window.__isaret = 1));
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__isaret)).toBe(1);
});
