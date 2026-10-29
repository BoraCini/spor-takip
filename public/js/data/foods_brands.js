// Türkiye'de sık satılan markalı ürünler — 100 g/ml başına etiket değerleri.
// Kaynak: ürünlerin Migros sanal market sayfalarındaki besin değerleri tabloları (Ekim 2026); Banvit tavuk göğsü FatSecret'taki marka kaydından.
// İçim Süzme'de sayfadaki kcal hatalıydı, makrolardan hesaplandı. Tarifler değişebilir; paketle karşılaştır.
// Sıra: id, ad, arama kelimeleri, kcal, protein, karbonhidrat, yağ, lif, tuz (g), porsiyonlar
const R = [
  // Yoğurt
  ['b_eker_suzme', 'Eker Süzme Yoğurt', 'eker suzme yogurt', 95, 5.6, 5, 5.8, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  ['b_eker_kaymakli_yog', 'Eker Kaymaklı Yoğurt', 'eker kaymakli yogurt', 94, 5.1, 7.3, 4.9, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  ['b_eker_yarim_yog', 'Eker Yarım Yağlı Kaymaksız Yoğurt', 'eker yarim yagli kaymaksiz yogurt', 54, 4, 6.2, 1.5, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  ['b_sutas_suzme', 'Sütaş Süzme Yoğurt', 'sutas suzme yogurt', 97, 8, 3.9, 5.5, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  ['b_sutas_light_yog', 'Sütaş Light Yoğurt', 'sutas light yogurt az yagli', 55, 4, 6.5, 1.5, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  ['b_icim_suzme', 'İçim Süzme Yoğurt', 'icim suzme yogurt', 107, 6.5, 5.7, 6.5, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  ['b_torku_suzme', 'Torku Süzme Yoğurt', 'torku seker sut suzme yogurt', 117, 8, 7.7, 6, 0, 0, [['kase', 150], ['yemek kaşığı', 30]]],
  // Ayran, kefir, süt
  ['b_eker_ayran', 'Eker Probiyotik Tam Yağlı Ayran', 'eker ayran', 43, 2, 3.5, 2.3, 0, 0.5, [['şişe/bardak', 195], ['su bardağı', 200]]],
  ['b_sutas_ayran', 'Sütaş Ayran', 'sutas ayran', 32, 2, 2, 1.8, 0, 0.6, [['su bardağı', 200], ['şişe', 300]]],
  ['b_eker_kefir', 'Eker Kefir', 'eker kefir sade', 52, 2.7, 3.2, 3.2, 0, 0, [['şişe', 200], ['su bardağı', 200]]],
  ['b_pinar_sut_25', 'Pınar Süt %2,5 Yağlı', 'pinar sut yarim yagli', 53, 3, 4.7, 2.5, 0, 0, [['su bardağı', 200]]],
  ['b_pinar_light_sut', 'Pınar Light Süt (yağsız)', 'pinar light extra light sut yagsiz', 33, 3.1, 5, 0.1, 0, 0, [['su bardağı', 200]]],
  ['b_icim_yarim_sut', 'İçim Yarım Yağlı Süt', 'icim sut yarim yagli', 45, 3.1, 4.7, 1.5, 0, 0.1, [['su bardağı', 200]]],
  ['b_pinar_protein_pro', 'Pınar Protein Pro+ Süt', 'pinar protein pro sut', 66, 10.4, 5.5, 0.3, 0, 0, [['şişe', 500], ['su bardağı', 200]]],
  ['b_pinar_protein_kakao', 'Pınar Protein Kakaolu Süt', 'pinar protein kakaolu sut', 49, 5.2, 6.5, 0.3, 0, 0, [['şişe', 500], ['kutu', 200]]],
  // Peynir
  ['b_pinar_beyaz_tam', 'Pınar Tam Yağlı Beyaz Peynir', 'pinar beyaz peynir tam yagli', 254, 16, 2.5, 20, 0, 2.7, [['dilim', 30], ['kibrit kutusu', 30]]],
  ['b_pinar_beyaz_protein', 'Pınar Az Yağlı Yüksek Proteinli Beyaz Peynir', 'pinar az yagli yuksek proteinli beyaz peynir', 184, 20, 3.5, 10, 0, 2.5, [['dilim', 30]]],
  ['b_pinar_suzme_protein', 'Pınar Yüksek Proteinli Süzme Peynir', 'pinar yuksek proteinli suzme peynir', 184, 14, 4.9, 12, 0, 1.3, [['yemek kaşığı', 25]]],
  ['b_pinar_suzme_yarim', 'Pınar Yarım Yağlı Süzme Peynir', 'pinar yarim yagli suzme peynir', 159, 11, 5.3, 10, 0, 2, [['yemek kaşığı', 25]]],
  ['b_sutas_suzme_peynir', 'Sütaş Süzme Peynir', 'sutas suzme peynir', 218, 11, 3, 18, 0, 1.8, [['yemek kaşığı', 25]]],
  ['b_pinar_labne', 'Pınar Labne', 'pinar labne', 194, 4.5, 3.5, 18, 0, 0.7, [['yemek kaşığı', 20]]],
  ['b_sutas_kasar', 'Sütaş Kaşar Peyniri', 'sutas kasar peyniri', 325, 24, 1, 25, 0, 1.6, [['dilim', 20]]],
  ['b_torku_lor', 'Torku Yarım Yağlı Lor Peyniri', 'torku lor peyniri yarim yagli', 150, 10.6, 3.3, 10.5, 0, 1.8, [['yemek kaşığı', 30]]],
  // Ton balığı, et
  ['b_dardanel_light', 'Dardanel Light Ton Balığı (süzülmüş)', 'dardanel light ton baligi', 95, 23.5, 0, 0.4, 0, 1, [['kutu (süzülmüş)', 100]]],
  ['b_dardanel_zeytinyagli', 'Dardanel Zeytinyağlı Ton Balığı', 'dardanel zeytinyagli ton baligi', 212, 23.5, 0, 12.4, 0, 1.7, [['kutu (süzülmüş)', 120]]],
  ['b_banvit_gogus', 'Banvit Tavuk Göğsü (çiğ)', 'banvit tavuk gogsu fileto cig', 102, 23.5, 0, 0.7, 0, null, [['porsiyon', 150]]],
];

export const FOODS_BRANDS = R.map(([id, name, alias, k, p, c, f, fb, salt, portions]) => ({
  id,
  name,
  alias,
  k,
  p,
  c,
  f,
  fb,
  na: salt == null ? null : Math.round(salt * 400),
  ka: null,
  portions,
  src: 'marka',
}));
