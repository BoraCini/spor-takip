// Yazılı/sesli öğün cümlesini yapay zekâ olmadan çözümler.
// Örn. "bugün kahvaltıda 3 yumurta 500 gr lifalif yulaf 150 ml yarım yağlı süt tükettim"
//  → öğün: kahvalti, [3 adet yumurta, 500 g yulaf, 150 ml süt]
import { searchFoods, findFood } from './data/foods.js';

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a');

const NUM_WORDS = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, onbes: 15, yirmi: 20, otuz: 30, kirk: 40, elli: 50, yuz: 100, ikiyuz: 200, ucyuz: 300, besyuz: 500, bin: 1000 };

// Birimler: [eşleşen kelime(ler), standart ad, gram karşılığı (porsiyonda yoksa)]
// Çok kelimeli birimler önce tek kelimeye çevrilir (su bardağı → su_bardagi)
const MULTI = [
  [/\bsu bardag\w*/g, 'su_bardagi'], [/\b(cay bardag\w*|ince belli)/g, 'cay_bardagi'],
  [/\byemek kasig\w*/g, 'yemek_kasigi'], [/\btatli kasig\w*/g, 'tatli_kasigi'], [/\bcay kasig\w*/g, 'cay_kasigi'],
  [/\borta boy\w*/g, 'orta_boy'], [/\bbuyuk boy\w*/g, 'buyuk_boy'], [/\bkucuk boy\w*/g, 'kucuk_boy'],
];
const UNITS = [
  [['su_bardagi'], 'su bardağı', 200],
  [['cay_bardagi'], 'çay bardağı', 100],
  [['yemek_kasigi'], 'yemek kaşığı', 15],
  [['tatli_kasigi'], 'tatlı kaşığı', 5],
  [['cay_kasigi'], 'çay kaşığı', 3],
  [['orta_boy', 'orta'], 'orta boy', null],
  [['buyuk_boy', 'buyuk'], 'büyük', null],
  [['kucuk_boy', 'kucuk'], 'küçük', null],
  [['kilogram', 'kilo', 'kg'], 'kg', 1000],
  [['gram', 'gr', 'g'], 'g', 1],
  [['mililitre', 'ml', 'cc'], 'ml', 1],
  [['litre', 'lt', 'l'], 'litre', 1000],
  [['adet', 'tane'], 'adet', null],
  [['dilim'], 'dilim', 30],
  [['bardak'], 'su bardağı', 200],
  [['kase', 'kaseye'], 'kase', 200],
  [['kasik'], 'yemek kaşığı', 15],
  [['porsiyon', 'tabak'], 'porsiyon', 150],
  [['avuc'], 'avuç', 30],
  [['kutu'], 'kutu', 200],
  [['sise'], 'şişe', 500],
  [['kupa'], 'kupa', 250],
  [['fincan'], 'fincan', 100],
  [['olcek', 'scoop'], 'ölçek', 30],
  [['paket'], 'paket', null],
  [['kare'], 'kare', 10],
  [['top'], 'top', 60],
];

const MEALS = [
  [/\b(kahvalti\w*|sabah\w*)\b/, 'kahvalti'],
  [/\b(ogle\w*|oglen\w*)\b/, 'ogle'],
  [/\b(aksam\w*)\b/, 'aksam'],
  [/\b(ara ogun\w*|atistir\w*|gece\w*|ara\b)/, 'ara'],
];

// Cümleden atılacak dolgu kelimeleri
const FILLER = new Set(
  'bugun dun yedim yedik ictim ictik tukettim tukettik aldim aldik yiyorum iciyorum yemek yedigim yediklerim ictiklerim olarak ben de da ayrica sonra once ekle ekleyin ekler misin kaydet yaninda ustune icinde ile ve arti biraz tane'.split(' ')
);
// "yemek" ve "yemegi" kelimeleri öğün adının parçası olabilir; besin adıysa (örn. ıspanak yemeği) korunsun diye sadece tek başına atılır

