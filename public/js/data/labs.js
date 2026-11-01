// Kan değeri kataloğu — yetişkin erkek için yaygın referans aralıkları.
// Laboratuvarlar farklı aralık kullanır; kullanıcı her değerde rapordaki aralığı girebilir/düzeltebilir.
// cycle: kür sırasında beklenen yön ('low' | 'high'); training: yoğun antrenmanla beklenen yön.
export const LAB_CATEGORIES = ['Kan sayımı', 'Karaciğer', 'Böbrek', 'Lipid', 'Şeker', 'Hormon', 'Tiroid', 'Vitamin / mineral', 'Diğer'];

export const LABS = [
  { key: 'hct', name: 'Hematokrit', unit: '%', lo: 40, hi: 52, cat: 'Kan sayımı', alias: 'hct hematokrit',
    note: 'Yükselmesi kanı koyulaştırır; pıhtı ve tansiyon riskini artırabilir. Kalıcı yükseklikte doktor değerlendirmesi önerilir.' },
  { key: 'hgb', name: 'Hemoglobin', unit: 'g/dL', lo: 13.5, hi: 17.5, cat: 'Kan sayımı', alias: 'hgb hb hemoglobin' },
  { key: 'rbc', name: 'Eritrosit (RBC)', unit: '10⁶/µL', lo: 4.5, hi: 5.9, cat: 'Kan sayımı', alias: 'rbc eritrosit alyuvar' },
  { key: 'wbc', name: 'Lökosit (WBC)', unit: '10³/µL', lo: 4, hi: 10, cat: 'Kan sayımı', alias: 'wbc lokosit akyuvar' },
  { key: 'mcv', name: 'MCV', unit: 'fL', lo: 80, hi: 100, cat: 'Kan sayımı', alias: 'mcv' },
  { key: 'mch', name: 'MCH', unit: 'pg', lo: 27, hi: 33, cat: 'Kan sayımı', alias: 'mch' },
  { key: 'mchc', name: 'MCHC', unit: 'g/dL', lo: 32, hi: 36, cat: 'Kan sayımı', alias: 'mchc' },
  { key: 'rdw', name: 'RDW', unit: '%', lo: 11.5, hi: 14.5, cat: 'Kan sayımı', alias: 'rdw rdw-cv' },
  { key: 'plt', name: 'Trombosit', unit: '10³/µL', lo: 150, hi: 400, cat: 'Kan sayımı', alias: 'plt trombosit' },

  { key: 'alt', name: 'ALT', unit: 'U/L', lo: 0, hi: 50, cat: 'Karaciğer', alias: 'alt sgpt alanin aminotransferaz',
    note: 'Ağır antrenman da yükseltebilir; testten önceki 48 saat antrenman yapmadan tekrar ölçtürmek yorumu kolaylaştırır.' },
  { key: 'ast', name: 'AST', unit: 'U/L', lo: 0, hi: 40, cat: 'Karaciğer', alias: 'ast sgot aspartat aminotransferaz',
    note: 'Kas hasarıyla da yükselir; CK ile birlikte değerlendirilir.' },
  { key: 'ggt', name: 'GGT', unit: 'U/L', lo: 0, hi: 60, cat: 'Karaciğer', alias: 'ggt gama',
    note: 'Antrenmandan pek etkilenmez; yükselmesi karaciğer kaynaklı olabilir.' },
  { key: 'bili', name: 'Total bilirubin', unit: 'mg/dL', lo: 0.2, hi: 1.2, cat: 'Karaciğer', alias: 'bilirubin' },

  { key: 'crea', name: 'Kreatinin', unit: 'mg/dL', lo: 0.7, hi: 1.2, cat: 'Böbrek', alias: 'kreatinin creatinine', training: 'high',
    note: 'Yüksek kas kütlesi ve kreatin kullanımıyla hafif yüksek çıkabilir; eGFR ve sistatin C ile birlikte yorumlanır.' },
  { key: 'egfr', name: 'eGFR', unit: 'mL/dk/1,73m²', lo: 90, hi: null, cat: 'Böbrek', alias: 'egfr gfr' },
  { key: 'urea', name: 'Üre', unit: 'mg/dL', lo: 17, hi: 43, cat: 'Böbrek', alias: 'ure' },
  { key: 'bun', name: 'BUN (kan üre azotu)', unit: 'mg/dL', lo: 6, hi: 20, cat: 'Böbrek', alias: 'bun kan ure azotu' },
  { key: 'uric', name: 'Ürik asit', unit: 'mg/dL', lo: 3.4, hi: 7, cat: 'Böbrek', alias: 'urik asit' },
  { key: 'ck', name: 'CK (kreatin kinaz)', unit: 'U/L', lo: 0, hi: 190, cat: 'Diğer', alias: 'ck cpk kreatin kinaz', training: 'high',
    note: 'Antrenman sonrası günlerce yüksek kalabilir.' },

  { key: 'chol', name: 'Total kolesterol', unit: 'mg/dL', lo: null, hi: 200, cat: 'Lipid', alias: 'kolesterol total' },
  { key: 'ldl', name: 'LDL', unit: 'mg/dL', lo: null, hi: 130, cat: 'Lipid', alias: 'ldl',
    note: 'Yüksek LDL kalp-damar riskini artırır.' },
  { key: 'hdl', name: 'HDL', unit: 'mg/dL', lo: 40, hi: null, cat: 'Lipid', alias: 'hdl',
    note: 'Düşük HDL kalp-damar riskini artırır; kür sırasında sık görülür ama yine de takip gerektirir.' },
  { key: 'tg', name: 'Trigliserid', unit: 'mg/dL', lo: null, hi: 150, cat: 'Lipid', alias: 'trigliserid tg' },

  { key: 'glu', name: 'Açlık kan şekeri', unit: 'mg/dL', lo: 70, hi: 100, cat: 'Şeker', alias: 'glukoz aclik seker' },
  { key: 'a1c', name: 'HbA1c', unit: '%', lo: 4, hi: 5.6, cat: 'Şeker', alias: 'hba1c a1c' },
  { key: 'insulin', name: 'İnsülin (açlık)', unit: 'µIU/mL', lo: 2.6, hi: 24.9, cat: 'Şeker', alias: 'insulin' },

  { key: 'tt', name: 'Total testosteron', unit: 'ng/dL', lo: 264, hi: 916, cat: 'Hormon', alias: 'testosteron total', cycle: 'high',
    note: 'Dışarıdan testosteron kullanımında yüksek çıkması beklenir.' },
  { key: 'ft', name: 'Serbest testosteron', unit: 'pg/mL', lo: 46, hi: 224, cat: 'Hormon', alias: 'serbest testosteron free', cycle: 'high' },
  { key: 'e2', name: 'Estradiol (E2)', unit: 'pg/mL', lo: 10, hi: 40, cat: 'Hormon', alias: 'estradiol e2 ostrojen',
    note: 'Yüksekliği su tutma, jinekomasti gibi belirtilerle birlikte değerlendirilir; tedavi kararı doktorla verilmeli.' },
  { key: 'lh', name: 'LH', unit: 'mIU/mL', lo: 1.7, hi: 8.6, cat: 'Hormon', alias: 'lh', cycle: 'low',
    note: 'Dışarıdan hormon alımında baskılanması beklenir.' },
  { key: 'fsh', name: 'FSH', unit: 'mIU/mL', lo: 1.5, hi: 12.4, cat: 'Hormon', alias: 'fsh', cycle: 'low',
    note: 'Dışarıdan hormon alımında baskılanması beklenir.' },
  { key: 'prl', name: 'Prolaktin', unit: 'ng/mL', lo: 4, hi: 15.2, cat: 'Hormon', alias: 'prolaktin prl',
    note: 'Yüksekliğin nedeni ayrıştırılmalı; ilaç kaynaklı olabileceği gibi hipofiz kaynaklı da olabilir. Doktor değerlendirmesi önerilir.' },
  { key: 'shbg', name: 'SHBG', unit: 'nmol/L', lo: 18, hi: 54, cat: 'Hormon', alias: 'shbg', cycle: 'low' },
  { key: 'psa', name: 'PSA', unit: 'ng/mL', lo: 0, hi: 4, cat: 'Hormon', alias: 'psa' },
  { key: 'tsh', name: 'TSH', unit: 'mIU/L', lo: 0.27, hi: 4.2, cat: 'Tiroid', alias: 'tsh' },
  { key: 'ft4', name: 'Serbest T4', unit: 'ng/dL', lo: 0.93, hi: 1.7, cat: 'Tiroid', alias: 'st4 serbest t4 ft4' },
  { key: 'ft3', name: 'Serbest T3', unit: 'pg/mL', lo: 2, hi: 4.4, cat: 'Tiroid', alias: 'st3 serbest t3 ft3' },

  { key: 'ferritin', name: 'Ferritin', unit: 'ng/mL', lo: 30, hi: 400, cat: 'Vitamin / mineral', alias: 'ferritin' },
  { key: 'vitd', name: 'D vitamini (25-OH)', unit: 'ng/mL', lo: 30, hi: 100, cat: 'Vitamin / mineral', alias: 'd vitamini vitamin 25 oh hidroksi kolekalsiferol' },
  { key: 'b12', name: 'B12 vitamini', unit: 'pg/mL', lo: 200, hi: 900, cat: 'Vitamin / mineral', alias: 'b12' },
  { key: 'alb', name: 'Albümin', unit: 'g/L', lo: 35, hi: 52, cat: 'Karaciğer', alias: 'albumin albümin' },
  { key: 'fe', name: 'Demir', unit: 'µg/dL', lo: 60, hi: 170, cat: 'Vitamin / mineral', alias: 'demir serum demiri fe' },
  { key: 'uibc', name: 'Serbest demir bağlama kapasitesi (UIBC)', unit: 'µg/dL', lo: 125, hi: 345, cat: 'Vitamin / mineral', alias: 'uibc' },
  { key: 'tibc', name: 'Total demir bağlama kapasitesi (TIBC)', unit: 'µg/dL', lo: 250, hi: 450, cat: 'Vitamin / mineral', alias: 'tibc' },
  { key: 'folat', name: 'Folat', unit: 'µg/L', lo: 3.9, hi: 26.8, cat: 'Vitamin / mineral', alias: 'folat folik asit' },
  { key: 'ca', name: 'Kalsiyum', unit: 'mg/dL', lo: 8.4, hi: 10.2, cat: 'Vitamin / mineral', alias: 'kalsiyum ca' },
  { key: 'mg', name: 'Magnezyum', unit: 'mg/dL', lo: 1.6, hi: 2.6, cat: 'Vitamin / mineral', alias: 'magnezyum mg' },
  { key: 'p', name: 'Fosfor', unit: 'mg/dL', lo: 2.5, hi: 4.5, cat: 'Vitamin / mineral', alias: 'fosfor' },
  { key: 'zn', name: 'Çinko', unit: 'µg/dL', lo: 70, hi: 127, cat: 'Vitamin / mineral', alias: 'cinko çinko zn' },
  { key: 'cl', name: 'Klor', unit: 'mmol/L', lo: 98, hi: 107, cat: 'Vitamin / mineral', alias: 'klor klorür' },
  { key: 'dheas', name: 'DHEA-S', unit: 'µg/dL', lo: 44, hi: 492, cat: 'Hormon', alias: 'dhea dheas dhea-s so4 dehidroepiandrosteron sulfat' },
  { key: 'na', name: 'Sodyum', unit: 'mmol/L', lo: 136, hi: 145, cat: 'Vitamin / mineral', alias: 'sodyum na' },
  { key: 'k', name: 'Potasyum', unit: 'mmol/L', lo: 3.5, hi: 5.1, cat: 'Vitamin / mineral', alias: 'potasyum k' },
  { key: 'crp', name: 'CRP', unit: 'mg/L', lo: 0, hi: 5, cat: 'Diğer', alias: 'crp' },
];

