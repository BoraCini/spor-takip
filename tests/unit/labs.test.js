import { describe, it, expect } from 'vitest';
import { status, refSourceOf, unitsCompatible, effectiveRange, classify } from '../../public/js/data/labs.js';
import { parseLabLines } from '../../public/js/labpdf.js';

describe('Tahlil durumu', () => {
  it('aralığa göre düşük/normal/yüksek', () => {
    expect(status(5, 4, 10)).toBe('ok');
    expect(status(3, 4, 10)).toBe('low');
    expect(status(11, 4, 10)).toBe('high');
    expect(status(11, null, 10)).toBe('high');
    expect(status(3, 4, null)).toBe('low');
  });
});

describe('Referans kaynağı', () => {
  it('eski kayıtlarda kaynak çıkarımı: katalogla aynı → katalog, farklı → bilinmiyor', () => {
    expect(refSourceOf({ marker_key: 'hct', ref_low: 40, ref_high: 52 })).toBe('katalog');
    expect(refSourceOf({ marker_key: 'hct', ref_low: 38.8, ref_high: 50 })).toBe('bilinmiyor');
    expect(refSourceOf({ marker_key: 'hct', ref_low: 38.8, ref_high: 50, ref_source: 'rapor' })).toBe('rapor');
    expect(refSourceOf({ marker_key: 'hct' })).toBeNull();
  });

  it('PDF: raporda aralık varsa rapor, yoksa genel aralık; birim katalogdan varsayılmaz', () => {
    const v = parseLabLines(['Hemoglobin\t15,2\tg/dL\t13,5 - 17,5', 'Hematokrit\t53,1\t%', 'Ferritin\t120']).values;
    expect(v[0]).toMatchObject({ ref_source: 'rapor', ref_low: 13.5, ref_high: 17.5 });
    expect(v[1]).toMatchObject({ ref_source: 'katalog', unit: '%' });
    expect(v[2]).toMatchObject({ ref_source: 'katalog', unit: '' });
  });

  it('tek taraflı rapor aralığı katalogla karıştırılmaz', () => {
    const [alt] = parseLabLines(['ALT\t44\tU/L\t< 41']).values;
    expect(alt).toMatchObject({ ref_source: 'rapor', ref_low: null, ref_high: 41 });
  });
});

describe('Birim doğrulama', () => {
  it('aynı ölçeğin farklı yazımları uyumlu', () => {
    expect(unitsCompatible('10³/µL', 'K/uL')).toBe(true);
    expect(unitsCompatible('10^3/uL', 'x10^9/L')).toBe(true);
    expect(unitsCompatible('U/L', 'IU/L')).toBe(true);
    expect(unitsCompatible('µIU/mL', 'mIU/L')).toBe(true);
    expect(unitsCompatible('g/dL', 'g/dl')).toBe(true);
  });
  it('farklı ölçekler ve boş birim uyumsuz', () => {
    expect(unitsCompatible('mg/dL', 'mmol/L')).toBe(false);
    expect(unitsCompatible('ng/dL', 'nmol/L')).toBe(false);
    expect(unitsCompatible('', 'mg/dL')).toBe(false);
  });
  it('uyumsuz birimde genel aralıkla otomatik kıyaslama yapılmaz', () => {
    const v = { marker_key: 'glu', value: 5.4, unit: 'mmol/L', ref_low: null, ref_high: null };
    const r = effectiveRange(v);
    expect(r.comparable).toBe(false);
    expect(classify(v).group).toBe('unknown');
  });
  it('raporun kendi aralığı birimden bağımsız kullanılır', () => {
    const v = { marker_key: 'glu', value: 6.4, unit: 'mmol/L', ref_low: 3.9, ref_high: 5.6, ref_source: 'rapor' };
    expect(classify(v)).toMatchObject({ group: 'attention', st: 'high' });
  });
});

describe('Sınıflandırma — referans dışı hiçbir değer gizlenmez', () => {
  const cycle = { active: true, kind: 'kur', text: 'Tahlil tarihi kayıtlı kür dönemine denk geliyor.' };
  it('kür bağlamında beklenen yönde olsa da dikkat listesinde kalır, açıklama ayrı not', () => {
    const v = { marker_key: 'lh', value: 0.1, unit: 'mIU/mL', ref_low: 1.7, ref_high: 8.6, ref_source: 'rapor' };
    const c = classify(v, { cycle });
    expect(c.group).toBe('attention');
    expect(c.expect).toMatchObject({ why: 'kur' });
  });
  it('kür bağlamı yoksa açıklama yok', () => {
    const v = { marker_key: 'lh', value: 0.1, unit: 'mIU/mL', ref_low: 1.7, ref_high: 8.6, ref_source: 'rapor' };
    expect(classify(v, { cycle: { active: false } }).expect).toBeNull();
  });
  it('antrenmanla beklenen hafif yükseklik not alır, aşırı yükseklik almaz', () => {
    const mild = classify({ marker_key: 'ck', value: 600, unit: 'U/L', ref_low: 0, ref_high: 190, ref_source: 'rapor' });
    const huge = classify({ marker_key: 'ck', value: 5000, unit: 'U/L', ref_low: 0, ref_high: 190, ref_source: 'rapor' });
    expect(mild).toMatchObject({ group: 'attention', expect: { why: 'antrenman' } });
    expect(huge).toMatchObject({ group: 'attention', expect: null });
  });
});

describe('Tahlil tarihindeki kayıtlı kür bağlamı', () => {
  async function setup() {
    const db = await import('../../public/js/db.js');
    await db.init();
    const { cycleContextAt } = await import('../../public/js/context.js');
    return { db, at: cycleContextAt };
  }
  it('kür sırasında, bitişten sonraki 4 hafta ve sonrası', async () => {
    const { db, at } = await setup();
    await db.put('cycles', { start_date: '2026-03-02', weeks: 12 }); // bitiş 2026-05-24
    expect(await at('2026-04-10')).toMatchObject({ active: true, kind: 'kur', week: 6 });
    expect(await at('2026-06-05')).toMatchObject({ active: true, kind: 'sonrasi' });
    expect(await at('2026-08-01')).toMatchObject({ active: false });
    expect(await at('2026-02-20')).toMatchObject({ active: false });
  });
  it('bitiş tarihi girilmişse o kullanılır', async () => {
    const { db, at } = await setup();
    await db.put('cycles', { start_date: '2026-03-02', weeks: 12, end_date: '2026-04-01' });
    expect(await at('2026-05-15')).toMatchObject({ active: false });
  });
  it('kür kaydı yoksa: son 14 günde kür dozu kaydı varsa bağlam var, sadece takviye dozu yetmez', async () => {
    const { db, at } = await setup();
    const kur = await db.put('compounds', { name: 'X', category: 'kur', active: true });
    const vit = await db.put('compounds', { name: 'D vitamini', category: 'destek', active: true });
    await db.put('dose_logs', { date: '2026-09-25', compound_id: vit.id });
    expect(await at('2026-10-01')).toMatchObject({ active: false });
    await db.put('dose_logs', { date: '2026-09-25', compound_id: kur.id });
    expect(await at('2026-10-01')).toMatchObject({ active: true, kind: 'doz' });
    expect(await at('2026-11-30')).toMatchObject({ active: false }); // doz 14 günden eski
  });
  it('aktif madde olması tek başına bağlam sayılmaz (eski 60 gün kuralı kalktı)', async () => {
    const { db, at } = await setup();
    await db.put('compounds', { name: 'X', category: 'kur', active: true });
    const { today } = await import('../../public/js/util.js');
    expect(await at(today())).toMatchObject({ active: false });
  });
});
