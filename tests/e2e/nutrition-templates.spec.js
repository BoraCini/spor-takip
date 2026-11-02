import { test, expect } from '@playwright/test';
import { onboard, go } from './helpers.js';

const top = (page) => page.locator('.sheet').last();
const all = (page, store) => page.evaluate(async (s) => (await import('./js/db.js')).list(s), store);
const todayStr = (page) => page.evaluate(async () => (await import('./js/util.js')).today());

async function openTemplates(page, mealIndex = 0) {
  await page.locator('.meal-add').nth(mealIndex).click();
  await page.click('#ftabs [data-tab="sablon"]');
}

test('şablon: günlükteki öğünden oluştur, başka öğüne 1,5 katıyla tek işlemde uygula; eski kayıtlar değişmez', async ({ page }) => {
  const errors = await onboard(page);
  const d = await todayStr(page);
  await page.evaluate(async (d) => {
    const db = await import('./js/db.js');
    const { findFood, nutrientsFor } = await import('./js/data/foods.js');
    const egg = findFood('f_egg');
    const oats = findFood('f_oats');
    await db.put('food_logs', { date: d, meal: 'kahvalti', food_id: 'f_egg', name: egg.name, grams: 100, unit: 'adet', qty: 2, source: 'manuel', ...nutrientsFor(egg, 100) });
    await db.put('food_logs', { date: d, meal: 'kahvalti', food_id: 'f_oats', name: oats.name, grams: 40, unit: 'gram', qty: 40, source: 'manuel', ...nutrientsFor(oats, 40) });
    await db.put('food_logs', { date: d, meal: 'kahvalti', name: 'Kahve (hızlı)', kcal: 60, protein_g: 2, carb_g: 8, fat_g: 2, source: 'hizli' });
  }, d);
  await go(page, 'beslenme', 1200);
  const before = await all(page, 'food_logs');

  await page.click('[data-act="save-template"][data-meal="kahvalti"]');
  await expect(top(page).locator('#tp-name')).toHaveValue('Kahvaltı şablonu');
  await expect(top(page).locator('#tp-count')).toHaveText('3 besin');
  await top(page).locator('#tp-name').fill('Hafta içi kahvaltım');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#toast')).toContainText('Şablon kaydedildi');
  const [tpl] = await all(page, 'meal_templates');
  expect(tpl).toMatchObject({ name: 'Hafta içi kahvaltım', meal: 'kahvalti', use_count: 0 });
  expect(tpl.items.map((x) => [x.food_id, x.unit, x.qty, x.grams])).toEqual([['f_egg', 'adet', 2, 100], ['f_oats', 'gram', 40, 40], [null, null, null, null]]);
  expect(tpl.items[2].fixed.kcal).toBe(60);

  // Öğle'nin + düğmesinden aç: hedef öğün Öğle gelir
  await openTemplates(page, 1);
  await page.locator('[data-topen]', { hasText: 'Hafta içi kahvaltım' }).click();
  await expect(top(page).locator('[data-tmeal="ogle"]')).toHaveAttribute('aria-pressed', 'true');
  await top(page).locator('[data-tf="1.5"]').click();
  await expect(top(page).locator('[data-ta="0"]')).toContainText('3 adet (150 g)');
  // geçersiz çarpan uygulanamaz
  await top(page).locator('#ta-factor').fill('0');
  await expect(top(page).locator('[data-apply]')).toBeDisabled();
  await top(page).locator('#ta-factor').fill('1,5');
  await expect(top(page).locator('[data-apply]')).toBeEnabled();
  // kahveyi çıkar
  await top(page).locator('[data-tsel="2"]').click();
  await expect(top(page).locator('[data-apply]')).toHaveText('2 besini Öğle öğününe ekle');
  await top(page).locator('[data-apply]').click();
  await expect(page.locator('#toast')).toContainText('2 besin Öğle öğününe eklendi');

  const after = await all(page, 'food_logs');
  expect(after).toHaveLength(before.length + 2);
  // eski kayıtlar aynen duruyor
  for (const b of before) expect(after.find((x) => x.id === b.id)).toEqual(b);
  const added = after.filter((x) => x.source === 'sablon');
  expect(added.map((x) => [x.meal, x.date, x.food_id, x.grams, x.unit, x.qty])).toEqual([
    ['ogle', d, 'f_egg', 150, 'adet', 3],
    ['ogle', d, 'f_oats', 60, 'gram', 60],
  ]);
  expect(added[0].kcal).toBe(Math.round(before.find((x) => x.food_id === 'f_egg').kcal * 1.5));
  const [used] = await all(page, 'meal_templates');
  expect(used.use_count).toBe(1);
  expect(used.last_used).toBeTruthy();
  expect(errors).toEqual([]);
});

