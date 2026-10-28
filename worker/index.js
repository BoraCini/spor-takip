// SporCoach sunucu parçası (Cloudflare Worker)
// - Statik dosyaları (public/) sunar
// - /api/push/*: bildirim aboneliği ve hatırlatma programı
// - Zamanlayıcı (cron): her 5 dakikada bir zamanı gelen hatırlatmaları Web Push ile gönderir
// Kişisel veri saklanmaz: sadece push aboneliği, hatırlatma saatleri ve (varsayılan olarak genel) başlıklar tutulur.

import { encryptPayload, vapidAuthHeader, generateVapidKeys, b64u } from './webpush.js';

const MAX_DEVICES = 5;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,80}$/;
const WINDOW_MIN = 30; // gecikmeli cron çalışmalarında bile kaçırmamak için pencere

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
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
    title: String(r.title || 'SporCoach').slice(0, 80),
    body: String(r.body || '').slice(0, 160),
    url: String(r.url || '/').slice(0, 80),
    time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '09:00',
    days: Array.isArray(r.days) ? r.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6],
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

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
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
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'subscription' }, 400);
    const existing = await env.PUSH_KV.get(key, 'json');
    if (!existing) {
      const list = await env.PUSH_KV.list({ prefix: 'dev:' });
      if (list.keys.length >= MAX_DEVICES) return json({ error: 'limit' }, 403);
    }
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
    const r = await sendPush(env, rec, { title: 'SporCoach', body: 'Bildirimler çalışıyor. Hatırlatmalar bu şekilde gelecek.', url: '/#/profil', tag: 'test' });
    if (r.gone) await env.PUSH_KV.delete(key);
    return json({ ok: r.ok, status: r.status });
  }
  if (path === '/api/push/unregister') {
    await env.PUSH_KV.delete(key);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

async function sendPush(env, rec, payload) {
  const v = await getVapid(env);
  const sub = rec.subscription;
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
