import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

// Open Food Facts'e giden istekler taklit edilir (testler internete bağlı olmasın); service worker kapalı ki taklit her tarayıcıda yakalansın
test.use({ serviceWorkers: 'block' });

const top = (page) => page.locator('.sheet').last();
const logs = (page) => page.evaluate(async () => (await (await import('./js/db.js')).list('food_logs')).map((l) => ({ food_id: l.food_id, name: l.name, grams: l.grams, unit: l.unit, kcal: l.kcal, fiber_g: l.fiber_g })));

async function mockOFF(page, products = []) {
  let calls = 0;
  await page.route(/openfoodfacts\.org/, (route) => {
    calls++;
    const body = route.request().url().includes('search.openfoodfacts.org') ? { hits: products } : { products };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return () => calls;
}

test('paketli ürün listesi: aramada ayrı bölüm, günlüğe ekleme, Son sekmesi, barkod çevrimdışı bulunur', async ({ page }) => {
  const errors = await onboard(page);
  const calls = await mockOFF(page, []);
  await go(page, 'beslenme', 1200);
  await page.locator('.meal-add').first().click();
  await page.fill('#fsearch', 'eti burçak');
  const sec = page.locator('#flist .sec h2', { hasText: 'Paketli ürünler' });
  await expect(sec).toBeVisible({ timeout: 15_000 });
  // marka adıyla arandığı için paketli ürünler en üstte
  await expect(page.locator('#flist .sec h2').first()).toHaveText('Paketli ürünler');
  const row = page.locator('#flist [data-open="o_8690526602943"]');
  await expect(row).toContainText('paketli');
  await row.click();
  await expect(top(page)).toContainText('Open Food Facts · barkod 8690526602943');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#toast')).toContainText('eklendi');
  const [l] = await logs(page);
  expect(l).toMatchObject({ food_id: 'o_8690526602943', name: 'Eti Burçak Bitkisel içerikli Çok Tahıllı Bisküvi' });
  expect(l.kcal).toBeGreaterThan(0);
  // yerelde 8+ sonuç olduğu için internette arama yapılmadı
  expect(calls()).toBe(0);

  // Son sekmesinde paketli ürün görünür (kimliği bulunur)
  await page.locator('.meal-add').first().click();
  await expect(page.locator('#flist [data-open="o_8690526602943"]')).toBeVisible();
  await page.keyboard.press('Escape');

  // barkod: önce uygulamadaki liste (internetsiz)
  const viaBarcode = await page.evaluate(async () => {
    const f = await (await import('./js/barcode.js')).foodFromBarcode('8681324002837');
    return f && { id: f.id, packaged: f.packaged, name: f.name };
  });
  expect(viaBarcode).toEqual({ id: 'o_8681324002837', packaged: true, name: 'Sütaş Ayran' });
  expect(calls()).toBe(0);
  expect(errors).toEqual([]);
});

test('yerelde az sonuç varsa Open Food Facts kendiliğinden aranır; seçilen ürün kontrol edilip kaydedilir', async ({ page }) => {
  const errors = await onboard(page);
  // bu test canlı aramayı dener: ayar açılır (Ayarlar'daki düğme)
  await go(page, 'ayarlar', 1200);
  await expect(page.locator('#off-live')).not.toBeChecked();
  await page.locator('#off-live').check({ force: true });
  expect(await page.evaluate(async () => (await import('./js/db.js')).getSetting('off_live'))).toBe(true);
  const calls = await mockOFF(page, [
    { code: '8699999000017', product_name: 'Zqxbar Protein Bar Fıstıklı', brands: 'Zqx', serving_quantity: 45, nutriments: { 'energy-kcal_100g': 380, proteins_100g: 30, carbohydrates_100g: 35, fat_100g: 12, sodium_100g: 0.3 } },
  ]);
  await go(page, 'beslenme', 1200);
  await page.locator('.meal-add').first().click();
  await page.fill('#fsearch', 'zqxbar');
  const liveRow = page.locator('#flive [data-live="0"]');
  await expect(liveRow).toContainText('Zqxbar Protein Bar Fıstıklı', { timeout: 15_000 });
  expect(calls()).toBeGreaterThan(0);
  await liveRow.click();
  // kontrol ekranı: bilinmeyen lif boş gelir (0 değil)
  await expect(top(page).locator('#rf-fb')).toHaveValue('');
  await expect(top(page).locator('#rf-na')).toHaveValue('300');
  await top(page).locator('[data-sheet-right]').click();
  await expect(top(page).locator('[data-sheet-right]')).toHaveText('Ekle');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#toast')).toContainText('eklendi');
  const [l] = await logs(page);
  expect(l.name).toContain('Zqxbar');
  expect(l.fiber_g).toBeNull();
  const saved = await page.evaluate(async () => (await (await import('./js/db.js')).list('custom_foods')).map((f) => ({ barcode: f.barcode, fb: f.fb })));
  expect(saved).toEqual([{ barcode: '8699999000017', fb: null }]);

  // aynı ürün artık kendi listende: internet sonucu olarak tekrar gösterilmez
  await page.locator('.meal-add').first().click();
  await page.fill('#fsearch', 'zqxbar');
  await expect(page.locator('#flist [data-open]').first()).toContainText('Zqxbar');
  await page.waitForTimeout(1500);
  await expect(page.locator('#flive [data-live]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