export const labByKey = (k) => LABS.find((l) => l.key === k) || null;

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchLab(name) {
  const n = norm(name).replace(/\bvitamin ([a-z0-9]+)\b/, '$1 vitamini');
  if (!n) return null;
  // Puanlama: adın kelimeleri 2, takma ad kelimeleri 1 puan; testin adında olup sorguda olmayan kelimeler puan düşürür
  // (örn. "LDL Kolesterol" → LDL, "Total kolesterol" değil)
  // Tek başına ayırt edici olmayan kelimeler (örn. "Serbest Demir…" serbest testosteron sanılmasın)
  const GENERIC = new Set(['serbest', 'total', 'toplam', 'free', 'aclik', 'kan', 'serum', 'plazma', 'vitamini', 'vitamin', 'hormon', 'kolesterol', 'sayisi', 'orani']);
  const q = n.split(' ').filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const l of LABS) {
    const ln = norm(l.name);
    if (ln === n || l.key === n) return l;
    const nameT = ln.split(' ').filter((x) => x.length > 1);
    const aliasT = norm(l.alias).split(' ').filter((x) => x.length > 1);
    if (aliasT.includes(n)) return l;
    let score = 0;
    let strong = 0;
    for (const t of q) {
      if (nameT.includes(t)) score += 2;
      else if (aliasT.includes(t)) score += 1;
      else continue;
      if (!GENERIC.has(t)) strong++;
    }
    if (!score || !strong) continue;
    // sorgudaki eşleşmeyen ayırt edici kelimeler de puan düşürür
    score -= 0.5 * q.filter((t) => t.length > 1 && !GENERIC.has(t) && !nameT.includes(t) && !aliasT.includes(t)).length;
    score -= 0.25 * nameT.filter((t) => !q.includes(t)).length;
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

// Değerin durumu: 'low' | 'high' | 'ok'
export function status(value, lo, hi) {
  if (value == null || isNaN(value)) return 'ok';
  if (lo != null && value < lo) return 'low';
  if (hi != null && value > hi) return 'high';
  return 'ok';
}

// ---------- Referans kaynağı ve birim ----------
// Laboratuvarın kendi aralığı önceliklidir. Genel katalog aralığı raporun aralığı gibi gösterilmez.
export const REF_SOURCES = {
  rapor: 'Laboratuvar aralığı',
  katalog: 'Genel aralık',
  manuel: 'Senin girdiğin aralık',
  bilinmiyor: 'Aralığın kaynağı bilinmiyor',
};

// Eski kayıtlarda ref_source yok: katalogla birebir aynı aralık → 'katalog', başka bir aralık → 'bilinmiyor'
export function refSourceOf(v) {
  if (v.ref_source && REF_SOURCES[v.ref_source]) return v.ref_source;
  if (v.ref_low == null && v.ref_high == null) return null;
  const m = labByKey(v.marker_key);
  if (m && (v.ref_low ?? null) === (m.lo ?? null) && (v.ref_high ?? null) === (m.hi ?? null)) return 'katalog';
  return 'bilinmiyor';
}

// Aynı ölçeği gösteren birim yazımları
const UNIT_GROUPS = [
  ['10^3/ul', 'k/ul', '10^9/l', 'thou/ul', '/nl'],
  ['10^6/ul', 'm/ul', '10^12/l', '/pl'],
  ['u/l', 'iu/l', 'miu/ml'],
  ['uiu/ml', 'miu/l', 'mu/l'],
  ['ug/dl', 'mcg/dl'],
  ['ug/l', 'ng/ml', 'mcg/l'],
  ['pg/ml', 'ng/l'],
  ['%', 'yuzde'],
];
export function unitNorm(u) {
  return String(u || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/mcg/g, 'ug')
    .replace(/⁶/g, '^6')
    .replace(/³/g, '^3')
    .replace(/⁹/g, '^9')
    .replace(/¹²/g, '^12')
    .replace(/^[x*×]/, '')
    .replace(/10e(\d+)/g, '10^$1')
    .replace(/10\*\*(\d+)/g, '10^$1')
    .replace(/^10(\d+)\//, '10^$1/')
    .replace(/mm3$/, 'ul');
}
export function unitsCompatible(a, b) {
  const x = unitNorm(a);
  const y = unitNorm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return UNIT_GROUPS.some((g) => g.includes(x) && g.includes(y));
}

// Değerin kıyaslanacağı aralık. Katalog aralığı yalnızca birim uyuşuyorsa kullanılır.
export function effectiveRange(v) {
  const m = labByKey(v.marker_key);
  const src = refSourceOf(v);
  if (src && src !== 'katalog') return { lo: v.ref_low ?? null, hi: v.ref_high ?? null, source: src, comparable: true };
  if (m && (src === 'katalog' || src == null)) {
    if (!unitsCompatible(v.unit, m.unit)) return { lo: null, hi: null, source: 'katalog', comparable: false, reason: v.unit ? 'birim' : 'birim-yok', catalogUnit: m.unit };
    return { lo: m.lo ?? null, hi: m.hi ?? null, source: 'katalog', comparable: true };
  }
  return { lo: null, hi: null, source: null, comparable: false, reason: 'aralik-yok' };
}

// Gruplama: 'attention' (referans dışı — hiçbiri gizlenmez) | 'normal' | 'unknown' (otomatik kıyaslanamadı)
// cycle: tahlil tarihindeki kayıtlı bağlam (cycleContextAt). Beklenen olabilecek etki ayrı not olarak döner.
export function classify(v, { cycle = null } = {}) {
  const r = effectiveRange(v);
  if (!r.comparable) return { group: 'unknown', st: 'unknown', range: r };
  const st = status(v.value, r.lo, r.hi);
  if (st === 'ok') return { group: 'normal', st, range: r };
  const meta = labByKey(v.marker_key);
  let expect = null;
  if (meta) {
    if (cycle && cycle.active && meta.cycle === st) expect = { why: 'kur', text: cycle.text };
    else if (meta.training === st) {
      const tooHigh = r.hi != null && v.value > r.hi * (meta.key === 'ck' ? 5 : 2);
      if (!tooHigh) expect = { why: 'antrenman', text: 'Yoğun antrenmanla bu yönde değişebilir.' };
    }
  }
  return { group: 'attention', st, range: r, expect };
}
