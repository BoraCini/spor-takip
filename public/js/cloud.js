// Şifreli bulut yedeği ve Apple Sağlık (Kestirmeler) köprüsü.
// Yedek telefonda kullanıcının şifresiyle şifrelenir; sunucu yalnızca okunamaz veriyi saklar.
// Şifre unutulursa yedek açılamaz — bunu kimse geri getiremez.
import * as db from './db.js';
import { today, addDays, toast } from './util.js';
import { activityOf } from './context.js';
import * as V from './vault.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const cloudSupported = () => !!(window.crypto && crypto.subtle && window.CompressionStream && window.DecompressionStream);

// v2: yedeğin sunucudaki adresi, şifreleme anahtarı ve yazma anahtarı tek bir yavaş türetmeden (PBKDF2, 310 bin tur) çıkar.
// Adres artık hızlı bir özet olmadığı için, sunucudaki liste ele geçse bile şifre hızlıca denenemez.
// Yazma anahtarı olmadan kimse yedeğin üzerine yazamaz ya da silemez.
const secretCache = new Map();
async function secretsFor(pass) {
  if (secretCache.has(pass)) return secretCache.get(pass);
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('procoach:yedek:v2'), iterations: 310000, hash: 'SHA-256' }, base, 256);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const part = (info) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) }, hk, 256);
  const out = {
    id: hex(await part('procoach:kimlik')),
    write: hex(await part('procoach:yazma')),
    key: await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('procoach:anahtar') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
  };
  secretCache.clear();
  secretCache.set(pass, out);
  return out;
}

// Eski biçim (2.0.0): yalnızca okumak ve taşıdıktan sonra silmek için
async function legacyId(pass) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode('procoach:yedek:' + pass)));
}
async function legacyKey(pass, id) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('procoach:anahtar:' + id), iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
// Sıkıştırılmış ve açılmış boyut ayrı ayrı sınırlı ("zip bombası" ve bellek taşmasına karşı)
export const MAX_COMPRESSED = 25 * 1024 * 1024;
export const MAX_INFLATED = 250 * 1024 * 1024;
export async function gunzipLimited(bytes, max = MAX_INFLATED) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      try {
        await reader.cancel();
      } catch {}
      throw new Error('Yedek açıldığında çok büyük çıkıyor; açılmadı.');
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}
async function dropLegacy(pass) {
  try {
    await fetch('/api/backup/' + (await legacyId(pass)), { method: 'DELETE' });
  } catch {}
}

export function passIssue(p) {
  if (!p || p.length < 10) return 'Şifre en az 10 karakter olmalı.';
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|qwertyuiop)/i.test(p)) return 'Daha tahmin edilmesi zor bir şifre seç.';
  return null;
}

// Yedeği hazırlar: dışa aktar (okuma hatasında fırlatır: eksik yedek gönderilmez) → ani düşüş kontrolü → gzip
async function prepareBackup(guard) {
  const withPhotos = await db.getSetting('backup_photos', true);
  const data = await db.exportAll({ photos: withPhotos });
  if (guard) {
    const hold = dropCheck(db.backupCounts(data), await db.getSetting('cloud_last_counts'));
    if (hold) {
      await db.setSetting('cloud_hold', { at: new Date().toISOString(), ...hold });
      return { hold };
    }
  }
  const zipped = await pipe(enc.encode(JSON.stringify(data)), new CompressionStream('gzip'));
  return { data, zipped };
}
async function markBackedUp(data) {
  const at = new Date().toISOString();
  await db.setSetting('cloud_last', at);
  await db.setSetting('cloud_last_counts', db.backupCounts(data));
  await db.setSetting('cloud_hold', null);
  return at;
}

