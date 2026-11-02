// Gömülü besin veritabanı — değerler 100 g başınadır.
// Kaynak: USDA FoodData Central ortalamaları; "~" ile işaretli yerel ürünler marka ve tarife göre değişir, yaklaşıktır.
// Alanlar: k=kcal, p=protein g, c=karbonhidrat g, f=yağ g, fb=lif g, na=sodyum mg, ka=potasyum mg
// portions: [etiket, gram]
import { FOODS_TR } from './foods_tr.js';
import { FOODS_USDA } from './foods_usda.js';
import { FOODS_BRANDS } from './foods_brands.js';

const BASE_FOODS = [
  // --- Yumurta, et, balık ---
  { id: 'f_egg', name: 'Yumurta', alias: 'yumurta haşlanmış haslanmis omlet', k: 147, p: 12.6, c: 0.8, f: 9.9, fb: 0, na: 142, ka: 138, portions: [['adet', 50]] },
  { id: 'f_eggwhite', name: 'Yumurta beyazı', alias: 'yumurta aki', k: 52, p: 10.9, c: 0.7, f: 0.2, fb: 0, na: 166, ka: 163, portions: [['adet', 33]] },
  { id: 'f_chk_breast', name: 'Tavuk göğsü (pişmiş)', alias: 'tavuk gogus izgara haslama fileto', k: 165, p: 31, c: 0, f: 3.6, fb: 0, na: 74, ka: 256, portions: [] },
  { id: 'f_chk_breast_raw', name: 'Tavuk göğsü (çiğ)', alias: 'tavuk gogus ciğ', k: 110, p: 23.1, c: 0, f: 1.2, fb: 0, na: 45, ka: 334, portions: [] },
  { id: 'f_chk_thigh', name: 'Tavuk but (pişmiş, derisiz)', alias: 'tavuk but baget pirzola', k: 209, p: 26, c: 0, f: 10.9, fb: 0, na: 88, ka: 240, portions: [] },
  { id: 'f_turkey', name: 'Hindi göğsü (pişmiş)', alias: 'hindi', k: 147, p: 30, c: 0, f: 2, fb: 0, na: 52, ka: 250, portions: [] },
  { id: 'f_beef_mince10', name: 'Dana kıyma %10 yağ (pişmiş)', alias: 'kiyma dana yagsiz', k: 217, p: 26.1, c: 0, f: 11.8, fb: 0, na: 72, ka: 318, portions: [] },
  { id: 'f_beef_mince20', name: 'Dana kıyma %20 yağ (pişmiş)', alias: 'kiyma dana yagli', k: 270, p: 25.6, c: 0, f: 17.8, fb: 0, na: 75, ka: 300, portions: [] },
  { id: 'f_beef_steak', name: 'Dana biftek (pişmiş, yağsız)', alias: 'et biftek bonfile antrikot kirmizi et', k: 217, p: 30, c: 0, f: 10, fb: 0, na: 60, ka: 330, portions: [] },
  { id: 'f_lamb', name: 'Kuzu eti (pişmiş)', alias: 'kuzu et pirzola', k: 294, p: 25, c: 0, f: 21, fb: 0, na: 72, ka: 310, portions: [] },
  { id: 'f_kofte', name: 'Köfte (ev yapımı) ~', alias: 'kofte izgara', k: 250, p: 20, c: 6, f: 16, fb: 0.5, na: 500, ka: 280, portions: [['adet', 30]] },
  { id: 'f_sucuk', name: 'Sucuk ~', alias: 'sucuk', k: 450, p: 20, c: 2, f: 40, fb: 0, na: 1400, ka: 250, portions: [['dilim', 8]] },
  { id: 'f_salmon', name: 'Somon (pişmiş)', alias: 'somon balik', k: 206, p: 22, c: 0, f: 12.4, fb: 0, na: 61, ka: 384, portions: [] },
  { id: 'f_tuna_water', name: 'Ton balığı (suda, süzülmüş)', alias: 'ton baligi konserve', k: 116, p: 25.5, c: 0, f: 0.8, fb: 0, na: 338, ka: 237, portions: [['kutu (süzülmüş)', 120]] },
  { id: 'f_tuna_oil', name: 'Ton balığı (yağlı, süzülmüş)', alias: 'ton baligi konserve yagli', k: 198, p: 29, c: 0, f: 8.2, fb: 0, na: 354, ka: 207, portions: [['kutu (süzülmüş)', 120]] },
  { id: 'f_whitefish', name: 'Levrek / çipura (pişmiş)', alias: 'levrek cipura balik', k: 124, p: 23.6, c: 0, f: 2.6, fb: 0, na: 87, ka: 328, portions: [] },
  { id: 'f_shrimp', name: 'Karides (pişmiş)', alias: 'karides', k: 99, p: 24, c: 0.2, f: 0.3, fb: 0, na: 111, ka: 259, portions: [] },

  // --- Süt ürünleri ---
  { id: 'f_milk_full', name: 'Süt (tam yağlı)', alias: 'sut', k: 61, p: 3.2, c: 4.8, f: 3.3, fb: 0, na: 43, ka: 132, portions: [['su bardağı', 200]] },
  { id: 'f_milk_semi', name: 'Süt (yarım yağlı %1,5)', alias: 'sut light yarim yagli', k: 46, p: 3.4, c: 4.8, f: 1.5, fb: 0, na: 44, ka: 150, portions: [['su bardağı', 200]] },
  { id: 'f_yog_full', name: 'Yoğurt (tam yağlı)', alias: 'yogurt', k: 61, p: 3.5, c: 4.7, f: 3.3, fb: 0, na: 46, ka: 155, portions: [['kase', 150]] },
  { id: 'f_yog_low', name: 'Yoğurt (yağsız)', alias: 'yogurt light yagsiz', k: 56, p: 5.7, c: 7.7, f: 0.2, fb: 0, na: 77, ka: 255, portions: [['kase', 150]] },
  { id: 'f_greek', name: 'Süzme yoğurt (yağsız)', alias: 'suzme yogurt greek yunan', k: 59, p: 10.2, c: 3.6, f: 0.4, fb: 0, na: 36, ka: 141, portions: [['kase', 150]] },
  { id: 'f_ayran', name: 'Ayran ~', alias: 'ayran', k: 36, p: 1.7, c: 2.3, f: 2, fb: 0, na: 280, ka: 80, portions: [['bardak', 200]] },
  { id: 'f_feta', name: 'Beyaz peynir (tam yağlı)', alias: 'beyaz peynir feta', k: 264, p: 14.2, c: 4.1, f: 21.3, fb: 0, na: 1116, ka: 62, portions: [['dilim', 30]] },
  { id: 'f_kasar', name: 'Kaşar peyniri ~', alias: 'kasar peynir', k: 360, p: 26, c: 2, f: 28, fb: 0, na: 650, ka: 90, portions: [['dilim', 20]] },
  { id: 'f_lor', name: 'Lor peyniri ~', alias: 'lor peynir cottage', k: 98, p: 11, c: 3.4, f: 4.3, fb: 0, na: 300, ka: 104, portions: [['yemek kaşığı', 30]] },
  { id: 'f_butter', name: 'Tereyağı', alias: 'tereyagi', k: 717, p: 0.9, c: 0.1, f: 81, fb: 0, na: 11, ka: 24, portions: [['tatlı kaşığı', 5], ['yemek kaşığı', 14]] },

  // --- Tahıllar, ekmek, nişasta ---
  { id: 'f_rice_cooked', name: 'Pirinç (beyaz, haşlanmış)', alias: 'pirinc haslanmis', k: 130, p: 2.7, c: 28, f: 0.3, fb: 0.4, na: 1, ka: 35, portions: [] },
  { id: 'f_rice_raw', name: 'Pirinç (beyaz, çiğ)', alias: 'pirinc cig', k: 365, p: 7.1, c: 80, f: 0.7, fb: 1.3, na: 5, ka: 115, portions: [] },
  { id: 'f_pilav', name: 'Pirinç pilavı (tereyağlı) ~', alias: 'pilav pirinc', k: 160, p: 3, c: 29, f: 3.5, fb: 0.4, na: 250, ka: 40, portions: [['porsiyon', 150]] },
  { id: 'f_bulgur_cooked', name: 'Bulgur (pişmiş)', alias: 'bulgur pilavi', k: 83, p: 3.1, c: 18.6, f: 0.2, fb: 4.5, na: 5, ka: 68, portions: [['porsiyon', 150]] },
  { id: 'f_bulgur_raw', name: 'Bulgur (çiğ)', alias: 'bulgur cig', k: 342, p: 12.3, c: 76, f: 1.3, fb: 18.3, na: 17, ka: 410, portions: [] },
  { id: 'f_pasta_cooked', name: 'Makarna (haşlanmış)', alias: 'makarna spagetti', k: 158, p: 5.8, c: 31, f: 0.9, fb: 1.8, na: 1, ka: 44, portions: [['porsiyon', 200]] },
  { id: 'f_pasta_raw', name: 'Makarna (çiğ)', alias: 'makarna cig', k: 371, p: 13, c: 75, f: 1.5, fb: 3.2, na: 6, ka: 223, portions: [] },
  { id: 'f_oats', name: 'Yulaf ezmesi', alias: 'yulaf', k: 379, p: 13.2, c: 67.7, f: 6.5, fb: 10.1, na: 6, ka: 362, portions: [['yemek kaşığı', 10], ['su bardağı', 90], ['kase', 80]] },
  { id: 'f_quinoa', name: 'Kinoa (pişmiş)', alias: 'kinoa', k: 120, p: 4.4, c: 21.3, f: 1.9, fb: 2.8, na: 7, ka: 172, portions: [] },
  { id: 'f_bread_ww', name: 'Tam buğday ekmeği', alias: 'ekmek tam bugday kepekli', k: 252, p: 12.4, c: 42.7, f: 3.5, fb: 6, na: 455, ka: 250, portions: [['dilim', 28]] },
  { id: 'f_bread_white', name: 'Beyaz ekmek', alias: 'ekmek beyaz francala', k: 266, p: 8.9, c: 49, f: 3.3, fb: 2.7, na: 490, ka: 120, portions: [['dilim', 30]] },
  { id: 'f_lavas', name: 'Lavaş / tortilla', alias: 'lavas tortilla durum', k: 312, p: 8.3, c: 52, f: 8, fb: 3.5, na: 600, ka: 140, portions: [['adet', 60]] },
  { id: 'f_simit', name: 'Simit ~', alias: 'simit', k: 330, p: 10, c: 55, f: 8, fb: 3, na: 600, ka: 150, portions: [['adet', 100]] },
  { id: 'f_ricecake', name: 'Pirinç patlağı', alias: 'pirinc patlagi', k: 387, p: 8.2, c: 81.5, f: 2.8, fb: 4.2, na: 29, ka: 290, portions: [['adet', 9]] },
  { id: 'f_cornflakes', name: 'Mısır gevreği', alias: 'misir gevregi corn flakes', k: 357, p: 7.5, c: 84, f: 0.4, fb: 3.3, na: 729, ka: 168, portions: [['kase', 30]] },
  { id: 'f_potato', name: 'Patates (haşlanmış)', alias: 'patates', k: 87, p: 1.9, c: 20, f: 0.1, fb: 1.8, na: 4, ka: 379, portions: [['orta boy', 170]] },
  { id: 'f_sweetpotato', name: 'Tatlı patates (fırın)', alias: 'tatli patates', k: 90, p: 2, c: 20.7, f: 0.2, fb: 3.3, na: 36, ka: 475, portions: [['orta boy', 150]] },
  { id: 'f_fries', name: 'Patates kızartması', alias: 'patates kizartmasi', k: 312, p: 3.4, c: 41, f: 15, fb: 3.8, na: 210, ka: 579, portions: [['porsiyon', 120]] },

  // --- Baklagiller ---
  { id: 'f_lentil', name: 'Mercimek (haşlanmış)', alias: 'mercimek', k: 116, p: 9, c: 20, f: 0.4, fb: 7.9, na: 2, ka: 369, portions: [] },
  { id: 'f_lentil_raw', name: 'Kırmızı mercimek (çiğ)', alias: 'mercimek cig', k: 358, p: 24, c: 63, f: 2.2, fb: 10.8, na: 7, ka: 578, portions: [] },
  { id: 'f_lentil_soup', name: 'Mercimek çorbası ~', alias: 'corba mercimek', k: 60, p: 3.5, c: 9, f: 1.5, fb: 2.5, na: 300, ka: 150, portions: [['kase', 250]] },
  { id: 'f_chickpea', name: 'Nohut (haşlanmış)', alias: 'nohut', k: 164, p: 8.9, c: 27.4, f: 2.6, fb: 7.6, na: 7, ka: 291, portions: [] },
  { id: 'f_beans', name: 'Kuru fasulye (haşlanmış)', alias: 'kuru fasulye', k: 140, p: 8.2, c: 26, f: 0.6, fb: 10.5, na: 0, ka: 389, portions: [] },

  // --- Meyve ---
  { id: 'f_banana', name: 'Muz', alias: 'muz', k: 89, p: 1.1, c: 22.8, f: 0.3, fb: 2.6, na: 1, ka: 358, portions: [['adet', 120]] },
  { id: 'f_apple', name: 'Elma', alias: 'elma', k: 52, p: 0.3, c: 13.8, f: 0.2, fb: 2.4, na: 1, ka: 107, portions: [['adet', 180]] },
  { id: 'f_orange', name: 'Portakal', alias: 'portakal mandalina', k: 47, p: 0.9, c: 11.8, f: 0.1, fb: 2.4, na: 0, ka: 181, portions: [['adet', 150]] },
  { id: 'f_strawberry', name: 'Çilek', alias: 'cilek', k: 32, p: 0.7, c: 7.7, f: 0.3, fb: 2, na: 1, ka: 153, portions: [] },
  { id: 'f_blueberry', name: 'Yaban mersini', alias: 'yaban mersini blueberry', k: 57, p: 0.7, c: 14.5, f: 0.3, fb: 2.4, na: 1, ka: 77, portions: [] },
  { id: 'f_grape', name: 'Üzüm', alias: 'uzum', k: 69, p: 0.7, c: 18, f: 0.2, fb: 0.9, na: 2, ka: 191, portions: [] },
  { id: 'f_watermelon', name: 'Karpuz', alias: 'karpuz', k: 30, p: 0.6, c: 7.6, f: 0.2, fb: 0.4, na: 1, ka: 112, portions: [['dilim', 300]] },
  { id: 'f_date', name: 'Hurma', alias: 'hurma', k: 277, p: 1.8, c: 75, f: 0.2, fb: 6.7, na: 1, ka: 696, portions: [['adet', 24]] },
  { id: 'f_raisin', name: 'Kuru üzüm', alias: 'kuru uzum', k: 299, p: 3.1, c: 79, f: 0.5, fb: 3.7, na: 11, ka: 749, portions: [] },
  { id: 'f_apricot_dry', name: 'Kuru kayısı', alias: 'kuru kayisi', k: 241, p: 3.4, c: 62.6, f: 0.5, fb: 7.3, na: 10, ka: 1162, portions: [['adet', 8]] },
  { id: 'f_avocado', name: 'Avokado', alias: 'avokado', k: 160, p: 2, c: 8.5, f: 14.7, fb: 6.7, na: 7, ka: 485, portions: [['yarım', 70]] },

  // --- Sebze ---
  { id: 'f_broccoli', name: 'Brokoli', alias: 'brokoli', k: 34, p: 2.8, c: 6.6, f: 0.4, fb: 2.6, na: 33, ka: 316, portions: [] },
  { id: 'f_spinach', name: 'Ispanak (çiğ)', alias: 'ispanak', k: 23, p: 2.9, c: 3.6, f: 0.4, fb: 2.2, na: 79, ka: 558, portions: [] },
  { id: 'f_tomato', name: 'Domates', alias: 'domates', k: 18, p: 0.9, c: 3.9, f: 0.2, fb: 1.2, na: 5, ka: 237, portions: [['adet', 120]] },
  { id: 'f_cucumber', name: 'Salatalık', alias: 'salatalik hiyar', k: 15, p: 0.7, c: 3.6, f: 0.1, fb: 0.5, na: 2, ka: 147, portions: [['adet', 150]] },
  { id: 'f_lettuce', name: 'Marul / yeşillik', alias: 'marul salata yesillik roka', k: 15, p: 1.4, c: 2.9, f: 0.2, fb: 1.3, na: 28, ka: 194, portions: [] },
  { id: 'f_carrot', name: 'Havuç', alias: 'havuc', k: 41, p: 0.9, c: 9.6, f: 0.2, fb: 2.8, na: 69, ka: 320, portions: [['adet', 70]] },
  { id: 'f_pepper', name: 'Biber (yeşil)', alias: 'biber', k: 20, p: 0.9, c: 4.6, f: 0.2, fb: 1.7, na: 3, ka: 175, portions: [] },
  { id: 'f_onion', name: 'Soğan', alias: 'sogan', k: 40, p: 1.1, c: 9.3, f: 0.1, fb: 1.7, na: 4, ka: 146, portions: [] },
  { id: 'f_mushroom', name: 'Mantar', alias: 'mantar', k: 22, p: 3.1, c: 3.3, f: 0.3, fb: 1, na: 5, ka: 318, portions: [] },

  // --- Yağlar, kuruyemiş ---
  { id: 'f_olive_oil', name: 'Zeytinyağı', alias: 'zeytinyagi yag', k: 884, p: 0, c: 0, f: 100, fb: 0, na: 2, ka: 1, portions: [['tatlı kaşığı', 5], ['yemek kaşığı', 13.5]] },
  { id: 'f_olive', name: 'Zeytin (yeşil)', alias: 'zeytin', k: 145, p: 1, c: 3.8, f: 15.3, fb: 3.3, na: 1556, ka: 42, portions: [['adet', 4]] },
  { id: 'f_pb', name: 'Fıstık ezmesi (sade)', alias: 'fistik ezmesi peanut butter', k: 588, p: 25, c: 20, f: 50, fb: 6, na: 17, ka: 649, portions: [['yemek kaşığı', 16]] },
  { id: 'f_almond', name: 'Badem', alias: 'badem', k: 579, p: 21, c: 21.6, f: 49.9, fb: 12.5, na: 1, ka: 733, portions: [['avuç', 28]] },
  { id: 'f_walnut', name: 'Ceviz', alias: 'ceviz', k: 654, p: 15.2, c: 13.7, f: 65.2, fb: 6.7, na: 2, ka: 441, portions: [['avuç', 28]] },
  { id: 'f_hazelnut', name: 'Fındık', alias: 'findik', k: 628, p: 15, c: 16.7, f: 60.8, fb: 9.7, na: 0, ka: 680, portions: [['avuç', 28]] },
  { id: 'f_tahini', name: 'Tahin', alias: 'tahin', k: 595, p: 17, c: 21, f: 54, fb: 9.3, na: 115, ka: 414, portions: [['yemek kaşığı', 15]] },
  { id: 'f_chia', name: 'Chia tohumu', alias: 'chia', k: 486, p: 16.5, c: 42, f: 30.7, fb: 34.4, na: 16, ka: 407, portions: [['yemek kaşığı', 12]] },
  { id: 'f_flax', name: 'Keten tohumu', alias: 'keten tohumu', k: 534, p: 18.3, c: 28.9, f: 42.2, fb: 27.3, na: 30, ka: 813, portions: [['yemek kaşığı', 10]] },

  // --- Takviye, tatlı, içecek ---
  { id: 'f_whey', name: 'Whey protein tozu ~', alias: 'whey protein tozu', k: 400, p: 80, c: 7, f: 5, fb: 0, na: 200, ka: 400, portions: [['ölçek', 30]] },
  { id: 'f_honey', name: 'Bal', alias: 'bal', k: 304, p: 0.3, c: 82.4, f: 0, fb: 0.2, na: 4, ka: 52, portions: [['tatlı kaşığı', 7], ['yemek kaşığı', 21]] },
  { id: 'f_sugar', name: 'Şeker', alias: 'seker', k: 387, p: 0, c: 100, f: 0, fb: 0, na: 1, ka: 2, portions: [['küp', 4], ['tatlı kaşığı', 4]] },
  { id: 'f_jam', name: 'Reçel', alias: 'recel', k: 278, p: 0.4, c: 69, f: 0.1, fb: 1.1, na: 32, ka: 77, portions: [['yemek kaşığı', 20]] },
  { id: 'f_darkchoc', name: 'Bitter çikolata (%70)', alias: 'cikolata bitter', k: 598, p: 7.8, c: 46, f: 43, fb: 10.9, na: 20, ka: 715, portions: [['kare', 10]] },
  { id: 'f_milkchoc', name: 'Sütlü çikolata', alias: 'cikolata sutlu', k: 535, p: 7.6, c: 59, f: 30, fb: 3.4, na: 79, ka: 372, portions: [['kare', 10]] },
  { id: 'f_icecream', name: 'Dondurma (vanilyalı)', alias: 'dondurma', k: 207, p: 3.5, c: 23.6, f: 11, fb: 0.7, na: 80, ka: 199, portions: [['top', 60]] },
  { id: 'f_pizza', name: 'Pizza (karışık) ~', alias: 'pizza', k: 266, p: 11, c: 33, f: 10, fb: 2.3, na: 600, ka: 180, portions: [['dilim', 110]] },
  { id: 'f_burger', name: 'Hamburger ~', alias: 'hamburger burger', k: 250, p: 13, c: 25, f: 11, fb: 1.5, na: 480, ka: 230, portions: [['adet', 220]] },
  { id: 'f_cola', name: 'Kola', alias: 'kola gazli icecek', k: 42, p: 0, c: 10.6, f: 0, fb: 0, na: 4, ka: 2, portions: [['kutu', 330]] },
  { id: 'f_oj', name: 'Portakal suyu', alias: 'portakal suyu meyve suyu', k: 45, p: 0.7, c: 10.4, f: 0.2, fb: 0.2, na: 1, ka: 200, portions: [['su bardağı', 200]] },
  { id: 'f_coffee', name: 'Kahve (sade)', alias: 'kahve filtre americano espresso', k: 2, p: 0.3, c: 0, f: 0, fb: 0, na: 2, ka: 49, portions: [['fincan', 200]] },
  { id: 'f_tea', name: 'Çay (şekersiz)', alias: 'cay', k: 1, p: 0, c: 0.3, f: 0, fb: 0, na: 3, ka: 37, portions: [['ince belli', 100]] },
];

