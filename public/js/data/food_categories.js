// Besin kategorileri — merkezi tanım. Hazır kategoriler silinemez; kişisel kategoriler ayarlarda tutulur.
export const FOOD_CATEGORIES = [
  ['et', 'Et ve balık'],
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
