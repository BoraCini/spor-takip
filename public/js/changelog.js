// Sürüm notları ("Yenilikler"). Güncelleme sonrası ilk açılışta bir kez gösterilir; Ayarlar'dan her zaman açılır.
// Yeni sürüm yayınlarken: APP_VERSION (app.js) ve CACHE (sw.js) ile birlikte en üste bir kayıt ekle.
// Dil: kullanıcıya yönelik, kısa ve teknik olmayan Türkçe.
import * as db from './db.js';
import { esc, openSheet } from './util.js';

export const CHANGELOG = [
  {
    version: '2.4.0',
    date: '5 Kasım 2026',
    title: 'Yeni görünüm: Cam tema',
    sections: [
      {
        name: 'Görünüm',
        items: [
          'Uygulama artık buzlu cam görünümünde: arka planda ana renge göre renklenen yumuşak ışıklar, üstünde yarı saydam kartlar ve paneller.',
          'Açık ve koyu modda çalışır; seçtiğin ana renk arka plan ışıklarına da yansır.',
          'Eski görünümü istersen Ayarlar → Görünüm → Tema\'dan "Klasik"i seç.',
          'iPhone\'da "Saydamlığı Azalt" açıksa kartlar okunaklı kalsın diye bulanıklık kapanır.',
        ],
      },
      {
        name: 'Diğer',
        items: [
          'Ayarlar → Genel: "Besin aramasında internete de bak" ile Open Food Facts\'te otomatik aramayı kapatabilirsin.',
          '"Yeni sürüm hazır" şeridi artık açık bir sayfanın Kaydet ve Kapat düğmelerini örtmüyor.',
        ],
      },
    ],
  },
  {
    version: '2.3.1',
    date: '4 Kasım 2026',
    title: 'Dinlenme sayacını kapatma',
    sections: [
      {
        name: 'Antrenman',
        items: ['Ayarlar → Genel\'deki "Setler arası dinlenme sayacı" düğmesiyle sayacı kapatabilirsin. Kapalıyken set tamamlayınca geri sayım başlamaz; istediğin zaman yeniden açabilirsin.'],
      },
    ],
  },
  {
    version: '2.3.0',
    date: '2 Kasım 2026',
    title: 'Binlerce paketli ürün',
    sections: [
      {
        name: 'Paketli ürünler',
        items: [
          'Türkiye\'de satılan yaklaşık 5.000 markalı paketli ürün (Eti, Ülker, Sütaş, Pınar…) artık aramada "Paketli ürünler" bölümünde çıkar.',
          'Marka adıyla ararsan ("eti burçak") paketli ürünler en üste gelir.',
          'Liste telefonda durur: internet yokken de aranır, barkodu okutunca da önce burada bakılır.',
          'Liste her hafta Open Food Facts\'ten kendiliğinden güncellenir.',
        ],
      },
      {
        name: 'İnternette arama',
        items: [
          'Aradığın şey listede azsa uygulama Open Food Facts\'te de kendiliğinden arar; sonuçlar "İnternette bulunanlar" bölümünde çıkar.',
          'Değerleri bilinmeyen lif ve sodyum artık 0 değil boş gelir; kaydetmeden önce paketle karşılaştırabilirsin.',
        ],
      },
    ],
  },
  {
    version: '2.2.1',
    date: '2 Kasım 2026',
    title: 'Yenilikler ekranı',
    sections: [
      {
        name: 'Uygulama',
        items: ['Güncelleme geldiğinde neyin değiştiğini bu ekranda görürsün. Tüm sürüm notları Ayarlar → Yenilikler\'de durur.'],
      },
    ],
  },
  {
    version: '2.2.0',
    date: '2 Kasım 2026',
    title: 'Beslenme: porsiyonlar, tarifler, favoriler ve öğün şablonları',
    sections: [
      {
        name: 'Öğün şablonları',
        items: [
          'Günlükte bir öğünün altındaki "Şablon olarak kaydet" ile sık yediğin öğünü sakla.',
          'Besin ekle → Şablonlar: şablonu istediğin öğüne ve güne (7 gün ileriye kadar) tek seferde ekle.',
          'Eklerken miktarı çarpanla değiştir (ör. 1,5×) ve istemediğin besinleri çıkar.',
          'Listende artık olmayan bir besin, şablondaki kayıtlı değeriyle eklenir ve sana haber verilir.',
        ],
      },
      {
        name: 'Favoriler ve kategoriler',
        items: [
          'Besinlerin yanındaki yıldızla favorilere ekle; Favoriler sekmesinden hızlıca bul.',
          'Besinler 15 kategoride (Süt ürünleri, Atıştırmalıklar…). Ararken kategoriye göre süzebilirsin.',
          'Kendi kategorilerini oluştur (ör. "Kahvaltılıklar"). Bir besin birden çok kategoride olabilir.',
        ],
      },
      {
        name: 'Tarifler',
        items: [
          'Tariflere adımlar, etiketler, hazırlama ve pişirme süresi eklenebiliyor.',
          'Porsiyon sayısını değiştirince malzemeler de ölçeklenir.',
          'Pişmiş son ağırlığı girersen porsiyon değerleri daha doğru hesaplanır.',
          'Tarife dokununca detay ekranı açılır: günlüğe ekle, düzenle, kopyala, sil.',
        ],
      },
      {
        name: 'Porsiyonlar',
        items: [
          'Kendi besinine birden çok ölçü (adet, dilim, ölçek…) ve varsayılan ölçü tanımlayabilirsin.',
          '1,5 ölçek gibi ondalıklı miktarlar girilebiliyor.',
          'Değeri bilinmeyen lif, sodyum ve potasyum artık 0 değil "bilinmiyor" görünür.',
          'Bir besini sonradan düzenlesen de eski günlük kayıtların değişmez.',
        ],
      },
      {
        name: 'Coach',
        items: ['Coach favorilerini, şablonlarını ve tariflerini bilir; "her zamanki kahvaltımı ekle" diyebilirsin.'],
      },
    ],
  },
  {
    version: '2.1.1',
    date: '2 Kasım 2026',
    title: 'Coach sohbetleri',
    sections: [
      {
        name: 'Coach',
        items: [
          'Konuşmalar artık ayrı sohbetlerde; Coach ekranı temiz açılır, son sohbetler listede durur.',
          'Üstteki "‹ Sohbetler" ile sohbeti kapat, "+ Yeni" ile yenisini başlat.',
          '3 saatten uzun süre yazışılmayan sohbet kendiliğinden kapanır.',
          'Coach\'a yalnızca açık sohbetin geçmişi gider. Eski mesajların "Önceki konuşmalar" sohbetinde.',
        ],
      },
    ],
  },
  {
    version: '2.1.0',
    date: '2 Kasım 2026',
    title: 'Güvenlik ve veri koruma',
    sections: [
      {
        name: 'Yedekler',
        items: [
          'Şifreli bulut yedeği daha güçlü. Yeni telefonda yedek adı ya da kurtarma kodu (QR) ve şifrenle açılır.',
          'Geri yükleme önce yedeği kontrol eder; yarıda kalırsa eski verilerin olduğu gibi kalır.',
          'Otomatik yedek, eksik bir yedeği sağlam yedeğin üzerine yazmaz.',
        ],
      },
      {
        name: 'Kilit ve gizlilik',
        items: [
          'Yeni PIN 6 haneli; yanlış denemelerden sonra bekleme süresi artar.',
          'Face ID daha güvenli doğrulanıyor.',
          'Ayarlar → "Coach neleri görebilir" ile Coach\'a giden bilgileri seçebilirsin.',
        ],
      },
      {
        name: 'Tahliller',
        items: ['Referans aralığının nereden geldiği (rapor ya da genel aralık) açıkça yazar; birimi uymayan değerler ayrıca gösterilir.'],
      },
    ],
  },
];

