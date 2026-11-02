import { describe, it, expect } from 'vitest';
import { resolveItem, recipeTotals, recipeNutrition, scaleItems, itemGrams, normalizeRecipe, basisWeight } from '../../public/js/recipes.js';
import { findFood, nutrientsFor } from '../../public/js/data/foods.js';

const egg = findFood('f_egg');
const chicken = findFood('f_chk_breast_raw');

describe('Tarif hesapları', () => {
  it('adet ölçüsü besine özel gramla çevrilir; toplamlar merkezi hesapla tutarlı', () => {
    expect(itemGrams(egg, 'adet', 2)).toBe(100);
    expect(itemGrams(egg, 'gram', 75)).toBe(75);
    expect(itemGrams(egg, 'olmayan ölçü', 1)).toBeNull();
    expect(itemGrams(egg, 'adet', 0)).toBeNull();
    const items = [resolveItem({ food_id: 'f_egg', name: 'Yumurta', grams: 100 }), resolveItem({ food_id: 'f_chk_breast_raw', name: 'Tavuk', grams: 200 })];
    const { totals, complete } = recipeTotals(items);
    expect(complete).toBe(true);
    expect(totals.g).toBe(300);
    expect(Math.round(totals.k)).toBe(nutrientsFor(egg, 100).kcal + nutrientsFor(chicken, 200).kcal);
  });

  it('pişmiş ağırlık girilince 100 g ve porsiyon ona göre; girilmezse çiğ toplam', () => {
    const items = [resolveItem({ food_id: 'f_chk_breast_raw', name: 'Tavuk', grams: 400 })];
    const { totals } = recipeTotals(items);
    const raw = recipeNutrition(totals, 2, null);
    const cooked = recipeNutrition(totals, 2, 300);
    expect(raw.basis).toEqual({ grams: 400, cooked: false });
    expect(raw.portion_g).toBe(200);
    expect(cooked.basis).toEqual({ grams: 300, cooked: true });
    expect(cooked.portion_g).toBe(150);
    expect(cooked.k).toBe(Math.round((totals.k / 300) * 100));
    // porsiyon başı kalori iki durumda da aynı (toplam / porsiyon)
    expect(Math.round((raw.k * raw.portion_g) / 100)).toBeCloseTo(Math.round((cooked.k * cooked.portion_g) / 100), -1);
    expect(basisWeight(400, '')).toEqual({ grams: 400, cooked: false });
  });

  it('2 porsiyon → 4 porsiyon ve 1,5 porsiyon ölçekleme (miktar ve gram)', () => {
    const items = [{ name: 'Tavuk', grams: 200, unit: 'gram', qty: 200 }, { name: 'Pirinç', grams: 100, unit: 'gram', qty: 100 }, { name: 'Yağ', grams: 10, unit: 'yemek kaşığı', qty: 1 }];
    expect(scaleItems(items, 4 / 2).map((x) => [x.grams, x.qty])).toEqual([[400, 400], [200, 200], [20, 2]]);
    expect(scaleItems(items, 1.5 / 2).map((x) => x.grams)).toEqual([150, 75, 7.5]);
    expect(scaleItems(items, 0)).toBe(items);
  });

  it('besini silinmiş malzeme anlık görüntüyle hesaplanır; görüntü de yoksa eksik sayılır (sıfır kabul edilmez)', () => {
    const snap = { k: 120, p: 20, c: 0, f: 4, fb: null, na: 60, ka: null };
    const a = resolveItem({ food_id: 'silinmis', name: 'Eski besin', grams: 100, snap });
    const b = resolveItem({ food_id: 'silinmis2', name: 'Bilinmeyen', grams: 50 });
    expect(a.status).toBe('snapshot');
    expect(b.status).toBe('missing');
    const r = recipeTotals([a, b]);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['Bilinmeyen']);
    expect(r.totals.k).toBe(120);
    expect(r.totals.fb).toBeNull(); // bir malzemede bilinmiyor → toplam bilinmiyor
    expect(r.totals.na).toBe(60);
  });

  it('eski tarif (yalnızca servings + items{food_id,name,grams}) güvenli varsayılanlarla okunur', () => {
    const R = normalizeRecipe({ recipe: { servings: 3, items: [{ food_id: 'f_egg', name: 'Yumurta', grams: 150 }, null, {}] } });
    expect(R).toMatchObject({ servings: 3, cooked_weight: null, category: 'diger', tags: [], steps: [], prep_min: null });
    expect(R.items).toHaveLength(1);
    expect(normalizeRecipe({}).servings).toBe(1);
    expect(normalizeRecipe({ recipe: { servings: 0, items: 'bozuk' } })).toMatchObject({ servings: 1, items: [] });
  });
});