// ---- Eski biçim (PC02, 2.0.1–2.0.2): yalnızca henüz v3'e geçmemiş kurulumlar için ----
export async function cloudUpload(pass, { guard = false } = {}) {
  const { id, key, write } = await secretsFor(pass);
  const prep = await prepareBackup(guard);
  if (prep.hold) return { ok: false, reason: 'dusus', ...prep.hold };
  const { data, zipped } = prep;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('PC02') }, key, zipped));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(enc.encode('PC02'), 0);
  out.set(iv, 4);
  out.set(ct, 16);
  const res = await fetch('/api/backup/' + id, { method: 'PUT', body: out, headers: { 'content-type': 'application/octet-stream', 'x-write-key': write } });
  if (res.status === 429) return { ok: false, reason: 'sik' };
  if (!res.ok) {
    if (res.status === 413) throw new Error('Yedek çok büyük (fotoğrafları yedekten çıkarmayı dene).');
    if (res.status === 507) throw new Error('Sunucudaki yedek alanı dolu. Uygulamayı kuran kişiye haber ver.');
    if (res.status === 403) throw new Error('Bu yedeğin üzerine yazılamadı.');
    throw new Error('Sunucuya ulaşılamadı.');
  }
  const at = await markBackedUp(data);
  // eski biçimdeki yedek varsa yeni biçime geçtikten sonra sil
  if (!(await db.getSetting('cloud_v2'))) {
    await dropLegacy(pass);
    await db.setSetting('cloud_v2', true);
  }
  return { ok: true, at, size: out.length };
}

async function decode(buf, key, tag) {
  let plain;
  try {
    plain = await crypto.subtle.decrypt(tag === 'PC02' ? { name: 'AES-GCM', iv: buf.slice(4, 16), additionalData: enc.encode('PC02') } : { name: 'AES-GCM', iv: buf.slice(4, 16) }, key, buf.slice(16));
  } catch {
    throw new Error('Şifre yanlış ya da yedek bozuk.');
  }
  const json = new TextDecoder().decode(await gunzipLimited(new Uint8Array(plain)));
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('Yedek bozuk (içerik okunamadı).');
  }
}

export async function cloudDownload(pass) {
  const { id, key } = await secretsFor(pass);
  let res = await fetch('/api/backup/' + id, { cache: 'no-store' });
  let legacy = false;
  if (res.status === 404) {
    res = await fetch('/api/backup/' + (await legacyId(pass)), { cache: 'no-store' });
    legacy = true;
  }
  if (res.status === 404) throw new Error('Bu şifreyle bir yedek bulunamadı.');
  if (!res.ok) throw new Error('Sunucuya ulaşılamadı.');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_COMPRESSED) throw new Error('Yedek beklenenden büyük; açılmadı.');
  const tag = new TextDecoder().decode(buf.slice(0, 4));
  if (tag !== (legacy ? 'PC01' : 'PC02')) throw new Error('Yedek biçimi tanınmadı.');
  const data = await decode(buf, legacy ? await legacyKey(pass, await legacyId(pass)) : key, tag);
  return { data, at: res.headers.get('x-backup-at') || null };
}

export async function cloudDelete(pass) {
  const { id, write } = await secretsFor(pass);
  await fetch('/api/backup/' + id, { method: 'DELETE', headers: { 'x-write-key': write } });
  await dropLegacy(pass);
}

// ---------- Vault v3 ----------
// Telefonda saklanan: kasa kimliği, tuz, yedek adı, dışa aktarılamaz şifreleme anahtarı (CryptoKey) ve okuma/yazma
// yetki anahtarları. Ham şifre saklanmaz. Şifreleme anahtarı kullanılabilir ama içeriği okunamaz, şifre geri elde edilemez.
const getVault = () => db.getSetting('cloud_v3');

export async function cloudMode() {
  if (await getVault()) return 'v3';
  if (await db.getSetting('cloud_pass')) return 'v2';
  return 'off';
}

async function uploadV3(vault, prep) {
  const sealed = await V.sealPayload(vault.encKey, vault.id, prep.zipped);
  await V.vaultPut(vault.id, vault, sealed);
  return sealed.length;
}

