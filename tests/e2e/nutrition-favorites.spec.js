import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

const setting = (page, key) => page.evaluate(async (k) => (await import('./js/db.js')).getSetting(k), key);
const top = (page) => page.locator('.sheet').last();

async function openAdd(page) {
  await go(page, 'beslenme', 1200);
  await page.locator('.meal-add').first().click();
}

test('favoriler: yıldız arama/sekme/seçimleri bozmaz; Favoriler sekmesi; hazır ve kişisel besin', async ({ page }) => {
  const errors = await onboard(page);
  // kişisel bir besin
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('custom_foods', { id: 'c_tarator', name: 'Havuç tarator (benim)', k: 120, p: 3, c: 8, f: 9, fb: null, na: null, ka: null, portions: [['kase', 150]], default_portion: 'kase' });
  });
  await openAdd(page);
  await page.fill('#fsearch', 'yumurta');
  const egg = page.locator('#flist .frow', { has: page.locator('[data-open="f_egg"]') });
  // önce başka bir besini seç
  await page.locator('#flist [data-pick]').nth(1).click();
  await expect(page.locator('.sheet-ft [data-addall]')).toContainText('1 besini ekle');
  await egg.locator('[data-fav]').click();
  await expect(egg.locator('[data-fav]')).toHaveAttribute('aria-pressed', 'true');
  // arama ve seçim korunur
  await expect(page.locator('#fsearch')).toHaveValue('yumurta');
  await expect(page.locator('.sheet-ft [data-addall]')).toContainText('1 besini ekle');
  expect(await setting(page, 'food_favorites')).toEqual(['f_egg']);

  await page.fill('#fsearch', 'tarator');
  await page.locator('#flist .frow', { has: page.locator('[data-open="c_tarator"]') }).locator('[data-fav]').click();
  await page.fill('#fsearch', '');
  await page.click('#ftabs [data-tab="fav"]');
  await expect(page.locator('#flist [data-open]')).toHaveCount(2);
  await expect(page.locator('#flist')).toContainText('Havuç tarator (benim)');
  await expect(page.locator('#flist')).toContainText('Yumurta');
  // favori sekmesinde çıkarınca satır yerinde kalır (yanlışlıkla dokunmayı geri almak kolay), sonra listeden düşer
  await page.locator('#flist [data-fav="f_egg"]').click();
  await expect(page.locator('#flist [data-fav="f_egg"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await setting(page, 'food_favorites')).toEqual(['c_tarator']);
  await page.click('#ftabs [data-tab="son"]');
  await page.click('#ftabs [data-tab="fav"]');
  await expect(page.locator('#flist [data-open]')).toHaveCount(1);
  // seçim hâlâ duruyor
  await expect(page.locator('.sheet-ft [data-addall]')).toContainText('1 besini ekle');

  // miktar ekranından favori
  await page.fill('#fsearch', 'muz');
  await page.locator('#flist [data-open]').first().click();
  await top(page).locator('[data-favtoggle]').click();
  await expect(top(page).locator('[data-favtoggle]')).toContainText('Favorilerde');
  await top(page).locator('[data-sheet-close]').click();
  await expect(page.locator('#flist [data-fav]').first()).toHaveAttribute('aria-pressed', 'true');
  expect((await setting(page, 'food_favorites')).length).toBe(2);
  expect(errors).toEqual([]);
});

