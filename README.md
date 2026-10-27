# SporCoach

iPhone'da ana ekrana eklenip uygulama gibi çalışan kişisel spor takip uygulaması (PWA).

- **Danışman:** Claude ile sohbet; yemek, set, doz, kilo ve tahlil kayıtlarını onay kartıyla hazırlar.
- **Beslenme:** Günlük (besin veritabanı, makro/mikro takibi) ve Planım.
- **Antrenman:** 7 günlük program, haftalık set/kg/tekrar girişi, dinlenme sayacı, ilerleme.
- **Kür:** Maddeler, enjeksiyon/hap takvimi, bölge rotasyonu, takvime aktarma.
- **Kan testleri:** Değerler, referans aralıkları, gruplama ve trend.

Tüm veriler yalnızca cihazda (IndexedDB) saklanır; bu depoda kişisel veri yoktur.
Danışman için gereken API anahtarı da yalnızca cihazda tutulur.

## Kurulum (iPhone)

Safari'de sitenin adresini aç → Paylaş → **Ana Ekrana Ekle** → Ekle.

## Geliştirme

Derleme adımı yoktur; düz HTML/CSS/JS (ES modülleri). Yerelde denemek için:

```
python3 -m http.server 8000
```

Yeni sürüm yayınlarken `sw.js` içindeki `CACHE` adını artır.