// Yeni kasa: ad + şifre. Kurtarma kodunu döndürür (kullanıcıya bir kez gösterilir, ayarlardan tekrar görülebilir).
export async function enableVault({ name, pass, migrateFrom = null }) {
  const ni = V.nameIssue(name);
  if (ni) throw new Error(ni);
  const pi = passIssue(pass);
  if (pi) throw new Error(pi);
  const locId = await V.locatorId(name);
  if (await V.locatorGet(locId)) throw new Error('Bu yedek adı kullanılıyor. Başka bir ad seç ya da "Geri yükle" ile o yedeği aç.');
  const { id, salt } = V.newVault();
  const keys = await V.deriveVaultKeys(pass, salt, id);
  const vault = { id, salt, name: V.normalizeName(name), locId, ...keys, created: new Date().toISOString() };
  const prep = await prepareBackup(false);
  const size = await uploadV3(vault, prep);
  try {
    await V.locatorPut(locId, { vault_id: id, salt, v: 3 }, keys);
  } catch (e) {
    await V.vaultDelete(id, keys).catch(() => {}); // ad bu arada alındıysa kasayı geri al
    throw e;
  }
  await db.setSetting('cloud_v3', vault);
  const at = await markBackedUp(prep.data);
  // Eski biçimden geçiş: yeni kasa doğrulandıktan SONRA eski yedek silinir ve düz metin şifre kaldırılır
  const old = migrateFrom || (await db.getSetting('cloud_pass'));
  if (old) {
    try {
      await cloudDelete(old);
    } catch {}
    await db.setSetting('cloud_pass', null);
  }
  return { code: await V.encodeRecovery(id, salt), at, size };
}

// Eski (PC02) kurulumdan v3'e geçiş: kayıtlı şifre ile, kullanıcının seçtiği adla
export async function upgradeToVault(name) {
  const pass = await db.getSetting('cloud_pass');
  if (!pass) throw new Error('Eski bulut yedeği bulunamadı.');
  return enableVault({ name, pass, migrateFrom: pass });
}

export async function recoveryCode() {
  const v = await getVault();
  return v ? V.encodeRecovery(v.id, v.salt) : null;
}

// Hangi biçimde olursa olsun "şimdi yedekle"
export async function backupNow({ guard = false } = {}) {
  const vault = await getVault();
  if (vault) {
    const prep = await prepareBackup(guard);
    if (prep.hold) return { ok: false, reason: 'dusus', ...prep.hold };
    let size;
    try {
      size = await uploadV3(vault, prep);
    } catch (e) {
      if (e.status === 429) return { ok: false, reason: 'sik' };
      throw e;
    }
    // bulucunun ömrünü uzat (ayda bir)
    const lr = await db.getSetting('cloud_loc_refresh');
    if (!lr || Date.now() - Date.parse(lr) > 30 * 86400000) {
      try {
        await V.locatorPut(vault.locId, { vault_id: vault.id, salt: vault.salt, v: 3 }, vault);
        await db.setSetting('cloud_loc_refresh', new Date().toISOString());
      } catch {}
    }
    return { ok: true, at: await markBackedUp(prep.data), size };
  }
  const pass = await db.getSetting('cloud_pass');
  if (pass) return cloudUpload(pass, { guard });
  throw new Error('Bulut yedeği kapalı.');
}

