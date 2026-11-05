# Pro Coach (eski adı SporCoach)

iPhone'da ana ekrana eklenip uygulama gibi çalışan kişisel spor takip uygulaması (PWA).

- **Danışman:** Claude ile sohbet (canlı yazılan cevap, sesli konuşma, önbellekli istekler). Yemek, su, set, kardiyo, doz, kilo, ölçü ve tahlil kayıtlarını onay kartıyla hazırlar; kalıcı notlar tutar; haftalık rapor hazırlar.
- **Beslenme:** Günlük (~630 besinlik veritabanı: temel besinler USDA'dan, Türk yemekleri yaklaşık değerlerle; FatSecret tarzı ekleme ekranı: Son/Sık/Favoriler/Kategoriler/Benim/Tarifler/Şablonlar sekmeleri, besine özel çoklu porsiyon, çoklu seçim, hızlı kalori, adımlı tarif oluşturucu (pişmiş ağırlık), kişisel kategoriler, öğün şablonları (çarpanla, istenen gün ve öğüne tek işlemde); barkod + Open Food Facts, yapay zekâyla hesaplama, su takibi) ve Planım.
- **Antrenman:** 7 günlük program, set/kg/tekrar + RPE, kardiyo (süre/mesafe), kademeli ağırlık önerisi, plaka hesaplayıcı, dinlenme sayacı. **İlerleme:** haftalık kas grubu hacmi, kilo, vücut ölçüleri, ilerleme fotoğrafları, rekorlar.
- **Protokol (eski adı Kür):** Maddeler, enjeksiyon/hap takvimi, bölge rotasyonu, takvime aktarma; Koruma ve Vitamin sekmesi.
- **Kan testleri:** Değerler, referans aralıkları, gruplama ve trend.
- **Bildirimler:** Doz, enjeksiyon, antrenman ve yedek hatırlatmaları (Web Push).

Tüm kişisel veriler yalnızca cihazda (IndexedDB) saklanır. Bildirim sunucusunda yalnızca push aboneliği,
hatırlatma saatleri ve (varsayılan olarak genel) başlıklar tutulur.

İsteğe bağlı iki istisna:
- **Şifreli bulut yedeği (Vault v3):** Her kasa için rastgele 256 bit kasa kimliği ve tuz. Şifreden PBKDF2-SHA256
  (600 bin tur) + HKDF ile birbirinden bağımsız şifreleme (AES-256-GCM), okuma ve yazma anahtarları türetilir.
  Sunucu yalnızca okunamaz veriyi ve okuma/yazma anahtarlarının özetini tutar; okumak, yazmak ve silmek için
  ilgili anahtar gerekir. Yeni cihazda kasaya yedek adı + şifre ya da kurtarma kodu (QR) + şifre ile ulaşılır.
  Telefonda ham şifre saklanmaz; otomatik yedek dışa aktarılamaz bir anahtarla çalışır. Eski PC01/PC02 yedekler okunur.
- **Apple Sağlık kutusu:** Kestirmeler'den gelen adım/kilo verisi, uygulama alana kadar en fazla 45 gün tutulur.
  Kutu yalnızca uygulama açtıysa veri kabul eder.

Sunucu uçlarında IP başına hız sınırı, toplam yedek/kutu/cihaz sayısı sınırı ve yalnızca bilinen push servislerine
(Apple, Google, Mozilla, Microsoft) bildirim gönderme kuralı vardır.

## Yapı

```
public/          Uygulama (statik dosyalar)
worker/          Cloudflare Worker: statik dosyaları sunar, /api/push/* ve zamanlanmış hatırlatmalar
wrangler.jsonc   Cloudflare yapılandırması (KV: PUSH_KV, cron: her 5 dk)
```

## Kurulum (iPhone)

Safari'de sitenin adresini aç → Paylaş → **Ana Ekrana Ekle** → Ekle.

## Geliştirme

```
npx wrangler dev --test-scheduled
```

Yeni sürüm yayınlarken `public/sw.js` içindeki `CACHE` adını ve `public/js/app.js` içindeki `APP_VERSION`ı artır, `public/js/changelog.js` en üstüne kullanıcıya gösterilecek sürüm notunu ekle (güncellemeden sonraki ilk açılışta "Yenilikler" olarak bir kez çıkar).

## Veri kaynakları

Temel besin değerleri: USDA FoodData Central (SR Legacy), [TempoLife](https://tempolife.app) derlemesi (`tempo-food-db`) üzerinden, CC-BY-4.0. Türkçe adlar ve porsiyonlar bu projede eklendi. Paketli ürünler: Open Food Facts (ODbL); Türkiye'de satılan ürünlerin listesi (`public/data/off_tr.json`) `scripts/build-off-tr.mjs` ile OFF dökümünden üretilir ve `.github/workflows/off-data.yml` ile haftalık yenilenir.

QR kodlar: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT, `public/vendor/qrcode`).

Tahlil PDF'leri telefonda [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0, `public/vendor/pdfjs`) ile okunur; yapay zekâ kullanılmaz.

## Geliştirme ve testler

Uygulama build gerektirmez; `package.json` yalnızca geliştirme araçları içindir.

```
npm install
npm test            # birim + Worker testleri (Vitest, fake-indexeddb)
npm run test:e2e    # uçtan uca testler (Playwright, yerel wrangler dev üzerinde)
npm run lint
```

Önizleme sürümleri (`<dal>-spor-takip.<hesap>.workers.dev`) üretimle aynı KV'yi kullanır; Worker bu adreslerde
tüm anahtarları `pv:` önekiyle ayırır, böylece önizleme denemeleri gerçek yedeklere dokunmaz.