test('kategoriler: hazır kategori listesi, aramayla birlikte süzme, kişisel kategori oluştur/ata/yeniden adlandır/sil', async ({ page }) => {
  const errors = await onboard(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('custom_foods', { id: 'c_bar', name: 'Ev yapımı yulaf bar', k: 380, p: 10, c: 55, f: 12, category: 'tatli' });
  });
  await openAdd(page);
  await page.click('#ftabs [data-tab="kat"]');
  await page.click('#flist [data-cat="sut"]');
  await expect(page.locator('#flist h2')).toHaveText('Süt ürünleri');
  await expect(page.locator('#flist')).toContainText('Cheddar peyniri');
  await expect(page.locator('#flist')).not.toContainText('Kaşarlı pide');
  // aramayla birlikte: kategori seçiliyken arama yalnızca o kategoride
  await page.fill('#fsearch', 'peynir');
  await expect(page.locator('#fcat')).toHaveValue('sut');
  const inSut = await page.locator('#flist [data-open]').count();
  expect(inSut).toBeGreaterThan(3);
  await expect(page.locator('#flist [data-open="t_pide_kasarli"]')).toHaveCount(0);
  await page.selectOption('#fcat', '');
  await expect.poll(() => page.locator('#flist [data-open]').count()).toBeGreaterThan(inSut);
  await page.selectOption('#fcat', 'tatli');
  await page.fill('#fsearch', 'yulaf');
  await expect(page.locator('#flist [data-open="c_bar"]')).toBeVisible(); // kişisel besinin seçtiği kategori
  await expect(page.locator('#flist [data-open="f_oats"]')).toHaveCount(0);
  await page.fill('#fsearch', '');
  await page.click('#ftabs [data-tab="kat"]');

  // kişisel kategori
  await page.click('#flist [data-act="newcat"]');
  await top(page).locator('#uc-name').fill('Meyveler');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#toast')).toContainText('hazır bir kategoride');
  await top(page).locator('#uc-name').fill('Kahvaltılıklar');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#flist')).toContainText('Kahvaltılıklar');
  const [uc] = await setting(page, 'food_user_categories');
  expect(uc).toMatchObject({ name: 'Kahvaltılıklar' });
  expect(uc.id).toMatch(/^uc_/);

  // hazır besini ata
  await page.fill('#fsearch', 'yumurta');
  await page.locator('#flist [data-open="f_egg"]').click();
  await top(page).locator('[data-ucpick]').click();
  await top(page).locator(`[data-uc="${uc.id}"]`).click();
  await expect(top(page).locator('[data-ucpick]')).toHaveText('Kahvaltılıklar');
  await top(page).locator('[data-sheet-close]').click();
  // kişisel besini ata
  await page.fill('#fsearch', 'yulaf bar');
  await page.locator('#flist [data-open="c_bar"]').click();
  await top(page).locator('[data-ucpick]').click();
  await top(page).locator(`[data-uc="${uc.id}"]`).click();
  await top(page).locator('[data-sheet-close]').click();
  expect(await setting(page, 'food_cat_assign')).toEqual({ f_egg: uc.id, c_bar: uc.id });

  await page.fill('#fsearch', '');
  await page.click('#ftabs [data-tab="kat"]');
  await page.click(`#flist [data-cat="${uc.id}"]`);
  await expect(page.locator('#flist [data-open]')).toHaveCount(2);
  // hazır kategorisinde de görünmeye devam eder
  await page.click('#flist [data-cat=""]');
  await page.click('#flist [data-cat="et"]');
  await expect(page.locator('#flist [data-open="f_egg"]')).toBeVisible();
  await page.click('#flist [data-cat=""]');

  // yeniden adlandır
  await page.click(`#flist [data-ucedit="${uc.id}"]`);
  await top(page).locator('#uc-name').fill('Sabah');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#flist')).toContainText('Sabah');
  // sil: besinler silinmez, atamalar kalkar
  await page.click(`#flist [data-ucdel="${uc.id}"]`);
  await top(page).locator('[data-ok], .btn.danger').last().click();
  await expect(page.locator('#toast')).toContainText('Kategori silindi');
  expect(await setting(page, 'food_user_categories')).toEqual([]);
  expect(await setting(page, 'food_cat_assign')).toEqual({});
  const foods = await page.evaluate(async () => (await (await import('./js/db.js')).list('custom_foods')).map((f) => f.id));
  expect(foods).toEqual(['c_bar']);
  expect(errors).toEqual([]);
});
