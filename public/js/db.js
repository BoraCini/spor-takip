// Veri katmanı — tüm okuma/yazma buradan geçer.
// v2'de (Supabase) yalnızca bu dosya değişecek: her "store" bir tabloya karşılık gelir.

const DB_NAME = 'sporcoach';
const DB_VERSION = 5; // 5: meal_templates (öğün şablonları)
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
  'vitals',
  'meal_templates',
];

// Dışa aktarmaya girmeyecek gizli ayarlar
const SECRET_SETTINGS = ['api_key', 'pin_hash', 'pin_salt', 'push_token', 'push_enabled', 'push_hash', 'faceid_cred', 'cloud_pass', 'cloud_last', 'inbox_token', 'inbox_last', 'cloud_v2', '_health', 'cloud_last_counts', 'cloud_hold', 'inbox_seen', 'cloud_v3', 'cloud_loc_refresh', 'pin_len', 'pin_fail', 'pin_upgrade_asked'];

// ---------- Hatalar ----------
// Veritabanı hataları üst katmana anlamlı kodlarla iletilir; hiçbir hata boş liste ya da yeni kullanıcı gibi gösterilmez.
export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message || code);
    this.name = 'StorageError';
    this.code = code; // STORAGE_UNAVAILABLE | STORAGE_READ_FAILED | STORAGE_WRITE_FAILED | STORAGE_QUOTA_EXCEEDED | STORAGE_BLOCKED | STORAGE_MIGRATION_FAILED
    if (cause) this.cause = cause;
  }
}
const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''));
function wrap(e, code) {
  if (e instanceof StorageError) return e;
  if (isQuota(e)) return new StorageError('STORAGE_QUOTA_EXCEEDED', 'Telefonda yer kalmadı.', e);
  return new StorageError(code, (e && e.message) || code, e);
}

let dbp = null;
const BLOCK_WAIT_MS = 4000;

function openIDB() {
  if (dbp) return dbp;
  let self = null;
  const p = new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      // bir sonraki denemede yeniden açılabilsin (senkron hata durumunda da çalışsın diye ertelenir)
      queueMicrotask(() => {
        if (dbp === self) dbp = null;
      });
      reject(err);
    };
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB yok');
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      fail(new StorageError('STORAGE_UNAVAILABLE', 'Bu tarayıcıda veri saklanamıyor.', e));
      return;
    }
    let blockTimer = null;
    req.onupgradeneeded = (ev) => {
      // Yükseltme tek bir işlem içinde çalışır; hata olursa IndexedDB eski şemayı ve verileri olduğu gibi bırakır.
      try {
        const db = req.result;
        for (const st of STORES) if (!db.objectStoreNames.contains(st)) db.createObjectStore(st, { keyPath: 'id' });
      } catch (e) {
        try {
          req.transaction && req.transaction.abort();
        } catch {}
        fail(new StorageError('STORAGE_MIGRATION_FAILED', 'Veritabanı güncellenemedi; eski verilerin korunuyor.', e));
      }
    };
    req.onblocked = () => {
      // Eski sürümü açık başka bir sekme/pencere yükseltmeyi bekletiyor
      blockTimer = setTimeout(() => fail(new StorageError('STORAGE_BLOCKED', 'Uygulama başka bir sekmede açık. O sekmeyi kapatıp yeniden dene.')), BLOCK_WAIT_MS);
    };
    req.onsuccess = () => {
      clearTimeout(blockTimer);
      const db = req.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        // Yeni sürüm başka bir sekmede açıldı: bağlantıyı bırak ki o sekme yükseltebilsin
        db.close();
        dbp = null;
        try {
          window.dispatchEvent(new CustomEvent('db-versionchange'));
        } catch {}
      };
      db.onclose = () => {
        dbp = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      clearTimeout(blockTimer);
      const e = req.error;
      fail(e && e.name === 'VersionError' ? new StorageError('STORAGE_MIGRATION_FAILED', 'Veritabanı bu sürümden daha yeni. Uygulamayı yenile.', e) : wrap(e, 'STORAGE_UNAVAILABLE'));
    };
  });
  self = p;
  dbp = p;
  return p;
}

