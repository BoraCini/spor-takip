import { describe, it, expect } from 'vitest';
import { findFood, nutrientsFor } from '../../public/js/data/foods.js';
import {
  itemFromLog,
  itemFromFood,
  templateFromLogs,
  validateTemplate,
  validFactor,
  resolveTemplateItem,
  templateTotals,
  applyTemplate,
  markUsed,
  searchTemplates,
  sortTemplates,
  copyTemplate,
} from '../../public/js/templates.js';

const egg = findFood('f_egg');
const oats = findFood('f_oats');
const log = (food, grams, extra = {}) => ({ id: 'l' + Math.random(), date: '2026-10-01', meal: 'kahvalti', food_id: food.id, name: food.name, grams, unit: 'gram', qty: grams, ...nutrientsFor(food, grams), ...extra });

describe('Şablon oluşturma', () => {
  it('günlük kaydından kalem: miktar ve kayıt anındaki 100 g değerleri', () => {
    const it1 = itemFromLog(log(egg, 100, { unit: 'adet', qty: 2 }));
    expect(it1).toMatchObject({ food_id: 'f_egg', grams: 100, unit: 'adet', qty: 2 });
    expect(it1.snap.k).toBeCloseTo(egg.k, 0);
    expect(it1.snap.p).toBeCloseTo(egg.p, 1);
  });
  it('bilinmeyen lif/sodyum anlık görüntüde de bilinmiyor kalır (sıfır olmaz)', () => {
    const it1 = itemFromLog({ food_id: 'c_x', name: 'X', grams: 50, kcal: 100, protein_g: 5, carb_g: 10, fat_g: 4, fiber_g: null, sodium_mg: null, potassium_mg: null });
    expect(it1.snap).toMatchObject({ k: 200, fb: null, na: null, ka: null });
  });
  it('gramsız kayıt (hızlı kalori) sabit değerli kalem olur', () => {
    const it1 = itemFromLog({ name: 'Kahve', kcal: 60, protein_g: 2, carb_g: 8, fat_g: 2 });
    expect(it1).toMatchObject({ food_id: null, grams: null, fixed: { kcal: 60, protein_g: 2, fiber_g: null } });
  });
  it('öğündeki kayıtlardan şablon; silinmiş kayıtlar alınmaz', () => {
    const t = templateFromLogs([log(egg, 100), log(oats, 50), { ...log(oats, 30), deleted_at: '2026-10-01T00:00:00Z' }], { name: ' Kahvaltım ', meal: 'kahvalti' });
    expect(t.name).toBe('Kahvaltım');
    expect(t.items).toHaveLength(2);
    expect(validateTemplate(t)).toBeNull();
  });
  it('doğrulama', () => {
    expect(validateTemplate({ name: '', items: [itemFromFood(egg, { grams: 50 })] })).toMatch(/ad/);
    expect(validateTemplate({ name: 'x'.repeat(61), items: [itemFromFood(egg, { grams: 50 })] })).toMatch(/60/);
    expect(validateTemplate({ name: 'A', items: [] })).toMatch(/en az bir/);
    expect(validateTemplate({ name: 'A', items: [itemFromFood(egg, { grams: 0 })] })).toMatch(/sıfırdan büyük/);
    expect(validateTemplate({ name: 'A', items: [{ name: 'K', fixed: { kcal: null } }] })).toMatch(/kalori/);
  });
  it('çarpan sınırları', () => {
    expect(validFactor(1.5)).toBe(true);
    expect(validFactor(0)).toBe(false);
    expect(validFactor(-1)).toBe(false);
    expect(validFactor(11)).toBe(false);
    expect(validFactor('abc')).toBe(false);
  });
});