function isNumTok(t) {
  return /^\d+([.,]\d+)?$/.test(t) || NUM_WORDS[t] != null || t === 'yarim' || t === 'bucuk';
}

// "1,5" / "bir bucuk" / "yarim" → sayı
function readNumber(tokens, i) {
  let t = tokens[i];
  let v;
  let used = 1;
  if (/^\d+([.,]\d+)?$/.test(t)) v = parseFloat(t.replace(',', '.'));
  else if (t === 'yarim') v = 0.5;
  else v = NUM_WORDS[t];
  // "iki yüz", "bir buçuk"
  if (tokens[i + 1] === 'yuz' && v < 10) {
    v *= 100;
    used++;
  }
  if (tokens[i + used] === 'bucuk') {
    v += 0.5;
    used++;
  }
  return { v, used };
}

function readUnit(tokens, i) {
  for (const [keys, name, g] of UNITS) {
    for (const k of keys) {
      const parts = k.split(' ');
      if (parts.every((p, j) => tokens[i + j] === p || (j === parts.length - 1 && tokens[i + j] && tokens[i + j].startsWith(p) && p.length >= 4))) {
        return { name, g, used: parts.length };
      }
    }
  }
  return null;
}

// Besin için gram hesabı
export function gramsFor(food, qty, unit) {
  const q = qty == null ? 1 : qty;
  const portions = food.portions || [];
  const find = (re) => portions.find((p) => re.test(norm(p[0])));
  if (unit && unit.g === 1) return { grams: q, unit: 'gram', qty: q };
  if (unit && (unit.name === 'kg' || unit.name === 'litre')) return { grams: q * 1000, unit: 'gram', qty: q * 1000 };
  if (unit) {
    const key = norm(unit.name).split(' ')[0];
    const p = find(new RegExp(key)) || (unit.name === 'adet' ? find(/adet|orta|tane/) || portions[0] : null);
    if (p) return { grams: Math.round(p[1] * q * 10) / 10, unit: p[0], qty: q };
    if (unit.g) return { grams: unit.g * q, unit: 'gram', qty: unit.g * q, approx: true };
  }
  // Birim yok: küçük sayı → adet/porsiyon, büyük sayı → gram
  if (qty != null && qty >= 20 && !portions.some((p) => /adet/.test(p[0]))) return { grams: q, unit: 'gram', qty: q };
  const p = find(/adet|orta/) || portions[0];
  if (p) return { grams: Math.round(p[1] * q * 10) / 10, unit: p[0], qty: q };
  return { grams: 100 * q, unit: 'gram', qty: 100 * q, approx: true };
}

// Metindeki kelimelerin ne kadarı besin adında geçiyor
function coverage(text, food) {
  const words = norm(text).split(' ').filter((w) => w.length > 1);
  if (!words.length) return 0;
  const hay = norm(`${food.name} ${food.alias || ''}`).replace(/[^a-z0-9 ]/g, ' ');
  const hw = hay.split(/\s+/);
  let hit = 0;
  for (const w of words) if (hw.some((h) => h.startsWith(w) || (w.length >= 5 && w.startsWith(h) && h.length >= 4))) hit++;
  return hit / words.length;
}

