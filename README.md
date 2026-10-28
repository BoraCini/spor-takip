# SporCoach

iPhone'da ana ekrana eklenip uygulama gibi çalışan kişisel spor takip uygulaması (PWA).

- **Danışman:** Claude ile sohbet (canlı yazılan cevap, sesli konuşma, önbellekli istekler). Yemek, su, set, kardiyo, doz, kilo, ölçü ve tahlil kayıtlarını onay kartıyla hazırlar; kalıcı notlar tutar; haftalık rapor hazırlar.
- **Beslenme:** Günlük (besin veritabanı, barkod okutma + Open Food Facts, son eklenenler, dünkü öğünü kopyalama, su takibi) ve Planım.
- **Antrenman:** 7 günlük program, set/kg/tekrar + RPE, kardiyo (süre/mesafe), kademeli ağırlık önerisi, plaka hesaplayıcı, dinlenme sayacı. **İlerleme:** haftalık kas grubu hacmi, kilo, vücut ölçüleri, ilerleme fotoğrafları, rekorlar.
- **Kür:** Maddeler, enjeksiyon/hap takvimi, bölge rotasyonu, takvime aktarma.
- **Kan testleri:** Değerler, referans aralıkları, gruplama ve trend.
- **Bildirimler:** Doz, enjeksiyon, antrenman ve yedek hatırlatmaları (Web Push).

Tüm kişisel veriler yalnızca cihazda (IndexedDB) saklanır. Bildirim sunucusunda yalnızca push aboneliği,
hatırlatma saatleri ve (varsayılan olarak genel) başlıklar tutulur.

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