function tx(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    let t;
    try {
      t = db.transaction(stores, mode);
    } catch (e) {
      reject(wrap(e, mode === 'readonly' ? 'STORAGE_READ_FAILED' : 'STORAGE_WRITE_FAILED'));
      return;
    }
    let result;
    try {
      result = fn(t, typeof stores === 'string' ? t.objectStore(stores) : null);
    } catch (e) {
      try {
        t.abort();
      } catch {}
      reject(wrap(e, mode === 'readonly' ? 'STORAGE_READ_FAILED' : 'STORAGE_WRITE_FAILED'));
      return;
    }
    const code = mode === 'readonly' ? 'STORAGE_READ_FAILED' : 'STORAGE_WRITE_FAILED';
    t.oncomplete = () => Promise.resolve(result).then(resolve, (e) => reject(wrap(e, code)));
    t.onerror = (ev) => {
      ev && ev.preventDefault && ev.preventDefault();
      reject(wrap(t.error || (ev && ev.target && ev.target.error), code));
    };
    t.onabort = () => reject(wrap(t.error, code));
  });
}

const reqP = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function rawAll(store) {
  const db = await openIDB();
  return tx(db, store, 'readonly', (t, os) => reqP(os.getAll()));
}

async function rawPut(store, obj) {
  const db = await openIDB();
  await tx(db, store, 'readwrite', (t, os) => {
    os.put(obj);
  });
  return obj;
}

async function rawClear(store) {
  const db = await openIDB();
  await tx(db, store, 'readwrite', (t, os) => {
    os.clear();
  });
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
  const r = await tx(db, store, 'readonly', (t, os) => reqP(os.get(id)));
  return r && !r.deleted_at ? r : null;
}

let lastStamp = 0;
function stamp(obj) {
  // aynı milisaniyede yazılan kayıtların sırası korunsun diye zaman damgası hep artar
  const ms = Math.max(Date.now(), lastStamp + 1);
  lastStamp = ms;
  const now = new Date(ms).toISOString();
  const rec = { ...obj };
  if (!rec.id) rec.id = newId();
  if (!rec.user_id) rec.user_id = USER_ID;
  if (!rec.created_at) rec.created_at = now;
  rec.updated_at = now;
  return rec;
}
export async function put(store, obj) {
  return rawPut(store, stamp(obj));
}

