// Besin kategorileri — merkezi tanım. Hazır kategoriler silinemez; kişisel kategoriler ayarlarda tutulur.
// Hazır besinlerin kategorisi, aşağıdaki açık kural tablosuyla (besin adı + arama kelimeleri) ve gerekirse
// kimliğe göre istisnalarla belirlenir. Hiçbir kurala uymayan "Diğer"e düşer. tests/unit/categories.test.js
// tüm hazır besinlerin geçerli bir kategoriye düştüğünü ve örnek eşleşmeleri doğrular.
export const FOOD_CATEGORIES = [
  ['et', 'Et, balık ve yumurta'],
  ['sut', 'Süt ürünleri'],
  ['tahil', 'Tahıllar ve ekmek'],
  ['baklagil', 'Baklagiller'],
  ['sebze', 'Sebzeler'],
  ['meyve', 'Meyveler'],
  ['kuruyemis', 'Kuruyemişler ve tohumlar'],
  ['yag', 'Yağlar'],
  ['icecek', 'İçecekler'],
  ['tatli', 'Tatlılar ve atıştırmalıklar'],
  ['sporcu', 'Sporcu besinleri'],
  ['paketli', 'Paketli ürünler'],
  ['yemek', 'Hazır yemekler'],
  ['diger', 'Diğer'],
];
export const CATEGORY_LABEL = Object.fromEntries(FOOD_CATEGORIES);
export const isBuiltinCategory = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, k);

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Kimliğe göre istisnalar (kuralın yanlış bulacağı az sayıdaki besin)
export const CATEGORY_OVERRIDES = {
  t_tavuk_gogsu_tatli: 'tatli',
  t_deniz_borulcesi: 'sebze',
  t_kuru_fasulye_etli: 'yemek',
  t_kiymali_fasulye: 'yemek',
  t_makarna_bolonez: 'yemek',
  t_makarna_kremali: 'yemek',
  t_makarna_domates: 'yemek',
  u_yumurtali_eriste_haslanmis: 'tahil',
};

