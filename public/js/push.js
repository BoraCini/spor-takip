// Bildirimler (Web Push): abonelik, hatırlatma programının sunucuya gönderilmesi
import * as db from './db.js';
import { today, weekday, debounce } from './util.js';
import { dueOn, weekProgram, slotLabel } from './context.js';

export const DEFAULT_PREFS = {
  doses: true,
  times: { sabah: '09:00', ogle: '13:00', aksam: '21:00' },
  injection_time: '09:00',
  workout: false,
  workout_time: '18:00',
  backup: true,
  show_names: false,
};

export function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}
export function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPrefs() {
  const p = await db.getSetting('push_prefs');
  return { ...DEFAULT_PREFS, ...(p || {}), times: { ...DEFAULT_PREFS.times, ...((p && p.times) || {}) } };
}
export async function savePrefs(p) {
  await db.setSetting('push_prefs', p);
  await sync(true);
}

async function token() {
  let t = await db.getSetting('push_token');
  if (!t) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await db.setSetting('push_token', t);
  }
  return t;
}

function urlB64ToUint8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function api(path, body) {
  const res = await fetch('api/push/' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || 'http ' + res.status);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Kür, program ve tercihlere göre hatırlatma listesi
export async function buildReminders(prefs) {
  const out = [];
  const comps = await db.list('compounds', (c) => c.active !== false);
  if (prefs.doses) {
    for (const slot of ['sabah', 'ogle', 'aksam']) {
      const cs = comps.filter((c) => c.kind !== 'enjeksiyon' && (c.times && c.times.length ? c.times : ['sabah']).includes(slot));
      if (!cs.length) continue;
      const days = [...new Set(cs.flatMap((c) => (c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6])))].sort();
      out.push({
        id: `dose-${slot}`,
        title: `${slotLabel(slot)} dozu`,
        body: prefs.show_names ? cs.map((c) => c.name).join(', ') : 'Bugünkü dozunu işaretlemeyi unutma.',
        url: '/#/kur',
        time: prefs.times[slot],
        days,
      });
    }
    const inj = comps.filter((c) => c.kind === 'enjeksiyon');
    for (let wd = 0; wd < 7; wd++) {
      const todays = inj.filter((c) => (c.days || []).includes(wd));
      if (!todays.length) continue;
      out.push({
        id: `inj-${wd}`,
        title: 'Enjeksiyon günü',
        body: prefs.show_names ? todays.map((c) => c.name).join(', ') : 'Bugün enjeksiyon günün.',
        url: '/#/kur',
        time: prefs.injection_time,
        days: [wd],
      });
    }
  }
  if (prefs.workout) {
    const week = await weekProgram();
    week.forEach((w, wd) => {
      if (!w.day || w.day.rest || !w.items.length) return;
      out.push({ id: `workout-${wd}`, title: 'Antrenman zamanı', body: `Bugün: ${w.day.title || 'antrenman'}`, url: '/#/antrenman', time: prefs.workout_time, days: [wd] });
    });
  }
  if (prefs.backup) out.push({ id: 'backup', title: 'Yedek alma zamanı', body: 'Verilerini yedeklemek için dokun.', url: '/#/profil', time: '20:00', days: [6] });
  return out;
}

// Bugün tamamlananlar: bu hatırlatmalar gönderilmez
async function doneToday() {
  const t = today();
  const ids = [];
  const due = await dueOn(t);
  for (const slot of ['sabah', 'ogle', 'aksam']) {
    const ps = due.pills.filter((p) => p.slot === slot);
    if (ps.length && ps.every((p) => p.done)) ids.push(`dose-${slot}`);
  }
  if (due.injections.length && due.injections.every((i) => i.done)) ids.push(`inj-${weekday(t)}`);
  const sets = await db.list('workout_sets', (s) => s.date === t && s.done);
  if (sets.length) ids.push(`workout-${weekday(t)}`);
  if ((await db.getSetting('last_backup')) === t) ids.push('backup');
  return { date: t, ids };
}

async function payload() {
  const prefs = await getPrefs();
  return { reminders: await buildReminders(prefs), done: await doneToday(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul' };
}

export async function enable() {
  if (!isSupported()) throw new Error('Bu cihaz bildirimleri desteklemiyor. iPhone\'da iOS 16.4 veya üstü gerekir.');
  if (!isStandalone()) throw new Error('Bildirimler için uygulamayı ana ekrandaki simgesinden açman gerekiyor.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Bildirim izni verilmedi. Ayarlar > Bildirimler > SporCoach\'tan açabilirsin.');
  const reg = await navigator.serviceWorker.ready;
  let key;
  try {
    key = (await api('key')).publicKey;
  } catch {
    throw new Error('Bildirim sunucusuna ulaşılamadı. Biraz sonra yeniden dene.');
  }
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // farklı anahtarla oluşmuş eski abonelik varsa yenile
    const cur = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    const want = urlB64ToUint8(key);
    if (!cur || cur.length !== want.length || cur.some((b, i) => b !== want[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
  const p = await payload();
  try {
    await api('register', { token: await token(), subscription: sub.toJSON(), ...p });
  } catch (e) {
    if (e.status === 403) throw new Error('En fazla 5 cihaz kaydedilebilir.');
    throw new Error('Kayıt başarısız: ' + e.message);
  }
  await db.setSetting('push_enabled', true);
  await db.setSetting('push_hash', JSON.stringify(p));
}

export async function disable() {
  try {
    await api('unregister', { token: await token() });
  } catch {}
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch {}
  await db.setSetting('push_enabled', false);
  await db.remove('settings', 'push_hash');
}

export async function test() {
  const r = await api('test', { token: await token() });
  if (!r.ok) throw new Error('Bildirim gönderilemedi (' + r.status + '). Bildirimleri kapatıp yeniden açmayı dene.');
}

// Program değiştiyse sunucuya bildir (sayfa her yenilendiğinde çağrılır)
export async function sync(force = false) {
  if (!(await db.getSetting('push_enabled'))) return;
  const p = await payload();
  const h = JSON.stringify(p);
  if (!force && h === (await db.getSetting('push_hash'))) return;
  try {
    await api('sync', { token: await token(), ...p });
    await db.setSetting('push_hash', h);
  } catch (e) {
    if (e.status === 404) {
      // sunucu kaydı silinmiş (örn. abonelik süresi doldu): yeniden kaydol
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub && Notification.permission === 'granted') {
          await api('register', { token: await token(), subscription: sub.toJSON(), ...p });
          await db.setSetting('push_hash', h);
        } else await db.setSetting('push_enabled', false);
      } catch {}
    }
  }
}

export const syncSoon = debounce(() => sync().catch(() => {}), 1500);
