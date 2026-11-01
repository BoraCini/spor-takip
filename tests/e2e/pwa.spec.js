import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { onboard, go } from './helpers.js';

test('çevrimdışı açılır ve ekranlar çalışır', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'çevrimdışı benzetimi Chromium ile');
  const errors = await onboard(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30_000 });
  // tüm ekranları bir kez gez (modüller önbelleğe girsin)
  for (const h of ['danisman', 'beslenme', 'antrenman', 'kur', 'kan', 'profil', 'ayarlar']) await go(page, h, 800);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(1500);
  for (const h of ['beslenme', 'kan', 'ayarlar']) {
    await go(page, h, 1000);
    await expect(page.locator('#view')).not.toBeEmpty();
  }
  await expect(page.getByText('Veriler açılamadı')).toHaveCount(0);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('yeni sürüm: "Yeni sürüm hazır" → Yenile → yeni önbellek, eskisi silinir, veriler yerinde', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'service worker değiştirme Chromium ile');
  await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Güncellemeden önce', grams: 1, kcal: 1 });
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30_000 });
  const before = await page.evaluate(() => caches.keys());
  // sunucuda yeni sürüm yayınlanmış gibi: sw.js içindeki önbellek adını geçici olarak değiştir (test sonunda geri alınır)
  const swPath = path.resolve('public/sw.js');
  const original = fs.readFileSync(swPath, 'utf8');
  try {
    fs.writeFileSync(swPath, original.replace(/const CACHE = '([^']+)'/, "const CACHE = '$1-yeni'"));
    await expect
      .poll(async () => (await (await page.request.get('/sw.js')).text()).includes('-yeni'), { timeout: 20_000 })
      .toBe(true);
    // tarayıcı güncellemeyi kontrol eder (uygulama görünür olunca da kendiliğinden yapar)
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            await (await navigator.serviceWorker.getRegistration()).update().catch(() => {});
            await new Promise((r) => setTimeout(r, 1500));
            return !!document.querySelector('.update-banner');
          }),
        { timeout: 30_000 }
      )
      .toBe(true);
    await expect(page.locator('.update-banner')).toContainText('Yeni sürüm hazır');
    await Promise.all([page.waitForEvent('load', { timeout: 20_000 }), page.click('.update-banner button')]);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => caches.keys());
    expect(after.some((k) => k.endsWith('-yeni'))).toBe(true);
    expect(after.filter((k) => before.includes(k))).toEqual([]);
  } finally {
    fs.writeFileSync(swPath, original);
  }
  const names = await page.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((f) => f.name));
  expect(names).toContain('Güncellemeden önce');
});
