// Protokol takibi için madde kataloğu. Yalnızca tanımlayıcı bilgi içerir (ad, kullanım şekli, ester, yaklaşık yarılanma ömrü).
// Doz, süre veya kullanım önerisi içermez. Yarılanma ömürleri literatürdeki yaklaşık değerlerdir; kaynağa göre değişir.
// Alanlar: id, ad, arama kelimeleri, tür (enjeksiyon | hap), grup, ester sınıfı, yaklaşık yarılanma ömrü, not
const C = (id, name, alias, kind, group, ester, hl, note = '') => ({ id, name, alias, kind, group, ester, hl, note });

export const COMPOUND_GROUPS = ['Testosteron', 'Nandrolon', 'Boldenon', 'Trenbolon', 'Drostanolon (Masteron)', 'Metenolon (Primobolan)', 'Diğer enjeksiyonlar', 'Oral steroidler', 'Aromataz inhibitörleri', 'SERM', 'Prolaktin', 'Gonadotropin ve hormonlar', 'Tiroid', 'Diğer'];

export const COMPOUNDS = [
  // ---- Testosteron ----
  C('k_test_e', 'Testosteron Enantat', 'test e enanthate testosteron enantat', 'enjeksiyon', 'Testosteron', 'uzun', '~4,5–7 gün'),
  C('k_test_c', 'Testosteron Sipiyonat', 'test c cypionate sipiyonat', 'enjeksiyon', 'Testosteron', 'uzun', '~5–8 gün'),
  C('k_test_p', 'Testosteron Propiyonat', 'test p prop propionate propiyonat', 'enjeksiyon', 'Testosteron', 'kısa', '~0,8–1,5 gün'),
  C('k_test_pp', 'Testosteron Fenilpropiyonat', 'tpp phenylpropionate fenilpropiyonat', 'enjeksiyon', 'Testosteron', 'kısa', '~1,5–2,5 gün'),
  C('k_test_iso', 'Testosteron İzokaproat', 'isocaproate izokaproat', 'enjeksiyon', 'Testosteron', 'orta', '~3–4 gün'),
  C('k_test_dec', 'Testosteron Dekanoat', 'decanoate dekanoat', 'enjeksiyon', 'Testosteron', 'uzun', '~7–8 gün'),
  C('k_test_u_inj', 'Testosteron Undekanoat (enjeksiyon)', 'nebido undecanoate undekanoat', 'enjeksiyon', 'Testosteron', 'çok uzun', '~20–34 gün'),
  C('k_test_u_oral', 'Testosteron Undekanoat (oral)', 'andriol undecanoate oral', 'hap', 'Testosteron', 'oral', '~2–4 saat', 'Yağlı yemekle emilir.'),
  C('k_sust', 'Sustanon 250', 'sustanon sust karışım blend omnadren', 'enjeksiyon', 'Testosteron', 'karışım', null, 'Propiyonat, fenilpropiyonat, izokaproat ve dekanoat esterlerinin karışımı.'),
  C('k_test_susp', 'Testosteron Süspansiyon', 'suspension estersiz base', 'enjeksiyon', 'Testosteron', 'estersiz', 'birkaç saat'),
  C('k_test_gel', 'Testosteron Jel', 'jel gel testogel androgel transdermal', 'hap', 'Testosteron', 'transdermal', null, 'Cilde sürülür, genelde her gün uygulanır.'),
  // ---- Nandrolon ----
  C('k_deca', 'Nandrolon Dekanoat (Deca)', 'deca durabolin nandrolone decanoate', 'enjeksiyon', 'Nandrolon', 'uzun', '~6–12 gün'),
  C('k_npp', 'Nandrolon Fenilpropiyonat (NPP)', 'npp durabolin phenylpropionate', 'enjeksiyon', 'Nandrolon', 'kısa', '~2,5–4 gün'),
  // ---- Boldenon ----
  C('k_eq', 'Boldenon Undesilenat (Equipoise)', 'eq equipoise boldenone undecylenate bold', 'enjeksiyon', 'Boldenon', 'çok uzun', '~14 gün'),
  C('k_bold_c', 'Boldenon Sipiyonat', 'boldenone cypionate', 'enjeksiyon', 'Boldenon', 'uzun', '~8–10 gün'),
  C('k_bold_a', 'Boldenon Asetat', 'boldenone acetate', 'enjeksiyon', 'Boldenon', 'kısa', '~1–2 gün'),
  // ---- Trenbolon ----
  C('k_tren_a', 'Trenbolon Asetat', 'tren a ace acetate trenbolone', 'enjeksiyon', 'Trenbolon', 'kısa', '~1–2 gün'),
  C('k_tren_e', 'Trenbolon Enantat', 'tren e enanthate', 'enjeksiyon', 'Trenbolon', 'uzun', '~5–7 gün'),
  C('k_tren_h', 'Trenbolon Heksahidrobenzilkarbonat (Parabolan)', 'parabolan hex trenbolone hexahydrobenzylcarbonate', 'enjeksiyon', 'Trenbolon', 'uzun', '~6–8 gün'),
  // ---- Drostanolon ----
  C('k_mast_p', 'Drostanolon Propiyonat (Masteron P)', 'masteron mast p propionate drostanolone', 'enjeksiyon', 'Drostanolon (Masteron)', 'kısa', '~2 gün'),
  C('k_mast_e', 'Drostanolon Enantat (Masteron E)', 'masteron mast e enanthate', 'enjeksiyon', 'Drostanolon (Masteron)', 'uzun', '~5 gün'),
  // ---- Metenolon ----
  C('k_primo_e', 'Metenolon Enantat (Primobolan Depot)', 'primo primobolan methenolone enanthate', 'enjeksiyon', 'Metenolon (Primobolan)', 'uzun', '~10 gün'),
  C('k_primo_a', 'Metenolon Asetat (oral Primobolan)', 'primo tab methenolone acetate oral', 'hap', 'Metenolon (Primobolan)', 'oral', '~4–6 saat'),
  // ---- Diğer enjeksiyonlar ----
  C('k_winny_inj', 'Stanozolol (enjeksiyon)', 'winstrol winny depot stanozolol suspension', 'enjeksiyon', 'Diğer enjeksiyonlar', 'estersiz (süspansiyon)', '~24 saat'),
  C('k_dhb', 'DHB (1-Testosteron Sipiyonat)', 'dhb 1-test dihydroboldenone', 'enjeksiyon', 'Diğer enjeksiyonlar', 'uzun', '~8 gün'),
  C('k_ment', 'Trestolon Asetat (MENT)', 'ment trestolone', 'enjeksiyon', 'Diğer enjeksiyonlar', 'kısa', '~1–2 gün'),
  // ---- Oral steroidler ----
  C('k_var', 'Oksandrolon (Anavar)', 'anavar var oxandrolone', 'hap', 'Oral steroidler', 'oral', '~9–10 saat'),
  C('k_dbol', 'Metandienon (Dianabol)', 'dianabol dbol methandienone methandrostenolone', 'hap', 'Oral steroidler', 'oral', '~3–6 saat'),
  C('k_drol', 'Oksimetolon (Anadrol)', 'anadrol drol oxymetholone', 'hap', 'Oral steroidler', 'oral', '~8–9 saat'),
  C('k_winny_oral', 'Stanozolol (oral)', 'winstrol winny tablet stanozolol', 'hap', 'Oral steroidler', 'oral', '~9 saat'),
  C('k_tbol', 'Turinabol', 'tbol turinabol chlorodehydromethyltestosterone', 'hap', 'Oral steroidler', 'oral', '~16 saat'),
  C('k_proviron', 'Mesterolon (Proviron)', 'proviron mesterolone', 'hap', 'Oral steroidler', 'oral', '~12 saat'),
  C('k_halo', 'Fluoksimesteron (Halotestin)', 'halotestin halo fluoxymesterone', 'hap', 'Oral steroidler', 'oral', '~9 saat'),
  C('k_mt', 'Metiltestosteron', 'methyltestosterone', 'hap', 'Oral steroidler', 'oral', '~3 saat'),
  C('k_sdrol', 'Metasteron (Superdrol)', 'superdrol methasterone', 'hap', 'Oral steroidler', 'oral', '~8 saat'),
  // ---- Aromataz inhibitörleri ----
  C('k_adex', 'Anastrozol (Arimidex)', 'arimidex adex anastrozole ai', 'hap', 'Aromataz inhibitörleri', null, '~46 saat'),
  C('k_letro', 'Letrozol (Femara)', 'femara letro letrozole ai', 'hap', 'Aromataz inhibitörleri', null, '~2–4 gün'),
  C('k_aromasin', 'Eksemestan (Aromasin)', 'aromasin exemestane ai', 'hap', 'Aromataz inhibitörleri', null, '~24 saat'),
  // ---- SERM ----
  C('k_nolva', 'Tamoksifen (Nolvadex)', 'nolvadex nolva tamoxifen serm', 'hap', 'SERM', null, '~5–7 gün'),
  C('k_clomid', 'Klomifen (Clomid)', 'clomid klomen clomiphene serm', 'hap', 'SERM', null, '~5 gün'),
  C('k_enclo', 'Enklomifen', 'enclomiphene serm', 'hap', 'SERM', null, '~10 saat'),
  C('k_ralox', 'Raloksifen (Evista)', 'evista raloxifene serm', 'hap', 'SERM', null, '~27 saat'),
  // ---- Prolaktin ----
  C('k_caber', 'Kabergolin (Dostinex)', 'dostinex caber cabergoline prolaktin', 'hap', 'Prolaktin', null, '~63–69 saat'),
  C('k_bromo', 'Bromokriptin (Parlodel)', 'parlodel bromocriptine prolaktin', 'hap', 'Prolaktin', null, '~12–15 saat'),
  C('k_prami', 'Pramipeksol', 'pramipexole prolaktin', 'hap', 'Prolaktin', null, '~8–12 saat'),
  // ---- Gonadotropin ve hormonlar ----
  C('k_hcg', 'hCG (Pregnyl)', 'hcg pregnyl ovitrelle gonadotropin', 'enjeksiyon', 'Gonadotropin ve hormonlar', null, '~24–36 saat'),
  C('k_hmg', 'hMG (Menotropin)', 'hmg menopur menotropin', 'enjeksiyon', 'Gonadotropin ve hormonlar', null, '~1–2 gün'),
  C('k_gh', 'Büyüme hormonu (somatropin, GH)', 'gh hgh somatropin genotropin norditropin', 'enjeksiyon', 'Gonadotropin ve hormonlar', null, '~2–4 saat (deri altı)'),
  C('k_igf', 'IGF-1 LR3', 'igf igf-1 lr3', 'enjeksiyon', 'Gonadotropin ve hormonlar', null, '~20–30 saat'),
  // ---- Tiroid ----
  C('k_t3', 'Liotironin (T3, Cytomel)', 't3 cytomel liothyronine tiroid', 'hap', 'Tiroid', null, '~1–2,5 gün'),
  C('k_t4', 'Levotiroksin (T4, Levotiron/Euthyrox)', 't4 levotiron euthyrox levothyroxine tiroid', 'hap', 'Tiroid', null, '~7 gün'),
  // ---- Diğer ----
  C('k_clen', 'Klenbuterol', 'clen clenbuterol', 'hap', 'Diğer', null, '~25–39 saat'),
  C('k_fina', 'Finasterid (Propecia/Proscar)', 'propecia proscar finasteride', 'hap', 'Diğer', null, '~5–6 saat'),
  C('k_duta', 'Dutasterid (Avodart)', 'avodart dutasteride', 'hap', 'Diğer', null, '~5 hafta'),
];

const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function searchCompounds(q) {
  const v = norm(q);
  if (!v) return COMPOUNDS;
  const words = v.split(' ');
  return COMPOUNDS.filter((c) => {
    const hay = norm(`${c.name} ${c.alias} ${c.group} ${c.ester || ''}`);
    return words.every((w) => hay.includes(w));
  });
}

export function compoundInfo(c) {
  if (!c) return '';
  const est = !c.ester || ['oral', 'transdermal'].includes(c.ester) ? '' : c.ester === 'karışım' ? 'ester karışımı' : c.ester.startsWith('estersiz') ? c.ester : `${c.ester} ester`;
  return [c.kind === 'enjeksiyon' ? 'Enjeksiyon' : c.ester === 'transdermal' ? 'Cilde' : 'Oral', est, c.hl ? `yarılanma ${c.hl}` : '']
    .filter(Boolean)
    .join(' · ');
}

export function findCompound(id) {
  return COMPOUNDS.find((c) => c.id === id) || null;
}
