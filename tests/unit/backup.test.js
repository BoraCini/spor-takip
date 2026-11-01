import { describe, it, expect, vi } from 'vitest';

const load = () => import('../../public/js/db.js');
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(400);

async function seeded() {
  const db = await load();
  await db.init();
  await db.put('food_logs', { id: 'f-eski', date: '2026-09-01', meal: 'ogle', name: 'Eski yemek', grams: 100, kcal: 100 });
  await db.put('progress_photos', { id: 'p1', date: '2026-09-01', pose: 'on', image: IMG, thumb: IMG });
  await db.setSetting('api_key', 'sk-ant-telefonda');
  return db;
}
const backup = (data, extra = {}) => ({ app: 'sporcoach', schema_version: 2, exported_at: '2026-10-01T10:00:00Z', data, ...extra });

describe('Yedek biçimi', () => {
  it('yeni alanlarla dışa aktarır', async () => {
    const db = await seeded();
    const b = await db.exportAll({ photos: false });
    expect(b).toMatchObject({ app: 'sporcoach', backup_format_version: 2, schema_version: 2, photos_included: false });
    expect(b.included_stores).not.toContain('progress_photos');
    expect(b.included_stores).toContain('food_logs');
  });

  it('eski biçimdeki yedeği (backup_format_version yok) kabul eder', async () => {
    const db = await seeded();
    await db.importAll(backup({ food_logs: [{ id: 'n1', date: '2026-10-01', name: 'Yeni', kcal: 50 }] }));
    expect((await db.list('food_logs')).map((f) => f.name)).toEqual(['Yeni']);
  });
});

describe('Doğrulama — hata varsa telefondaki veriye dokunulmaz', () => {
  const cases = {
    'bozuk JSON': null,
    'tekrarlanan kimlik': backup({ food_logs: [{ id: 'x', date: '2026-10-01' }, { id: 'x', date: '2026-10-02' }] }),
    'eksik kimlik': backup({ food_logs: [{ date: '2026-10-01' }] }),
    'geçersiz tarih': backup({ food_logs: [{ id: 'x', date: '2026-02-31' }] }),
    'geçersiz sayı': backup({ food_logs: [{ id: 'x', date: '2026-10-01', kcal: 'çok' }] }),
    'beklenmeyen tip': backup({ food_logs: { id: 'x' } }),
    'bozuk fotoğraf': backup({ progress_photos: [{ id: 'p', date: '2026-10-01', image: 'data:text/html;base64,PHNjcmlwdD4=' }] }),
    'desteklenmeyen sürüm': backup({ food_logs: [] }, { backup_format_version: 99 }),
    'yanlış uygulama': { app: 'baska', data: {} },
  };
  for (const [name, obj] of Object.entries(cases)) {
    it(name, async () => {
      const db = await seeded();
      if (obj === null) {
        expect(() => db.parseBackupText('{"app":"sporcoach", bozuk')).toThrow(/JSON/);
        return;
      }
      await expect(db.importAll(obj)).rejects.toThrow();
      expect((await db.list('food_logs')).map((f) => f.name)).toEqual(['Eski yemek']);
      expect(await db.list('progress_photos')).toHaveLength(1);
    });
  }

  it('kopuk bağlantı uyarıdır, geri yüklemeyi durdurmaz', async () => {
    const db = await seeded();
    const v = db.validateBackup(backup({ lab_tests: [], lab_values: [{ id: 'v1', test_id: 'yok', name: 'ALT', value: 30 }] }));
    expect(v.ok).toBe(true);
    expect(v.warnings.join(' ')).toMatch(/lab_values/);
  });

  it('tanınmayan bölüm uyarıyla atlanır', async () => {
    const db = await seeded();
    const v = db.validateBackup(backup({ gelecek_ozellik: [{ id: 1 }], food_logs: [] }));
    expect(v.ok).toBe(true);
    expect(v.warnings[0]).toMatch(/gelecek_ozellik/);
  });
});

describe('Tek işlemli geri yükleme', () => {
  it('yazma yarıda başarısız olursa eski verilerin tamamı korunur', async () => {
    const db = await seeded();
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: 'n' + i, date: '2026-10-01', name: 'Yeni ' + i, kcal: 1 }));
    const realPut = IDBObjectStore.prototype.put;
    let n = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...a) {
      if (++n === 30) throw new DOMException('dolu', 'QuotaExceededError');
      return realPut.apply(this, a);
    });
    await expect(db.importAll(backup({ food_logs: rows }))).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
    vi.restoreAllMocks();
    expect((await db.list('food_logs')).map((f) => f.name)).toEqual(['Eski yemek']);
  });

  it('gizli ayarlar korunur, yedekteki gizli ayar yazılmaz', async () => {
    const db = await seeded();
    await db.importAll(backup({ settings: [{ id: 'api_key', value: 'sk-ant-yedekten' }, { id: 'theme', value: 'dark' }] }));
    expect(await db.getSetting('api_key')).toBe('sk-ant-telefonda');
    expect(await db.getSetting('theme')).toBe('dark');
  });

  it('fotoğrafsız yedek: varsayılan olarak fotoğraflar korunur, istenirse silinir', async () => {
    let db = await seeded();
    await db.importAll(backup({ food_logs: [] }));
    expect(await db.list('progress_photos')).toHaveLength(1);
    await db.importAll(backup({ food_logs: [] }), { keepPhotos: false });
    expect(await db.list('progress_photos')).toHaveLength(0);
  });

  it('dışa aktar → içe aktar gidiş-dönüşü veriyi aynen korur', async () => {
    const db = await seeded();
    await db.put('lab_tests', { id: 't1', date: '2026-10-01' });
    await db.put('lab_values', { id: 'v1', test_id: 't1', name: 'ALT', value: 31, unit: 'U/L', ref_low: 0, ref_high: 41 });
    const b = await db.exportAll();
    await db.wipeAll();
    await db.importAll(JSON.parse(JSON.stringify(b)));
    const again = await db.exportAll();
    for (const s of ['food_logs', 'progress_photos', 'lab_tests', 'lab_values']) expect(again.data[s]).toEqual(b.data[s]);
  });
});
