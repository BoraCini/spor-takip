// Open Food Facts verisinden Türkiye'de satılan paketli ürünlerin kompakt listesini üretir.
// Kaynak: OFF'un resmi CSV dökümü (toplu veri için önerilen yol; API taranmaz). Lisans: ODbL.
// Çıktı: public/data/off_tr.json — { v, generated, source, license, count, fields, items: [[...], ...] }
// Kullanım: node scripts/build-off-tr.mjs [--input dosya.csv(.gz)] [--out public/data/off_tr.json]
//   --input verilmezse döküm indirilir. Döküm sekmeyle ayrılmış (TSV) ve gzip'lidir.
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { dirname } from 'node:path';

const DUMP_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const OUT = args.out || 'public/data/off_tr.json';
const MIN_COUNT = Number(args.min || 500); // bundan azsa döküm bozuk sayılır, dosya yazılmaz
const MAX_DROP = 0.4; // önceki listeye göre %40'tan fazla düşüş: yazılmaz

export const FIELDS = ['code', 'name', 'brand', 'k', 'p', 'c', 'f', 'fb', 'na', 'ka', 'ml', 'serving', 'pack'];

const num = (x) => {
  if (x == null || x === '') return null;
  const n = Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Tamamı büyük harfle yazılmış adları okunur hâle getir (Türkçe kurallarıyla)
export function tidyName(s) {
  let t = clean(s).replace(/^[-–•*.,\s]+|[-–•*,\s]+$/g, '');
  if (/[A-ZÇĞİÖŞÜ]/.test(t) && !/[a-zçğıöşü]/.test(t)) {
    t = t
      .toLocaleLowerCase('tr')
      .split(' ')
      .map((w) => (w ? w[0].toLocaleUpperCase('tr') + w.slice(1) : w))
      .join(' ');
  }
  return t;
}

// "500 g", "1 L", "330 ml", "2 x 200 ml" → { amount, ml }
export function parseQuantity(q) {
  const s = clean(q).toLowerCase().replace(',', '.');
  if (!s || /\d\s*[x×*]\s*\d/.test(s)) return null; // çoklu paketler belirsiz
  const m = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|mg|l|lt|cl|ml)\b/);
  if (!m) return null;
  const v = Number(m[1]);
  const u = m[2];
  const g = { kg: v * 1000, g: v, gr: v, mg: v / 1000, l: v * 1000, lt: v * 1000, cl: v * 10, ml: v }[u];
  return { amount: g, ml: ['l', 'lt', 'cl', 'ml'].includes(u) };
}

// Tek ürün satırını (sütun adı → değer) uygulama kaydına çevirir; uygun değilse null
export function toItem(row) {
  const code = clean(row.code);
  if (!/^\d{8,14}$/.test(code)) return null;
  if (!String(row.countries_tags || '').split(',').includes('en:turkey')) return null;
  let name = tidyName(row.product_name || row.generic_name);
  if (!name || name.length < 2 || name.length > 90) return null;
  const brand = tidyName(String(row.brands || '').split(',')[0]);
  const k = num(row['energy-kcal_100g']) ?? (num(row['energy_100g']) != null ? num(row['energy_100g']) / 4.184 : null);
  const p = num(row.proteins_100g);
  const c = num(row.carbohydrates_100g);
  const f = num(row.fat_100g);
  if ([k, p, c, f].some((x) => x == null)) return null; // makrolar eksikse alınmaz (sıfır kabul edilmez)
  if (k < 0 || k > 900 || [p, c, f].some((x) => x < 0 || x > 100) || p + c + f > 105) return null;
  const fb = num(row.fiber_100g);
  // tutarlılık: makrolardan hesaplanan enerji etiketteki kaloriyle çok farklıysa veri hatalıdır
  const calc = 4 * p + 4 * c + 9 * f + (fb ? 2 * fb : 0);
  if (Math.abs(calc - k) > Math.max(40, 0.3 * k)) return null;
  const sodiumG = num(row.sodium_100g) ?? (num(row.salt_100g) != null ? num(row.salt_100g) / 2.5 : null);
  const na = sodiumG == null || sodiumG < 0 || sodiumG > 40 ? null : Math.round(sodiumG * 1000);
  const kaG = num(row.potassium_100g);
  const ka = kaG == null || kaG < 0 || kaG > 10 ? null : Math.round(kaG * 1000);
  const qty = parseQuantity(row.quantity);
  const sq = num(row.serving_quantity);
  const serving = sq && sq >= 1 && sq <= 1000 ? r1(sq) : 0;
  const pack = qty && qty.amount >= 5 && qty.amount <= 3000 ? r1(qty.amount) : 0;
  if (brand && !name.toLocaleLowerCase('tr').includes(brand.toLocaleLowerCase('tr'))) name = `${brand} ${name}`;
  return [code, name, brand, Math.round(k), r1(p), r1(c), r1(f), fb == null || fb < 0 || fb > 100 ? null : r1(fb), na, ka, qty && qty.ml ? 1 : 0, serving, pack];
}

