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
  { key: 'plt', name: 'Trombosit', unit: '10³/µL', lo: 150, hi: 400, cat: 'Kan sayımı', alias: 'plt trombosit' },

  { key: 'alt', name: 'ALT', unit: 'U/L', lo: 0, hi: 50, cat: 'Karaciğer', alias: 'alt sgpt',
    note: 'Ağır antrenman da yükseltebilir; testten önceki 48 saat antrenman yapmadan tekrar ölçtürmek yorumu kolaylaştırır.' },
  { key: 'ast', name: 'AST', unit: 'U/L', lo: 0, hi: 40, cat: 'Karaciğer', alias: 'ast sgot',
    note: 'Kas hasarıyla da yükselir; CK ile birlikte değerlendirilir.' },
  { key: 'ggt', name: 'GGT', unit: 'U/L', lo: 0, hi: 60, cat: 'Karaciğer', alias: 'ggt gama',
    note: 'Antrenmandan pek etkilenmez; yükselmesi karaciğer kaynaklı olabilir.' },
  { key: 'bili', name: 'Total bilirubin', unit: 'mg/dL', lo: 0.2, hi: 1.2, cat: 'Karaciğer', alias: 'bilirubin' },

  { key: 'crea', name: 'Kreatinin', unit: 'mg/dL', lo: 0.7, hi: 1.2, cat: 'Böbrek', alias: 'kreatinin creatinine', training: 'high',
    note: 'Yüksek kas kütlesi ve kreatin kullanımıyla hafif yüksek çıkabilir; eGFR ve sistatin C ile birlikte yorumlanır.' },
  { key: 'egfr', name: 'eGFR', unit: 'mL/dk/1,73m²', lo: 90, hi: null, cat: 'Böbrek', alias: 'egfr gfr' },
  { key: 'urea', name: 'Üre', unit: 'mg/dL', lo: 17, hi: 43, cat: 'Böbrek', alias: 'ure bun' },
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
  { key: 'vitd', name: 'D vitamini (25-OH)', unit: 'ng/mL', lo: 30, hi: 100, cat: 'Vitamin / mineral', alias: 'd vitamini 25 oh' },
  { key: 'b12', name: 'B12 vitamini', unit: 'pg/mL', lo: 200, hi: 900, cat: 'Vitamin / mineral', alias: 'b12' },
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
  const n = norm(name);
  if (!n) return null;
  let best = null;
  for (const l of LABS) {
    const names = [norm(l.name), ...norm(l.alias).split(' ')];
    if (norm(l.name) === n || l.key === n) return l;
    if (names.some((x) => x.length > 1 && (n === x || n.split(' ').includes(x)))) best = best || l;
  }
  return best;
}

// Değerin durumu: 'low' | 'high' | 'ok'
export function status(value, lo, hi) {
  if (value == null || isNaN(value)) return 'ok';
  if (lo != null && value < lo) return 'low';
  if (hi != null && value > hi) return 'high';
  return 'ok';
}

// Gruplama: 'attention' | 'expected' | 'normal'
export function classify(v, { onCycle }) {
  const st = status(v.value, v.ref_low, v.ref_high);
  if (st === 'ok') return { group: 'normal', st };
  const meta = labByKey(v.marker_key);
  if (meta) {
    if (onCycle && meta.cycle === st) return { group: 'expected', st, reason: 'kür' };
    if (meta.training === st) {
      // antrenmanla beklenen ama aşırı yüksekse yine dikkat
      const hi = v.ref_high;
      const tooHigh = hi != null && v.value > hi * (meta.key === 'ck' ? 5 : 2);
      if (!tooHigh) return { group: 'expected', st, reason: 'antrenman' };
    }
  }
  return { group: 'attention', st };
}
