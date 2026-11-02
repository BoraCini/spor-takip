import { describe, it, expect } from 'vitest';
import { installServer, call } from '../helpers/server.js';

const PASS = 'ortak bir uzun sifre';

async function device(srv) {
  // her "cihaz" ayrı IndexedDB; sunucu (KV) ortak
  globalThis.indexedDB = new (await import('fake-indexeddb')).IDBFactory();
  const { vi } = await import('vitest');
  vi.resetModules();
  installServer({ kv: srv.kv });
  const db = await import('../../public/js/db.js');
  await db.init();
  const cloud = await import('../../public/js/cloud.js');
  const V = await import('../../public/js/vault.js');
  return { db, cloud, V };
}
const later = async () => {
  const { vi } = await import('vitest');
  const real = Date.now;
  vi.spyOn(Date, 'now').mockImplementation(() => real() + 6 * 60 * 1000);
};

describe('Vault v3 – kripto çekirdeği', () => {
  it('kurtarma kodu gidiş-dönüş, sağlama kontrolü', async () => {
    const V = await import('../../public/js/vault.js');
    const v = V.newVault();
    const code = await V.encodeRecovery(v.id, v.salt);
    expect(code).toMatch(/^PC3-[0-9A-Z]{4}(-[0-9A-Z]{1,4})+$/);
    expect(await V.decodeRecovery(code)).toEqual({ id: v.id, salt: v.salt, v: 3 });
    expect(await V.decodeRecovery(code.toLowerCase().replace(/-/g, ' '))).toMatchObject({ id: v.id });
    const broken = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
    await expect(V.decodeRecovery(broken)).rejects.toThrow(/sağlama/);
    await expect(V.decodeRecovery('PC3-ABCD')).rejects.toThrow(/eksik/);
  });

  it('anahtarlar amaca göre bağımsız, şifreleme anahtarı dışa aktarılamaz', async () => {
    const V = await import('../../public/js/vault.js');
    const v = V.newVault();
    const k = await V.deriveVaultKeys(PASS, v.salt, v.id);
    expect(k.read).not.toBe(k.write);
    expect(k.read).toMatch(/^[0-9a-f]{64}$/);
    expect(k.encKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', k.encKey)).rejects.toBeTruthy();
    // aynı şifre, farklı tuz → farklı anahtarlar
    const k2 = await V.deriveVaultKeys(PASS, V.newVault().salt, v.id);
    expect(k2.read).not.toBe(k.read);
  });

  it('her yedekte yeni IV; AAD kasa kimliğine bağlı', async () => {
    const V = await import('../../public/js/vault.js');
    const v = V.newVault();
    const k = await V.deriveVaultKeys(PASS, v.salt, v.id);
    const data = new TextEncoder().encode('merhaba');
    const a = await V.sealPayload(k.encKey, v.id, data);
    const b = await V.sealPayload(k.encKey, v.id, data);
    expect(new TextDecoder().decode(a.slice(0, 4))).toBe('PC03');
    expect(a.slice(4, 16)).not.toEqual(b.slice(4, 16));
    expect(new TextDecoder().decode(await V.openPayload(k.encKey, v.id, a))).toBe('merhaba');
    await expect(V.openPayload(k.encKey, V.newVault().id, a)).rejects.toThrow(); // başka kasa kimliğiyle açılmaz
  });
});

describe('Vault v3 – akışlar', () => {
  it('aynı şifreyle iki farklı kasa: birbirini göremez, üzerine yazamaz', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.db.put('food_logs', { date: '2026-10-01', name: 'A yemeği', kcal: 1 });
    const ra = await A.cloud.enableVault({ name: 'ali@ornek.com', pass: PASS });
    const B = await device(srv);
    await B.db.put('food_logs', { date: '2026-10-01', name: 'B yemeği', kcal: 1 });
    const rb = await B.cloud.enableVault({ name: 'ayse@ornek.com', pass: PASS });
    expect(ra.code).not.toBe(rb.code);
    const C = await device(srv);
    const gotA = await C.cloud.findBackup({ who: 'ali@ornek.com', pass: PASS });
    const gotB = await C.cloud.findBackup({ who: 'Ayse@Ornek.com ', pass: PASS }); // ad büyük/küçük harf ve boşluk duyarsız
    expect(gotA.data.data.food_logs[0].name).toBe('A yemeği');
    expect(gotB.data.data.food_logs[0].name).toBe('B yemeği');
  });

  it('alınmış yedek adı reddedilir', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.cloud.enableVault({ name: 'benim adim', pass: PASS });
    const B = await device(srv);
    await expect(B.cloud.enableVault({ name: 'Benim Adim', pass: 'baska uzun sifre' })).rejects.toThrow(/kullanılıyor/);
  });

  it('kurtarma kodu + şifre ile açılır; kod tek başına yetmez', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.db.put('food_logs', { date: '2026-10-01', name: 'Kodla bulunan', kcal: 1 });
    const { code } = await A.cloud.enableVault({ name: 'kod testi', pass: PASS });
    const B = await device(srv);
    expect((await B.cloud.findBackup({ who: code, pass: PASS })).data.data.food_logs[0].name).toBe('Kodla bulunan');
    await expect(B.cloud.findBackup({ who: code, pass: 'yanlis uzun sifre' })).rejects.toThrow(/Şifre yanlış/);
  });

  it('yanlış anahtarla okuma, yazma ve silme reddedilir', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.cloud.enableVault({ name: 'yetki testi', pass: PASS });
    const v = await A.db.getSetting('cloud_v3');
    const bad = 'f'.repeat(64);
    expect((await call(srv.env, 'GET', `/api/vault/${v.id}`, { headers: { 'x-read-key': bad } })).status).toBe(403);
    expect((await call(srv.env, 'GET', `/api/vault/${v.id}`)).status).toBe(403);
    expect((await call(srv.env, 'HEAD', `/api/vault/${v.id}`, { headers: { 'x-read-key': bad } })).status).toBe(403);
    expect((await call(srv.env, 'GET', `/api/vault/${v.id}`, { headers: { 'x-read-key': v.write } })).status).toBe(403); // yazma anahtarı okumaya yetmez
    expect((await call(srv.env, 'PUT', `/api/vault/${v.id}`, { headers: { 'x-write-key': bad, 'x-read-key': bad }, body: 'PC03xxxxxxxxxxxxxxxx' })).status).toBe(403);
    expect((await call(srv.env, 'PUT', `/api/vault/${v.id}`, { headers: { 'x-write-key': v.read }, body: 'PC03xxxxxxxxxxxxxxxx' })).status).toBe(403); // okuma anahtarı yazmaya yetmez
    expect((await call(srv.env, 'DELETE', `/api/vault/${v.id}`, { headers: { 'x-write-key': bad } })).status).toBe(403);
    expect((await call(srv.env, 'DELETE', `/api/vault-name/${v.locId}`, { headers: { 'x-write-key': bad } })).status).toBe(403);
    expect((await call(srv.env, 'GET', `/api/vault/${v.id}`, { headers: { 'x-read-key': v.read } })).status).toBe(200);
  });

  it('sunucu şifreyi ve şifreleme anahtarını hiç görmez', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.db.put('food_logs', { date: '2026-10-01', name: 'GIZLIICERIK', kcal: 1 });
    await A.cloud.enableVault({ name: 'gizlilik', pass: PASS });
    const sent = JSON.stringify(srv.calls) + [...srv.kv._map.values()].map((e) => (typeof e.value === 'string' ? e.value : new TextDecoder('latin1').decode(e.value)) + JSON.stringify(e.metadata)).join('');
    expect(sent).not.toContain(PASS);
    expect(sent).not.toContain('GIZLIICERIK');
    const v = await A.db.getSetting('cloud_v3');
    expect(sent).not.toContain(v.read); // yalnızca özeti saklanır
  });

  it('telefonda ham şifre saklanmaz, otomatik yedek anahtarla çalışır', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.cloud.enableVault({ name: 'otomatik', pass: PASS });
    expect(await A.db.getSetting('cloud_pass')).toBeNull();
    const dump = JSON.stringify(await A.db.getSetting('cloud_v3'));
    expect(dump).not.toContain(PASS);
    await A.db.put('food_logs', { date: '2026-10-02', name: 'Sonradan', kcal: 1 });
    await A.db.setSetting('cloud_last', null);
    await later();
    await A.cloud.autoCloudBackup();
    const B = await device(srv);
    const got = await B.cloud.findBackup({ who: 'otomatik', pass: PASS });
    expect(got.data.data.food_logs.map((f) => f.name)).toContain('Sonradan');
  });

  it('eski PC02 yedeği yeni sisteme taşınır; eski yedek ancak yenisi doğrulandıktan sonra silinir', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.db.put('food_logs', { date: '2026-10-01', name: 'Eski kasadan', kcal: 1 });
    await A.db.setSetting('cloud_pass', PASS);
    await A.cloud.cloudUpload(PASS); // 2.0.x davranışı
    expect([...srv.kv._map.keys()].some((k) => k.startsWith('bk:'))).toBe(true);
    expect(await A.cloud.cloudMode()).toBe('v2');
    const { code } = await A.cloud.upgradeToVault('tasima testi');
    expect(code).toMatch(/^PC3-/);
    expect(await A.cloud.cloudMode()).toBe('v3');
    expect(await A.db.getSetting('cloud_pass')).toBeNull();
    expect([...srv.kv._map.keys()].some((k) => k.startsWith('bk:'))).toBe(false);
    const B = await device(srv);
    expect((await B.cloud.findBackup({ who: 'tasima testi', pass: PASS })).data.data.food_logs[0].name).toBe('Eski kasadan');
  });

  it('taşıma başarısız olursa eski yedek ve şifre yerinde kalır', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.db.setSetting('cloud_pass', PASS);
    await A.cloud.cloudUpload(PASS);
    installServer({ kv: srv.kv, fail: (u) => u.pathname.startsWith('/api/vault/') });
    await expect(A.cloud.upgradeToVault('olmayacak')).rejects.toThrow();
    expect(await A.db.getSetting('cloud_pass')).toBe(PASS);
    expect([...srv.kv._map.keys()].some((k) => k.startsWith('bk:'))).toBe(true);
    expect(await A.cloud.cloudMode()).toBe('v2');
  });

  it('eski yedek (ad boş) hâlâ şifreyle açılır', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.db.put('food_logs', { date: '2026-10-01', name: 'PC02 içerik', kcal: 1 });
    await A.cloud.cloudUpload(PASS);
    const B = await device(srv);
    const got = await B.cloud.findBackup({ who: '', pass: PASS });
    expect(got.vault).toBeNull();
    expect(got.data.data.food_logs[0].name).toBe('PC02 içerik');
  });

  it('geri yüklenen kasa yeni telefonda benimsenir, yedekleme aynı kasaya devam eder', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.cloud.enableVault({ name: 'benimseme', pass: PASS });
    const B = await device(srv);
    const got = await B.cloud.findBackup({ who: 'benimseme', pass: PASS });
    await B.db.importAll(got.data);
    await B.cloud.adoptVault(got.vault);
    await B.db.put('food_logs', { date: '2026-10-03', name: 'Yeni telefondan', kcal: 1 });
    await later();
    expect((await B.cloud.backupNow()).ok).toBe(true);
    const C = await device(srv);
    expect((await C.cloud.findBackup({ who: 'benimseme', pass: PASS })).data.data.food_logs.map((f) => f.name)).toContain('Yeni telefondan');
    expect([...srv.kv._map.keys()].filter((k) => k.startsWith('vx:'))).toHaveLength(1);
  });

  it('kapatınca kasa ve bulucu silinir', async () => {
    const srv = installServer();
    const A = await device(srv);
    await A.cloud.enableVault({ name: 'kapatma', pass: PASS });
    await A.cloud.disableCloud();
    expect([...srv.kv._map.keys()].filter((k) => k.startsWith('vx:') || k.startsWith('vn:'))).toEqual([]);
    expect(await A.cloud.cloudMode()).toBe('off');
  });

  it('bozuk biçim ve boyut sunucuda reddedilir', async () => {
    const srv = installServer();
    const id = 'a'.repeat(64);
    const k = { 'x-read-key': 'b'.repeat(64), 'x-write-key': 'c'.repeat(64) };
    expect((await call(srv.env, 'PUT', `/api/vault/${id}`, { headers: k, body: 'XXXXyyyy' })).status).toBe(400);
    expect((await call(srv.env, 'PUT', `/api/vault/${id}`, { headers: { 'x-read-key': 'zz' }, body: 'PC03yyyy' })).status).toBe(400);
  });
});