// Geri yükleme: "kim" = yedek adı ya da kurtarma kodu. Boş bırakılırsa eski (şifreyle bulunan) yedek denenir.
// Döner: { data, at, vault } — vault varsa bu telefon aynı kasaya yedeklemeye devam edebilir (adoptVault).
export async function findBackup({ who = '', pass }) {
  if (!pass) throw new Error('Şifreyi yaz.');
  let id;
  let salt;
  let name = null;
  let locId = null;
  if (V.looksLikeRecovery(who)) {
    ({ id, salt } = await V.decodeRecovery(who));
  } else if (String(who).trim()) {
    const ni = V.nameIssue(who);
    if (ni) throw new Error(ni);
    locId = await V.locatorId(who);
    const loc = await V.locatorGet(locId);
    if (!loc) throw new Error('Bu adla bir yedek bulunamadı. Adı kontrol et ya da kurtarma kodunu kullan.');
    ({ vault_id: id, salt } = loc);
    name = V.normalizeName(who);
  } else {
    const r = await cloudDownload(pass); // eski biçim (PC02/PC01)
    return { ...r, vault: null, legacyPass: pass };
  }
  const keys = await V.deriveVaultKeys(pass, salt, id);
  let got;
  try {
    got = await V.vaultGet(id, keys);
  } catch (e) {
    if (e.status === 403) throw new Error('Şifre yanlış.');
    if (e.status === 404) throw new Error('Bu kasada yedek bulunamadı.');
    throw e;
  }
  if (got.buf.byteLength > MAX_COMPRESSED) throw new Error('Yedek beklenenden büyük; açılmadı.');
  const zipped = await V.openPayload(keys.encKey, id, got.buf);
  const text = new TextDecoder().decode(await gunzipLimited(zipped));
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Yedek bozuk (içerik okunamadı).');
  }
  return { data, at: got.at, vault: { id, salt, name, locId, ...keys, created: new Date().toISOString() } };
}

// Geri yüklenen kasayı bu telefonda kullan (otomatik yedek aynı kasaya devam eder)
export async function adoptVault(vault) {
  if (!vault) return;
  await db.setSetting('cloud_v3', vault);
  await db.setSetting('cloud_pass', null);
}

// Bulut yedeğini kapat: sunucudaki kasa ve bulucu (ya da eski yedek) silinir
export async function disableCloud() {
  const vault = await getVault();
  if (vault) {
    await V.vaultDelete(vault.id, vault).catch(() => {});
    if (vault.locId) await V.locatorDelete(vault.locId, vault).catch(() => {});
  }
  const pass = await db.getSetting('cloud_pass');
  if (pass) await cloudDelete(pass).catch(() => {});
  for (const k of ['cloud_v3', 'cloud_pass', 'cloud_last', 'cloud_last_counts', 'cloud_hold', 'cloud_loc_refresh']) await db.setSetting(k, null);
}

// Otomatik yedekte güvenlik: kayıt sayısı bir önceki yedeğe göre yarıdan fazla düştüyse yedekleme durur, kullanıcıya sorulur.
export function dropCheck(now, prev) {
  if (!prev) return null;
  const sum = (o) => Object.entries(o || {}).filter(([k]) => k !== 'settings' && k !== 'chat_messages').reduce((a, [, v]) => a + (v || 0), 0);
  const p = sum(prev);
  const n = sum(now);
  if (p >= 20 && n < p * 0.5) return { prev: p, now: n };
  return null;
}

// Uygulama açıldığında: son yedekten 24 saat geçtiyse arka planda yedekle
export async function autoCloudBackup() {
  try {
    if ((await cloudMode()) === 'off' || !cloudSupported() || !navigator.onLine) return;
    const last = await db.getSetting('cloud_last');
    if (last && Date.now() - Date.parse(last) < 24 * 3600 * 1000) return;
    await backupNow({ guard: true });
  } catch (e) {
    console.warn('bulut yedeği', e);
  }
}

// ---------- Apple Sağlık köprüsü ----------
export async function inboxToken(create = false) {
  let t = await db.getSetting('inbox_token');
  if (!t && create) {
    t = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 40);
    await db.setSetting('inbox_token', t);
  }
  return t;
}
export const inboxUrl = (t) => `${location.origin}/api/inbox/${t}`;
export async function closeInbox() {
  const t = await inboxToken();
  if (t) {
    try {
      await fetch(inboxUrl(t), { method: 'DELETE' });
    } catch {}
  }
  await db.setSetting('inbox_token', null);
}