export const FOODS = [...BASE_FOODS, ...FOODS_TR, ...FOODS_USDA, ...FOODS_BRANDS];
export const FOOD_ATTRIBUTION = 'Temel besin değerleri: USDA FoodData Central (SR Legacy), TempoLife (tempolife.app) derlemesi üzerinden, CC-BY-4.0. Türkçe adlar ve porsiyonlar Pro Coach tarafından eklendi.';

// ---------- Porsiyon ve ölçü sistemi ----------
// Porsiyonlar eski biçimde kalır: [etiket, gram] dizisi (ör. [['adet', 50], ['dilim', 30]]).
// Her porsiyonun gram karşılığı O BESİNE ÖZELDİR: hacim ölçüleri genel olarak grama çevrilmez
// (1 yemek kaşığı zeytinyağı ≠ 1 yemek kaşığı yulaf). Gram karşılığı bilinmeyen ölçü kullanılmaz.
// Besinin temel birimi 'g' (varsayılan) ya da 'ml'dir; besin değerleri 100 g ya da 100 ml içindir.
// İç hesaplarda "grams" alanı her zaman temel birim miktarıdır (ml besinde ml).
export const UNIT_TYPES = ['adet', 'dilim', 'su bardağı', 'çay bardağı', 'yemek kaşığı', 'tatlı kaşığı', 'çay kaşığı', 'kase', 'porsiyon', 'avuç', 'ölçek', 'paket', 'kutu', 'ml'];
export const MAX_PORTIONS = 10;
export const baseUnit = (food) => (food && food.base === 'ml' ? 'ml' : 'g');