// Sıralı kurallar: ilk eşleşen kazanır. Kelimelerin başı eşleşir (Türkçe ekler için: "peyniri", "lahanası").
// Önce özel ifadeler, sonra yemek/ürün türünü belirleyen kelimeler, en sonda ham malzemeler.
const W = (words) => new RegExp(`\\b(?:${words})`);
const X = (words) => new RegExp(`\\b(?:${words})\\b`); // tam kelime
export const CATEGORY_RULES = [
  ['sporcu', W('whey|protein tozu|kazein|bcaa|kreatin|gainer|protein bar|protein shake|protein pro|enerji jeli|izotonik')],
  ['tahil', W('yulaf ezmesi|yulaf lapasi|lifalif')],
  ['sebze', W('bal kabag|salatalik')],
  ['kuruyemis', W('fistik ezmesi|badem ezmesi|findik ezmesi|findik kremasi|badem sutu')],
  ['icecek', W('elma suyu|nar suyu|portakal suyu|meyve suyu|salgam|hindistan cevizi suyu|soya sutu|pirinc sutu')],
  ['diger', W('soya sosu|makarna sosu|ketcap|mayonez|hardal|barbeku|acı sos|aci sos|pesto|ranch|sezar sos|salsa sos|sirke|limon suyu')],
  ['icecek', W('ayran|kefir|kola|gazoz|soda|limonata|kahve|cay|yesil cay|latte|cappuccino|espresso|smoothie|milkshake|salep|boza|bira|sarap|raki|viski|votka|enerji icecegi|maden suyu')],
  ['tatli', W('baklava|kunefe|sutlac|kazandibi|muhallebi|supangle|lokum|helva|helvasi|revani|sekerpare|tulumba|lokma|kek|kurabiye|biskuvi|gofret|cikolata|dondurma|puding|tiramisu|cheesecake|brownie|asure|kadayif|profiterol|recel|pekmez|seker|surup|jelibon|marshmallow|cips|kraker|pretzel|patlamis misir|granola bar|bal kaymak|tahin pekmez')],
  ['tatli', X('bal')],
  ['yemek', W('corba|yemegi|kebap|kebabi|doner|durum|lahmacun|pide|pizza|hamburger|cheeseburger|burger|tost|sandvic|borek|boregi|gozleme|manti|kofte|dolma|sarma|musakka|guvec|kavurma|sote|zeytinyagli|pilaki|mucver|menemen|omlet|cilbir|sucuklu|sinitzel|nugget|kisir|salata|piyaz|ezme|haydari|cacik|humus|tarator|babagannus|muhammara|saksuka|fava|tarama|pilav|kumpir|kizartma|islim|hunkar|iskender|imam bayildi|karniyarik|turlu|kokorec|midye dolma|cig kofte|sosis|pure|kumru|wrap|tantuni|beyti|kiymali|etli|firin makarna|tas kebabi|yogurtlu|falafel|sushi|balik ekmek|hamsi tava|kalamar tava|izgara sebze|haslanmis sebze|atom')],
  ['et', X('hindi')],
  ['et', W('tavuk|dana|kuzu|koyun|sigir|biftek|bonfile|antrikot|pirzola|kiyma|ciger|sucuk|pastirma|salam|jambon|somon|ton baligi|levrek|cipura|hamsi|palamut|uskumru|sardalya|alabalik|morina|mezgit|tilapya|lufer|karides|kalamar|ahtapot|midye|yengec|istakoz|balik|yumurta|jerky')],
  ['et', X('et|eti')],
  ['sut', W('sut|yogurt|peynir|lor|labne|kasar|tulum|kaymak|krema|eksi krema|tereyag|cheddar|mozzarella|parmesan|gouda|emmental|isvicre peyniri|brie|ricotta|mascarpone|hellim|rokfor|cottage')],
  ['sut', X('edam')],
  ['yag', W('zeytinyag|aycicek yag|misirozu yag|findik yag|hindistan cevizi yag|margarin|zeytin')],
  ['tahil', W('ekmek|ekmegi|simit|pogaca|acma|catal|lavas|tortilla|yufka|bazlama|pirinc|bulgur|makarna|eriste|sehriye|yulaf|kinoa|karabugday|arpa|misir gevreg|gevrek|musli|granola|irmik|kuskus|galeta|grissini|kruton|noodle|pita|kepek|dari|pankek|krep|nisasta|misir unu|misir cipsi')],
  ['tahil', X('un|unu')],
  ['sebze', W('taze fasulye')],
  ['baklagil', W('mercimek|nohut|fasulye|barbunya|borulce|bakla|bezelye|soya|edamame|tofu|leblebi')],
  ['kuruyemis', W('badem|ceviz|findik|fistik|fistig|kaju|antep|makademya|kestane|tahin|chia|keten|kenevir|cekirdeg|cekirdek|susam|tohum|hindistan cevizi')],
  ['meyve', W('elma|armut|muz|portakal|mandalina|greyfurt|limon|cilek|kiraz|visne|kayisi|seftali|nektarin|erik|uzum|karpuz|kavun|incir|nar|kivi|ananas|mango|papaya|avokado|hurma|ayva|yaban mersini|bogurtlen|ahududu|dut|kizilcik|meyve')],
  ['sebze', W('brokoli|ispanak|domates|salatalik|marul|roka|havuc|biber|sogan|sarimsak|mantar|patates|kabak|bal kabagi|patlican|lahana|karnabahar|pirasa|kereviz|pancar|turp|enginar|bamya|semizotu|maydanoz|dereotu|nane|feslegen|zencefil|misir|pazi|kuskonmaz|yesillik|sebze|tursu|salca')],
];

