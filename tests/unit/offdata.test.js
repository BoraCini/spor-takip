import { describe, it, expect } from 'vitest';
import { toItem, tidyName, parseQuantity, FIELDS } from '../../scripts/build-off-tr.mjs';

const row = (o = {}) => ({
  code: '8690504011112',
  product_name: 'Çikolatalı Gofret',
  brands: 'Ülker,Yıldız Holding',
  countries_tags: 'en:turkey',
  quantity: '36 g',
  serving_quantity: '36',
  'energy-kcal_100g': '536',
  proteins_100g: '6',
  carbohydrates_100g: '60',
  fat_100g: '30',
  fiber_100g: '2',
  salt_100g: '0.3',
  ...o,
});
const obj = (it) => Object.fromEntries(FIELDS.map((k, i) => [k, it[i]]));

describe('Open Food Facts → paketli ürün listesi', () => {
  it('Türkiye ürünü dönüştürülür: marka ada eklenir, tuzdan sodyum, porsiyon ve paket', () => {
    expect(obj(toItem(row()))).toEqual({ code: '8690504011112', name: 'Ülker Çikolatalı Gofret', brand: 'Ülker', k: 536, p: 6, c: 60, f: 30, fb: 2, na: 120, ka: null, ml: 0, serving: 36, pack: 36 });
  });
  it('başka ülke, eksik makro, bozuk barkod ve tutarsız enerji alınmaz', () => {
    expect(toItem(row({ countries_tags: 'en:france' }))).toBeNull();
    expect(toItem(row({ fat_100g: '' }))).toBeNull(); // eksik değer sıfır sayılmaz
    expect(toItem(row({ code: '12AB' }))).toBeNull();
    expect(toItem(row({ 'energy-kcal_100g': '120' }))).toBeNull(); // makrolar ~536 kcal diyor
    expect(toItem(row({ proteins_100g: '120' }))).toBeNull();
  });
  it('kcal yoksa kJ\'den çevrilir; sıvılar ml olarak işaretlenir; bilinmeyen lif/sodyum null kalır', () => {
    const it = obj(toItem(row({ product_name: 'Ayran', brands: 'Eker', 'energy-kcal_100g': '', energy_100g: '180', proteins_100g: '2', carbohydrates_100g: '3.5', fat_100g: '2.3', fiber_100g: '', salt_100g: '', quantity: '1 L', serving_quantity: '' })));
    expect(it).toMatchObject({ name: 'Eker Ayran', k: 43, ml: 1, pack: 1000, serving: 0, fb: null, na: null });
  });
  it('ad düzeltme ve miktar okuma', () => {
    expect(tidyName('  ÜLKER ÇİKOLATALI   GOFRET ')).toBe('Ülker Çikolatalı Gofret');
    expect(tidyName('Süzme Yoğurt')).toBe('Süzme Yoğurt');
    expect(parseQuantity('500 g')).toEqual({ amount: 500, ml: false });
    expect(parseQuantity('1,5 L')).toEqual({ amount: 1500, ml: true });
    expect(parseQuantity('33 cl')).toEqual({ amount: 330, ml: true });
    expect(parseQuantity('2 x 200 ml')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
});
