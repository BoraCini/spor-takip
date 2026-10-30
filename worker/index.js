// Pro Coach sunucu parçası (Cloudflare Worker)
// - Statik dosyaları (public/) sunar
// - /api/push/*: bildirim aboneliği ve hatırlatma programı
// - /api/backup/<id>: şifreli bulut yedeği (sunucu içeriği okuyamaz)
// - /api/inbox/<token>: Kestirmeler'den gelen adım/kilo verisi için geçici kutu
// - Zamanlayıcı (cron): her 5 dakikada bir zamanı gelen hatırlatmaları Web Push ile gönderir
// Kişisel veri saklanmaz: sadece push aboneliği, hatırlatma saatleri ve (varsayılan olarak genel) başlıklar tutulur.

import { encryptPayload, vapidAuthHeader, generateVapidKeys, b64u } from './webpush.js';

const MAX_DEVICES = 10;
const DEVICE_STALE_DAYS = 14; // sınır doluysa bu kadar gündür güncellenmeyen kayıt yer açmak için silinir
const MAX_BACKUPS = 25; // toplam yedek sayısı (25 × 20 MB ≈ KV ücretsiz kotasının yarısı)
const MAX_INBOXES = 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;
const WINDOW_MIN = 30; // gecikmeli cron çalışmalarında bile kaçırmamak için pencere

// Bildirim adresi yalnızca bilinen push servislerinden biri olabilir (sunucunun rastgele adreslere istek atmasını engeller)
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export function pushEndpointOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

// IP başına basit hız sınırı (sunucu örneği bellekte tutar; kalıcı kotalar ayrıca KV'de)
const RATE = { write: [20, 60_000], read: [90, 60_000] };
const hits = new Map();
export function rateOk(ip, kind, now = Date.now()) {
  const [max, win] = RATE[kind];
  const k = kind + '|' + ip;
  let h = hits.get(k);
  if (!h || now - h.t > win) h = { t: now, n: 0 };
  h.n++;
  hits.set(k, h);
  if (hits.size > 5000) for (const [kk, v] of hits) if (now - v.t > 120_000) hits.delete(kk);
  return h.n <= max;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function sha256hex(s) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const ip = request.headers.get('cf-connecting-ip') || 'yerel';
      const kind = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write';
      if (!rateOk(ip, kind)) return json({ error: 'sik' }, 429);
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.error('api error', e && e.stack ? e.stack : e);
        return json({ error: 'server' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env, new Date(event.scheduledTime || Date.now())));
  },
};

async function getVapid(env) {
  let v = await env.PUSH_KV.get('vapid', 'json');
  if (!v) {
    v = await generateVapidKeys();
    await env.PUSH_KV.put('vapid', JSON.stringify(v));
  }
  return v;
}

function cleanReminders(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 60).map((r) => ({
    id: String(r.id || '').slice(0, 40),
    title: String(r.title || 'Pro Coach').slice(0, 80),
    body: String(r.body || '').slice(0, 160),
    url: String(r.url || '/').slice(0, 80),
    time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '09:00',
    days: Array.isArray(r.days) ? r.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6],
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : null, // tek seferlik hatırlatma
  })).filter((r) => r.id);
}

function cleanDone(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.ids)) return null;
  return { date: d.date, ids: d.ids.map((x) => String(x).slice(0, 40)).slice(0, 60) };
}

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'Europe/Istanbul';
  }
}

// ---------- Şifreli bulut yedeği ----------
// İçerik telefonda kullanıcının şifresiyle şifrelenir (AES-GCM); sunucu sadece okunamaz veriyi saklar.
const BK_ID = /^[a-f0-9]{64}$/;
const BK_MAX = 20 * 1024 * 1024;
const INBOX_RE = /^[A-Za-z0-9_-]{32,80}$/;
const INBOX_TTL = 60 * 60 * 24 * 45; // uygulama açılmazsa kutu 45 gün sonra kendiliğinden silinir

// Yeni biçimde (v2) yedeğin yazma anahtarının özeti metadata'da durur; üzerine yazmak ve silmek için anahtar gerekir.
// Eski biçimde (anahtarsız) yedekler yalnızca kimlikle silinebilir; uygulama bunları yeni biçime taşıyınca siler.
async function writeAllowed(request, metadata) {
  if (!metadata || !metadata.wh) return true;
  const wk = request.headers.get('x-write-key') || '';
  return /^[a-f0-9]{64}$/.test(wk) && safeEq(await sha256hex(wk), metadata.wh);
}