describe('Şablon uygulama', () => {
  const tpl = { id: 't1', name: 'Kahvaltı', items: [itemFromFood(egg, { grams: 100, unit: 'adet', qty: 2 }), itemFromFood(oats, { grams: 40 })] };

  it('çarpan 1,5: miktarlar ve değerler ölçeklenir; hedef tarih/öğün; kaynak "sablon"', () => {
    const { records, missing, fallback } = applyTemplate(tpl, { date: '2026-10-05', meal: 'ogle', factor: 1.5 });
    expect(missing).toEqual([]);
    expect(fallback).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ date: '2026-10-05', meal: 'ogle', food_id: 'f_egg', grams: 150, unit: 'adet', qty: 3, source: 'sablon', template_id: 't1' });
    expect(records[0].kcal).toBe(nutrientsFor(egg, 150).kcal);
    expect(records[1]).toMatchObject({ grams: 60, unit: 'gram', qty: 60 });
  });
  it('seçili kalemler', () => {
    const { records } = applyTemplate(tpl, { date: '2026-10-05', meal: 'ogle', selected: new Set([1]) });
    expect(records.map((r) => r.food_id)).toEqual(['f_oats']);
  });
  it('besin silinmişse kayıtlı değerle eklenir ve bildirilir; değer de yoksa eklenmez', () => {
    const t = {
      name: 'X',
      items: [
        { food_id: 'c_silindi', name: 'Silinen besin', grams: 50, unit: 'gram', qty: 50, snap: { k: 200, p: 10, c: 20, f: 8, fb: null, na: null, ka: null } },
        { food_id: 'c_yok', name: 'Bilinmeyen', grams: 50, unit: 'gram', qty: 50 },
      ],
    };
    expect(resolveTemplateItem(t.items[0]).status).toBe('snapshot');
    expect(resolveTemplateItem(t.items[1]).status).toBe('missing');
    const { records, missing, fallback } = applyTemplate(t, { date: '2026-10-05', meal: 'aksam' });
    expect(fallback).toEqual(['Silinen besin']);
    expect(missing).toEqual(['Bilinmeyen']);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'Silinen besin', kcal: 100, protein_g: 5, fiber_g: null, sodium_mg: null });
    const { totals } = templateTotals(t.items);
    expect(totals.kcal).toBe(100);
    expect(totals.fiber_g).toBeNull();
  });
  it('kişisel besin güncellenmişse güncel değer kullanılır', () => {
    const pool = [{ id: 'c_b', name: 'Bar', k: 400, p: 20, c: 40, f: 15, custom: true }];
    const t = { name: 'B', items: [{ food_id: 'c_b', name: 'Bar', grams: 50, unit: 'gram', qty: 50, snap: { k: 300, p: 10, c: 30, f: 10 } }] };
    expect(applyTemplate(t, { pool, date: '2026-10-05', meal: 'ara' }).records[0].kcal).toBe(200);
  });
  it('sabit değerli kalem çarpanla ölçeklenir', () => {
    const t = { name: 'K', items: [{ food_id: null, name: 'Kahve', fixed: { kcal: 60, protein_g: 2, carb_g: 8, fat_g: 2, fiber_g: null, sodium_mg: null, potassium_mg: null } }] };
    const [r] = applyTemplate(t, { date: '2026-10-05', meal: 'ara', factor: 2 }).records;
    expect(r).toMatchObject({ kcal: 120, protein_g: 4, grams: null, food_id: null, fiber_g: null });
  });
  it('kullanım bilgisi, arama, sıralama, kopya', () => {
    const a = { id: 'a', name: 'Akşam', favorite: false, use_count: 5, last_used: '2026-10-01', items: [{ name: 'Mercimek çorbası' }] };
    const b = { id: 'b', name: 'Büyük kahvaltı', favorite: true, use_count: 1, last_used: '2026-09-01', items: [] };
    const c = { id: 'c', name: 'Çabuk öğle', favorite: false, use_count: 9, last_used: '2026-10-03', items: [] };
    expect(markUsed(a, '2026-10-04T00:00:00Z')).toMatchObject({ use_count: 6, last_used: '2026-10-04T00:00:00Z' });
    expect(searchTemplates([a, b, c], 'mercimek').map((x) => x.id)).toEqual(['a']);
    expect(searchTemplates([a, b, c], 'kahvalti').map((x) => x.id)).toEqual(['b']);
    expect(sortTemplates([a, b, c], 'son').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortTemplates([a, b, c], 'sik').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortTemplates([a, b, c], 'ad').map((x) => x.id)).toEqual(['b', 'a', 'c']);
    const k = copyTemplate({ ...a, created_at: 'x', updated_at: 'y' });
    expect(k).toMatchObject({ name: 'Akşam (kopya)', use_count: 0, last_used: null, favorite: false });
    expect(k.id).toBeUndefined();
    expect(k.created_at).toBeUndefined();
    k.items[0].name = 'değişti';
    expect(a.items[0].name).toBe('Mercimek çorbası');
  });
});

