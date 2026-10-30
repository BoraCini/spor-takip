# Pro Coach (eski adı SporCoach)

iPhone'da ana ekrana eklenip uygulama gibi çalışan kişisel spor takip uygulaması (PWA).

- **Danışman:** Claude ile sohbet (canlı yazılan cevap, sesli konuşma, önbellekli istekler). Yemek, su, set, kardiyo, doz, kilo, ölçü ve tahlil kayıtlarını onay kartıyla hazırlar; kalıcı notlar tutar; haftalık rapor hazırlar.
- **Beslenme:** Günlük (~630 besinlik veritabanı: temel besinler USDA'dan, Türk yemekleri yaklaşık değerlerle; FatSecret tarzı ekleme ekranı: Son/Sık/Benim/Tarifler sekmeleri, porsiyonlu sonuçlar, çoklu seçim, hızlı kalori, tarif oluşturucu; barkod + Open Food Facts, yapay zekâyla hesaplama, su takibi) ve Planım.
- **Antrenman:** 7 günlük program, set/kg/tekrar + RPE, kardiyo (süre/mesafe), kademeli ağırlık önerisi, plaka hesaplayıcı, dinlenme sayacı. **İlerleme:** haftalık kas grubu hacmi, kilo, vücut ölçüleri, ilerleme fotoğrafları, rekorlar.
- **Kür:** Maddeler, enjeksiyon/hap takvimi, bölge rotasyonu, takvime aktarma.
- **Kan testleri:** Değerler, referans aralıkları, gruplama ve trend.
- **Bildirimler:** Doz, enjeksiyon, antrenman ve yedek hatırlatmaları (Web Push).

Tüm kişisel veriler yalnızca cihazda (IndexedDB) saklanır. Bildirim sunucusunda yalnızca push aboneliği,
hatırlatma saatleri ve (varsayılan olarak genel) başlıklar tutulur.

İsteğe bağlı iki istisna:
- **Şifreli bulut yedeği:** Telefonda kullanıcının şifresinden PBKDF2 (310 bin tur) + HKDF ile sunucu adresi,
  AES-GCM anahtarı ve yazma anahtarı türetilir. Sunucu yalnızca okunamaz veriyi ve yazma anahtarının özetini tutar;
  yazma anahtarı olmadan yedeğin üzerine yazılamaz ve silinemez.
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

Yeni sürüm yayınlarken `public/sw.js` içindeki `CACHE` adını artır.

## Veri kaynakları

Temel besin değerleri: USDA FoodData Central (SR Legacy), [TempoLife](https://tempolife.app) derlemesi (`tempo-food-db`) üzerinden, CC-BY-4.0. Türkçe adlar ve porsiyonlar bu projede eklendi. Paketli ürünler: Open Food Facts (ODbL).

Tahlil PDF'leri telefonda [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0, `public/vendor/pdfjs`) ile okunur; yapay zekâ kullanılmaz.
