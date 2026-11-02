import { describe, it, expect } from 'vitest';
import { FOODS, findFood, allFoods, searchFoods } from '../../public/js/data/foods.js';
import {
  FOOD_CATEGORIES,
  CATEGORY_LABEL,
  categoryOf,
  isBuiltinCategory,
  toggleFavorite,
  catNameError,
  newUserCatId,
  deleteUserCat,
  inCategory,
  categoryCounts,
  cleanUserCats,
  MAX_USER_CATEGORIES,
} from '../../public/js/data/food_categories.js';

const byName = (n) => FOODS.find((f) => f.name.replace(/\s*~$/, '') === n);

describe('Hazır kategoriler', () => {
  it('her hazır besin geçerli bir kategoriye düşer', () => {
    for (const f of FOODS) expect(isBuiltinCategory(categoryOf(f)), f.name).toBe(true);
  });
  it('kategori dağılımı makul: "Diğer" küçük kalır, temel gruplar dolu', () => {
    const c = categoryCounts(FOODS);
    expect(c.diger || 0).toBeLessThan(FOODS.length * 0.05);
    for (const k of ['et', 'sut', 'tahil', 'baklagil', 'sebze', 'meyve', 'kuruyemis', 'icecek', 'tatli', 'yemek']) expect(c[k], k).toBeGreaterThan(3);
  });
  it('örnek besinler doğru kategoride', () => {
    const exp = {
      f_egg: 'et',
      f_oats: 'tahil',
      f_whey: 'sporcu',
      f_cucumber: 'sebze',
      t_kiymali_patates: 'yemek',
      u_edamame: 'baklagil',
      u_bal_kabagi_pismis: 'sebze',
      u_hindistan_cevizi_yagi: 'yag',
      t_tavuk_gogsu_tatli: 'tatli',
    };
    for (const [id, cat] of Object.entries(exp)) expect(categoryOf(findFood(id)), id).toBe(cat);
    const names = {
      'Cheddar peyniri': 'sut',
      'Su böreği': 'yemek',
      'Tavuk göğsü (ızgara, derisiz)': 'et',
      'Mercimek çorbası': 'yemek',
      Ayran: 'icecek',
      'Portakal suyu': 'icecek',
      Bal: 'tatli',
      Zeytinyağı: 'yag',
      Ketçap: 'diger',
      'Kırmızı mercimek (çiğ)': 'baklagil',
      Muz: 'meyve',
      Badem: 'kuruyemis',
    };
    for (const [n, cat] of Object.entries(names)) {
      const f = byName(n);
      expect(f, n).toBeTruthy();
      expect(categoryOf(f), n).toBe(cat);
    }
  });
  it('kişisel besinin seçtiği hazır kategori önceliklidir; tarif ve barkodlu ürünün varsayılanı vardır', () => {
    expect(categoryOf({ id: 'c1', name: 'Tavuk', category: 'sporcu' })).toBe('sporcu');
    expect(categoryOf({ id: 'c2', name: 'Ev yemeği', recipe: { items: [] } })).toBe('yemek');
    expect(categoryOf({ id: 'c3', name: 'X marka bar', barcode: '869' })).toBe('paketli');
    expect(categoryOf({ id: 'c4', name: 'Tanımsız şey' })).toBe('diger');
    // bilinmeyen/zararlı kategori adı yok sayılır
    expect(categoryOf({ id: 'c5', name: 'Muz', category: 'toString' })).toBe('meyve');
    expect(categoryOf(null)).toBe('diger');
  });
  it('etiketler eksiksiz', () => {
    for (const [k] of FOOD_CATEGORIES) expect(CATEGORY_LABEL[k]).toBeTruthy();
  });
});

describe('Favoriler', () => {
  it('ekle/çıkar ve bozuk girdiye dayanıklılık', () => {
    expect(toggleFavorite([], 'f_egg')).toEqual(['f_egg']);
    expect(toggleFavorite(['f_egg', 'f_oats'], 'f_egg')).toEqual(['f_oats']);
    expect(toggleFavorite(null, 'x')).toEqual(['x']);
    expect(toggleFavorite(['a', 5, null], 'b')).toEqual(['a', 'b']);
  });
});