// Bu özellikten önceki kurulumlarda (görülen sürüm bilgisi yok) bu sürümden sonrakiler gösterilir
export const FIRST_TRACKED = '2.1.0';

// "2.10.0" > "2.9.1" gibi sayısal karşılaştırma; eksik ya da bozuk parçalar 0 sayılır
export function cmpVersion(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Görülen sürümden sonra gelen (ve şu anki sürümü geçmeyen) notlar, yeniden eskiye
export function notesSince(seen, current, log = CHANGELOG) {
  const from = seen || FIRST_TRACKED;
  return log.filter((e) => cmpVersion(e.version, from) > 0 && cmpVersion(e.version, current) <= 0);
}

const entryHTML = (e, open = true) => `
  <section class="card wn-entry">
    <div class="wn-hd"><span class="wn-ver">${esc(e.version)}</span><span class="small muted">${esc(e.date)}</span></div>
    <h3 class="wn-title">${esc(e.title)}</h3>
    ${open
      ? e.sections
          .map((s) => `<div class="wn-sec"><h4>${esc(s.name)}</h4><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`)
          .join('')
      : ''}
  </section>`;

// Yenilikler ekranı. entries boşsa tüm geçmiş gösterilir. Kapanınca çözülür.
export function openWhatsNew(entries = null, { current = null } = {}) {
  const all = !entries;
  const list = entries || CHANGELOG;
  const older = all ? [] : CHANGELOG.filter((e) => !list.includes(e) && (!current || cmpVersion(e.version, current) <= 0));
  return new Promise((resolve) => {
    const s = openSheet({
      title: all ? 'Sürüm notları' : 'Yenilikler',
      leftLabel: 'Kapat',
      onClose: () => resolve(),
      body: `
        ${all ? '' : `<p class="small muted" style="margin:-2px 4px 12px;text-align:center">Uygulama güncellendi${current ? ` · Pro Coach ${esc(current)}` : ''}</p>`}
        ${list.map((e) => entryHTML(e)).join('')}
        ${all ? '' : '<button type="button" class="btn primary block" data-wn-ok style="margin:4px 0 10px">Tamam</button>'}
        ${older.length ? `<button type="button" class="btn block" data-wn-all>Önceki sürüm notları (${older.length})</button>` : ''}`,
    });
    s.el.querySelector('.sheet-bd')?.scrollTo?.(0, 0);
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-wn-ok')) s.close();
      else if (b.hasAttribute('data-wn-all')) {
        b.remove();
        s.el.querySelector('[data-wn-ok]')?.insertAdjacentHTML('beforebegin', older.map((x) => entryHTML(x)).join(''));
      }
    });
  });
}

// Açılışta: sürüm değiştiyse bir kez göster. Görülen sürüm cihaza özeldir (yedeğe girmez).
export async function checkWhatsNew(current) {
  const seen = await db.getSetting('seen_version', null);
  if (seen && cmpVersion(seen, current) >= 0) return false;
  const notes = notesSince(seen, current);
  // önce kaydet: ekran kapatılmadan uygulama kapanırsa bir sonraki açılışta tekrar çıkmasın
  await db.setSetting('seen_version', current);
  if (!notes.length) return false;
  await openWhatsNew(notes, { current });
  return true;
}

// Yeni kurulum: ilk açılışta yenilikler gösterilmez
export async function markVersionSeen(current) {
  await db.setSetting('seen_version', current);
}