// Kutudaki adım/kilo verisini al → doğrula → tek işlemde kaydet → yalnızca kaydedilenleri sunucuya onayla (ACK).
// Sunucu onaylanmayan kaydı silmez; bağlantı ya da yazma yarıda kalırsa kayıt bir sonraki açılışta yeniden gelir.
// İşlenen kayıt kimlikleri telefonda tutulur, aynı kayıt ikinci kez yazılmaz.
const DATE_OK = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z'));
export function inboxItemValues(it) {
  const d = DATE_OK(it.date) ? it.date : it.at && DATE_OK(String(it.at).slice(0, 10)) ? String(it.at).slice(0, 10) : today();
  const steps = typeof it.steps === 'number' && isFinite(it.steps) && it.steps >= 0 && it.steps < 150000 ? Math.round(it.steps) : null;
  const weight = typeof it.weight === 'number' && isFinite(it.weight) && it.weight > 25 && it.weight < 350 ? Math.round(it.weight * 10) / 10 : null;
  return { date: d, steps, weight };
}

export async function pullInbox({ quiet = true } = {}) {
  const t = await inboxToken();
  if (!t || !navigator.onLine) return 0;
  let items = [];
  try {
    const res = await fetch(inboxUrl(t), { cache: 'no-store' });
    if (!res.ok) return 0;
    items = ((await res.json()).items || []).filter((it) => it && typeof it.id === 'string');
  } catch {
    return 0; // sunucuya ulaşılamadı: hiçbir şey değişmez, kayıtlar sunucuda bekler
  }
  if (!items.length) return 0;
  const seen = { ...((await db.getSetting('inbox_seen', {})) || {}) };
  const fresh = items.filter((it) => !seen[it.id]);
  const ackIds = items.filter((it) => seen[it.id]).map((it) => it.id); // önceden işlenmiş ama onayı ulaşmamış
  let applied = 0;
  if (fresh.length) {
    try {
      const steps = { ...((await db.getSetting('daily_steps', {})) || {}) };
      const logs = await db.list('body_logs');
      const entries = [];
      const weightDates = new Set(logs.map((r) => r.date));
      for (const it of fresh) {
        const v = inboxItemValues(it);
        if (v.steps != null) {
          steps[v.date] = v.steps;
          applied++;
        }
        if (v.weight != null && !weightDates.has(v.date)) {
          entries.push({ store: 'body_logs', obj: { date: v.date, weight_kg: v.weight, source: 'saglik', inbox_id: it.id } });
          weightDates.add(v.date);
          applied++;
        }
        seen[it.id] = today();
      }
      const cut = addDays(today(), -60);
      for (const k of Object.keys(steps)) if (k < cut) delete steps[k];
      for (const k of Object.keys(seen)) if (seen[k] < cut) delete seen[k];
      entries.push({ store: 'settings', obj: { id: 'daily_steps', value: steps } });
      entries.push({ store: 'settings', obj: { id: 'inbox_seen', value: seen } });
      entries.push({ store: 'settings', obj: { id: 'inbox_last', value: new Date().toISOString() } });
      // son 14 günün ortalama adımı aktivite hesabına girer (en az 5 gün varsa)
      const recent = Object.entries(steps).filter(([k]) => k >= addDays(today(), -14)).map(([, v]) => v);
      if (recent.length >= 5) {
        const p = await db.getProfile();
        const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length / 100) * 100;
        entries.push({ store: 'profile', obj: { ...p, id: 'me', act: { ...activityOf(p), steps: avg, steps_src: 'saglik' } } });
      }
      await db.putAtomic(entries); // ya hepsi ya hiçbiri
      ackIds.push(...fresh.map((it) => it.id));
    } catch (e) {
      console.warn('Sağlık verisi kaydedilemedi', e);
      if (!quiet) toast('Sağlık verisi kaydedilemedi; sunucuda bekliyor, sonra yeniden denenecek.', 4000);
      return 0; // onay gönderilmez: kayıtlar sunucuda kalır
    }
  }
  if (ackIds.length) {
    try {
      await fetch(inboxUrl(t) + '/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ackIds }) });
    } catch {
      // onay ulaşmadı: kayıtlar sunucuda kalır, sonraki açılışta işlenmiş olarak tanınıp yeniden onaylanır
    }
  }
  if (!quiet && applied) toast(`Apple Sağlık'tan ${fresh.length} kayıt alındı`);
  return fresh.length;
}
