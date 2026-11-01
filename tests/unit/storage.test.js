import { describe, it, expect, vi } from 'vitest';
import { installServer } from '../helpers/server.js';

const load = () => import('../../public/js/db.js');
const seed = async (db) => {
  await db.init();
  for (let i = 0; i < 30; i++) await db.put('food_logs', { date: '2026-10-01', meal: 'ogle', name: 'Yemek ' + i, grams: 100, kcal: 100 });
};

describe('IndexedDB erişim hataları', () => {
  it('açılamazsa bellek yerine STORAGE_UNAVAILABLE fırlatır ve boş liste dönmez', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const db = await load();
    await expect(db.init()).rejects.toMatchObject({ name: 'StorageError', code: 'STORAGE_UNAVAILABLE' });
    await expect(db.list('food_logs')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    await expect(db.getSetting('onboarded', false)).rejects.toBeTruthy();
  });

  it('açılamama geçiciyse yeniden denemede açılır', async () => {
    const real = indexedDB.open.bind(indexedDB);
    let n = 0;
    vi.spyOn(indexedDB, 'open').mockImplementation((...a) => {
      if (n++ === 0) throw new Error('geçici');
      return real(...a);
    });
    const db = await load();
    await expect(db.init()).rejects.toBeTruthy();
    await expect(db.init()).resolves.toBeUndefined();
  });

  it('okuma hatası boş listeye dönüşmez: STORAGE_READ_FAILED', async () => {
    const db = await load();
    await seed(db);
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => {
      throw new DOMException('okunamadı', 'UnknownError');
    });
    await expect(db.list('food_logs')).rejects.toMatchObject({ code: 'STORAGE_READ_FAILED' });
    await expect(db.exportAll()).rejects.toMatchObject({ code: 'STORAGE_READ_FAILED' });
  });

  it('kota dolarsa STORAGE_QUOTA_EXCEEDED', async () => {
    const db = await load();
    await db.init();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('dolu', 'QuotaExceededError');
    });
    await expect(db.put('food_logs', { date: '2026-10-01', name: 'x' })).rejects.toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED' });
  });

  it('veritabanı daha yeni bir sürümdeyse STORAGE_MIGRATION_FAILED ve veri silinmez', async () => {
    await new Promise((res) => {
      const r = indexedDB.open('sporcoach', 99);
      r.onupgradeneeded = () => r.result.createObjectStore('food_logs', { keyPath: 'id' }).put({ id: 'a', name: 'korunacak' });
      r.onsuccess = () => {
        r.result.close();
        res();
      };
    });
    const db = await load();
    await expect(db.init()).rejects.toMatchObject({ code: 'STORAGE_MIGRATION_FAILED' });
    const still = await new Promise((res) => {
      const r = indexedDB.open('sporcoach');
      r.onsuccess = () => {
        const g = r.result.transaction('food_logs').objectStore('food_logs').get('a');
        g.onsuccess = () => res(g.result);
      };
    });
    expect(still.name).toBe('korunacak');
  });

  it('eski sürüm başka sekmede açıkken STORAGE_BLOCKED', async () => {
    const holder = await new Promise((res) => {
      const r = indexedDB.open('sporcoach', 3);
      r.onupgradeneeded = () => r.result.createObjectStore('settings', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); // onversionchange yok: bağlantıyı bırakmıyor
    });
    const db = await load();
    await expect(db.init()).rejects.toMatchObject({ code: 'STORAGE_BLOCKED' });
    holder.close();
  }, 10000);

  it('başka sekmede yeni sürüm açılınca bağlantıyı bırakır ve haber verir', async () => {
    const db = await load();
    await db.init();
    const seen = vi.fn();
    window.addEventListener('db-versionchange', seen);
    await new Promise((res, rej) => {
      const r = indexedDB.open('sporcoach', 5);
      r.onsuccess = () => {
        r.result.close();
        res();
      };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('bloklandı'));
    });
    expect(seen).toHaveBeenCalled();
  });
});

describe('Otomatik bulut yedeği koruması', () => {
  it('okuma hatasında yedek gönderilmez (eski yedeğin üzerine boş yazılmaz)', async () => {
    const srv = installServer();
    const db = await load();
    await seed(db);
    await db.setSetting('cloud_pass', 'otomatik yedek sifresi');
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(() => {
      throw new DOMException('okunamadı', 'UnknownError');
    });
    const cloud = await import('../../public/js/cloud.js');
    await cloud.autoCloudBackup();
    expect(srv.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('kayıt sayısı yarıdan fazla düşerse otomatik yedek durur, elle yedek çalışır', async () => {
    const srv = installServer();
    const db = await load();
    await seed(db);
    const cloud = await import('../../public/js/cloud.js');
    const pass = 'otomatik yedek sifresi';
    await db.setSetting('cloud_pass', pass);
    expect((await cloud.cloudUpload(pass)).ok).toBe(true);
    // 30 kaydın 25'i kayboldu
    for (const r of (await db.list('food_logs')).slice(0, 25)) await db.remove('food_logs', r.id);
    await db.setSetting('cloud_last', null);
    const putsBefore = srv.calls.filter((c) => c.method === 'PUT').length;
    await cloud.autoCloudBackup();
    expect(srv.calls.filter((c) => c.method === 'PUT').length).toBe(putsBefore);
    expect(await db.getSetting('cloud_hold')).toMatchObject({ prev: 30, now: 5 });
    // sunucudaki yedek hâlâ 30 kayıtlı
    expect((await cloud.cloudDownload(pass)).data.data.food_logs.filter((f) => !f.deleted_at)).toHaveLength(30);
    // elle yedek: kullanıcı onaylamış sayılır (5 dk sınırına takılmamak için zamanı ileri al)
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 6 * 60 * 1000);
    expect((await cloud.cloudUpload(pass)).ok).toBe(true);
    expect(await db.getSetting('cloud_hold')).toBeNull();
  });

  it('dropCheck sınırları', async () => {
    const { dropCheck } = await import('../../public/js/cloud.js');
    expect(dropCheck({ food_logs: 5 }, null)).toBeNull();
    expect(dropCheck({ food_logs: 5 }, { food_logs: 10 })).toBeNull(); // küçük veri: kontrol yok
    expect(dropCheck({ food_logs: 15 }, { food_logs: 30 })).toBeNull(); // tam yarı: geçer
    expect(dropCheck({ food_logs: 14 }, { food_logs: 30 })).toEqual({ prev: 30, now: 14 });
    expect(dropCheck({ food_logs: 30, chat_messages: 0 }, { food_logs: 30, chat_messages: 500 })).toBeNull(); // sohbet temizliği sayılmaz
  });

  it('gzip açılımı boyut sınırını aşarsa durur', async () => {
    const { gunzipLimited } = await import('../../public/js/cloud.js');
    const zeros = new Uint8Array(2 * 1024 * 1024);
    const gz = new Uint8Array(await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    expect(gz.byteLength).toBeLessThan(20000);
    await expect(gunzipLimited(gz, 1024 * 1024)).rejects.toThrow(/çok büyük/);
    expect((await gunzipLimited(gz, 3 * 1024 * 1024)).byteLength).toBe(zeros.byteLength);
  });
});
