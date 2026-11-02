// Vault v3 — şifreli bulut yedeğinin şifreleme çekirdeği.
//
// - Her kasa için rastgele 256 bit kasa kimliği ve rastgele 256 bit KDF tuzu üretilir.
// - Şifreden PBKDF2-SHA256 (600 bin tur) ile ana anahtar, ondan HKDF-SHA256 ile birbirinden bağımsız
//   üç anahtar türetilir: şifreleme (AES-256-GCM), okuma yetkisi, yazma yetkisi.
// - Şifre ve şifreleme anahtarı sunucuya hiç gitmez. Sunucu yalnızca okuma/yazma yetkisinin özetini tutar.
// - Yeni cihazda kasaya iki yoldan ulaşılır: yedek adı + şifre, ya da kurtarma kodu + şifre.
//   Kurtarma kodu kasa kimliği + tuz + sürüm içerir; tek başına anahtar değildir, şifre ayrıca istenir.

export const FORMAT = 'PC03';
export const KDF_ITER = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// ---------- Yedek adı ----------
export function normalizeName(n) {
  return String(n || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}
export function nameIssue(n) {
  const v = normalizeName(n);
  if (v.length < 3) return 'Yedek adı en az 3 karakter olmalı.';
  if (v.length > 64) return 'Yedek adı en fazla 64 karakter olabilir.';
  return null;
}
// Ad sunucuya düz gitmez; yalnızca özeti bulucu (locator) kimliği olarak kullanılır
export async function locatorId(name) {
  return hex(await sha256(enc.encode('procoach:yedek-adi:v3:' + normalizeName(name))));
}

// ---------- Kasa ve anahtarlar ----------
export function newVault() {
  return { id: hex(crypto.getRandomValues(new Uint8Array(32))), salt: hex(crypto.getRandomValues(new Uint8Array(32))) };
}

export async function deriveVaultKeys(pass, saltHex, vaultId) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: KDF_ITER }, base, 256);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  // Her amaç için ayrı "info": anahtarlar birbirinden bağımsızdır ve kasa kimliğine bağlıdır
  const info = (purpose) => enc.encode(`procoach:v3:${purpose}:${vaultId}`);
  const zero = new Uint8Array(32);
  const encKey = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: zero, info: info('sifreleme') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const read = hex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: zero, info: info('okuma') }, hk, 256));
  const write = hex(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: zero, info: info('yazma') }, hk, 256));
  return { encKey, read, write };
}

// ---------- Şifreleme ----------
// Biçim: 'PC03' | IV (12 bayt, her yedekte yeni) | AES-GCM şifreli metin. AAD = 'PC03|<kasa kimliği>'
const aad = (vaultId) => enc.encode(`${FORMAT}|${vaultId}`);
export async function sealPayload(encKey, vaultId, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(vaultId) }, encKey, bytes));
  const out = new Uint8Array(16 + ct.length);
  out.set(enc.encode(FORMAT), 0);
  out.set(iv, 4);
  out.set(ct, 16);
  return out;
}
export async function openPayload(encKey, vaultId, buf) {
  if (buf.byteLength < 17 || dec.decode(buf.slice(0, 4)) !== FORMAT) throw new Error('Yedek biçimi tanınmadı.');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(4, 16), additionalData: aad(vaultId) }, encKey, buf.slice(16)));
  } catch {
    throw new Error('Şifre yanlış ya da yedek bozuk.');
  }
}

// ---------- Kurtarma kodu ----------
// 'PC3-' + Crockford base32( sürüm(1) | kasa kimliği(32) | tuz(32) | sağlama(2) ), 4'lü gruplar
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32encode(bytes) {
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  const out = [];
  let bits = 0;
  let val = 0;
  for (const ch of str) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Kurtarma kodunda geçersiz karakter var.');
    val = (val << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export async function encodeRecovery(vaultId, saltHex) {
  const body = new Uint8Array(65);
  body[0] = 3;
  body.set(unhex(vaultId), 1);
  body.set(unhex(saltHex), 33);
  const chk = (await sha256(body)).slice(0, 2);
  const all = new Uint8Array(67);
  all.set(body);
  all.set(chk, 65);
  return 'PC3-' + b32encode(all).match(/.{1,4}/g).join('-');
}
export const looksLikeRecovery = (s) => /^\s*PC3[-\s]/i.test(String(s || ''));
export async function decodeRecovery(code) {
  const clean = String(code || '')
    .toUpperCase()
    .replace(/^\s*PC3/, '')
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const bytes = b32decode(clean);
  if (bytes.length < 67) throw new Error('Kurtarma kodu eksik.');
  const body = bytes.slice(0, 65);
  if (body[0] !== 3) throw new Error('Bu kurtarma kodu bu sürümle açılamıyor.');
  const chk = (await sha256(body)).slice(0, 2);
  if (chk[0] !== bytes[65] || chk[1] !== bytes[66]) throw new Error('Kurtarma kodu hatalı yazılmış (sağlama tutmuyor).');
  return { id: hex(body.slice(1, 33)), salt: hex(body.slice(33, 65)), v: 3 };
}

// ---------- Sunucu ----------
async function ok(res, notFoundMsg) {
  if (res.ok) return res;
  if (res.status === 404) throw Object.assign(new Error(notFoundMsg || 'Yedek bulunamadı.'), { status: 404 });
  if (res.status === 403) throw Object.assign(new Error('Şifre yanlış.'), { status: 403 });
  if (res.status === 409) throw Object.assign(new Error('Bu yedek adı başka bir kasada kullanılıyor. Başka bir ad seç.'), { status: 409 });
  if (res.status === 413) throw Object.assign(new Error('Yedek çok büyük (fotoğrafları yedekten çıkarmayı dene).'), { status: 413 });
  if (res.status === 429) throw Object.assign(new Error('Az önce yedeklendi; birkaç dakika sonra tekrar dene.'), { status: 429 });
  if (res.status === 507) throw Object.assign(new Error('Sunucudaki yedek alanı dolu. Uygulamayı kuran kişiye haber ver.'), { status: 507 });
  throw Object.assign(new Error('Sunucuya ulaşılamadı.'), { status: res.status });
}
export async function vaultPut(id, keys, body) {
  return (await ok(await fetch('/api/vault/' + id, { method: 'PUT', body, headers: { 'content-type': 'application/octet-stream', 'x-read-key': keys.read, 'x-write-key': keys.write } }))).json();
}
export async function vaultGet(id, keys) {
  const res = await ok(await fetch('/api/vault/' + id, { cache: 'no-store', headers: { 'x-read-key': keys.read } }));
  return { buf: new Uint8Array(await res.arrayBuffer()), at: res.headers.get('x-backup-at') || null };
}
export async function vaultDelete(id, keys) {
  await ok(await fetch('/api/vault/' + id, { method: 'DELETE', headers: { 'x-write-key': keys.write } }));
}
export async function locatorGet(locId) {
  const res = await fetch('/api/vault-name/' + locId, { cache: 'no-store' });
  if (res.status === 404) return null;
  return (await ok(res)).json();
}
export async function locatorPut(locId, rec, keys) {
  await ok(await fetch('/api/vault-name/' + locId, { method: 'PUT', body: JSON.stringify(rec), headers: { 'content-type': 'application/json', 'x-write-key': keys.write } }));
}
export async function locatorDelete(locId, keys) {
  await ok(await fetch('/api/vault-name/' + locId, { method: 'DELETE', headers: { 'x-write-key': keys.write } }));
}