async function handleBackup(request, env, id) {
  const key = 'bk:' + id;
  if (request.method === 'GET') {
    const { value, metadata } = await env.PUSH_KV.getWithMetadata(key, 'arrayBuffer');
    if (!value) return json({ error: 'yok' }, 404);
    return new Response(value, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-backup-at': (metadata && metadata.at) || '' } });
  }
  if (request.method === 'HEAD') {
    const { metadata } = await env.PUSH_KV.getWithMetadata(key, 'stream');
    return new Response(null, { status: metadata ? 200 : 404, headers: { 'x-backup-at': (metadata && metadata.at) || '', 'cache-control': 'no-store' } });
  }
  if (request.method === 'PUT') {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > BK_MAX) return json({ error: 'buyuk' }, 413);
    const prev = await env.PUSH_KV.getWithMetadata(key, 'stream');
    if (!(await writeAllowed(request, prev.metadata))) return json({ error: 'yetki' }, 403);
    if (prev.metadata && Date.now() - Date.parse(prev.metadata.at) < 5 * 60 * 1000) return json({ error: 'sik' }, 429);
    if (!prev.metadata) {
      const all = await env.PUSH_KV.list({ prefix: 'bk:', limit: MAX_BACKUPS + 1 });
      if (all.keys.length >= MAX_BACKUPS) return json({ error: 'dolu' }, 507);
    }
    const wk = request.headers.get('x-write-key') || '';
    const wh = /^[a-f0-9]{64}$/.test(wk) ? await sha256hex(wk) : (prev.metadata && prev.metadata.wh) || null;
    const buf = await request.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > BK_MAX) return json({ error: 'boyut' }, 400);
    const at = new Date().toISOString();
    const metadata = { at, size: buf.byteLength };
    if (wh) metadata.wh = wh;
    await env.PUSH_KV.put(key, buf, { metadata, expirationTtl: 60 * 60 * 24 * 400 });
    return json({ ok: true, at });
  }
  if (request.method === 'DELETE') {
    const prev = await env.PUSH_KV.getWithMetadata(key, 'stream');
    if (!prev.metadata) return json({ ok: true });
    if (!(await writeAllowed(request, prev.metadata))) return json({ error: 'yetki' }, 403);
    await env.PUSH_KV.delete(key);
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

// ---------- Apple Sağlık köprüsü (Kestirmeler) ----------
// Kestirme günlük adım/kilo değerlerini buraya gönderir; uygulama açılınca alır ve kutuyu boşaltır.
async function handleInbox(request, env, token) {
  const key = 'ib:' + token;
  if (request.method === 'POST') {
    // Kutu ancak uygulama bir kez açtıysa vardır; rastgele adreslere veri yığılamaz
    const cur = await env.PUSH_KV.get(key, 'json');
    if (!cur) return json({ error: 'kutu yok' }, 404);
    let body;
    const txt = (await request.text()).slice(0, 4000);
    try {
      body = JSON.parse(txt);
    } catch {
      body = Object.fromEntries(new URLSearchParams(txt));
    }
    const num = (v) => {
      const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
      return isFinite(n) ? n : null;
    };
    const item = {
      date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null,
      steps: num(body.steps),
      weight: num(body.weight),
      bodyfat: num(body.bodyfat),
      rhr: num(body.rhr),
      at: new Date().toISOString(),
    };
    if (item.steps == null && item.weight == null && item.bodyfat == null && item.rhr == null) return json({ error: 'veri yok' }, 400);
    const list = cur.slice(-59);
    list.push(item);
    await env.PUSH_KV.put(key, JSON.stringify(list), { expirationTtl: INBOX_TTL });
    return json({ ok: true });
  }
  if (request.method === 'GET') {
    const cur = await env.PUSH_KV.get(key, 'json');
    if (!cur) {
      // uygulama kutuyu ilk kez açıyor
      const all = await env.PUSH_KV.list({ prefix: 'ib:', limit: MAX_INBOXES + 1 });
      if (all.keys.length >= MAX_INBOXES) return json({ error: 'dolu' }, 507);
      await env.PUSH_KV.put(key, '[]', { expirationTtl: INBOX_TTL });
      return json({ items: [] });
    }
    if (cur.length && new URL(request.url).searchParams.get('clear') === '1') await env.PUSH_KV.put(key, '[]', { expirationTtl: INBOX_TTL });
    return json({ items: cur });
  }
  if (request.method === 'DELETE') {
    await env.PUSH_KV.delete(key);
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const bk = path.match(/^\/api\/backup\/([a-f0-9]{64})$/);
  if (bk && BK_ID.test(bk[1])) return handleBackup(request, env, bk[1]);
  const ib = path.match(/^\/api\/inbox\/([A-Za-z0-9_-]+)$/);
  if (ib && INBOX_RE.test(ib[1])) return handleInbox(request, env, ib[1]);
  if (path === '/api/push/key' && request.method === 'GET') {
    const v = await getVapid(env);
    return json({ publicKey: v.publicKey });
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'json' }, 400);
  }
  const token = body && body.token;
  if (!TOKEN_RE.test(token || '')) return json({ error: 'token' }, 400);
  const key = 'dev:' + token;

  if (path === '/api/push/register') {
    const sub = body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !pushEndpointOk(sub.endpoint) || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string' || sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) return json({ error: 'subscription' }, 400);
    const existing = await env.PUSH_KV.get(key, 'json');
    if (!existing && !(await makeRoomForDevice(env))) return json({ error: 'limit' }, 403);
    const rec = {
      ...(existing || {}),
      subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
      reminders: cleanReminders(body.reminders),
      done: cleanDone(body.done),
      tz: validTz(body.tz || 'Europe/Istanbul'),
      origin: url.origin,
      sent: (existing && existing.sent) || null,
      updated: new Date().toISOString(),
      created: (existing && existing.created) || new Date().toISOString(),
    };
    await env.PUSH_KV.put(key, JSON.stringify(rec));
    return json({ ok: true });
  }

  const rec = await env.PUSH_KV.get(key, 'json');
  if (!rec) return json({ error: 'unknown' }, 404);

  if (path === '/api/push/sync') {
    rec.reminders = cleanReminders(body.reminders);
    rec.done = cleanDone(body.done);
    if (body.tz) rec.tz = validTz(body.tz);
    rec.updated = new Date().toISOString();
    await env.PUSH_KV.put(key, JSON.stringify(rec));
    return json({ ok: true });
  }
  if (path === '/api/push/test') {
    const r = await sendPush(env, rec, { title: 'Pro Coach', body: 'Bildirimler çalışıyor. Hatırlatmalar bu şekilde gelecek.', url: '/#/profil', tag: 'test' });
    if (r.gone) await env.PUSH_KV.delete(key);
    return json({ ok: r.ok, status: r.status });
  }
  if (path === '/api/push/unregister') {
    await env.PUSH_KV.delete(key);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// Sınır doluysa en uzun süredir güncellenmeyen kaydı (DEVICE_STALE_DAYS'ten eskiyse) silip yer açar.
// Silinen gerçek bir cihazsa uygulama bir sonraki açılışta kendini yeniden kaydeder.
async function makeRoomForDevice(env) {
  const list = await env.PUSH_KV.list({ prefix: 'dev:' });
  if (list.keys.length < MAX_DEVICES) return true;
  let oldest = null;
  for (const k of list.keys) {
    const r = await env.PUSH_KV.get(k.name, 'json');
    const t = Date.parse((r && (r.updated || r.created)) || 0) || 0;
    if (!oldest || t < oldest.t) oldest = { name: k.name, t };
  }
  if (oldest && Date.now() - oldest.t > DEVICE_STALE_DAYS * 86400_000) {
    await env.PUSH_KV.delete(oldest.name);
    return true;
  }
  return false;
}

async function sendPush(env, rec, payload) {
  const sub = rec.subscription;
  if (!sub || !pushEndpointOk(sub.endpoint)) return { ok: false, status: 0, gone: true };
  const v = await getVapid(env);
  const body = await encryptPayload(new TextEncoder().encode(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth);
  const auth = await vapidAuthHeader(sub.endpoint, rec.origin || 'https://sporcoach.app', v);
  let res;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth,
        TTL: '43200',
        Urgency: 'high',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Topic: String(payload.tag || 'sporcoach').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'sporcoach',
      },
      body,
    });
  } catch (e) {
    console.error('push fetch failed', e);
    return { ok: false, status: 0 };
  }
  if (!res.ok) console.warn('push status', res.status, await res.text().catch(() => ''));
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// Verilen saat diliminde tarih, haftanın günü (Pzt=0) ve dakika
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wdMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { date: `${p.year}-${p.month}-${p.day}`, wd: wdMap[p.weekday], min: Number(p.hour) * 60 + Number(p.minute) };
}

