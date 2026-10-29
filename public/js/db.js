// Veri katmanı — tüm okuma/yazma buradan geçer.
// v2'de (Supabase) yalnızca bu dosya değişecek: her "store" bir tabloya karşılık gelir.

const DB_NAME = 'sporcoach';
const DB_VERSION = 3;
export const SCHEMA_VERSION = 2;
const USER_ID = 'local';

export const STORES = [
  'settings',
  'profile',
  'body_logs',
  'custom_foods',
  'food_logs',
  'plan_items',
  'exercises',
  'program_days',
  'program_exercises',
  'workout_sets',
  'compounds',
  'dose_logs',
  'injection_logs',
  'cycles',
  'lab_tests',
  'lab_values',
  'chat_messages',
  'usage',
  'water_logs',
  'body_measurements',
  'progress_photos',
  'coach_notes',
  'workout_sessions',
];

// Dışa aktarmaya girmeyecek gizli ayarlar
const SECRET_SETTINGS = ['api_key', 'pin_hash', 'pin_salt', 'push_token', 'push_enabled', 'push_hash', 'faceid_cred'];

let dbp = null;
let memory = null; // IndexedDB yoksa geçici bellek

function openIDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('IndexedDB açılamadı, geçici bellek kullanılıyor', req.error);
        memory = memory || {};
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB yok', e);
      memory = memory || {};
      resolve(null);
    }
  });
  return dbp;
}

function memStore(name) {
  memory[name] = memory[name] || new Map();
  return memory[name];
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => (result = r));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function rawAll(store) {
  const db = await openIDB();
  if (!db) return Array.from(memStore(store).values());
  try {
    return await tx(db, store, 'readonly', (os) => reqP(os.getAll()));
  } catch (e) {
    console.error('Okuma hatası', store, e);
    return [];
  }
}

async function rawPut(store, obj) {
  const db = await openIDB();
  if (!db) {
    memStore(store).set(obj.id, obj);
    return obj;
  }
  await tx(db, store, 'readwrite', (os) => reqP(os.put(obj)));
  return obj;
}

async function rawDelete(store, id) {
  const db = await openIDB();
  if (!db) {
    memStore(store).delete(id);
    return;
  }
  await tx(db, store, 'readwrite', (os) => reqP(os.delete(id)));
}

async function rawClear(store) {
  const db = await openIDB();
  if (!db) {
    memStore(store).clear();
    return;
  }
  await tx(db, store, 'readwrite', (os) => reqP(os.clear()));
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Genel API ----------
export async function list(store, filter) {
  const all = (await rawAll(store)).filter((r) => !r.deleted_at);
  all.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  return filter ? all.filter(filter) : all;
}

export async function get(store, id) {
  const db = await openIDB();
  let r;
  if (!db) r = memStore(store).get(id);
  else {
    try {
      r = await tx(db, store, 'readonly', (os) => reqP(os.get(id)));
    } catch {
      r = undefined;
    }
  }
  return r && !r.deleted_at ? r : null;
}

let lastStamp = 0;
export async function put(store, obj) {
  // aynı milisaniyede yazılan kayıtların sırası korunsun diye zaman damgası hep artar
  const ms = Math.max(Date.now(), lastStamp + 1);
  lastStamp = ms;
  const now = new Date(ms).toISOString();
  const rec = { ...obj };
  if (!rec.id) rec.id = newId();
  if (!rec.user_id) rec.user_id = USER_ID;
  if (!rec.created_at) rec.created_at = now;
  rec.updated_at = now;
  return rawPut(store, rec);
}

export async function putMany(store, arr) {
  const out = [];
  for (const o of arr) out.push(await put(store, o));
  return out;
}

// Yumuşak silme (v2'de senkronizasyon için)
export async function remove(store, id) {
  const r = await get(store, id);
  if (!r) return;
  r.deleted_at = new Date().toISOString();
  r.updated_at = r.deleted_at;
  await rawPut(store, r);
}

export async function clearStore(store) {
  await rawClear(store);
}

// ---------- Ayarlar ----------
export async function getSetting(key, def = null) {
  const r = await get('settings', key);
  return r ? r.value : def;
}
export async function setSetting(key, value) {
  return put('settings', { id: key, value });
}

// ---------- Profil (tek kayıt) ----------
export async function getProfile() {
  return (await get('profile', 'me')) || { id: 'me' };
}
export async function saveProfile(p) {
  return put('profile', { ...p, id: 'me' });
}

// ---------- Yedekleme ----------
export async function exportAll({ photos = true } = {}) {
  const data = {};
  for (const s of STORES) {
    if (s === 'progress_photos' && !photos) continue;
    let rows = await rawAll(s);
    if (s === 'settings') rows = rows.filter((r) => !SECRET_SETTINGS.includes(r.id));
    data[s] = rows;
  }
  return { app: 'sporcoach', schema_version: SCHEMA_VERSION, exported_at: new Date().toISOString(), data };
}

export async function importAll(obj) {
  if (!obj || obj.app !== 'sporcoach' || !obj.data) throw new Error('Bu dosya bir SporCoach yedeği değil.');
  const keep = {};
  for (const k of SECRET_SETTINGS) keep[k] = await getSetting(k);
  for (const s of STORES) {
    const rows = obj.data[s];
    if (!Array.isArray(rows)) continue;
    await rawClear(s);
    for (const r of rows) if (r && r.id) await rawPut(s, r);
  }
  for (const k of SECRET_SETTINGS) if (keep[k] != null) await setSetting(k, keep[k]);
  await migrate();
}

export async function wipeAll() {
  for (const s of STORES) await rawClear(s);
}

// ---------- Şema geçişleri ----------
export async function migrate() {
  const v = await getSetting('schema_version', 0);
  if (v < 1) {
    // ilk sürüm: yapılacak bir şey yok
  }
  if (v !== SCHEMA_VERSION) await setSetting('schema_version', SCHEMA_VERSION);
}

export async function init() {
  await openIDB();
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {}
  await migrate();
}
