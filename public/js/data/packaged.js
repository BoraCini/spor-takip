// Türkiye'de satılan paketli ürünler (Open Food Facts, ODbL). Liste haftalık güncellenir: public/data/off_tr.json
// Dosya ilk aramada indirilir; service worker sonrasında çevrimdışı da sunar. Yüklenemezse uygulama listesiz çalışır.
import { registerExtraFoods } from './foods.js';

export const PACKAGED_URL = 'data/off_tr.json';
export const PACKAGED_ATTRIBUTION = 'Paketli ürünler: Open Food Facts (gönüllülerin girdiği açık veritabanı, ODbL). Değerleri paketle karşılaştır.';

let loading = null;
let list = null;
let byCode = null;
let failedAt = 0;
const RETRY_MS = 60_000;

// Kompakt satır → besin nesnesi (100 g / 100 ml değerleri)
export function fromRow(row, fields) {
  const o = Object.fromEntries(fields.map((k, i) => [k, row[i]]));
  if (!o.code || !o.name || o.k == null) return null;
  // ayırt edici olmayan kayıtlar (yalnızca marka adı ya da markasız tek kelime) gösterilmez
  const n = String(o.name).toLocaleLowerCase('tr').trim();
  const b = String(o.brand || '').toLocaleLowerCase('tr').trim();
  if ((b && n === b) || (!b && n.split(/\s+/).length < 2)) return null;
  const portions = [];
  if (o.serving > 0) portions.push(['porsiyon', o.serving]);
  if (o.pack > 0 && o.pack !== o.serving) portions.push(['paket', o.pack]);
  return {
    id: `o_${o.code}`,
    name: o.name,
    alias: `${o.brand || ''} paketli`.trim(),
    brand: o.brand || '',
    barcode: o.code,
    k: o.k,
    p: o.p,
    c: o.c,
    f: o.f,
    fb: o.fb ?? null,
    na: o.na ?? null,
    ka: o.ka ?? null,
    ...(o.ml ? { base: 'ml' } : {}),
    portions,
    default_portion: portions.length ? portions[0][0] : undefined,
    src: 'off',
    packaged: true,
  };
}

export function parsePackaged(data) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.fields)) return [];
  const out = [];
  for (const r of data.items) {
    const f = Array.isArray(r) ? fromRow(r, data.fields) : null;
    if (f) out.push(f);
  }
  return out;
}

export let packagedMeta = null;

function setList(arr, meta = null) {
  list = arr;
  byCode = new Map(arr.map((f) => [f.barcode, f]));
  registerExtraFoods(arr);
  packagedMeta = meta;
}

// Listeyi yükle (bir kez). Hata olursa boş liste döner, bir dakika sonra yeniden denenir.
export function loadPackaged({ fetcher = (u) => fetch(u) } = {}) {
  if (list) return Promise.resolve(list);
  if (loading) return loading;
  if (failedAt && Date.now() - failedAt < RETRY_MS) return Promise.resolve([]);
  loading = (async () => {
    try {
      const res = await fetcher(PACKAGED_URL);
      if (!res || !res.ok) throw new Error(String(res && res.status));
      const data = await res.json();
      const arr = parsePackaged(data);
      setList(arr, { generated: data.generated, count: arr.length });
      return arr;
    } catch {
      failedAt = Date.now();
      return [];
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export const packagedLoaded = () => list || null;
export const packagedByBarcode = (code) => (byCode && byCode.get(String(code))) || null;

// Testler için
export function _resetPackaged() {
  list = null;
  byCode = null;
  loading = null;
  failedAt = 0;
  packagedMeta = null;
  registerExtraFoods([]);
}