// Hazır ya da kişisel besinin hazır kategorisi. Kurallar önce ana ada (parantez dışı) bakar; eşleşme yoksa
// arama kelimeleri de dahil edilir. Böylece "Tavuk göğsü (ızgara)" yemek değil, et sayılır.
export function categoryOf(food) {
  if (!food) return 'diger';
  if (food.category && isBuiltinCategory(food.category)) return food.category;
  if (CATEGORY_OVERRIDES[food.id]) return CATEGORY_OVERRIDES[food.id];
  if (food.recipe) return 'yemek';
  if (food.barcode) return 'paketli';
  const main = ` ${norm(String(food.name || '').replace(/\([^)]*\)/g, ' '))} `;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(main)) return cat;
  const all = `${main} ${norm(food.alias)} `;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(all)) return cat;
  return 'diger';
}

// ---------- Favoriler ve kişisel kategoriler (saf fonksiyonlar) ----------
// Ayarlar: food_favorites [id], food_user_categories [{id:'uc_…', name}], food_cat_assign {foodId: 'uc_…'}
// Hazır besinlerin kimlikleri değişmez; atamalar yalnızca kimliğe göre tutulur.
export const MAX_USER_CATEGORIES = 30;
export const MAX_CAT_NAME = 40;
export const isUserCategory = (k) => typeof k === 'string' && k.startsWith('uc_');

export function toggleFavorite(favs, id) {
  const list = Array.isArray(favs) ? favs.filter((x) => typeof x === 'string') : [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function cleanUserCats(ucats) {
  return (Array.isArray(ucats) ? ucats : []).filter((c) => c && isUserCategory(c.id) && typeof c.name === 'string' && c.name.trim());
}

// Kişisel kategori adı doğrulaması: boş olmamalı, çok uzun olmamalı, mevcut (kişisel ya da hazır) bir adla çakışmamalı
export function catNameError(name, ucats, exceptId = null) {
  const n = String(name || '').trim();
  if (!n) return 'Kategori adı boş olamaz.';
  if (n.length > MAX_CAT_NAME) return `Kategori adı en fazla ${MAX_CAT_NAME} karakter olabilir.`;
  const key = norm(n);
  if (FOOD_CATEGORIES.some(([, l]) => norm(l) === key)) return 'Bu ad hazır bir kategoride kullanılıyor.';
  if (cleanUserCats(ucats).some((c) => c.id !== exceptId && norm(c.name) === key)) return 'Bu adla bir kategorin zaten var.';
  if (!exceptId && cleanUserCats(ucats).length >= MAX_USER_CATEGORIES) return `En fazla ${MAX_USER_CATEGORIES} kişisel kategori oluşturabilirsin.`;
  return null;
}

export function newUserCatId() {
  const r = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `uc_${Date.now().toString(36)}${r}`;
}

// Kişisel kategori silinince yalnızca o kategoriye yapılan atamalar kaldırılır; besinler hazır kategorilerinde kalır, hiçbir besin silinmez.
export function deleteUserCat(ucats, assign, id) {
  if (!isUserCategory(id)) return { ucats: cleanUserCats(ucats), assign: { ...(assign || {}) } };
  const a = {};
  for (const [fid, cid] of Object.entries(assign || {})) if (cid !== id) a[fid] = cid;
  return { ucats: cleanUserCats(ucats).filter((c) => c.id !== id), assign: a };
}

// Bir besin bir kategoride mi? Hazır kategori: categoryOf; kişisel kategori: atama tablosu
export function inCategory(food, key, assign = {}) {
  if (!food || !key) return true;
  if (isUserCategory(key)) return (assign || {})[food.id] === key;
  return categoryOf(food) === key;
}

// Kategori → besin sayısı (yalnızca dolu kategoriler arayüzde gösterilir)
export function categoryCounts(pool, assign = {}) {
  const out = {};
  for (const f of pool) {
    const c = categoryOf(f);
    out[c] = (out[c] || 0) + 1;
    const u = (assign || {})[f.id];
    if (isUserCategory(u)) out[u] = (out[u] || 0) + 1;
  }
  return out;
}
