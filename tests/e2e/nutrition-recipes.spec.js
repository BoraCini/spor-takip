import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

const q = (page, fn, arg) => page.evaluate(fn, arg);
const recipes = (page) => q(page, async () => (await (await import('./js/db.js')).list('custom_foods')).filter((f) => f.recipe));
const logs = (page) => q(page, async () => (await (await import('./js/db.js')).list('food_logs')).map((l) => ({ name: l.name, grams: l.grams, unit: l.unit, qty: l.qty, kcal: l.kcal })));

async function openRecipes(page) {
  await go(page, 'beslenme', 1200);
  await page.locator('.meal-add').first().click();
  await page.click('.sheet [role="tab"]:has-text("Tarifler")');
}
async function addIngredient(page, query, nameRe) {
  await page.fill('#rc-q', query);
  await page.locator('#rc-res [data-add]', { hasText: nameRe }).first().click();
}

test('tarif: ölçülü malzeme, adımlar, ölçekleme, pişmiş ağırlık, detay, kısmi porsiyonla günlüğe ekleme', async ({ page }) => {
  const errors = await onboard(page);
  await openRecipes(page);
  await page.click('.sheet [data-act="recipe"]');
  await page.fill('#rc-name', 'Yumurtalı tavuk');
  await page.selectOption('#rc-cat', 'ana');
  await page.fill('#rc-serv', '2');
  await page.locator('#rc-serv').dispatchEvent('change');
  await addIngredient(page, 'yumurta', /^Yumurta/);
  await page.selectOption('#ru-0', 'adet');
  await page.fill('#rq-0', '2');
  await addIngredient(page, 'tavuk göğsü', /Tavuk göğsü/);
  await page.selectOption('#ru-1', 'gram');
  await page.fill('#rq-1', '200');
  await expect(page.locator('[data-ik="0"]')).toContainText('100 g');
  // adımlar: ekle, düzenle, sırala
  await page.click('[data-step-add]');
  await page.fill('#rs-0', 'Tavuğu doğra');
  await page.click('[data-step-add]');
  await page.fill('#rs-1', 'Tavayı ısıt');
  await page.click('[data-sup="1"]');
  // 2 → 4 porsiyon: malzemeler ölçeklenir
  await page.fill('#rc-serv', '4');
  await page.locator('#rc-serv').dispatchEvent('change');
  await expect(page.locator('#rq-0')).toHaveValue('4');
  await expect(page.locator('[data-ik="1"]')).toContainText('400 g');
  await page.fill('#rc-cooked', '500');
  await expect(page.locator('#rc-tot')).toContainText('pişmiş son ağırlığa (500 g)');
  await page.locator('#rc-tags [data-tag="Yüksek protein"]').click();
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Tarif kaydedildi');
  let [r] = await recipes(page);
  expect(r.recipe).toMatchObject({ servings: 4, cooked_weight: 500, category: 'ana', steps: ['Tavayı ısıt', 'Tavuğu doğra'], tags: ['Yüksek protein'] });
  expect(r.recipe.items.map((x) => [x.unit, x.qty, x.grams])).toEqual([['adet', 4, 200], ['gram', 400, 400]]);
  expect(r.portions).toEqual([['porsiyon', 125]]);
  expect(r.recipe.items[0].snap.k).toBeGreaterThan(0);

  // detay ekranı → 1,5 porsiyon günlüğe
  await page.locator('.sheet [data-open]', { hasText: 'Yumurtalı tavuk' }).click();
  await expect(page.locator('.sheet h2', { hasText: 'Yumurtalı tavuk' })).toBeVisible();
  await expect(page.locator('.sheet')).toContainText('Pişmiş son ağırlık (500 g) üzerinden');
  await expect(page.locator('.sheet ol li').first()).toHaveText('Tavayı ısıt');
  await page.click('.sheet [data-log]');
  await page.click('.sheet [data-q="1.5"]');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('eklendi');
  let l = await logs(page);
  expect(l).toHaveLength(1);
  expect(l[0]).toMatchObject({ name: 'Yumurtalı tavuk', unit: 'porsiyon', qty: 1.5, grams: 187.5 });
  const kcalBefore = l[0].kcal;
  expect(kcalBefore).toBe(Math.round((r.k * 187.5) / 100));

  // tarifi düzenle (malzeme çıkar) → eski günlük kayıt değişmez
  await page.locator('.meal-row').first().click();
  await page.click('.sheet [data-edit-recipe]');
  await page.click('[data-rm="0"]');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Tarif güncellendi');
  [r] = await recipes(page);
  expect(r.recipe.items).toHaveLength(1);
  l = await logs(page);
  expect(l[0].kcal).toBe(kcalBefore);
  expect(errors).toEqual([]);
});

test('eski tarif: bulunamayan malzeme kaybolmaz, uyarılır; kopyala ve sil çalışır', async ({ page }) => {
  const errors = await onboard(page);
  await q(page, async () => {
    const db = await import('./js/db.js');
    await db.put('custom_foods', { name: 'Eski pilav', alias: 'tarif', k: 150, p: 3, c: 30, f: 2, portions: [['porsiyon', 200]], recipe: { servings: 2, items: [{ food_id: 'f_pilav', name: 'Pilav', grams: 300 }, { food_id: 'silinmis-besin', name: 'Silinmiş sos', grams: 100 }] } });
  });
  await openRecipes(page);
  await page.locator('.sheet [data-open]', { hasText: 'Eski pilav' }).click();
  await expect(page.locator('.sheet')).toContainText('Değeri bilinmeyen malzeme: Silinmiş sos');
  await page.click('.sheet [data-edit]');
  await expect(page.locator('.rc-row', { hasText: 'Silinmiş sos' })).toContainText('besin bulunamadı');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Değeri bilinmeyen malzeme var');
  let [r] = await recipes(page);
  expect(r.recipe.items).toHaveLength(2); // kaydedilmedi, hiçbir şey kaybolmadı
  // bilinmeyen malzemeyi çıkarıp kaydet
  await page.locator('.rc-row', { hasText: 'Silinmiş sos' }).locator('[data-rm]').click();
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Tarif güncellendi');
  // kopyala
  await page.locator('.sheet [data-open]', { hasText: 'Eski pilav' }).click();
  await page.click('.sheet [data-copy]');
  await expect(page.locator('#rc-name')).toHaveValue('Eski pilav (kopya)');
  await page.click('.sheet-hd [data-sheet-right]');
  await expect(page.locator('#toast')).toContainText('Tarif kaydedildi');
  expect((await recipes(page)).map((x) => x.name).sort()).toEqual(['Eski pilav', 'Eski pilav (kopya)']);
  // sil
  await page.locator('.sheet [data-open]', { hasText: 'Eski pilav (kopya)' }).click();
  await page.click('.sheet [data-del]');
  await page.click('.sheet [data-ok]');
  await expect(page.locator('#toast')).toContainText('Tarif silindi');
  expect((await recipes(page)).map((x) => x.name)).toEqual(['Eski pilav']);
  expect(errors).toEqual([]);
});