// Geçerli porsiyonlar; varsayılan (default_portion) öne alınır. Bozuk/eksik elemanlar atlanır.
export function portionsOf(food) {
  const list = ((food && food.portions) || [])
    .filter((p) => Array.isArray(p) && String(p[0] || '').trim() && Number(p[1]) > 0 && String(p[0]) !== 'gram')
    .map((p) => [String(p[0]).trim(), Number(p[1])]);
  const d = food && food.default_portion;
  if (d) {
    const i = list.findIndex((p) => p[0] === d);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
  }
  return list;
}

// "1 ölçek", "0,5 ölçek", "250 ml" gibi porsiyon etiketi
export function portionLabel(qty, unit) {
  const q = Number(qty);
  if (!q || q === 1) return unit;
  return `${String(Math.round(q * 100) / 100).replace('.', ',')} ${unit}`;
}

// Geçerli miktar: sıfırdan büyük, sonlu sayı
export const validAmount = (g) => typeof g === 'number' && isFinite(g) && g > 0;

// Porsiyon düzenleyici satırlarını doğrular: miktar × ölçü = gram. Döner { portions, default_portion } ya da { error }.
export function parsePortionRows(rows) {
  const parseNum = (t) => (String(t).trim() === '' ? NaN : Number(String(t).trim().replace(',', '.')));
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const unit = (r.unit === 'ozel' ? r.custom : r.unit || '').trim();
    const q = r.qty === '' || r.qty == null ? 1 : parseNum(String(r.qty));
    const g = parseNum(String(r.grams ?? ''));
    if (!unit && (r.grams === '' || r.grams == null)) continue; // tamamen boş satır
    if (!unit) return { error: 'Her porsiyona bir ölçü seç ya da yaz.' };
    if (!validAmount(q)) return { error: `"${unit}" için miktar sıfırdan büyük olmalı.` };
    if (!validAmount(g)) return { error: `"${portionLabel(q, unit)}" için gram karşılığını gir (sıfırdan büyük).` };
    const label = portionLabel(q, unit).slice(0, 30);
    if (label === 'gram' || seen.has(label)) return { error: `"${label}" iki kez tanımlanmış.` };
    seen.add(label);
    out.push({ label, grams: Math.round(g * 10) / 10, def: !!r.def });
  }
  if (out.length > MAX_PORTIONS) return { error: `En fazla ${MAX_PORTIONS} porsiyon tanımlanabilir.` };
  return { portions: out.map((p) => [p.label, p.grams]), default_portion: (out.find((p) => p.def) || out[0] || {}).label || null };
}

