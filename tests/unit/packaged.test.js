import { describe, it, expect } from 'vitest';

const DATA = {
  v: 1,
  generated: '2026-11-02',
  fields: ['code', 'name', 'brand', 'k', 'p', 'c', 'f', 'fb', 'na', 'ka', 'ml', 'serving', 'pack'],
  items: [
    ['8690504011112', 'Ülker Çikolatalı Gofret', 'Ülker', 536, 6, 60, 30, 2, 120, null, 0, 36, 36],
    ['8690000000003', 'Eker Ayran', 'Eker', 43, 2, 3.5, 2.3, null, 200, null, 1, 200, 1000],
    ['8690000000009', 'Eti Burçak Bisküvi', 'Eti', 470, 7.5, 64, 20, 6, 300, null, 0, 0, 131],
    ['8690000000004', 'Eker Ayran', 'Eker', 43, 2, 3.5, 2.3, null, 200, null, 1, 300, 300],
    ['8690000000005', 'Ülker', 'Ülker', 500, 6, 60, 25, null, null, null, 0, 0, 0],
    ['8690000000006', 'Ayran', '', 38, 2, 3.5, 1.8, null, null, null, 1, 0, 0],
    ['bozuk'],
  ],
};
const ok = (d = DATA) => async () => ({ ok: true, json: async () => d });

describe('Paketli ürün listesi', () => {
  it('kompakt satırlar besine çevrilir; porsiyon ve paket ölçü olur; bilinmeyenler null', async () => {
    const { parsePackaged } = await import('../../public/js/data/packaged.js');
    const [g, a, e] = parsePackaged(DATA);
    expect(g).toMatchObject({ id: 'o_8690504011112', barcode: '8690504011112', brand: 'Ülker', k: 536, fb: 2, na: 120, ka: null, portions: [['porsiyon', 36]], default_portion: 'porsiyon', src: 'off', packaged: true });
    expect(a).toMatchObject({ base: 'ml', fb: null, portions: [['porsiyon', 200], ['paket', 1000]] });
    expect(e.portions).toEqual([['paket', 131]]);
    expect(parsePackaged(DATA)).toHaveLength(4); // bozuk, yalnızca marka adı ve markasız tek kelime atlanır
    expect(parsePackaged(null)).toEqual([]);
  });

  it('yüklenince findFood, barkod ve arama çalışır; kendi kaydettiğin barkod aramada tekrar çıkmaz', async () => {
    const { loadPackaged, packagedByBarcode } = await import('../../public/js/data/packaged.js');
    const { findFood, searchExtra, searchFoods } = await import('../../public/js/data/foods.js');
    expect(searchExtra('ayran')).toEqual([]); // yüklenmeden boş
    await loadPackaged({ fetcher: ok() });
    expect(findFood('o_8690000000003').name).toBe('Eker Ayran');
    expect(packagedByBarcode('8690504011112').name).toBe('Ülker Çikolatalı Gofret');
    expect(searchExtra('eker ayran').map((f) => f.id)).toEqual(['o_8690000000003']); // aynı ad+kalori ikinci barkod tekrar gösterilmez
    expect(findFood('o_8690000000004')).toBeTruthy();
    expect(searchExtra('gofret').map((f) => f.id)).toEqual(['o_8690504011112']);
    expect(searchExtra('ülker')[0].id).toBe('o_8690504011112'); // marka adıyla
    expect(searchExtra('burcak').map((f) => f.id)).toEqual(['o_8690000000009']); // Türkçe karakter
    expect(searchExtra('gofret', { custom: [{ id: 'c1', barcode: '8690504011112', name: 'Gofret (benim)' }] })).toEqual([]);
    // genel arama listesine karışmaz (ayrı bölümde gösterilir)
    expect(searchFoods('eker ayran').some((f) => f.id === 'o_8690000000003')).toBe(false);
  });

  it('dosya yoksa ya da bozuksa uygulama listesiz çalışır (hata fırlatmaz)', async () => {
    const { loadPackaged, _resetPackaged } = await import('../../public/js/data/packaged.js');
    _resetPackaged();
    expect(await loadPackaged({ fetcher: async () => ({ ok: false, status: 404 }) })).toEqual([]);
    _resetPackaged();
    expect(await loadPackaged({ fetcher: async () => { throw new Error('çevrimdışı'); } })).toEqual([]);
    _resetPackaged();
    expect(await loadPackaged({ fetcher: ok({ bozuk: true }) })).toEqual([]);
  });

  it('gerçek liste dosyası geçerli: biçim, kimlik tekliği, değer aralıkları', async () => {
    const fs = await import('node:fs');
    const data = JSON.parse(fs.readFileSync('public/data/off_tr.json', 'utf8'));
    const { parsePackaged } = await import('../../public/js/data/packaged.js');
    const list = parsePackaged(data);
    expect(list.length).toBeLessThanOrEqual(data.count);
    expect(list.length).toBeGreaterThan(500);
    expect(new Set(list.map((f) => f.barcode)).size).toBe(list.length);
    for (const f of list) {
      expect(f.k).toBeGreaterThanOrEqual(0);
      expect(f.k).toBeLessThanOrEqual(900);
      for (const x of [f.p, f.c, f.f]) expect(x).toBeGreaterThanOrEqual(0);
    }
    expect(data.license).toMatch(/ODbL/);
  });
});