export function dueReminders(rec, now) {
  const lp = localParts(now, rec.tz || 'Europe/Istanbul');
  const sent = rec.sent && rec.sent.date === lp.date ? rec.sent.ids : [];
  const done = rec.done && rec.done.date === lp.date ? rec.done.ids : [];
  const out = [];
  for (const r of rec.reminders || []) {
    if (r.date && r.date !== lp.date) continue;
    if (!r.days.includes(lp.wd)) continue;
    const [h, m] = r.time.split(':').map(Number);
    const rMin = h * 60 + m;
    if (rMin > lp.min || lp.min - rMin >= WINDOW_MIN) continue;
    if (sent.includes(r.id) || done.includes(r.id)) continue;
    out.push(r);
  }
  return { lp, due: out, sent };
}

async function runReminders(env, now) {
  let cursor;
  do {
    const list = await env.PUSH_KV.list({ prefix: 'dev:', cursor });
    cursor = list.list_complete ? null : list.cursor;
    for (const k of list.keys) {
      const rec = await env.PUSH_KV.get(k.name, 'json');
      if (!rec || !rec.subscription) continue;
      const { lp, due, sent } = dueReminders(rec, now);
      if (!due.length) continue;
      let gone = false;
      const newSent = [...sent];
      for (const r of due) {
        const res = await sendPush(env, rec, { title: r.title, body: r.body, url: r.url, tag: r.id });
        if (res.gone) {
          gone = true;
          break;
        }
        newSent.push(r.id);
      }
      if (gone) {
        await env.PUSH_KV.delete(k.name);
        continue;
      }
      rec.sent = { date: lp.date, ids: newSent };
      await env.PUSH_KV.put(k.name, JSON.stringify(rec));
    }
  } while (cursor);
}

export { b64u };
