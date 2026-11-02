import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

test('veritabanı açılamazsa hata ekranı gösterilir, yeni kullanıcı gibi davranılmaz', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException('engellendi', 'SecurityError');
    };
  });
  await page.goto('/');
  await expect(page.getByText('Veriler açılamadı')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('STORAGE_UNAVAILABLE')).toBeVisible();
  await expect(page.locator('[data-go]')).toHaveCount(0); // karşılama/kurulum ekranı açılmadı
  await expect(page.getByRole('button', { name: 'Yeniden dene' })).toBeVisible();
});

test('bozuk yedek dosyası reddedilir ve veriye dokunulmaz', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Korunacak', grams: 100, kcal: 100 });
  });
  await go(page, 'ayarlar', 1500);
  const bad = { app: 'sporcoach', schema_version: 2, data: { food_logs: [{ id: 'a', date: '2026-13-45' }] } };
  await page.setInputFiles('[data-act="import"]', { name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByText('Yedek açılamadı')).toBeVisible();
  await expect(page.getByText(/geçersiz tarih/)).toBeVisible();
  const names = await page.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((f) => f.name));
  expect(names).toEqual(['Korunacak']);
  expect(errors).toEqual([]);
});

test('geçerli yedek özetle geri yüklenir', async ({ page }) => {
  const errors = await onboard(page);
  await go(page, 'ayarlar', 1500);
  const good = { app: 'sporcoach', schema_version: 2, exported_at: '2026-10-01T10:00:00Z', data: { food_logs: [{ id: 'a', date: '2026-10-01', meal: 'ogle', name: 'Yedekten gelen', grams: 100, kcal: 120 }] } };
  await page.setInputFiles('[data-act="import"]', { name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
  await expect(page.getByText('1 besin kaydı')).toBeVisible();
  await page.click('.sheet [data-ok]');
  await expect(page.locator('#toast')).toContainText('Yedek yüklendi');
  const names = await page.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((f) => f.name));
  expect(names).toEqual(['Yedekten gelen']);
  expect(errors).toEqual([]);
});
