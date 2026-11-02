// Öğün şablonları — saf fonksiyonlar (arayüzden bağımsız, test edilebilir).
// Şablon meal_templates deposunda durur: { id, name, meal, items[], favorite, use_count, last_used, note }
// Kalem: { food_id, name, grams, unit, qty, base, snap{k,p,c,f,fb,na,ka} }  (snap: kayıt anındaki 100 g değerleri)
//    ya da gramsız sabit değerli kalem (hızlı kalori, yapay zekâ tahmini): { food_id:null, name, fixed{kcal,protein_g,…} }
// Uygulanırken güncel besin bulunursa onun değerleri, bulunamazsa kayıtlı anlık görüntü kullanılır (sıfır kabul edilmez).
import { findFood, nutrientsFor } from './data/foods.js';

export const MAX_TEMPLATE_NAME = 60;
export const MAX_TEMPLATE_ITEMS = 40;
export const FACTOR_MIN = 0.1;
export const FACTOR_MAX = 10;
export const TEMPLATE_SORTS = [
  ['son', 'Son kullanılan'],
  ['sik', 'En çok kullanılan'],
  ['ad', 'Ada göre'],
];

const num = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));
const KEYS = ['k', 'p', 'c', 'f', 'fb', 'na', 'ka'];
const FIXED = ['kcal', 'protein_g', 'carb_g', 'fat_g', 'fiber_g', 'sodium_mg', 'potassium_mg'];
const LOG_TO_SNAP = { k: 'kcal', p: 'protein_g', c: 'carb_g', f: 'fat_g', fb: 'fiber_g', na: 'sodium_mg', ka: 'potassium_mg' };
const clean = (n) => String(n || '').replace(/\s*~$/, '');

// Günlük kaydından şablon kalemi. Kalem, kaydın kendi değerlerini (anlık görüntü) taşır.
export function itemFromLog(log) {
  const g = num(log.grams);
  const base = { food_id: log.food_id || null, name: clean(log.name) || 'Besin', ...(log.base === 'ml' ? { base: 'ml' } : {}), ...(log.estimated ? { estimated: true } : {}) };
  if (g && g > 0) {
    const snap = {};
    for (const k of KEYS) {
      const v = num(log[LOG_TO_SNAP[k]]);
      snap[k] = v == null ? null : (v * 100) / g;
    }
    return { ...base, grams: g, unit: log.unit || 'gram', qty: num(log.qty) ?? g, snap };
  }
  const fixed = {};
  for (const k of FIXED) fixed[k] = num(log[k]);
  return { ...base, grams: null, unit: null, qty: null, fixed };
}

// Besin listesinden (ekleme ekranındaki gibi) şablon kalemi
export function itemFromFood(food, { grams, unit = 'gram', qty = null }) {
  const snap = {};
  for (const k of KEYS) snap[k] = num(food[k]);
  return { food_id: food.id, name: clean(food.name), grams, unit, qty: qty ?? grams, ...(food.base === 'ml' ? { base: 'ml' } : {}), snap };
}

export function templateFromLogs(logs, { name, meal, note = '' } = {}) {
  return {
    name: String(name || '').trim(),
    meal: meal || null,
    note,
    items: (logs || []).filter((l) => l && !l.deleted_at).map(itemFromLog),
    favorite: false,
    use_count: 0,
    last_used: null,
  };
}

export function validateTemplate(t) {
  const n = String((t && t.name) || '').trim();
  if (!n) return 'Şablona bir ad ver.';
  if (n.length > MAX_TEMPLATE_NAME) return `Şablon adı en fazla ${MAX_TEMPLATE_NAME} karakter olabilir.`;
  const items = (t && t.items) || [];
  if (!items.length) return 'Şablonda en az bir besin olmalı.';
  if (items.length > MAX_TEMPLATE_ITEMS) return `Bir şablonda en fazla ${MAX_TEMPLATE_ITEMS} besin olabilir.`;
  for (const it of items) {
    if (it.fixed) {
      if (num(it.fixed.kcal) == null) return `"${it.name}" için kalori bilinmiyor.`;
    } else if (!(num(it.grams) > 0)) return `"${it.name}" için sıfırdan büyük bir miktar gir.`;
  }
  return null;
}

export function validFactor(f) {
  const x = num(f);
  return x != null && x >= FACTOR_MIN && x <= FACTOR_MAX;
}

// Kalemin uygulanacağı değer kaynağı: ok = güncel besin, snapshot = kayıtlı değer (besin silinmiş), fixed = sabit değer, missing = hesaplanamaz
export function resolveTemplateItem(item, pool = []) {
  if (item.fixed) return { ...item, food: null, status: num(item.fixed.kcal) == null ? 'missing' : 'fixed' };
  const food = item.food_id ? findFood(item.food_id, pool) : null;
  if (food) return { ...item, food, status: 'ok' };
  if (item.snap && num(item.snap.k) != null) return { ...item, food: null, status: 'snapshot' };
  return { ...item, food: null, status: 'missing' };
}

