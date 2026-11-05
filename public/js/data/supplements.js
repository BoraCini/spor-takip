// Koruyucu ilaç, vitamin ve takviye kataloğu (Protokol › Koruma ve Vitamin sekmesi).
// Yalnızca tanımlayıcı bilgi: ad, grup, yaygın biçimler ve kısa kullanım amacı. Doz önerisi içermez.
// Alanlar: id, ad, arama kelimeleri, grup, biçimler, not, reçeteli mi
const S = (id, name, alias, group, forms, note = '', rx = false) => ({ id, name, alias, group, forms, note, rx });
const K = ['kapsül', 'tablet'];

export const SUPP_GROUPS = ['Vitaminler', 'Mineraller', 'Karaciğer', 'Kalp, damar ve kolesterol', 'Hormon ve prostat', 'Uyku ve stres', 'Eklem ve bağ dokusu', 'Antioksidan', 'Sindirim ve bağırsak', 'Performans', 'Reçeteli koruyucular', 'Diğer'];

export const SUPPLEMENTS = [
  // ---- Vitaminler ----
  S('s_d3', 'D3 vitamini', 'd vitamini d3 kolekalsiferol', 'Vitaminler', ['yumuşak kapsül', 'damla', 'tablet', 'sprey'], 'Kemik, kas ve bağışıklık için; çoğu kişide eksik çıkar.'),
  S('s_d3k2', 'D3 + K2 vitamini', 'd3 k2 mk7 d vitamini k vitamini', 'Vitaminler', ['yumuşak kapsül', 'damla', 'tablet', 'sprey'], 'D3 ile kalsiyumun kemiğe yönlenmesini destekleyen K2 (MK-7) birlikte.'),
  S('s_k2', 'K2 vitamini (MK-7)', 'k2 mk7 menakinon', 'Vitaminler', ['kapsül', 'damla']),
  S('s_b12', 'B12 vitamini', 'b12 kobalamin metilkobalamin siyanokobalamin', 'Vitaminler', ['tablet', 'dil altı tablet', 'sprey', 'enjeksiyon'], 'Metilkobalamin, siyanokobalamin gibi formları vardır.'),
  S('s_bcomp', 'B kompleks', 'b kompleks b vitaminleri b1 b2 b3 b6', 'Vitaminler', K),
  S('s_b6', 'B6 vitamini (P5P)', 'b6 piridoksin p5p', 'Vitaminler', K),
  S('s_folat', 'Folat (metilfolat)', 'folat folik asit metilfolat b9', 'Vitaminler', K),
  S('s_c', 'C vitamini', 'c vitamini askorbik asit', 'Vitaminler', ['tablet', 'efervesan', 'kapsül', 'toz']),
  S('s_e', 'E vitamini', 'e vitamini tokoferol', 'Vitaminler', ['yumuşak kapsül']),
  S('s_a', 'A vitamini', 'a vitamini retinol', 'Vitaminler', ['yumuşak kapsül']),
  S('s_multi', 'Multivitamin', 'multivitamin multi mineral', 'Vitaminler', ['tablet', 'kapsül', 'efervesan']),
  S('s_biotin', 'Biotin', 'biotin b7 sac', 'Vitaminler', K),
  // ---- Mineraller ----
  S('s_mg_glis', 'Magnezyum bisglisinat', 'magnezyum glisinat bisglisinat', 'Mineraller', ['kapsül', 'tablet', 'toz'], 'Mideyi en az rahatsız eden formlardan.'),
  S('s_mg_sit', 'Magnezyum sitrat', 'magnezyum sitrat', 'Mineraller', ['kapsül', 'tablet', 'toz', 'efervesan']),
  S('s_mg_malat', 'Magnezyum malat', 'magnezyum malat', 'Mineraller', K),
  S('s_mg_treo', 'Magnezyum L-treonat', 'magnezyum treonat', 'Mineraller', K),
  S('s_mg_oks', 'Magnezyum oksit', 'magnezyum oksit', 'Mineraller', ['tablet']),
  S('s_zn', 'Çinko', 'cinko zinc pikolinat glukonat bisglisinat', 'Mineraller', K, 'Pikolinat, bisglisinat, glukonat gibi formları vardır.'),
  S('s_zma', 'ZMA (çinko + magnezyum + B6)', 'zma cinko magnezyum b6', 'Mineraller', ['kapsül']),
  S('s_fe', 'Demir', 'demir ferroz bisglisinat', 'Mineraller', ['tablet', 'kapsül', 'şurup']),
  S('s_ca', 'Kalsiyum', 'kalsiyum sitrat karbonat', 'Mineraller', ['tablet', 'efervesan']),
  S('s_se', 'Selenyum', 'selenyum selenometiyonin', 'Mineraller', K),
  S('s_k', 'Potasyum', 'potasyum sitrat', 'Mineraller', ['tablet', 'toz']),
  S('s_iyot', 'İyot', 'iyot kelp', 'Mineraller', K),
  S('s_krom', 'Krom pikolinat', 'krom', 'Mineraller', K),
  S('s_bor', 'Bor', 'bor boron', 'Mineraller', K),
  S('s_elektrolit', 'Elektrolit', 'elektrolit tuz sodyum potasyum', 'Mineraller', ['toz', 'tablet', 'efervesan']),
  // ---- Karaciğer ----
  S('s_tudca', 'TUDCA', 'tudca tauroursodeoksikolik safra asidi', 'Karaciğer', ['kapsül'], 'Safra asidi; karaciğer desteği amacıyla kullanılır.'),
  S('s_udca', 'Ursodeoksikolik asit (UDCA)', 'udca ursactive ursofalk ursodeoksikolik', 'Karaciğer', ['kapsül', 'tablet'], 'Reçeteli safra asidi ilacı.', true),
  S('s_nac', 'NAC (N-asetilsistein)', 'nac n asetilsistein asist', 'Karaciğer', ['kapsül', 'efervesan', 'toz'], 'Glutatyon öncülü.'),
  S('s_silimarin', 'Devedikeni (silimarin)', 'devedikeni silimarin milk thistle', 'Karaciğer', K),
  S('s_liv52', 'Liv.52', 'liv 52 himalaya', 'Karaciğer', ['tablet']),
  S('s_essentiale', 'Fosfolipid (Essentiale)', 'essentiale fosfolipid lesitin', 'Karaciğer', ['kapsül']),
  S('s_kolin', 'Kolin', 'kolin choline', 'Karaciğer', K),
  S('s_glutatyon', 'Glutatyon', 'glutatyon glutathione', 'Karaciğer', ['kapsül', 'dil altı tablet']),
  // ---- Kalp, damar, kolesterol ----
  S('s_omega3', 'Omega-3 (balık yağı)', 'omega 3 balik yagi epa dha fish oil', 'Kalp, damar ve kolesterol', ['yumuşak kapsül', 'sıvı'], 'EPA ve DHA miktarı ürüne göre değişir.'),
  S('s_bergamot', 'Sitrüs bergamot', 'bergamot citrus', 'Kalp, damar ve kolesterol', K),
  S('s_coq10', 'Koenzim Q10 (ubikinol)', 'coq10 q10 koenzim ubikinol ubikinon', 'Kalp, damar ve kolesterol', ['yumuşak kapsül']),
  S('s_niasin', 'Niasin (B3)', 'niasin b3 nikotinik asit', 'Kalp, damar ve kolesterol', ['tablet']),
  S('s_berberin', 'Berberin', 'berberin', 'Kalp, damar ve kolesterol', K),
  S('s_nattokinaz', 'Nattokinaz', 'nattokinaz', 'Kalp, damar ve kolesterol', ['kapsül']),
  S('s_kirmizi_maya', 'Kırmızı maya pirinci', 'kirmizi maya pirinci red yeast rice', 'Kalp, damar ve kolesterol', K),
  S('s_sarimsak', 'Sarımsak ekstresi', 'sarimsak ekstresi', 'Kalp, damar ve kolesterol', K),
  S('s_alicyan', 'Alıç ekstresi', 'alic hawthorn', 'Kalp, damar ve kolesterol', K),
  S('s_pancar', 'Pancar tozu / nitrat', 'pancar nitrat beet', 'Kalp, damar ve kolesterol', ['toz', 'kapsül']),
  // ---- Hormon ve prostat ----
  S('s_dim', 'DIM (diindolilmetan)', 'dim diindolilmetan', 'Hormon ve prostat', ['kapsül']),
  S('s_cdg', 'Kalsiyum D-glukarat', 'kalsiyum d glukarat', 'Hormon ve prostat', ['kapsül']),
  S('s_saw', 'Saw palmetto', 'saw palmetto testere palmiyesi prostat', 'Hormon ve prostat', ['kapsül']),
  S('s_tongkat', 'Tongkat ali', 'tongkat ali', 'Hormon ve prostat', ['kapsül']),
  S('s_tribulus', 'Tribulus', 'tribulus demir dikeni', 'Hormon ve prostat', K),
  S('s_fenugreek', 'Çemen otu (fenugreek)', 'cemen fenugreek', 'Hormon ve prostat', ['kapsül']),
  S('s_pygeum', 'Pygeum', 'pygeum prostat', 'Hormon ve prostat', ['kapsül']),
  // ---- Uyku ve stres ----
  S('s_melatonin', 'Melatonin', 'melatonin uyku', 'Uyku ve stres', ['tablet', 'damla', 'sprey']),
  S('s_ashwa', 'Ashwagandha (KSM-66)', 'ashwagandha ksm 66 withania', 'Uyku ve stres', ['kapsül', 'tablet']),
  S('s_teanin', 'L-teanin', 'l teanin theanine', 'Uyku ve stres', ['kapsül']),
  S('s_glisin', 'Glisin', 'glisin glycine', 'Uyku ve stres', ['toz', 'kapsül']),
  S('s_rhodiola', 'Rhodiola', 'rhodiola', 'Uyku ve stres', ['kapsül']),
  S('s_5htp', '5-HTP', '5 htp', 'Uyku ve stres', ['kapsül']),
  // ---- Eklem ve bağ dokusu ----
  S('s_kolajen', 'Kolajen', 'kolajen collagen hidrolize', 'Eklem ve bağ dokusu', ['toz', 'tablet', 'sıvı']),
  S('s_glukozamin', 'Glukozamin + kondroitin', 'glukozamin kondroitin', 'Eklem ve bağ dokusu', ['tablet', 'toz']),
  S('s_msm', 'MSM', 'msm metilsulfonilmetan', 'Eklem ve bağ dokusu', ['tablet', 'toz']),
  S('s_hyaluronik', 'Hyalüronik asit', 'hyaluronik asit', 'Eklem ve bağ dokusu', K),
  S('s_kurkumin', 'Zerdeçal (kurkumin)', 'zerdecal kurkumin curcumin', 'Eklem ve bağ dokusu', ['kapsül']),
  S('s_boswellia', 'Boswellia', 'boswellia akgunluk', 'Eklem ve bağ dokusu', ['kapsül']),
  S('s_uc2', 'UC-II kolajen', 'uc ii tip 2 kolajen', 'Eklem ve bağ dokusu', ['kapsül']),
  // ---- Antioksidan ----
  S('s_ala', 'Alfa lipoik asit (ALA)', 'ala alfa lipoik asit', 'Antioksidan', ['kapsül']),
  S('s_astaksantin', 'Astaksantin', 'astaksantin', 'Antioksidan', ['yumuşak kapsül']),
  S('s_resveratrol', 'Resveratrol', 'resveratrol', 'Antioksidan', ['kapsül']),
  S('s_lutein', 'Lutein + zeaksantin', 'lutein zeaksantin goz', 'Antioksidan', ['yumuşak kapsül']),
  // ---- Sindirim ve bağırsak ----
  S('s_probiyotik', 'Probiyotik', 'probiyotik', 'Sindirim ve bağırsak', ['kapsül', 'saşe', 'toz']),
  S('s_enzim', 'Sindirim enzimi', 'sindirim enzimi enzim', 'Sindirim ve bağırsak', ['kapsül', 'tablet']),
  S('s_psyllium', 'Psyllium (lif)', 'psyllium lif karnıyarık otu', 'Sindirim ve bağırsak', ['toz', 'kapsül']),
  S('s_glutamin', 'L-glutamin', 'glutamin', 'Sindirim ve bağırsak', ['toz', 'kapsül']),
  // ---- Performans ----
  S('s_kreatin', 'Kreatin monohidrat', 'kreatin creatine monohidrat', 'Performans', ['toz', 'kapsül', 'tablet']),
  S('s_whey', 'Whey protein', 'whey protein tozu', 'Performans', ['toz']),
  S('s_eaa', 'EAA / BCAA', 'eaa bcaa amino asit', 'Performans', ['toz', 'kapsül']),
  S('s_sitrulin', 'Sitrülin malat', 'sitrulin citrulline malat', 'Performans', ['toz', 'kapsül']),
  S('s_betaalanin', 'Beta-alanin', 'beta alanin', 'Performans', ['toz', 'kapsül']),
  S('s_karnitin', 'L-karnitin', 'karnitin carnitine', 'Performans', ['sıvı', 'kapsül', 'toz']),
  S('s_kafein', 'Kafein', 'kafein caffeine', 'Performans', ['tablet', 'kapsül']),
  S('s_preworkout', 'Pre-workout', 'pre workout preworkout', 'Performans', ['toz']),
  S('s_taurin', 'Taurin', 'taurin taurine', 'Performans', ['toz', 'kapsül']),
  S('s_hmb', 'HMB', 'hmb', 'Performans', ['kapsül', 'toz']),
  // ---- Reçeteli koruyucular ----
  S('s_telmi', 'Telmisartan', 'telmisartan micardis tansiyon', 'Reçeteli koruyucular', ['tablet'], 'Tansiyon ilacı; doktor kontrolünde.', true),
  S('s_nebivolol', 'Nebivolol', 'nebivolol vasoxen nebilet', 'Reçeteli koruyucular', ['tablet'], 'Tansiyon / nabız ilacı; doktor kontrolünde.', true),
  S('s_rosuva', 'Rosuvastatin', 'rosuvastatin crestor statin kolesterol', 'Reçeteli koruyucular', ['tablet'], 'Kolesterol ilacı; doktor kontrolünde.', true),
  S('s_atorva', 'Atorvastatin', 'atorvastatin lipitor ator statin', 'Reçeteli koruyucular', ['tablet'], 'Kolesterol ilacı; doktor kontrolünde.', true),
  S('s_ezetimib', 'Ezetimib', 'ezetimib ezetrol', 'Reçeteli koruyucular', ['tablet'], 'Kolesterol ilacı; doktor kontrolünde.', true),
  S('s_aspirin', 'Asetilsalisilik asit (düşük doz aspirin)', 'aspirin coraspin asetilsalisilik', 'Reçeteli koruyucular', ['tablet'], 'Kanamayı etkiler; doktor kontrolünde kullanılır.', true),
  S('s_metformin', 'Metformin', 'metformin glifor glucophage', 'Reçeteli koruyucular', ['tablet'], 'Şeker metabolizması ilacı; doktor kontrolünde.', true),
  S('s_tadalafil', 'Tadalafil', 'tadalafil cialis', 'Reçeteli koruyucular', ['tablet'], 'Doktor kontrolünde.', true),
  S('s_isotretinoin', 'İzotretinoin', 'izotretinoin roaccutane akne', 'Reçeteli koruyucular', ['kapsül'], 'Karaciğer ve lipidleri etkiler; doktor kontrolünde.', true),
  // ---- Diğer ----
  S('s_kolostrum', 'Kolostrum', 'kolostrum', 'Diğer', ['kapsül', 'toz']),
  S('s_spirulina', 'Spirulina', 'spirulina', 'Diğer', ['tablet', 'toz']),
  S('s_inositol', 'İnositol', 'inositol', 'Diğer', ['toz', 'kapsül']),
];

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function searchSupplements(q) {
  const v = norm(q);
  if (!v) return SUPPLEMENTS;
  const words = v.split(' ');
  return SUPPLEMENTS.filter((c) => {
    const hay = norm(`${c.name} ${c.alias} ${c.group}`);
    return words.every((w) => hay.includes(w));
  });
}

export function findSupplement(id) {
  return SUPPLEMENTS.find((c) => c.id === id) || null;
}

// Biçime göre günlük kullanım birimi
export function unitForForm(form) {
  return (
    {
      kapsül: 'kapsül', 'yumuşak kapsül': 'kapsül', tablet: 'tablet', 'dil altı tablet': 'tablet', 'çiğneme tableti': 'tablet', efervesan: 'tablet',
      damla: 'damla', sprey: 'sıkım', toz: 'ölçek', sıvı: 'ml', şurup: 'ml', saşe: 'saşe', enjeksiyon: 'ml',
    }[form] || 'adet'
  );
}