// Varsayılan porsiyon: son kullanılan miktar (ölçü hâlâ varsa), yoksa varsayılan porsiyon, yoksa 100 g/ml
export function defaultServing(food, last = null) {
  const portions = portionsOf(food);
  if (last && last.grams > 0) {
    if (last.unit && last.unit !== 'gram' && portions.some((p) => p[0] === last.unit)) return { unit: last.unit, qty: last.qty || 1, grams: last.grams };
    return { unit: 'gram', qty: last.grams, grams: last.grams };
  }
  const p = portions[0];
  if (p) return { unit: p[0], qty: 1, grams: p[1] };
  return { unit: 'gram', qty: 100, grams: 100 };
}

const trNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
// "1 orta boy (173 g)" gibi porsiyon metni; base: 'g' | 'ml'
export function servingText(unit, qty, grams, base = 'g') {
  if (!unit || unit === 'gram') return `${trNum(grams)} ${base}`;
  return `${trNum(qty)} ${unit} (${trNum(Math.round(grams))} ${base})`;
}

// Besin değerini miktara göre hesapla (merkezi hesap; günlük kayıt, tarif ve şablonlar hep bunu kullanır).
// Lif, sodyum ve potasyum bilinmiyorsa (null/undefined) sonuç da null döner: bilinmeyen değer sıfır gibi gösterilmez.
export function nutrientsFor(food, grams) {
  const r = grams / 100;
  const v = (x) => Math.round((x || 0) * r * 10) / 10;
  const opt = (x, d) => (x == null || x === '' || isNaN(Number(x)) ? null : Math.round(Number(x) * r * d) / d);
  return {
    kcal: Math.round((food.k || 0) * r),
    protein_g: v(food.p),
    carb_g: v(food.c),
    fat_g: v(food.f),
    fiber_g: opt(food.fb, 10),
    sodium_mg: opt(food.na, 1),
    potassium_mg: opt(food.ka, 1),
  };
}

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Basit Levenshtein (kısa kelimeler için yazım hatası toleransı)
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function wordScore(w, nameN, hayWords) {
  if (nameN === w || nameN.startsWith(w + ' ')) return 4.5;
  if (hayWords.includes(w)) return 4.2;
  if (nameN.startsWith(w)) return 4;
  if (hayWords.some((h) => h.startsWith(w))) return 3;
  if (hayWords.some((h) => h.includes(w))) return 2;
  if (w.length >= 4 && hayWords.some((h) => lev(w, h.slice(0, w.length)) <= 1 || lev(w, h) <= 1)) return 1;
  return -1;
}