// Birden çok depoya tek işlemde yazma: ya hepsi kaydedilir ya hiçbiri. entries: [{ store, obj }]
export async function putAtomic(entries) {
  const recs = entries.map(({ store, obj }) => ({ store, rec: stamp(obj) }));
  const stores = [...new Set(recs.map((e) => e.store))];
  const db = await openIDB();
  await tx(db, stores, 'readwrite', (t) => {
    for (const e of recs) t.objectStore(e.store).put(e.rec);
  });
  return recs.map((e) => e.rec);
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
export const BACKUP_FORMAT_VERSION = 2;
const SUPPORTED_BACKUP_FORMATS = [1, 2]; // 1 = backup_format_version alanı olmayan eski yedekler

// Okuma hatası olursa yedek ÜRETİLMEZ (hata fırlatılır). Eksik/boş yedeğin sağlam yedeğin üzerine yazılması böyle önlenir.
export async function exportAll({ photos = true } = {}) {
  const data = {};
  const included = [];
  for (const s of STORES) {
    if (s === 'progress_photos' && !photos) continue;
    let rows = await rawAll(s);
    if (s === 'settings') rows = rows.filter((r) => !SECRET_SETTINGS.includes(r.id));
    data[s] = rows;
    included.push(s);
  }
  return {
    app: 'sporcoach',
    backup_format_version: BACKUP_FORMAT_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    included_stores: included,
    photos_included: !!photos,
    data,
  };
}

// Yedekteki kayıt sayıları (otomatik yedeğin ani düşüşte durması için)
export function backupCounts(obj) {
  const out = {};
  for (const [s, rows] of Object.entries((obj && obj.data) || {})) if (Array.isArray(rows)) out[s] = rows.filter((r) => r && !r.deleted_at).length;
  return out;
}

// ---------- Yedek doğrulama ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FIELDS = ['date', 'start_date', 'end_date'];
const NUM_FIELDS = ['weight_kg', 'kcal', 'grams', 'qty', 'protein_g', 'carb_g', 'fat_g', 'fiber_g', 'sodium_mg', 'potassium_mg', 'reps', 'set_no', 'rpe', 'ml', 'value', 'ref_low', 'ref_high', 'sys', 'dia', 'hr', 'weeks', 'dose_amount', 'order', 'target_sets', 'height_cm', 'birth_year', 'target_kcal', 'target_protein_g', 'target_carb_g', 'target_fat_g'];
// [store, alan, hedef store] — kopuk bağlantılar uyarıdır (eski sürümlerde silinmiş kayıtlara bağlı satırlar olabilir), geri yüklemeyi durdurmaz
const RELATIONS = [
  ['lab_values', 'test_id', 'lab_tests'],
  ['program_exercises', 'day_id', 'program_days'],
  ['program_exercises', 'exercise_id', 'exercises'],
  ['workout_sets', 'exercise_id', 'exercises'],
  ['dose_logs', 'compound_id', 'compounds'],
  ['injection_logs', 'compound_id', 'compounds'],
];
const validDate = (v) => {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
};
const isNumLike = (v) => v == null || (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && (v.trim() === '' || isFinite(Number(v.replace(',', '.')))));
function validImage(v) {
  if (typeof v !== 'string' || v.length > 15 * 1024 * 1024) return false;
  const m = /^data:image\/(jpeg|png|webp|heic);base64,/.exec(v);
  if (!m) return false;
  const body = v.slice(m[0].length);
  return body.length > 16 && /^[A-Za-z0-9+/]+=*$/.test(body.slice(0, 2000) + (body.length > 2000 ? '' : ''));
}

// Geri yüklemeden ÖNCE tüm denetim. Hata varsa hiçbir şey silinmez.
export function validateBackup(obj) {
  const errors = [];
  const warnings = [];
  const add = (list, msg) => list.length < 50 && list.push(msg);
  if (!obj || typeof obj !== 'object' || obj.app !== 'sporcoach' || !obj.data || typeof obj.data !== 'object') {
    return { ok: false, errors: ['Bu dosya bir Pro Coach yedeği değil.'], warnings, stats: {} };
  }
  const fmt = obj.backup_format_version == null ? 1 : obj.backup_format_version;
  if (!SUPPORTED_BACKUP_FORMATS.includes(fmt)) errors.push(`Bu yedek uygulamanın daha yeni bir sürümüyle alınmış (biçim ${fmt}). Önce uygulamayı güncelle.`);
  if (obj.schema_version != null && obj.schema_version > SCHEMA_VERSION) errors.push('Bu yedek daha yeni bir veri şemasıyla alınmış. Önce uygulamayı güncelle.');
  const stats = {};
  const ids = {};
  for (const [store, rows] of Object.entries(obj.data)) {
    if (!STORES.includes(store)) {
      add(warnings, `Tanınmayan bölüm atlanacak: ${store}`);
      continue;
    }
    if (!Array.isArray(rows)) {
      add(errors, `${store}: liste bekleniyordu.`);
      continue;
    }
    const seen = new Set();
    stats[store] = rows.length;
    rows.forEach((r, i) => {
      const where = `${store} #${i + 1}`;
      if (!r || typeof r !== 'object' || Array.isArray(r)) return add(errors, `${where}: geçersiz kayıt.`);
      if (r.id == null || r.id === '' || (typeof r.id !== 'string' && typeof r.id !== 'number')) return add(errors, `${where}: kimlik (id) eksik veya geçersiz.`);
      if (seen.has(r.id)) add(errors, `${where}: aynı kimlik iki kez var (${String(r.id).slice(0, 40)}).`);
      seen.add(r.id);
      if (store === 'settings') return; // ayar değerleri serbest biçimli
      for (const f of DATE_FIELDS) if (r[f] != null && r[f] !== '' && !validDate(r[f])) add(errors, `${where}: geçersiz tarih (${f}: ${String(r[f]).slice(0, 20)}).`);
      for (const f of ['created_at', 'updated_at', 'deleted_at']) if (r[f] != null && (typeof r[f] !== 'string' || isNaN(Date.parse(r[f])))) add(errors, `${where}: geçersiz zaman (${f}).`);
      for (const f of NUM_FIELDS) if (f in r && !isNumLike(r[f])) add(errors, `${where}: ${f} sayı olmalı.`);
      if (store === 'progress_photos') {
        if (!validImage(r.image)) add(errors, `${where}: fotoğraf verisi bozuk.`);
        if (r.thumb != null && !validImage(r.thumb)) add(errors, `${where}: küçük fotoğraf bozuk.`);
      }
    });
    ids[store] = seen;
  }
  for (const [store, field, target] of RELATIONS) {
    const rows = obj.data[store];
    if (!Array.isArray(rows) || !ids[target]) continue;
    const orphans = rows.filter((r) => r && r[field] != null && !r.deleted_at && !ids[target].has(r[field])).length;
    if (orphans) add(warnings, `${store}: ${orphans} kayıt silinmiş bir ${target} kaydına bağlı.`);
  }
  return { ok: errors.length === 0, errors, warnings, stats, format: fmt, photosIncluded: Array.isArray(obj.data.progress_photos) };
}

// JSON metnini güvenle çöz
export function parseBackupText(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new StorageError('STORAGE_READ_FAILED', 'Yedek dosyası bozuk (JSON okunamadı).');
  }
}