async function* lines(input) {
  let stream;
  if (input) stream = createReadStream(input);
  else {
    const res = await fetch(DUMP_URL, { headers: { 'User-Agent': 'ProCoach-data-builder/1.0 (github.com/BoraCini/spor-takip)' } });
    if (!res.ok) throw new Error(`Döküm indirilemedi: HTTP ${res.status}`);
    stream = Readable.fromWeb(res.body);
  }
  if (!input || input.endsWith('.gz')) stream = stream.pipe(createGunzip());
  yield* createInterface({ input: stream, crlfDelay: Infinity });
}

export async function build({ input = null } = {}) {
  let header = null;
  let idx = null;
  const byCode = new Map();
  let seen = 0;
  for await (const line of lines(input)) {
    if (!header) {
      header = line.split('\t');
      idx = Object.fromEntries(header.map((h, i) => [h, i]));
      for (const need of ['code', 'product_name', 'brands', 'countries_tags', 'energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g']) {
        if (!(need in idx)) throw new Error(`Döküm biçimi değişmiş: "${need}" sütunu yok`);
      }
      continue;
    }
    if (!line.includes('en:turkey')) continue; // hızlı ön süzgeç
    seen++;
    const cols = line.split('\t');
    const row = {};
    for (const k of ['code', 'product_name', 'generic_name', 'brands', 'countries_tags', 'quantity', 'serving_quantity', 'energy-kcal_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'sodium_100g', 'salt_100g', 'potassium_100g', 'last_modified_t']) {
      if (k in idx) row[k] = cols[idx[k]];
    }
    const it = toItem(row);
    if (!it) continue;
    const prev = byCode.get(it[0]);
    if (!prev || Number(row.last_modified_t || 0) >= prev.t) byCode.set(it[0], { it, t: Number(row.last_modified_t || 0) });
  }
  const items = [...byCode.values()].map((x) => x.it).sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  return { items, seen };
}

async function main() {
  const { items, seen } = await build({ input: args.input || null });
  console.log(`Türkiye satırı: ${seen}, uygun ürün: ${items.length}`);
  if (items.length < MIN_COUNT) throw new Error(`Çok az ürün (${items.length} < ${MIN_COUNT}); dosya yazılmadı`);
  if (existsSync(OUT)) {
    const old = JSON.parse(readFileSync(OUT, 'utf8'));
    if (old.count && items.length < old.count * (1 - MAX_DROP)) throw new Error(`Ürün sayısı ${old.count} → ${items.length}; ani düşüş, dosya yazılmadı`);
    if (JSON.stringify(old.items) === JSON.stringify(items)) {
      console.log('Ürünler değişmedi; dosyaya dokunulmadı');
      return;
    }
  }
  const out = {
    v: 1,
    generated: new Date().toISOString().slice(0, 10),
    source: 'Open Food Facts (openfoodfacts.org), Türkiye\'de satılan ürünler',
    license: 'ODbL 1.0 (veri), DbCL 1.0 (içerik)',
    count: items.length,
    fields: FIELDS,
    items,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`${OUT} yazıldı (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