// Tek kelimelik genel aramalarda en sık kullanılan temel besinler öne çıksın (kullanım geçmişi oluşana kadar)
const STAPLES = new Set(['f_feta', 'u_dana_kiyma_10_yag_cig', 'f_milk_semi', 'f_chk_breast_raw', 'f_bread_white', 'f_yog_full', 'f_egg', 'f_oats', 'f_banana', 'f_pilav']);

// Kullanıcının düzelttiği besinler (custom.overrides = orijinal id) orijinalin yerine geçer
export function searchFoods(query, custom = [], usage = null) {
  const replaced = new Set(custom.filter((c) => c.overrides).map((c) => c.overrides));
  const all = [...custom.map((c) => ({ ...c, custom: true })), ...FOODS.filter((f) => !replaced.has(f.id))];
  const q = norm(query);
  if (!q) return all.slice(0, 60);
  const words = q.split(' ');
  const scored = [];
  const partial = [];
  for (const f of all) {
    const nameN = norm(f.name);
    const hayWords = (nameN + ' ' + norm(f.alias || '')).split(' ').filter(Boolean);
    let score = 0;
    let hits = 0;
    const nameWords = nameN.split(' ').filter(Boolean);
    for (const w of words) {
      const sc = wordScore(w, nameN, hayWords);
      if (sc < 0) continue;
      score += sc;
      hits++;
      // kelime besinin kendi adında geçiyorsa (sadece arama kelimelerinde değil) öne al: "kıyma" → Dana kıyma, Adana kebap değil
      if (nameWords.includes(w)) score += 0.5;
      else if (nameWords.some((h) => h.startsWith(w))) score += 0.25;
    }
    if (f.custom) score += 0.5;
    if (words.length === 1 && STAPLES.has(f.id)) score += 0.8;
    // Aranan kelimeyle başlayan sade besinler (örn. "Patates (çiğ)") yemeklerin önüne geçsin
    if (norm(f.name.split(/[(,]/)[0]) === q) score += 1.5;
    else if (nameN === q || nameN.startsWith(q + ' ')) score += 1;
    if (usage && (usage.get(f.id) || (f.overrides && usage.get(f.overrides)))) score += Math.min(2, 0.5 + (usage.get(f.id) || usage.get(f.overrides)) * 0.25);
    if (hits === words.length) scored.push([score, f, nameN.length]);
    else if (hits > 0 && words.length > 1) partial.push([score, f, nameN.length]);
  }
  const by = (a, b) => b[0] - a[0] || a[2] - b[2];
  scored.sort(by);
  partial.sort(by);
  return [...scored, ...partial].map((x) => x[1]).slice(0, 60);
}

export function bestMatch(name, custom = []) {
  const res = searchFoods(name, custom);
  if (res.length) return res[0];
  // kelime kelime dene (en uzun eşleşen kelime)
  const words = norm(name)
    .split(' ')
    .filter((w) => w.length > 2)
    .sort((a, b) => b.length - a.length);
  for (const w of words) {
    const r = searchFoods(w, custom);
    if (r.length) return r[0];
  }
  return null;
}

export function findFood(id, custom = []) {
  return custom.find((c) => c.id === id) || custom.find((c) => c.overrides === id) || FOODS.find((f) => f.id === id) || null;
}