// Geri yükleme: doğrulama → tek readwrite işlem (tüm ilgili depolar). İşlem başarısız olursa eski verilerin tamamı korunur.
// keepPhotos: yedekte fotoğraf yoksa telefondaki mevcut fotoğraflar korunsun mu (varsayılan: evet)
export async function importAll(obj, { keepPhotos = true } = {}) {
  const v = validateBackup(obj);
  if (!v.ok) {
    const err = new Error(v.errors[0] + (v.errors.length > 1 ? ` (+${v.errors.length - 1} sorun daha)` : ''));
    err.validation = v;
    throw err;
  }
  // gizli ayarlar (API anahtarı, PIN, bulut anahtarları) yedekte yok; telefondakiler korunur
  const db = await openIDB();
  const secretRows = (await tx(db, 'settings', 'readonly', (t, os) => reqP(os.getAll()))).filter((r) => SECRET_SETTINGS.includes(r.id));
  const targets = STORES.filter((s) => Array.isArray(obj.data[s]) || (s === 'progress_photos' && !keepPhotos));
  await tx(db, targets, 'readwrite', (t) => {
    // Bu fonksiyonun içinde await yok: tüm istekler aynı işlemde sıraya girer, işlem kendiliğinden kapanmaz
    for (const s of targets) {
      const os = t.objectStore(s);
      os.clear();
      const rows = obj.data[s];
      if (Array.isArray(rows)) for (const r of rows) if (!(s === 'settings' && SECRET_SETTINGS.includes(r.id))) os.put(r);
      if (s === 'settings') for (const r of secretRows) os.put(r);
    }
  });
  await migrate();
  return v;
}

export async function wipeAll() {
  const db = await openIDB();
  await tx(db, STORES, 'readwrite', (t) => {
    for (const s of STORES) t.objectStore(s).clear();
  });
}

// ---------- Şema geçişleri ----------
export async function migrate() {
  const v = await getSetting('schema_version', 0);
  if (v < 1) {
    // ilk sürüm: yapılacak bir şey yok
  }
  if (v !== SCHEMA_VERSION) await setSetting('schema_version', SCHEMA_VERSION);
}

// Uygulama açılışında veritabanı erişimini doğrular: açar, okur ve küçük bir yazma dener.
// Başarısızsa StorageError fırlatır; uygulama bu durumda normal ekranları açmaz.
export async function init() {
  await openIDB();
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {}
  await get('settings', 'onboarded');
  await put('settings', { id: '_health', value: Date.now() });
  await migrate();
}
