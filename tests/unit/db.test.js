import { describe, it, expect } from 'vitest';

const load = () => import('../../public/js/db.js');

describe('IndexedDB CRUD', () => {
  it('kayıt ekler, okur, günceller ve yumuşak siler', async () => {
    const db = await load();
    await db.init();
    const r = await db.put('body_logs', { date: '2026-10-01', weight_kg: 82.4 });
    expect(r.id).toBeTruthy();
    expect((await db.get('body_logs', r.id)).weight_kg).toBe(82.4);
    await db.put('body_logs', { ...r, weight_kg: 82.0 });
    expect((await db.list('body_logs')).map((x) => x.weight_kg)).toEqual([82.0]);
    await db.remove('body_logs', r.id);
    expect(await db.list('body_logs')).toEqual([]);
  });

  it('ayarları okur/yazar', async () => {
    const db = await load();
    await db.setSetting('x', { a: 1 });
    expect(await db.getSetting('x')).toEqual({ a: 1 });
    expect(await db.getSetting('yok', 5)).toBe(5);
  });
});

describe('Yedek alma ve geri yükleme', () => {
  it('gizli ayarlar yedeğe girmez, geri yüklemede korunur', async () => {
    const db = await load();
    await db.init();
    await db.setSetting('api_key', 'sk-ant-gizli');
    await db.setSetting('theme', 'dark');
    await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Pilav', grams: 150, kcal: 200 });
    const dump = await db.exportAll({ photos: false });
    expect(JSON.stringify(dump)).not.toContain('sk-ant-gizli');
    expect(dump.data.food_logs).toHaveLength(1);

    await db.wipeAll();
    await db.setSetting('api_key', 'sk-ant-yeni');
    await db.importAll(dump);
    expect(await db.getSetting('api_key')).toBe('sk-ant-yeni');
    expect(await db.getSetting('theme')).toBe('dark');
    expect(await db.list('food_logs')).toHaveLength(1);
  });

  it('Pro Coach yedeği olmayan dosyayı reddeder', async () => {
    const db = await load();
    await expect(db.importAll({ foo: 1 })).rejects.toThrow();
  });
});