test('şablon: silinen besin kayıtlı değerle eklenir ve bildirilir; sıfırdan oluştur, düzenle, kopyala, favori, ara, sil; geçmiş tarihe ekle', async ({ page }) => {
  const errors = await onboard(page);
  const d = await todayStr(page);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('custom_foods', { id: 'c_bar', name: 'Ev barı', k: 400, p: 20, c: 40, f: 15, fb: null, na: null, ka: null });
    await db.put('meal_templates', {
      id: 'tp_eski',
      name: 'Atıştırma',
      meal: 'ara',
      items: [{ food_id: 'c_bar', name: 'Ev barı', grams: 50, unit: 'gram', qty: 50, snap: { k: 400, p: 20, c: 40, f: 15, fb: null, na: null, ka: null } }],
      favorite: false,
      use_count: 0,
      last_used: null,
    });
    await db.remove('custom_foods', 'c_bar');
  });
  await go(page, 'beslenme', 1200);
  await openTemplates(page, 3);
  await page.locator('[data-topen="tp_eski"]').click();
  await expect(top(page)).toContainText('Listende artık olmayan besin: Ev barı');
  await expect(top(page).locator('[data-ta="0"]')).toContainText('kayıtlı değerlerle');
  // dünün tarihine ekle
  const y = await page.evaluate(async (d) => (await import('./js/util.js')).addDays(d, -1), d);
  await top(page).locator('#ta-date').fill(y);
  await top(page).locator('#ta-date').dispatchEvent('change');
  await top(page).locator('[data-apply]').click();
  await expect(page.locator('#toast')).toContainText('1 besin kayıtlı değerlerle');
  const logs = await all(page, 'food_logs');
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ date: y, meal: 'ara', name: 'Ev barı', grams: 50, kcal: 200, fiber_g: null, sodium_mg: null, source: 'sablon' });

  // sıfırdan şablon
  await openTemplates(page, 0);
  await page.click('[data-tnew]');
  await top(page).locator('#tp-name').fill('Protein öğünü');
  await top(page).locator('#tp-fq').fill('yumurta');
  await top(page).locator('#tp-fres [data-tadd]').first().click();
  await top(page).locator('#tp-fq').fill('whey');
  await top(page).locator('#tp-fres [data-tadd]').first().click();
  await top(page).locator('#tq-1').fill('2');
  await expect(top(page).locator('[data-tk="1"]')).toContainText('60 g');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#toast')).toContainText('Şablon kaydedildi');
  // kütüphaneye geri dönüldü
  await expect(page.locator('[data-topen]')).toHaveCount(2);
  let tps = await all(page, 'meal_templates');
  const p = tps.find((x) => x.name === 'Protein öğünü');
  expect(p.items.map((x) => [x.food_id, x.grams])).toEqual([['f_egg', 50], ['f_whey', 60]]);

  // ara (besin adıyla), favori ve sıralama
  await page.fill('#tp-q', 'whey');
  await expect(page.locator('[data-topen]')).toHaveCount(1);
  await page.fill('#tp-q', '');
  await page.locator(`[data-tfav="${p.id}"]`).click();
  await expect(page.locator(`[data-tfav="${p.id}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.selectOption('#tp-sort', 'ad');
  await expect(page.locator('[data-topen]').first()).toContainText('Protein öğünü'); // favori üstte

  // düzenle
  await page.locator(`[data-topen="${p.id}"]`).click();
  await top(page).locator('[data-tedit]').click();
  await top(page).locator('[data-trm="0"]').click();
  await top(page).locator('#tp-name').fill('Sadece whey');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('#toast')).toContainText('Şablon güncellendi');
  tps = await all(page, 'meal_templates');
  expect(tps.find((x) => x.id === p.id)).toMatchObject({ name: 'Sadece whey', favorite: true });
  expect(tps.find((x) => x.id === p.id).items).toHaveLength(1);

  // kopyala
  await page.locator(`[data-topen="${p.id}"]`).click();
  await top(page).locator('[data-tcopy]').click();
  await expect(top(page).locator('#tp-name')).toHaveValue('Sadece whey (kopya)');
  await top(page).locator('[data-sheet-right]').click();
  await expect(page.locator('[data-topen]')).toHaveCount(3);

  // sil (yumuşak silme), geçmiş kayıt etkilenmez
  await page.locator('[data-topen="tp_eski"]').click();
  await top(page).locator('[data-tdel]').click();
  await top(page).locator('[data-ok]').click();
  await expect(page.locator('#toast')).toContainText('Şablon silindi');
  await expect(page.locator('[data-topen]')).toHaveCount(2);
  // yumuşak silme: kayıt durur, deleted_at işaretlenir (get/list göstermez)
  const raw = await page.evaluate(async () => (await (await import('./js/db.js')).exportAll()).data.meal_templates.find((x) => x.id === 'tp_eski'));
  expect(raw.deleted_at).toBeTruthy();
  expect(await all(page, 'food_logs')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('v4 → v5 yükseltmesi (gerçek tarayıcı): eski kayıtlar ve ayarlar korunur, şablon deposu eklenir', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // uygulamayı yüklemeden aynı kökte eski (v4) veritabanını hazırla
  await page.goto('/icons/logo.png');
  const d = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  await page.evaluate(async (d) => {
    const OLD = ['settings', 'profile', 'body_logs', 'custom_foods', 'food_logs', 'plan_items', 'exercises', 'program_days', 'program_exercises', 'workout_sets', 'compounds', 'dose_logs', 'injection_logs', 'cycles', 'lab_tests', 'lab_values', 'chat_messages', 'usage', 'water_logs', 'body_measurements', 'progress_photos', 'coach_notes', 'workout_sessions', 'vitals'];
    await new Promise((res, rej) => {
      const r = indexedDB.open('sporcoach', 4);
      r.onupgradeneeded = () => {
        for (const s of OLD) r.result.createObjectStore(s, { keyPath: 'id' });
        const t = r.transaction;
        t.objectStore('settings').put({ id: 'onboarded', value: true });
        t.objectStore('settings').put({ id: 'schema_version', value: 2 });
        t.objectStore('settings').put({ id: 'ai_share', value: false });
        t.objectStore('profile').put({ id: 'me', name: 'Eski kullanıcı' });
        t.objectStore('food_logs').put({ id: 'eski1', date: d, meal: 'ogle', name: 'Eski öğle kaydı', grams: 100, kcal: 321, protein_g: 10, carb_g: 30, fat_g: 10, created_at: new Date().toISOString() });
      };
      r.onsuccess = () => {
        r.result.close();
        res();
      };
      r.onerror = () => rej(r.error);
    });
  }, d);
  await page.goto('/#/beslenme');
  await expect(page.locator('.meal-row', { hasText: 'Eski öğle kaydı' })).toBeVisible({ timeout: 30_000 });
  const info = await page.evaluate(async () => {
    const db = await import('./js/db.js');
    return { templates: await db.list('meal_templates'), log: await db.get('food_logs', 'eski1') };
  });
  expect(info.templates).toEqual([]);
  expect(info.log.kcal).toBe(321);
  const ver = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('sporcoach');
    r.onsuccess = () => {
      const v = r.result.version;
      const has = r.result.objectStoreNames.contains('meal_templates');
      r.result.close();
      res({ v, has });
    };
  }));
  expect(ver).toEqual({ v: 5, has: true });
  expect(errors).toEqual([]);
});

test('şablon ileri tarihe (planlı) eklenir; o gün haftada seçilebilir ve planlı notu görünür', async ({ page }) => {
  const errors = await onboard(page);
  const d = await todayStr(page);
  const tm = await page.evaluate(async (d) => (await import('./js/util.js')).addDays(d, 1), d);
  const far = await page.evaluate(async (d) => (await import('./js/util.js')).addDays(d, 8), d);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('meal_templates', { id: 'tp_p', name: 'Planlı', meal: 'aksam', items: [{ food_id: 'f_egg', name: 'Yumurta', grams: 100, unit: 'gram', qty: 100 }], use_count: 0 });
  });
  await go(page, 'beslenme', 1200);
  await openTemplates(page, 2);
  await page.locator('[data-topen="tp_p"]').click();
  // 7 günden ileri seçilemez
  await top(page).locator('#ta-date').fill(far);
  await top(page).locator('#ta-date').dispatchEvent('change');
  await expect(page.locator('#toast')).toContainText('En fazla 7 gün ileri');
  await top(page).locator('#ta-date').fill(tm);
  await top(page).locator('#ta-date').dispatchEvent('change');
  await top(page).locator('[data-apply]').click();
  await expect(page.locator('#toast')).toContainText('Yarın Akşam öğününe eklendi');
  const logs = await all(page, 'food_logs');
  expect(logs.map((l) => [l.date, l.meal])).toEqual([[tm, 'aksam']]);
  // günün başlığındaki ileri oku artık yarına gider
  await page.click('[data-act="next"]');
  await expect(page.locator('.note', { hasText: 'Bu gün henüz gelmedi' })).toBeVisible();
  await expect(page.locator('.meal-row', { hasText: 'Yumurta' })).toBeVisible();
  await expect(page.locator(`.dw[data-d="${tm}"]`)).toBeEnabled();
  // yarından ileri gidilemez
  await expect(page.locator('[data-act="next"]')).toBeDisabled();
  expect(errors).toEqual([]);
});