const r1 = (x) => Math.round(x * 100) / 100;

// Tek kalemin çarpanla besin değerleri ve miktarı
export function itemNutrition(resolved, factor = 1) {
  const st = resolved.status;
  if (st === 'missing') return null;
  if (st === 'fixed') {
    const out = { grams: null, unit: null, qty: null };
    for (const k of FIXED) {
      const v = num(resolved.fixed[k]);
      out[k] = v == null ? null : k === 'kcal' || k === 'sodium_mg' || k === 'potassium_mg' ? Math.round(v * factor) : Math.round(v * factor * 10) / 10;
    }
    return out;
  }
  const grams = r1(num(resolved.grams) * factor);
  const src = st === 'ok' ? resolved.food : resolved.snap;
  const unit = resolved.unit || 'gram';
  const qty = unit === 'gram' ? grams : r1((num(resolved.qty) ?? num(resolved.grams)) * factor);
  return { grams, unit, qty, ...nutrientsFor(src, grams) };
}

// Toplamlar. Bilinmeyen değer (lif/sodyum/potasyum) bir kalemde yoksa toplam da bilinmiyor (null).
export function templateTotals(items, pool = [], factor = 1) {
  const t = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, potassium_mg: 0 };
  const unknown = new Set();
  const missing = [];
  const fallback = [];
  for (const it of items || []) {
    const r = resolveTemplateItem(it, pool);
    if (r.status === 'snapshot') fallback.push(r.name);
    const n = itemNutrition(r, factor);
    if (!n) {
      missing.push(r.name);
      continue;
    }
    for (const k of FIXED) {
      if (n[k] == null) unknown.add(k);
      else t[k] += n[k];
    }
  }
  for (const k of Object.keys(t)) t[k] = unknown.has(k) ? null : Math.round(t[k] * 10) / 10;
  t.kcal = t.kcal == null ? null : Math.round(t.kcal);
  return { totals: t, missing, fallback };
}

// Şablonu günlük kayıtlarına çevir (yazma işini çağıran yapar; tek işlemde putAtomic ile)
export function applyTemplate(tpl, { pool = [], date, meal, factor = 1, selected = null } = {}) {
  const records = [];
  const missing = [];
  const fallback = [];
  (tpl.items || []).forEach((it, i) => {
    if (selected && !selected.has(i)) return;
    const r = resolveTemplateItem(it, pool);
    const n = itemNutrition(r, factor);
    if (!n) {
      missing.push(r.name);
      return;
    }
    if (r.status === 'snapshot') fallback.push(r.name);
    const name = r.status === 'ok' ? clean(r.food.name) : r.name;
    records.push({
      date,
      meal,
      food_id: r.status === 'fixed' ? null : r.food_id || null,
      name,
      grams: n.grams,
      unit: n.unit,
      qty: n.qty,
      ...(it.base === 'ml' || (r.food && r.food.base === 'ml') ? { base: 'ml' } : {}),
      estimated: !!it.estimated,
      source: 'sablon',
      template_id: tpl.id || null,
      kcal: n.kcal,
      protein_g: n.protein_g,
      carb_g: n.carb_g,
      fat_g: n.fat_g,
      fiber_g: n.fiber_g,
      sodium_mg: n.sodium_mg,
      potassium_mg: n.potassium_mg,
    });
  });
  return { records, missing, fallback };
}

// Uygulandıktan sonra kullanım bilgisi
export function markUsed(tpl, now = new Date().toISOString()) {
  return { ...tpl, use_count: (num(tpl.use_count) || 0) + 1, last_used: now };
}

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .trim();

export function searchTemplates(list, q) {
  const n = norm(q);
  if (!n) return list;
  return list.filter((t) => norm(t.name).includes(n) || (t.items || []).some((it) => norm(it.name).includes(n)));
}

// Favoriler her zaman üstte; sonra seçilen sıralama
export function sortTemplates(list, mode = 'son') {
  const by = {
    son: (a, b) => (b.last_used || b.updated_at || '').localeCompare(a.last_used || a.updated_at || ''),
    sik: (a, b) => (num(b.use_count) || 0) - (num(a.use_count) || 0),
    ad: (a, b) => a.name.localeCompare(b.name, 'tr'),
  }[mode] || (() => 0);
  return [...list].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || by(a, b) || a.name.localeCompare(b.name, 'tr'));
}

// Kopya: kullanım bilgisi sıfırlanır, kimlik yeni olur
export function copyTemplate(tpl) {
  const { id: _i, created_at: _c, updated_at: _u, deleted_at: _d, user_id: _x, ...rest } = tpl;
  return { ...rest, name: `${tpl.name} (kopya)`.slice(0, MAX_TEMPLATE_NAME), favorite: false, use_count: 0, last_used: null, items: (tpl.items || []).map((x) => ({ ...x })) };
}
