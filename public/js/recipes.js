// Tarif hesapları — saf fonksiyonlar (arayüzden bağımsız, test edilebilir).
// Tarif custom_foods deposunda normal bir besin olarak durur; ayrıntılar `recipe` alanındadır.
// Hesaplar her zaman gram üzerinden yapılır; kullanıcıya adet/kaşık gibi ölçüler gösterilebilir.
import { findFood, portionsOf } from './data/foods.js';

export const RECIPE_CATEGORIES = [
  ['kahvalti', 'Kahvaltı'],
  ['ana', 'Ana yemek'],
  ['ogle', 'Öğle yemeği'],
  ['aksam', 'Akşam yemeği'],
  ['ara', 'Ara öğün'],
  ['atistirmalik', 'Atıştırmalık'],
  ['tatli', 'Tatlı'],
  ['icecek', 'İçecek'],
  ['salata', 'Salata'],
  ['corba', 'Çorba'],
  ['diger', 'Diğer'],
];
export const RECIPE_CAT_LABEL = Object.fromEntries(RECIPE_CATEGORIES);
// Kullanıcının atadığı tanımlayıcı etiketler; uygulama bunları otomatik vermez, garanti olarak sunmaz
export const RECIPE_TAGS = ['Yüksek protein', 'Düşük kalorili', 'Düşük karbonhidrat', 'Yüksek lif', 'Vejetaryen', 'Vegan', 'Glutensiz'];

const KEYS = ['k', 'p', 'c', 'f', 'fb', 'na', 'ka'];
const OPTIONAL = ['fb', 'na', 'ka'];
const num = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));

// Malzemenin 100 g değerleri: güncel besin varsa o, yoksa kayıtlı anlık görüntü (snap), o da yoksa bilinmiyor
export function snapOf(food) {
  return Object.fromEntries(KEYS.map((k) => [k, num(food[k])]));
}
export function resolveItem(item, pool = []) {
  const food = item.food_id ? findFood(item.food_id, pool) : null;
  if (food) return { ...item, food, per100: snapOf(food), status: 'ok' };
  if (item.snap && num(item.snap.k) != null) return { ...item, food: null, per100: { ...item.snap }, status: 'snapshot' };
  return { ...item, food: null, per100: null, status: 'missing' };
}

// Toplamlar. Bilinmeyen malzeme varsa sonuç "eksik"tir (sıfır kabul edilmez).
// Lif/sodyum/potasyum bir malzemede bilinmiyorsa o değerin toplamı da bilinmiyor (null) sayılır.
export function recipeTotals(items) {
  const t = { g: 0, k: 0, p: 0, c: 0, f: 0, fb: 0, na: 0, ka: 0 };
  const unknownOpt = new Set();
  const missing = [];
  for (const it of items) {
    const g = num(it.grams) || 0;
    t.g += g;
    if (!it.per100) {
      missing.push(it.name || 'Malzeme');
      continue;
    }
    for (const k of KEYS) {
      const v = num(it.per100[k]);
      if (v == null) {
        if (OPTIONAL.includes(k)) unknownOpt.add(k);
        continue;
      }
      t[k] += (v * g) / 100;
    }
  }
  for (const k of unknownOpt) t[k] = null;
  return { totals: t, missing, complete: missing.length === 0 };
}

// Hesap ağırlığı: pişmiş son ağırlık girildiyse o, yoksa çiğ malzemelerin toplamı
export function basisWeight(rawGrams, cooked) {
  const c = num(cooked);
  return c && c > 0 ? { grams: c, cooked: true } : { grams: rawGrams, cooked: false };
}

// Tarifin kaydedilecek besin alanları (100 g değerleri ve porsiyon)
export function recipeNutrition(totals, servings, cooked) {
  const basis = basisWeight(totals.g, cooked);
  const b = basis.grams || 0;
  const per = (x, d = 10) => (x == null || !b ? null : Math.round(((x / b) * 100) * d) / d);
  const sv = servings > 0 ? servings : 1;
  return {
    k: b ? Math.round((totals.k / b) * 100) : 0,
    p: per(totals.p) ?? 0,
    c: per(totals.c) ?? 0,
    f: per(totals.f) ?? 0,
    fb: per(totals.fb),
    na: per(totals.na, 1),
    ka: per(totals.ka, 1),
    portion_g: Math.round((b / sv) * 10) / 10,
    basis,
  };
}

// Porsiyon sayısı değişince malzemeleri ölçekle (miktar ve gram birlikte)
export function scaleItems(items, factor) {
  if (!(factor > 0) || !isFinite(factor)) return items;
  const r1 = (x) => Math.round(x * 100) / 100;
  return items.map((it) => ({ ...it, grams: r1((num(it.grams) || 0) * factor), qty: it.qty != null ? r1(Number(it.qty) * factor) : it.qty }));
}

// Malzeme miktarı → gram (besine özel porsiyon karşılığıyla)
export function itemGrams(food, unit, qty) {
  const q = num(qty);
  if (q == null || q <= 0) return null;
  if (!unit || unit === 'gram') return q;
  const p = food ? portionsOf(food).find((x) => x[0] === unit) : null;
  return p ? Math.round(q * p[1] * 10) / 10 : null;
}

// Eski tarifler: yalnızca servings ve items {food_id, name, grams} olabilir. Eksik alanlar güvenli varsayılanlarla doldurulur.
export function normalizeRecipe(food) {
  const r = (food && food.recipe) || {};
  return {
    servings: num(r.servings) > 0 ? num(r.servings) : 1,
    items: Array.isArray(r.items) ? r.items.filter((x) => x && (x.food_id || x.name)) : [],
    cooked_weight: num(r.cooked_weight),
    category: r.category || 'diger',
    description: r.description || '',
    prep_min: num(r.prep_min),
    cook_min: num(r.cook_min),
    tags: Array.isArray(r.tags) ? r.tags : [],
    steps: Array.isArray(r.steps) ? r.steps.filter((x) => typeof x === 'string' && x.trim()) : [],
  };
}