describe('Kişisel kategoriler', () => {
  const uc = [{ id: 'uc_1', name: 'Kahvaltılıklar' }];
  it('ad doğrulaması', () => {
    expect(catNameError('', uc)).toMatch(/boş/);
    expect(catNameError('   ', uc)).toMatch(/boş/);
    expect(catNameError('x'.repeat(41), uc)).toMatch(/40/);
    expect(catNameError('kahvaltılıklar', uc)).toMatch(/zaten/);
    expect(catNameError('KAHVALTILIKLAR', uc, 'uc_1')).toBeNull(); // kendi adını büyük harfe çevirmek serbest
    expect(catNameError('Meyveler', uc)).toMatch(/hazır/);
    expect(catNameError('Diyet atıştırmalıkları', uc)).toBeNull();
    const many = Array.from({ length: MAX_USER_CATEGORIES }, (_, i) => ({ id: `uc_${i}`, name: `K${i}` }));
    expect(catNameError('Yeni', many)).toMatch(/En fazla/);
  });
  it('kimlikler uc_ önekli ve benzersiz', () => {
    const a = newUserCatId();
    const b = newUserCatId();
    expect(a).toMatch(/^uc_/);
    expect(a).not.toBe(b);
  });
  it('silme yalnızca o kategorinin atamalarını kaldırır; hazır kategoriler silinemez', () => {
    const ucats = [...uc, { id: 'uc_2', name: 'Akşam' }];
    const assign = { f_egg: 'uc_1', f_oats: 'uc_2', c_x: 'uc_1' };
    const r = deleteUserCat(ucats, assign, 'uc_1');
    expect(r.ucats).toEqual([{ id: 'uc_2', name: 'Akşam' }]);
    expect(r.assign).toEqual({ f_oats: 'uc_2' });
    // girdiler değiştirilmez
    expect(assign.f_egg).toBe('uc_1');
    const r2 = deleteUserCat(ucats, assign, 'meyve');
    expect(r2.ucats).toHaveLength(2);
    expect(r2.assign).toEqual(assign);
  });
  it('bozuk kayıtlar ayıklanır', () => {
    expect(cleanUserCats([{ id: 'uc_1', name: 'A' }, { id: 'meyve', name: 'B' }, { id: 'uc_2', name: '' }, null])).toEqual([{ id: 'uc_1', name: 'A' }]);
    expect(cleanUserCats('bozuk')).toEqual([]);
  });
  it('hazır ve kişisel besinler kişisel kategoride listelenir; sayım ikisini de içerir', () => {
    const custom = [{ id: 'c_tarator', name: 'Havuç tarator (benim)', k: 120, p: 3, c: 8, f: 9, custom: true }];
    const assign = { f_egg: 'uc_1', c_tarator: 'uc_1' };
    const pool = allFoods(custom);
    const inUc = pool.filter((f) => inCategory(f, 'uc_1', assign)).map((f) => f.id);
    expect(inUc.sort()).toEqual(['c_tarator', 'f_egg']);
    const counts = categoryCounts(pool, assign);
    expect(counts.uc_1).toBe(2);
    // aynı besin hazır kategorisinde de görünür
    expect(inCategory(findFood('f_egg'), 'et', assign)).toBe(true);
  });
});

describe('Kategoriyle süzülmüş arama', () => {
  it('arama sonucu yalnızca seçili kategoriden gelir', () => {
    const all = searchFoods('tavuk');
    expect(all.some((f) => categoryOf(f) === 'yemek')).toBe(true);
    const et = searchFoods('tavuk', [], null, { filter: (f) => categoryOf(f) === 'et' });
    expect(et.length).toBeGreaterThan(3);
    expect(et.every((f) => categoryOf(f) === 'et')).toBe(true);
  });
  it('düzeltilmiş hazır besin aramada tek kez çıkar (orijinal gizlenir)', () => {
    const custom = [{ id: 'c_ov', name: 'Yumurta', overrides: 'f_egg', k: 150, p: 13, c: 1, f: 10 }];
    const pool = allFoods(custom);
    expect(pool.filter((f) => f.id === 'f_egg')).toHaveLength(0);
    expect(pool.find((f) => f.id === 'c_ov').custom).toBe(true);
  });
});