describe('Veritabanı: meal_templates deposu', () => {
  it('v4 veritabanı v5e yükseltilir; eski veriler korunur, yeni depo boş gelir', async () => {
    const OLD = ['settings', 'profile', 'body_logs', 'custom_foods', 'food_logs', 'plan_items', 'exercises', 'program_days', 'program_exercises', 'workout_sets', 'compounds', 'dose_logs', 'injection_logs', 'cycles', 'lab_tests', 'lab_values', 'chat_messages', 'usage', 'water_logs', 'body_measurements', 'progress_photos', 'coach_notes', 'workout_sessions', 'vitals'];
    await new Promise((res, rej) => {
      const r = indexedDB.open('sporcoach', 4);
      r.onupgradeneeded = () => {
        for (const s of OLD) r.result.createObjectStore(s, { keyPath: 'id' });
        r.transaction.objectStore('food_logs').put({ id: 'eski', date: '2026-10-01', meal: 'ogle', name: 'Eski kayıt', grams: 100, kcal: 123 });
        r.transaction.objectStore('settings').put({ id: 'food_favorites', value: ['f_egg'] });
      };
      r.onsuccess = () => {
        r.result.close();
        res();
      };
      r.onerror = () => rej(r.error);
    });
    const db = await import('../../public/js/db.js');
    await db.init();
    expect((await db.get('food_logs', 'eski')).kcal).toBe(123);
    expect(await db.getSetting('food_favorites')).toEqual(['f_egg']);
    expect(await db.list('meal_templates')).toEqual([]);
    const t = await db.put('meal_templates', { name: 'Şablon', items: [itemFromFood(egg, { grams: 50 })] });
    expect((await db.get('meal_templates', t.id)).name).toBe('Şablon');
  });

  it('yedek: şablonlar, favoriler ve kişisel kategoriler yedeğe girer ve geri yüklenir; eski yedek (şablonsuz) da açılır', async () => {
    const db = await import('../../public/js/db.js');
    await db.init();
    await db.put('meal_templates', { id: 'tp1', name: 'Kahvaltım', meal: 'kahvalti', items: [itemFromFood(egg, { grams: 100, unit: 'adet', qty: 2 })], favorite: true, use_count: 3 });
    await db.setSetting('food_favorites', ['f_egg']);
    await db.setSetting('food_user_categories', [{ id: 'uc_1', name: 'Sabah' }]);
    await db.setSetting('food_cat_assign', { f_egg: 'uc_1' });
    const b = await db.exportAll();
    expect(b.included_stores).toContain('meal_templates');
    expect(b.data.meal_templates).toHaveLength(1);
    expect(db.validateBackup(b).ok).toBe(true);
    await db.wipeAll();
    expect(await db.list('meal_templates')).toEqual([]);
    await db.importAll(b);
    expect(await db.get('meal_templates', 'tp1')).toMatchObject({ name: 'Kahvaltım', favorite: true, use_count: 3 });
    expect(await db.getSetting('food_cat_assign')).toEqual({ f_egg: 'uc_1' });
    // şablon bölümü olmayan eski yedek: hata vermez, telefondaki şablonlar korunur
    const old = { app: 'sporcoach', schema_version: 2, exported_at: '2026-10-01T10:00:00Z', data: { food_logs: [{ id: 'a', date: '2026-10-01', meal: 'ogle', name: 'Eski', grams: 100, kcal: 100 }] } };
    expect(db.validateBackup(old).ok).toBe(true);
    await db.importAll(old);
    expect(await db.get('meal_templates', 'tp1')).toBeTruthy();
    expect((await db.list('food_logs')).map((x) => x.id)).toEqual(['a']);
  });

  it('şablon uygulaması tek işlemde yazılır: biri başarısız olursa hiçbiri yazılmaz', async () => {
    const { vi } = await import('vitest');
    const db = await import('../../public/js/db.js');
    await db.init();
    const tpl = { id: 't', name: 'T', items: [itemFromFood(egg, { grams: 50 }), itemFromFood(oats, { grams: 40 })] };
    const { records } = applyTemplate(tpl, { date: '2026-10-05', meal: 'ogle' });
    let n = 0;
    const real = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...a) {
      if (++n === 2) throw new DOMException('dolu', 'QuotaExceededError');
      return real.apply(this, a);
    });
    await expect(db.putAtomic(records.map((obj) => ({ store: 'food_logs', obj })))).rejects.toBeTruthy();
    spy.mockRestore();
    expect(await db.list('food_logs')).toEqual([]);
  });
});
