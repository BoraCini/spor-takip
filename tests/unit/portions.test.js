import { describe, it, expect } from 'vitest';
import { FOODS, nutrientsFor, defaultServing, portionsOf, parsePortionRows, servingText, baseUnit, validAmount, findFood } from '../../public/js/data/foods.js';

const egg = findFood('f_egg');
const whey = findFood('f_whey');

describe('Porsiyon hesapları', () => {
  it('1 ve 2 adet yumurta besine özel gramla hesaplanır', () => {
    const p = portionsOf(egg).find((x) => x[0] === 'adet');
    expect(p[1]).toBe(50);
    expect(nutrientsFor(egg, 1 * p[1]).kcal).toBe(Math.round(egg.k * 0.5));
    expect(nutrientsFor(egg, 2 * p[1]).protein_g).toBeCloseTo(egg.p, 1);
  });
  it('1 ölçek whey ve ondalıklı porsiyon (1,5 ölçek)', () => {
    const p = portionsOf(whey)[0];
    expect(p).toEqual(['ölçek', 30]);
    expect(nutrientsFor(whey, 30).kcal).toBe(120);
    expect(nutrientsFor(whey, 1.5 * 30).kcal).toBe(180);
  });
  it('eski [etiket, gram] dizileri aynen okunur; bozuk elemanlar atlanır', () => {
    const f = { portions: [['adet', 50], ['dilim'], ['', 10], ['kase', -1], ['gram', 1], 'bozuk', ['dilim', '30']] };
    expect(portionsOf(f)).toEqual([['adet', 50], ['dilim', 30]]);
    expect(portionsOf({})).toEqual([]);
  });
  it('varsayılan porsiyon öne gelir; son kullanılan ölçü hâlâ varsa korunur, yoksa grama döner', () => {
    const f = { portions: [['ölçek', 30], ['0,5 ölçek', 15]], default_portion: '0,5 ölçek' };
    expect(defaultServing(f)).toEqual({ unit: '0,5 ölçek', qty: 1, grams: 15 });
    expect(defaultServing(f, { unit: 'ölçek', qty: 2, grams: 60 })).toEqual({ unit: 'ölçek', qty: 2, grams: 60 });
    expect(defaultServing(f, { unit: 'kaldırılan ölçü', qty: 1, grams: 40 })).toEqual({ unit: 'gram', qty: 40, grams: 40 });
    expect(defaultServing({ portions: [] })).toEqual({ unit: 'gram', qty: 100, grams: 100 });
  });
  it('bilinmeyen ml dönüşümü tahmin edilmez: tanımlı değilse ml ölçüsü yok', () => {
    const yog = { k: 61, portions: [['kase', 150]] };
    expect(portionsOf(yog).some((p) => /ml/.test(p[0]))).toBe(false);
    // ml tabanlı besinde temel birim ml, metin ml gösterir
    const milk = { k: 46, base: 'ml', portions: [['su bardağı', 200]] };
    expect(baseUnit(milk)).toBe('ml');
    expect(servingText('su bardağı', 1, 200, baseUnit(milk))).toBe('1 su bardağı (200 ml)');
    expect(servingText('gram', 150, 150, 'ml')).toBe('150 ml');
  });
  it('sıfır ve negatif miktar geçersiz, ondalık geçerli', () => {
    expect(validAmount(0)).toBe(false);
    expect(validAmount(-5)).toBe(false);
    expect(validAmount(NaN)).toBe(false);
    expect(validAmount(12.5)).toBe(true);
  });
});

describe('Porsiyon düzenleyici doğrulaması', () => {
  it('birden fazla porsiyon, ondalıklı miktar ve varsayılan seçimi', () => {
    const r = parsePortionRows([
      { qty: '0,5', unit: 'ölçek', grams: '15' },
      { qty: '1', unit: 'ölçek', grams: '30', def: true },
      { qty: '2', unit: 'ölçek', grams: '60' },
      { qty: '250', unit: 'ml', grams: '257,5' },
      { qty: '1', unit: 'ozel', custom: 'bar', grams: '45' },
    ]);
    expect(r.portions).toEqual([['0,5 ölçek', 15], ['ölçek', 30], ['2 ölçek', 60], ['250 ml', 257.5], ['bar', 45]]);
    expect(r.default_portion).toBe('ölçek');
  });
  it('gram karşılığı olmayan, sıfır gramlı, adsız ve tekrarlanan porsiyon reddedilir', () => {
    expect(parsePortionRows([{ qty: '1', unit: 'kase', grams: '' }]).error).toMatch(/gram/);
    expect(parsePortionRows([{ qty: '1', unit: 'kase', grams: '0' }]).error).toMatch(/gram/);
    expect(parsePortionRows([{ qty: '0', unit: 'kase', grams: '10' }]).error).toMatch(/miktar/);
    expect(parsePortionRows([{ qty: '1', unit: 'ozel', custom: '', grams: '10' }]).error).toMatch(/ölçü/);
    expect(parsePortionRows([{ qty: '1', unit: 'kase', grams: '10' }, { qty: '1', unit: 'kase', grams: '20' }]).error).toMatch(/iki kez/);
  });
  it('en fazla 10 porsiyon; boş satırlar yok sayılır; silinen porsiyon listeden çıkar', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ qty: String(i + 1), unit: 'adet', grams: String(10 * (i + 1)) }));
    expect(parsePortionRows(many).error).toMatch(/10/);
    expect(parsePortionRows([{ qty: '', unit: '', grams: '' }])).toEqual({ portions: [], default_portion: null });
    const rows = [{ qty: '1', unit: 'adet', grams: '50', def: true }, { qty: '1', unit: 'dilim', grams: '30' }];
    rows.splice(0, 1);
    expect(parsePortionRows(rows)).toEqual({ portions: [['dilim', 30]], default_portion: 'dilim' });
  });
  it('hazır besinlerin hepsinin porsiyonları geçerli', () => {
    for (const f of FOODS) for (const p of portionsOf(f)) expect(p[1]).toBeGreaterThan(0);
  });
});

describe('Bilinmeyen değerler', () => {
  it('lif/sodyum/potasyum bilinmiyorsa null döner, sıfır sayılmaz; bilinenler hesaplanır', () => {
    const n = nutrientsFor({ k: 200, p: 10, c: 20, f: 5, fb: null, na: undefined, ka: 300 }, 50);
    expect(n).toMatchObject({ kcal: 100, protein_g: 5, fiber_g: null, sodium_mg: null, potassium_mg: 150 });
    expect(nutrientsFor({ k: 100, fb: 0, na: 0, ka: 0 }, 100)).toMatchObject({ fiber_g: 0, sodium_mg: 0, potassium_mg: 0 });
  });
});
