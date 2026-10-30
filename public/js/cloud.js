// Şifreli bulut yedeği ve Apple Sağlık (Kestirmeler) köprüsü.
// Yedek telefonda kullanıcının şifresiyle şifrelenir; sunucu yalnızca okunamaz veriyi saklar.
// Şifre unutulursa yedek açılamaz — bunu kimse geri getiremez.
import * as db from './db.js';
import { today, addDays, toast } from './util.js';
import { activityOf } from './context.js';

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

export async function cloudUpload(pass) {
  const { id, key, write } = await secretsFor(pass);
  const withPhotos = await db.getSetting('backup_photos', true);
  const data = await db.exportAll({ photos: withPhotos });
  const zipped = await pipe(enc.encode(JSON.stringify(data)), new CompressionStream('gzip'));
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
  const at = new Date().toISOString();
  await db.setSetting('cloud_last', at);
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
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), new DecompressionStream('gzip'))));
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

// Uygulama açıldığında: son yedekten 24 saat geçtiyse arka planda yedekle
export async function autoCloudBackup() {
  try {
    const pass = await db.getSetting('cloud_pass');
    if (!pass || !cloudSupported() || !navigator.onLine) return;
    const last = await db.getSetting('cloud_last');
    if (last && Date.now() - Date.parse(last) < 24 * 3600 * 1000) return;
    await cloudUpload(pass);
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

// Kutudaki adım/kilo verisini al, kaydet ve kutuyu boşalt
export async function pullInbox({ quiet = true } = {}) {
  const t = await inboxToken();
  if (!t || !navigator.onLine) return 0;
  let items = [];
  try {
    const res = await fetch(inboxUrl(t) + '?clear=1', { cache: 'no-store' });
    if (!res.ok) return 0;
    items = (await res.json()).items || [];
  } catch {
    return 0;
  }
  if (!items.length) return 0;
  const steps = (await db.getSetting('daily_steps', {})) || {};
  for (const it of items) {
    const d = it.date || (it.at ? it.at.slice(0, 10) : today());
    if (it.steps != null && it.steps >= 0 && it.steps < 150000) steps[d] = Math.round(it.steps);
    if (it.weight != null && it.weight > 25 && it.weight < 350) {
      const existing = (await db.list('body_logs', (r) => r.date === d))[0];
      if (!existing) {
        await db.put('body_logs', { date: d, weight_kg: Math.round(it.weight * 10) / 10, source: 'saglik' });
      }
    }
  }
  // son 60 günü tut
  const cut = addDays(today(), -60);
  for (const k of Object.keys(steps)) if (k < cut) delete steps[k];
  await db.setSetting('daily_steps', steps);
  // son 14 günün ortalama adımı aktivite hesabına girer (en az 5 gün varsa)
  const recent = Object.entries(steps).filter(([k]) => k >= addDays(today(), -14)).map(([, v]) => v);
  if (recent.length >= 5) {
    const p = await db.getProfile();
    const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length / 100) * 100;
    p.act = { ...activityOf(p), steps: avg, steps_src: 'saglik' };
    await db.saveProfile(p);
  }
  if (!quiet) toast(`Apple Sağlık'tan ${items.length} kayıt alındı`);
  await db.setSetting('inbox_last', new Date().toISOString());
  return items.length;
}
