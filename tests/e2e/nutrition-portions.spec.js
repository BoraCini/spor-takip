import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

const logs = (page) => page.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((l) => ({ name: l.name, grams: l.grams, unit: l.unit, qty: l.qty, kcal: l.kcal, id: l.id })));

test('kişisel besin: çoklu porsiyon, varsayılan, ondalıklı ekleme; düzenleme geçmiş kaydı değiştirmez', async ({ page }) => {
  const errors = await onboard(page);
  await go(page, 'beslenme', 1500);
  await page.locator('.meal-add').first().click();
  await page.click('.sheet [data-act="custom"]');
  await page.click('.sheet [data-m="manual"]');
  await page.fill('#cf-name', 'Test whey');
  await page.fill('#cf-k', '400');
  await page.fill('#cf-p', '80');
  await page.fill('#cf-c', '8');
  await page.fill('#cf-f', '5');
  // ilk satır: 1 ölçek = 30 g
  await page.selectOption('#pu-0', 'ölçek');
  await page.fill('#pg-0', '30');
  // ikinci satır: 0,5 ölçek = 15 g
  await page.click('[data-padd]');
  await page.selectOption('#pu-1', 'ölçek');
  await page.fill('#pq-1', '0,5');
  await page.fill('#pg-1', '15');
  // üçüncü satır: özel ölçü
  await page.click('[data-padd]');
  await page.selectOption('#pu-2', 'ozel');
  await page.fill('#pc-2', 'bar');
  await page.fill('#pg-2', '45');
  await page.check('[data-pdef="0"]');
  await page.click('.sheet-hd [data-sheet-right]');
  // miktar ekranı varsayılan porsiyonla açılır
  await expect(page.locator('.sheet [data-unit="ölçek"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sheet [data-unit="0,5 ölçek"]')).toBeVisible();
  await expect(page.locator('.sheet [data-unit="bar"]')).toBeVisible();
  await page.click('.sheet [data-q="1.5"]');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('eklendi');
  let l = await logs(page);
  expect(l).toHaveLength(1);
  expect(l[0]).toMatchObject({ name: 'Test whey', grams: 45, unit: 'ölçek', qty: 1.5, kcal: 180 });

  // besini düzenle: kaloriyi değiştir, 0,5 ölçek porsiyonunu sil
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    const f = (await db.list('custom_foods'))[0];
    await db.put('custom_foods', { ...f, k: 500, portions: f.portions.filter((p) => p[0] !== '0,5 ölçek') });
  });
  // eski kaydı aç ve hiçbir şey değiştirmeden kaydet → değerler aynı kalır
  await go(page, 'beslenme', 1200);
  await page.locator('.meal-row').first().click();
  await expect(page.getByText('Bu kayıt, eklendiği andaki değerlerle açıldı')).toBeVisible();
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Güncellendi');
  l = await logs(page);
  expect(l[0]).toMatchObject({ grams: 45, kcal: 180 });
  // istenirse güncel değerlerle hesaplanır
  await page.locator('.meal-row').first().click();
  await page.click('.sheet [data-live]');
  await page.click('.sheet-hd [data-sheet-right]');
  await page.waitForTimeout(500);
  l = await logs(page);
  expect(l[0].kcal).toBe(225);
  expect(errors).toEqual([]);
});

test('besin düzenleme ekranı mevcut porsiyonları ve ml tabanını yönetir', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('custom_foods', { name: 'Ev sütü', k: 60, p: 3.2, c: 4.7, f: 3.3, base: 'ml', portions: [['su bardağı', 200], ['kupa', 300]], default_portion: 'kupa', category: 'sut' });
  });
  await go(page, 'beslenme', 1200);
  await page.locator('.meal-add').first().click();
  await page.click('.sheet [data-tab="benim"]');
  await page.locator('.sheet [data-open]', { hasText: 'Ev sütü' }).click();
  await expect(page.locator('.sheet [data-unit="kupa"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sheet [data-unit="gram"]')).toHaveText('ml');
  await page.click('.sheet [data-edit-food]');
  await expect(page.locator('[data-base="ml"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pu-1')).toHaveValue('ozel');
  await expect(page.locator('#pc-1')).toHaveValue('kupa');
  await expect(page.locator('[data-pdef="1"]')).toBeChecked();
  await page.click('[data-prm="0"]');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Besin güncellendi');
  const f = await page.evaluate(async () => (await (await import('./js/db.js')).list('custom_foods'))[0]);
  expect(f).toMatchObject({ portions: [['kupa', 300]], default_portion: 'kupa', base: 'ml', category: 'sut' });
  expect(errors).toEqual([]);
});