export function parseMealText(text, custom = [], usage = null, aliases = {}) {
  let s = norm(text)
    .replace(/(\d)\s*(gr|g|ml|kg|lt|cc)\b/g, '$1 $2')
    .replace(/[;:!?]/g, ' , ')
    .replace(/,(?!\d)/g, ' , ')
    .replace(/\.(?!\d)/g, ' , ')
    .replace(/\s+/g, ' ')
    .trim();
  // öğün ve gün
  let meal = null;
  let dayOffset = 0;
  if (/\bdun\b/.test(s)) dayOffset = -1;
  for (const [re, m] of MEALS) {
    if (re.test(s)) {
      meal = m;
      s = s.replace(re, ' ');
      break;
    }
  }
  for (const [re, v] of MULTI) s = s.replace(re, v);
  s = s.replace(/\b(ve|ile|arti|bir de|ayrica|sonra da|sonra)\b/g, ' , ');
  s = s.replace(/\bbir de\b/g, ' ').replace(/\b(yemeginde|yemeginden)\b/g, ' ').replace(/\s+/g, ' ');
  // "yarım yağlı", "tam yağlı" besin tarifidir, miktar değil
  s = s.replace(/\byarim yagli\b/g, 'yarimyagli').replace(/\btam yagli\b/g, 'tamyagli').replace(/\baz yagli\b/g, 'azyagli');
  const raw = s.split(' ').filter(Boolean);
  const tokens = raw.filter((t) => !FILLER.has(t) && !(t === 'yemek' || t === 'yemegi' || t === 'ogunu' || t === 'ogun'));

  // Parçalara böl: virgül/ve ile, ya da besin kelimesinden sonra gelen yeni bir sayıyla
  const segs = [];
  let cur = [];
  const hasWord = (arr) => arr.some((t) => !isNumTok(t) && !readUnit([t], 0) && t !== ',');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === ',') {
      if (cur.length) segs.push(cur);
      cur = [];
      continue;
    }
    if (isNumTok(t) && t !== 'bucuk' && hasWord(cur)) {
      segs.push(cur);
      cur = [];
    }
    cur.push(t);
  }
  if (cur.length) segs.push(cur);
  // "yoğurt 200 gr" gibi miktarı sonra söylenen besinler: sadece miktardan oluşan parçayı öncekine bağla
  const onlyQty = (seg) => seg.length && !hasWord(seg);
  const hasNum = (seg) => seg.some((t) => isNumTok(t));
  for (let i = segs.length - 1; i > 0; i--) {
    if (onlyQty(segs[i]) && hasWord(segs[i - 1]) && !hasNum(segs[i - 1])) {
      segs[i - 1] = [...segs[i], ...segs[i - 1]];
      segs.splice(i, 1);
    }
  }

  const items = [];
  for (const seg of segs) {
    let qty = null;
    let unit = null;
    const words = [];
    for (let i = 0; i < seg.length; ) {
      if (qty == null && isNumTok(seg[i]) && seg[i] !== 'bucuk') {
        const n = readNumber(seg, i);
        qty = n.v;
        i += n.used;
        const u = readUnit(seg, i);
        if (u) {
          unit = u;
          i += u.used;
        }
        continue;
      }
      if (!unit) {
        const u = readUnit(seg, i);
        // birim kelimesi besin adının başındaysa (örn. "kase yoğurt") birim say
        if (u && !(u.name === 'g' && seg[i] === 'g') && (qty != null || i === 0)) {
          unit = u;
          i += u.used;
          continue;
        }
      }
      words.push(seg[i]);
      i++;
    }
    const foodText = words
      .join(' ')
      .replace(/yarimyagli/g, 'yarim yagli')
      .replace(/tamyagli/g, 'tam yagli')
      .replace(/azyagli/g, 'az yagli')
      .trim();
    if (!foodText || foodText.length < 2) continue;
    // Daha önce kullanıcının düzelttiği eşleşme varsa onu kullan ("lifalif yulaf" → Eti Lifalif)
    const learned = aliases[foodText] ? findFood(aliases[foodText], custom) : null;
    const res = learned ? [learned] : searchFoods(foodText, custom, usage);
    const food = res[0] || null;
    const cov = learned ? 1 : food ? coverage(foodText, food) : 0;
    const g = food ? gramsFor(food, qty, unit) : null;
    items.push({ text: foodText, said: { qty, unit }, food, match: !food ? 'none' : cov >= 0.99 ? 'full' : 'partial', ...(g || {}) });
  }
  return { meal, dayOffset, items };
}
