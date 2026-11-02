import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, trDate, icon, confirmSheet, openSheet, downloadOrShare, lineChartSVG, trendChartSVG, MONTHS_SHORT, parseDate, avatarHTML, setAvatarCache, dateStr } from '../util.js';
import { ACCENTS, applyAccent, go, refresh, APP_VERSION } from '../app.js';
import { hasPin, setupPinFlow, clearPin, showLock, faceIdAvailable, hasFaceId, enableFaceId, disableFaceId, pinLength, faceIdNeedsReenroll } from '../lock.js';
import { monthUsage } from '../ai.js';
import { waterTarget, energyBreakdown, activityOf, JOBS, INTENSITY, adaptiveExpenditure, macrosFor, weightTrend, trendRate, AI_CATEGORIES } from '../context.js';
import * as push from '../push.js';
import { sharedLabels, openAiShareSheet } from '../aishare.js';
import { cloudSupported, cloudMode, enableVault, upgradeToVault, backupNow, findBackup, adoptVault, disableCloud, recoveryCode, passIssue, inboxToken, inboxUrl, pullInbox, closeInbox } from '../cloud.js';


function suggestTargets(p) {
  const e = energyBreakdown(p);
  if (!e) return null;
  return macrosFor(p, e.tdee);
}

export const render = (root, params) => renderPage(root, params, 'profile');

export async function renderPage(root, params, mode = 'profile') {
  const p = await db.getProfile();
  const accent = (await db.getSetting('accent')) || 'pro';
  const avatar = await db.getSetting('avatar');
  const restSec = await db.getSetting('rest_seconds', 90);
  const pin = await hasPin();
  const faceAvail = pin && (await faceIdAvailable());
  const faceOn = await hasFaceId();
  const pinLen = await pinLength();
  const faceOld = await faceIdNeedsReenroll();
  const dailyWeight = await db.getSetting('daily_weight_prompt', true);
  const apiKey = await db.getSetting('api_key', '');
  const usage = await monthUsage();
  const wTarget = await waterTarget(p);
  const wCustom = await db.getSetting('water_target_ml');
  const notes = await db.list('coach_notes');
  const pushOn = !!(await db.getSetting('push_enabled'));
  const prefs = await push.getPrefs();
  const pushSupported = push.isSupported();
  const standalone = push.isStandalone();
  const pushDiag = [`ana ekran: ${standalone ? 'evet' : 'hayır'}`, `push: ${'PushManager' in window ? 'var' : 'yok'}`, `bildirim: ${'Notification' in window ? 'var' : 'yok'}`, `sw: ${'serviceWorker' in navigator ? 'var' : 'yok'}`].join(' · ');
  const backupPhotos = await db.getSetting('backup_photos', true);
  const cloudM = await cloudMode();
  const aiShared = await sharedLabels();
  const vault = await db.getSetting('cloud_v3');
  const cloudLast = await db.getSetting('cloud_last');
  const cloudHold = await db.getSetting('cloud_hold');
  const inTok = await db.getSetting('inbox_token');
  const inLast = await db.getSetting('inbox_last');
  const stepsMap = (await db.getSetting('daily_steps', {})) || {};
  const stepDays = Object.keys(stepsMap).sort();
  const photoCount = (await db.list('progress_photos')).length;
  const lastBackup = await db.getSetting('last_backup');
  const weights = (await db.list('body_logs')).sort((a, b) => a.date.localeCompare(b.date));
  const first = params.first === '1';
  const wTrend = weightTrend(weights);
  const wRate = trendRate(wTrend, 14);
  const en = energyBreakdown(p);
  const act = activityOf(p);
  const sug = suggestTargets(p);
  const adapt = await adaptiveExpenditure(21);
  const sugA = adapt.ready ? macrosFor(p, adapt.tdee) : null;
  const phase = p.phase || 'koruma';

  const wPoints = weights.slice(-12).map((w) => {
    const d = parseDate(w.date);
    return { label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, value: w.weight_kg };
  });

  root.innerHTML = mode === 'settings'
    ? `
    <header class="hdr">
      <div class="hdr-text">
        <a href="#/profil" class="btn ghost" style="padding:0;height:32px;justify-content:flex-start">‹ Profil</a>
        <h1 class="title">Ayarlar</h1>
      </div>
    </header>

    <div class="sec"><h2>Görünüm</h2></div>
    <section class="card">
      <div class="field" style="margin-bottom:0"><span class="lbl">Ana renk</span>
        <div class="swatches">
          ${ACCENTS.map((a) => `<button type="button" class="swatch" style="background:${a.swatch || a.value}" aria-label="${a.label}" aria-pressed="${accent === a.value}" data-accent="${a.value}"></button>`).join('')}
        </div>
      </div>
      <p class="small muted" style="margin:10px 0 0;line-height:18px">Pro Coach rengi açık temada bordo, koyu temada altın olur; iPhone'un görünüm ayarını izler.</p>
    </section>

    <div class="sec"><h2>Coach (yapay zekâ)</h2></div>
    <section class="card">
      <p class="small muted" style="margin:0 0 10px;line-height:18px">Coach, Anthropic'in Claude modelini kullanır. Bunun için Claude Console'dan aldığın bir API anahtarı gerekir. Anahtar yalnızca bu telefonda (uygulama verisinde, ayrıca şifrelenmeden) saklanır, yedeğe dahil edilmez ve doğrudan Anthropic'e gönderilir.</p>
      <div class="field"><label for="api-key">API anahtarı</label>
        <input id="api-key" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${apiKey ? '••••••••••••' : ''}">
      </div>
      <div class="btn-row">
        <button type="button" class="btn primary" data-act="save-key">Kaydet</button>
        ${apiKey ? '<button type="button" class="btn" data-act="del-key">Kaldır</button>' : ''}
      </div>
      <div class="kv" style="margin-top:12px"><span class="k">Bu ayki harcama (tahmini)</span><span class="v">$${usage.cost.toFixed(2)}</span></div>
      <div class="kv"><span class="k">Bu ay mesaj</span><span class="v">${fmt(usage.calls)}</span></div>
      ${usage.saved > 0.005 ? `<div class="kv"><span class="k">Önbellekle tasarruf</span><span class="v">$${usage.saved.toFixed(2)}</span></div>` : ''}
      <p class="small muted" style="margin:6px 0 0;line-height:18px">Console'da aylık harcama limiti koymanı öneririm; limit aşılırsa Coach durur, uygulamanın geri kalanı çalışmaya devam eder.</p>
      <button type="button" class="list-btn" data-act="ai-share" style="margin-top:6px"><span class="k" style="display:flex;flex-direction:column;gap:2px"><span>Coach neleri görebilir</span><span class="small muted">${esc(aiShared.length === AI_CATEGORIES.length ? 'Tüm kategoriler' : aiShared.length ? aiShared.join(', ') : 'Hiçbiri')}</span></span>${icon.chev}</button>
    </section>

    <div class="sec"><h2>Bildirimler</h2></div>
    <section class="card">
      ${
        !standalone && !pushOn
          ? `<p style="margin:0 0 10px;font-size:15px;line-height:21px">Şu an uygulama <b>Safari içinde</b> açık görünüyor. iPhone bildirimlere sadece ana ekrandan <b>web uygulaması olarak</b> açılan uygulamalarda izin veriyor.</p>
             <ol style="margin:0;padding-left:20px;font-size:15px;line-height:22px">
               <li>Ana ekrandaki eski simgeyi sil (önce Yedek al ile verilerini yedekle).</li>
               <li>Safari'de siteyi aç → Paylaş → <b>Ana Ekrana Ekle</b>.</li>
               <li>Açılan ekranda <b>"Web Uygulaması Olarak Aç"</b> seçeneğinin açık olduğundan emin ol → Ekle.</li>
               <li>Yeni simgeden aç; üstte Safari adres çubuğu görünmemeli. Yedeğini Ayarlar'dan geri yükle.</li>
             </ol>
             <p class="small muted" style="margin:10px 0 0">Durum: ${pushDiag}</p>`
          : !pushSupported
          ? `<p style="margin:0;font-size:15px;line-height:21px">Uygulama ana ekrandan açık ama iPhone bildirim özelliğini sunmuyor. Ayarlar → Uygulamalar → Safari → Gelişmiş → Özellik Bayrakları bölümünde "Notifications" ve "Push API" açık olmalı.</p>
             <p class="small muted" style="margin:10px 0 0">Durum: ${pushDiag}</p>`
          : `<div class="kv" style="border-top:0"><label class="k" for="push-on">Hatırlatmalar</label><span class="switch"><input id="push-on" type="checkbox" ${pushOn ? 'checked' : ''}><span></span></span></div>
             ${
               pushOn
                 ? `<div class="kv"><label class="k" for="pp-doses">Hap ve enjeksiyon</label><span class="switch"><input id="pp-doses" type="checkbox" data-pref="doses" ${prefs.doses ? 'checked' : ''}><span></span></span></div>
                    ${
                      prefs.doses
                        ? `<div class="grid2" style="padding:8px 0;row-gap:8px">
                            ${[['sabah', 'Sabah'], ['ogle', 'Öğle'], ['aksam', 'Akşam']].map(([k, l]) => `<div class="field" style="margin:0"><label for="pt-${k}">${l}</label><input id="pt-${k}" class="input" type="time" data-ptime="${k}" value="${prefs.times[k]}"></div>`).join('')}
                            <div class="field" style="margin:0"><label for="pt-inj">Enjeksiyon</label><input id="pt-inj" class="input" type="time" data-pinj value="${prefs.injection_time}"></div>
                          </div>
                          <div class="kv"><label class="k" for="pp-names">Bildirimde madde adlarını göster</label><span class="switch"><input id="pp-names" type="checkbox" data-pref="show_names" ${prefs.show_names ? 'checked' : ''}><span></span></span></div>`
                        : ''
                    }
                    <div class="kv"><label class="k" for="pp-workout">Antrenman günleri</label><span class="switch"><input id="pp-workout" type="checkbox" data-pref="workout" ${prefs.workout ? 'checked' : ''}><span></span></span></div>
                    ${prefs.workout ? `<div class="field" style="margin:8px 0"><label for="pt-w">Antrenman hatırlatma saati</label><input id="pt-w" class="input" type="time" data-pwork value="${prefs.workout_time}"></div>` : ''}
                    <div class="kv"><label class="k" for="pp-backup">Haftalık yedek hatırlatması (Pazar 20:00)</label><span class="switch"><input id="pp-backup" type="checkbox" data-pref="backup" ${prefs.backup ? 'checked' : ''}><span></span></span></div>
                    <button type="button" class="btn block" data-act="push-test" style="margin-top:10px">Deneme bildirimi gönder</button>`
                 : ''
             }
             <p class="small muted" style="margin:10px 0 0;line-height:18px">Hatırlatma saatleri ve başlıklar bildirim sunucusunda tutulur; madde adları varsayılan olarak gönderilmez. O zaman dilimindeki dozlarını önceden işaretlediysen hatırlatma gelmez.</p>`
      }
    </section>

    <div class="sec"><h2>Genel</h2></div>
    <section class="card">
      <div class="field"><label for="rest-sec">Dinlenme süresi (setler arası)</label>
        <select id="rest-sec" class="input">
          ${[45, 60, 75, 90, 120, 150, 180, 240].map((s) => `<option value="${s}" ${Number(restSec) === s ? 'selected' : ''}>${Math.floor(s / 60) ? Math.floor(s / 60) + ' dk ' : ''}${s % 60 ? (s % 60) + ' sn' : ''}</option>`).join('')}
        </select></div>
      <div class="kv" style="border-top:0"><label class="k" for="daily-w">Her gün ilk açılışta kilomu sor</label><span class="switch"><input id="daily-w" type="checkbox" ${dailyWeight ? 'checked' : ''}><span></span></span></div>
    </section>

    <div class="sec"><h2>Güvenlik</h2></div>
    <section class="card">
      <div style="display:flex;flex-direction:column">
        ${
          pin
            ? `<button type="button" class="list-btn" data-act="pin-change"><span class="k">PIN'i değiştir</span>${icon.chev}</button>
               <button type="button" class="list-btn" data-act="pin-off"><span class="k">PIN kilidini kapat</span>${icon.chev}</button>`
            : `<button type="button" class="list-btn" data-act="pin-set"><span class="k">PIN kilidi belirle</span>${icon.chev}</button>`
        }
      </div>
      ${pin && pinLen < 6 ? `<p class="small warn" style="margin:6px 0 4px;line-height:18px">PIN'in ${pinLen} haneli. Daha güvenli olması için 6 haneli bir PIN'e geçmeni öneririm ("PIN'i değiştir").</p>` : ''}
      ${pin && faceOld ? `<p class="small warn" style="margin:6px 0 4px;line-height:18px">Face ID güvenlik güncellemesi nedeniyle kapatıldı. Aşağıdan yeniden açabilirsin.</p>` : ''}
      ${
        pin
          ? faceAvail || faceOn
            ? `<div class="kv"><label class="k" for="faceid">Face ID ile aç</label><span class="switch"><input id="faceid" type="checkbox" ${faceOn ? 'checked' : ''}><span></span></span></div>`
            : `<p class="small muted" style="margin:6px 0 0;line-height:18px">Face ID, uygulama ana ekrandan açıldığında kullanılabilir.</p>`
          : `<p class="small muted" style="margin:6px 0 0;line-height:18px">Face ID ile açmak için önce PIN belirle (Face ID olmazsa PIN yedek olarak kullanılır).</p>`
      }
      <p class="small muted" style="margin:6px 0 0;line-height:18px">PIN ve Face ID uygulamayı açmayı kilitler; telefondaki verileri şifrelemez. Verilerini asıl koruyan, telefonunun kendi kilidi ve şifresidir. Art arda 5 yanlış PIN'den sonra bekleme süresi başlar ve giderek uzar; veriler hiçbir zaman otomatik silinmez.</p>
    </section>

    <div class="sec"><h2>Şifreli bulut yedeği</h2>${cloudM !== 'off' ? '<span class="meta">açık</span>' : ''}</div>
    <section class="card">
      ${
        !cloudSupported()
          ? '<p class="small muted" style="margin:0">Bu tarayıcı şifreli yedeği desteklemiyor (iOS 16.4 ve sonrası gerekir).</p>'
          : cloudM !== 'off'
          ? `${cloudHold ? `<p class="small warn" style="margin:0 0 8px;line-height:18px">Otomatik yedek durduruldu: telefondaki kayıt sayısı son yedeğe göre çok azaldı (${esc(String(cloudHold.prev))} → ${esc(String(cloudHold.now))}). Eski yedeğin üzerine yazılmadı. Verilerin doğruysa "Şimdi yedekle"ye dokun; bir şeyler kaybolduysa önce "Buluttan geri yükle".</p>` : ''}
             ${
               cloudM === 'v2'
                 ? `<div class="cloud-upgrade" style="margin:0 0 10px">
                      <p style="margin:0 0 6px;font-size:15px;line-height:21px"><b>Yedeğini yeni güvenli biçime taşı.</b> Yeni biçimde şifren telefonda saklanmaz ve aynı şifreyi seçen başka biri senin yedeğine erişemez. Bir yedek adı seç; yeni telefonda bu ad ve şifrenle açacaksın.</p>
                      <div class="field"><label for="cl-up-name">Yedek adı (e-posta ya da takma ad)</label><input id="cl-up-name" class="input" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
                      <button type="button" class="btn primary block" data-act="cloud-upgrade">Yeni biçime taşı</button>
                    </div>`
                 : `<div class="kv" style="border-top:0"><span class="k" style="flex:none;white-space:nowrap;margin-right:12px">Yedek adı</span><span class="v" style="min-width:0;overflow-wrap:anywhere;text-align:right">${esc((vault && vault.name) || '—')}</span></div>`
             }
             <div class="kv"${cloudM === 'v2' ? ' style="border-top:0"' : ''}><span class="k">Son bulut yedeği</span><span class="v">${cloudLast ? esc(trDate(cloudLast.slice(0, 10))) + ' ' + esc(new Date(cloudLast).toTimeString().slice(0, 5)) : 'henüz yok'}</span></div>
             <p class="small muted" style="margin:0 0 6px;line-height:18px">Uygulamayı her gün ilk açışında otomatik yedeklenir.${cloudM === 'v3' ? ' Yeni telefonda Buluttan geri yükle\'ye yedek adını (ya da kurtarma kodunu) ve şifreni yazman yeterli.' : ''}</p>
             <button type="button" class="list-btn" data-act="cloud-now"><span class="k">Şimdi yedekle</span>${icon.chev}</button>
             ${cloudM === 'v3' ? `<button type="button" class="list-btn" data-act="cloud-code"><span class="k">Kurtarma kodunu göster</span>${icon.chev}</button>` : ''}
             <button type="button" class="list-btn" data-act="cloud-restore"><span class="k">Buluttan geri yükle</span>${icon.chev}</button>
             <button type="button" class="list-btn danger" data-act="cloud-off"><span class="k">Bulut yedeğini kapat ve sil</span></button>`
          : `<p style="margin:0 0 10px;font-size:15px;line-height:21px">Telefon kaybolsa ya da değişse bile verilerin kaybolmasın. Yedek <b>senin belirlediğin şifreyle telefonda şifrelenir</b>; sunucu içeriği göremez, şifren telefonda da saklanmaz.</p>
             <div class="field"><label for="cl-name">Yedek adı (e-posta ya da takma ad)</label><input id="cl-name" class="input" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Yeni telefonda bu adla bulacaksın"></div>
             <div class="field"><label for="cl-pass">Yedek şifresi (en az 10 karakter)</label><input id="cl-pass" class="input" type="password" autocomplete="new-password" placeholder="Unutmayacağın bir cümle"></div>
             <div class="field"><label for="cl-pass2">Şifre tekrar</label><input id="cl-pass2" class="input" type="password" autocomplete="new-password"></div>
             <p class="small warn" style="margin:0 0 10px;line-height:18px">Bu şifreyi unutursan yedeği kimse açamaz, ben de. Açtıktan sonra sana bir kurtarma kodu da vereceğim; ikisini de güvenli bir yere kaydet.</p>
             <div class="btn-row"><button type="button" class="btn primary" data-act="cloud-on">Aç ve yedekle</button><button type="button" class="btn" data-act="cloud-restore">Geri yükle</button></div>`
      }
    </section>

    <div class="sec"><h2>Apple Sağlık bağlantısı</h2>${inTok ? '<span class="meta">açık</span>' : ''}</div>
    <section class="card">
      ${
        inTok
          ? `<p class="small muted" style="margin:0 0 8px;line-height:18px">Kestirmeler uygulamasıyla günlük adım sayın ve kilon otomatik gelir. Ortalama adım sayın aktivite hesabına girer.</p>
             <div class="kv" style="border-top:0"><span class="k">Son veri</span><span class="v">${inLast ? esc(trDate(inLast.slice(0, 10))) : 'henüz gelmedi'}${stepDays.length ? ` · ${stepDays.length} günlük adım` : ''}</span></div>
             <button type="button" class="list-btn" data-act="health-guide"><span class="k">Kurulum adımları ve bağlantı adresi</span>${icon.chev}</button>
             <button type="button" class="list-btn" data-act="health-pull"><span class="k">Şimdi kontrol et</span>${icon.chev}</button>
             <button type="button" class="list-btn danger" data-act="health-off"><span class="k">Bağlantıyı kapat</span></button>`
          : `<p style="margin:0 0 10px;font-size:15px;line-height:21px">Web uygulamaları Sağlık verisini doğrudan okuyamıyor. iPhone'daki <b>Kestirmeler</b> ile her gün adım sayını ve kilonu otomatik gönderebilirsin.</p>
             <button type="button" class="btn primary block" data-act="health-on">Bağlantıyı kur</button>`
      }
    </section>

    <div class="sec"><h2>Yedekleme</h2></div>
    <section class="card">
      <p class="small muted" style="margin:0 0 6px;line-height:18px">Veriler yalnızca bu telefonda durur. Uygulamayı silersen ya da telefon değiştirirsen kaybolmaması için ara ara yedek al ve Dosyalar'a kaydet.</p>
      ${lastBackup ? `<p class="small muted" style="margin:0 0 6px">Son yedek: ${esc(trDate(lastBackup))}</p>` : ''}
      ${photoCount ? `<div class="kv" style="border-top:0"><label class="k" for="bk-photos">Fotoğrafları yedeğe dahil et (${photoCount})</label><span class="switch"><input id="bk-photos" type="checkbox" ${backupPhotos ? 'checked' : ''}><span></span></span></div>` : ''}
      <button type="button" class="list-btn" data-act="export"><span class="k">Yedek al</span>${icon.chev}</button>
      <label class="list-btn" style="cursor:pointer"><span class="k">Yedekten geri yükle</span>${icon.chev}<input type="file" accept="application/json,.json" data-act="import" class="sr-only"></label>
      <button type="button" class="list-btn" data-act="csv"><span class="k">CSV olarak dışa aktar (Excel)</span>${icon.chev}</button>
      <button type="button" class="list-btn" data-act="clear-chat"><span class="k">Sohbet geçmişini temizle</span>${icon.chev}</button>
      <button type="button" class="list-btn danger" data-act="wipe"><span class="k">Tüm verileri sil</span></button>
    </section>
    <div class="app-foot"><picture class="logo-pic"><source srcset="icons/logo-dark.png" media="(prefers-color-scheme: dark)"><img src="icons/logo.png" alt=""></picture><span>Pro Coach ${APP_VERSION}</span></div>
  `
    : `
    <header class="hdr">
      <div class="hdr-text">
        ${first ? '<span class="eyebrow">İlk kurulum</span>' : `<a href="#/danisman" class="btn ghost" style="padding:0;height:32px;justify-content:flex-start">‹ Coach</a>`}
        <h1 class="title">Profil</h1>
      </div>
      <div class="hdr-actions"><a href="#/ayarlar" class="icon-btn" aria-label="Ayarlar">${icon.gear}</a></div>
    </header>

    ${first ? `<p class="note" style="margin-top:0;margin-bottom:12px">Kendini kısaca tanıt. Coach bu bilgileri her soruda kullanır, böylece her seferinde anlatman gerekmez. Hepsini sonra değiştirebilirsin.</p>` : ''}

    <div class="sec"><h2>Profil</h2></div>
    <section class="card" id="pform">
      <div class="avatar-row">
        <span class="avatar-lg">${avatarHTML(p.name)}</span>
        <div class="avatar-acts">
          <label class="btn" style="cursor:pointer">${avatar ? 'Fotoğrafı değiştir' : 'Profil fotoğrafı ekle'}<input type="file" accept="image/*" id="avatar-in" class="sr-only"></label>
          ${avatar ? '<button type="button" class="btn ghost" data-act="avatar-del">Kaldır</button>' : ''}
        </div>
      </div>
      <div class="field"><label for="p-name">Adın</label><input id="p-name" class="input" data-p="name" value="${esc(p.name || '')}" autocomplete="given-name"></div>
      <div class="grid2">
        <div class="field"><label for="p-sex">Cinsiyet</label>
          <select id="p-sex" class="input" data-p="sex">
            <option value="erkek" ${p.sex !== 'kadin' ? 'selected' : ''}>Erkek</option>
            <option value="kadin" ${p.sex === 'kadin' ? 'selected' : ''}>Kadın</option>
          </select></div>
        <div class="field"><label for="p-by">Doğum yılı</label><input id="p-by" class="input" data-p="birth_year" inputmode="numeric" value="${esc(p.birth_year || '')}" placeholder="1995"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="p-h">Boy (cm)</label><input id="p-h" class="input" data-p="height_cm" inputmode="decimal" value="${esc(p.height_cm || '')}"></div>
        <div class="field"><label for="p-w">Kilo (kg)</label><input id="p-w" class="input" data-p="weight_kg" inputmode="decimal" value="${esc(p.weight_kg ?? '')}"></div>
      </div>
      <div class="field"><span class="lbl">Dönem</span>
        <div class="seg" style="margin:0" role="radiogroup" aria-label="Dönem">
          ${[['bulk', 'Bulk'], ['cut', 'Cut'], ['koruma', 'Koruma']]
            .map(([v, l]) => `<button type="button" role="radio" aria-checked="${phase === v}" aria-selected="${phase === v}" data-phase="${v}">${l}</button>`)
            .join('')}
        </div>
      </div>
      <div class="field"><label for="p-goal">Hedefin</label><textarea id="p-goal" class="input" data-p="goal" placeholder="Örn. yazın 8 kg temiz kilo almak, bench'te 120 kg">${esc(p.goal || '')}</textarea></div>
      <div class="field"><label for="p-inj">Sakatlıklar / dikkat edilecekler</label><textarea id="p-inj" class="input" data-p="injuries" placeholder="Örn. sol omuzda impingement, bel fıtığı geçmişi">${esc(p.injuries || '')}</textarea></div>
      <div class="field" style="margin-bottom:0"><label for="p-notes">Diğer notlar</label><textarea id="p-notes" class="input" data-p="notes" placeholder="Coach'un bilmesini istediğin başka şeyler">${esc(p.notes || '')}</textarea></div>
    </section>

    <div class="sec"><h2>Aktivite</h2>${en ? `<span class="meta">${esc(en.label)}</span>` : ''}</div>
    <section class="card" id="actform">
      <div class="field"><span class="lbl">Gün içinde (iş / okul)</span>
        <div class="act-jobs" role="radiogroup" aria-label="Gün içi hareket">
          ${JOBS.map(([k, l, d]) => `<button type="button" role="radio" class="act-job" aria-checked="${act.job === k}" data-actk="job" data-v="${k}"><b>${l}</b><small>${d}</small></button>`).join('')}
        </div></div>
      <div class="field"><label for="a-steps">Günlük ortalama adım</label>
        <input id="a-steps" class="input" inputmode="numeric" data-acti="steps" value="${esc(act.steps ?? '')}" placeholder="Örn. 7000 (Sağlık uygulamasındaki ortalaman)">${act.steps_src === 'saglik' ? '<span class="small muted">Apple Sağlık\'tan otomatik geliyor (son 14 gün ortalaması)</span>' : ''}</div>
      <div class="act-grp">
        <span class="lbl">Ağırlık antrenmanı</span>
        <div class="grid2">
          <div class="field"><label for="a-td">Haftada kaç gün</label>
            <select id="a-td" class="input" data-acts="train_days">${[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${Number(act.train_days) === n ? 'selected' : ''}>${n ? n + ' gün' : 'Yapmıyorum'}</option>`).join('')}</select></div>
          <div class="field"><label for="a-tm">Bir seans</label>
            <select id="a-tm" class="input" data-acts="train_min">${[30, 45, 60, 75, 90, 120].map((n) => `<option value="${n}" ${Number(act.train_min) === n ? 'selected' : ''}>${n} dk</option>`).join('')}</select></div>
        </div>
        <div class="seg sm" role="radiogroup" aria-label="Antrenman yoğunluğu">${INTENSITY.agirlik.map(([k, l]) => `<button type="button" role="radio" aria-checked="${act.train_int === k}" aria-selected="${act.train_int === k}" data-actk="train_int" data-v="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="act-grp">
        <span class="lbl">Kardiyo</span>
        <div class="field"><label for="a-cm">Haftada toplam (dk)</label>
          <input id="a-cm" class="input" inputmode="numeric" data-acti="cardio_min" value="${act.cardio_min ? esc(act.cardio_min) : ''}" placeholder="Örn. 90 (yoksa boş bırak)"></div>
        <div class="seg sm" role="radiogroup" aria-label="Kardiyo yoğunluğu">${INTENSITY.kardiyo.map(([k, l]) => `<button type="button" role="radio" aria-checked="${act.cardio_int === k}" aria-selected="${act.cardio_int === k}" data-actk="cardio_int" data-v="${k}">${l}</button>`).join('')}</div>
      </div>
      ${
        en
          ? `<div class="inset act-res">
              <div class="act-total"><span>Günlük harcaman</span><b class="num">≈ ${fmt(en.tdee)} kcal</b></div>
              ${[
                ['Bazal metabolizma', en.bmr],
                ['Gün içi yaşam', en.life],
                ['Ek adımlar', en.steps],
                ['Ağırlık antrenmanı', en.train],
                ['Kardiyo', en.cardio],
              ]
                .map(([l, v]) => `<div class="act-row"><span>${l}</span><span class="num">${v ? fmt(v) + ' kcal' : '—'}</span></div>`)
                .join('')}
              <span class="small muted">Katsayı ${String(en.factor.toFixed(2)).replace('.', ',')} · ${esc(en.label)}. Antrenman ve kardiyo haftalık toplamın günlük ortalamasıdır.</span>
            </div>`
          : `<p class="small muted" style="margin:4px 0 0">Doğum yılı, boy ve kilonu girince günlük harcamanı hesaplarım.</p>`
      }
    </section>

    <div class="sec"><h2>Günlük hedefler</h2></div>
    <section class="card">
      <div class="grid2">
        <div class="field"><label for="t-k">Kalori (kcal)</label><input id="t-k" class="input" data-p="target_kcal" inputmode="numeric" value="${esc(p.target_kcal || '')}"></div>
        <div class="field"><label for="t-p">Protein (g)</label><input id="t-p" class="input" data-p="target_protein_g" inputmode="numeric" value="${esc(p.target_protein_g || '')}"></div>
        <div class="field" style="margin-bottom:0"><label for="t-c">Karbonhidrat (g)</label><input id="t-c" class="input" data-p="target_carb_g" inputmode="numeric" value="${esc(p.target_carb_g || '')}"></div>
        <div class="field" style="margin-bottom:0"><label for="t-f">Yağ (g)</label><input id="t-f" class="input" data-p="target_fat_g" inputmode="numeric" value="${esc(p.target_fat_g || '')}"></div>
      </div>
      <div class="field" style="margin:14px 0 0"><label for="t-w">Su (ml)</label>
        <input id="t-w" class="input" inputmode="numeric" data-water value="${esc(wCustom || '')}" placeholder="Otomatik: ${fmt(wTarget)} ml (kilo × 35 ml)"></div>
      ${
        sug
          ? `<div class="inset" style="margin-top:14px">
              <span style="font-size:15px;font-weight:600">Önerilen: ${fmt(sug.kcal)} kcal · P ${sug.protein} · K ${sug.carb} · Y ${sug.fat}</span>
              <span class="small muted">Günlük harcaman yaklaşık ${fmt(sug.tdee)} kcal (Aktivite bölümünden). ${phase === 'bulk' ? '+300 kcal fazla' : phase === 'cut' ? '−500 kcal açık' : 'Koruma'} ile hesaplandı. Kilo değişimine göre 2–3 haftada bir güncellemek iyi olur.</span>
              <button type="button" class="btn primary" style="margin-top:8px" data-act="apply-sug">Önerileri uygula</button>
            </div>`
          : `<p class="small muted" style="margin:12px 0 0">Doğum yılı, boy ve kilonu girersen sana bir başlangıç hedefi hesaplarım.</p>`
      }
    </section>

    <div class="sec"><h2>Gerçek harcaman</h2><span class="meta">son 21 gün</span></div>
    <section class="card">
      ${
        adapt.ready
          ? `<div class="act-total"><span>Yediklerin ve kilo eğiliminden</span><b class="num">≈ ${fmt(adapt.tdee)} kcal</b></div>
             <div class="act-row"><span>Ortalama alınan</span><span class="num">${fmt(adapt.avg_intake)} kcal</span></div>
             <div class="act-row"><span>Kilo eğilimi</span><span class="num">${adapt.rate_kg_week > 0 ? '+' : ''}${String(adapt.rate_kg_week).replace('.', ',')} kg / hafta</span></div>
             <div class="act-row"><span>Güven</span><span>${esc(adapt.confidence)} (${adapt.logged_days} kayıtlı gün, ${adapt.weigh_ins} tartı)</span></div>
             ${sug ? `<div class="act-row"><span>Formülle hesaplanan</span><span class="num">${fmt(sug.tdee)} kcal</span></div>` : ''}
             ${
               sugA && Math.abs((Number(p.target_kcal) || 0) - sugA.kcal) >= 80
                 ? `<div class="inset" style="margin-top:10px"><span style="font-size:15px;font-weight:600">Önerilen hedef: ${fmt(sugA.kcal)} kcal · P ${sugA.protein} · K ${sugA.carb} · Y ${sugA.fat}</span>
                     <span class="small muted">Gerçek harcamana ${phase === 'bulk' ? '+300 kcal' : phase === 'cut' ? '−500 kcal' : 'koruma için ±0'} eklenerek hesaplandı.</span>
                     <button type="button" class="btn primary" style="margin-top:8px" data-act="apply-adapt">Bu hedefe geç</button></div>`
                 : `<p class="small muted" style="margin:8px 0 0">Mevcut kalori hedefin gerçek harcamanla uyumlu.</p>`
             }`
          : `<p style="margin:0 0 8px;font-size:15px;line-height:21px">Formüller herkes için ortalama verir. Yediklerini ve kilonu düzenli girersen gerçek harcamanı hesaplarım.</p>
             <div class="act-row"><span>Kayıtlı gün (en az 10)</span><span class="num">${adapt.logged_days} / 10</span></div>
             <div class="act-row"><span>Tartı (en az 5)</span><span class="num">${adapt.weigh_ins} / 5</span></div>`
      }
      <p class="small muted" style="margin:8px 0 0;line-height:17px">Hesap: ortalama kalori − (kilo eğilimi değişimi × 7.700 kcal). Eksik kaydedilen günler (800 kcal altı) sayılmaz; su ve tuz dalgalanmalarını eğilim çizgisi düzeltir.</p>
    </section>

    <div class="sec"><h2>Kilo geçmişi</h2>${weights.length ? `<span class="meta">${weights.length} kayıt</span>` : ''}</div>
    <section class="card">
      ${wTrend.length >= 2 ? trendChartSVG(wTrend.slice(-30).map((w) => { const d = parseDate(w.date); return { label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, value: w.weight, trend: w.trend }; })) + `<p class="small muted" style="margin:6px 0 0">Çizgi kilo eğilimin${wRate != null ? `: haftada ${wRate > 0 ? '+' : ''}${String(wRate).replace('.', ',')} kg` : ''}. Noktalar günlük tartılar.</p>` : `<p class="small muted" style="margin:0 0 10px">Kilonu girdikçe burada grafik oluşur.</p>`}
      <div style="display:flex;gap:8px;margin-top:10px">
        <label class="sr-only" for="w-today">Bugünkü kilo</label>
        <input id="w-today" class="input" inputmode="decimal" placeholder="Bugünkü kilo (kg)" style="flex:1">
        <button type="button" class="btn primary" data-act="add-weight">Ekle</button>
      </div>
    </section>

    ${first ? `<div style="padding:16px"><button type="button" class="btn primary block" data-act="done-first">Bitti, başlayalım</button></div>` : ''}

    <div class="sec"><h2>Coach'un notları</h2><span class="meta">${notes.length} not</span></div>
    <section class="card">
      <p class="small muted" style="margin:0 0 6px;line-height:18px">Coach konuşmalarda öğrendiği kalıcı tercihlerini buraya not eder ve her cevapta bunlara uyar. İstediğini silebilir ya da kendin ekleyebilirsin.</p>
      ${notes.map((n) => `<div class="note-item"><span>${esc(n.text)}</span><button type="button" class="icon-btn ed-ic" style="color:var(--warn)" aria-label="Notu sil: ${esc(n.text)}" data-act="del-note" data-id="${n.id}">${icon.trash}</button></div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:10px">
        <label class="sr-only" for="note-new">Yeni not</label>
        <input id="note-new" class="input" placeholder="Örn. Sabah 7'de antrenman yapıyorum" style="flex:1">
        <button type="button" class="btn primary" data-act="add-note">Ekle</button>
      </div>
    </section>

    <a href="#/ayarlar" class="card list-row-link" style="display:flex;align-items:center;gap:10px;margin-top:16px"><span style="color:var(--accent)">${icon.gear}</span><span style="flex:1;font-size:16px">Ayarlar</span>${icon.chev}</a>
    <p class="small muted" style="margin:6px 20px 0;line-height:18px">Coach anahtarı, renkler, bildirimler, PIN ve yedekleme Ayarlar'da.</p>
    <div class="app-foot"><picture class="logo-pic"><source srcset="icons/logo-dark.png" media="(prefers-color-scheme: dark)"><img src="icons/logo.png" alt=""></picture><span>Pro Coach ${APP_VERSION}</span></div>
  `;

  // ---- Profil alanları: değişince kaydet ----
  root.querySelectorAll('[data-p]').forEach((inp) => {
    inp.addEventListener('change', async () => {
      const cur = await db.getProfile();
      const key = inp.dataset.p;
      let val = inp.value.trim();
      if (['height_cm', 'weight_kg', 'birth_year', 'target_kcal', 'target_protein_g', 'target_carb_g', 'target_fat_g'].includes(key)) {
        const n = parseNum(val);
        val = isNaN(n) ? null : n;
      }
      cur[key] = val;
      await db.saveProfile(cur);
      if (key === 'weight_kg' && val) await logWeight(val);
      toast('Kaydedildi');
      if (['height_cm', 'weight_kg', 'birth_year', 'sex', 'activity'].includes(key)) refresh();
    });
  });

  // ---- Aktivite: değişince kaydet, katsayıyı güncelle ----
  const saveAct = async (patch) => {
    const cur = await db.getProfile();
    cur.act = { ...activityOf(cur), ...patch };
    const e = energyBreakdown(cur);
    if (e) cur.activity = String(e.factor);
    await db.saveProfile(cur);
    refresh();
  };
  const af = root.querySelector('#actform');
  if (af) {
    af.addEventListener('click', (e) => {
      const b = e.target.closest('[data-actk]');
      if (b) saveAct({ [b.dataset.actk]: b.dataset.v });
    });
    af.querySelectorAll('[data-acts]').forEach((el) => el.addEventListener('change', () => saveAct({ [el.dataset.acts]: Number(el.value) })));
    af.querySelectorAll('[data-acti]').forEach((el) =>
      el.addEventListener('change', () => {
        const n = parseNum(el.value);
        saveAct({ [el.dataset.acti]: isNaN(n) || n <= 0 ? null : Math.round(n) });
      })
    );
  }

  // ---- Profil fotoğrafı: kare kırpılıp küçültülür, sadece bu telefonda saklanır ----
  root.querySelector('#avatar-in')?.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const url = URL.createObjectURL(f);
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Fotoğraf açılamadı'));
        i.src = url;
      });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', 0.82);
      await db.setSetting('avatar', data);
      setAvatarCache(data);
      toast('Profil fotoğrafı eklendi');
      refresh();
    } catch (err) {
      toast(err.message);
    }
  });

  const fid = root.querySelector('#faceid');
  if (fid)
    fid.addEventListener('change', async () => {
      if (fid.checked) {
        try {
          await enableFaceId();
          toast('Face ID açıldı');
        } catch (err) {
          fid.checked = false;
          toast(err && err.name === 'NotAllowedError' ? 'Face ID izni verilmedi' : 'Face ID kurulamadı: ' + (err.message || err), 4000);
        }
      } else {
        await disableFaceId();
        toast('Face ID kapatıldı');
      }
    });
  const dw = root.querySelector('#daily-w');
  if (dw)
    dw.addEventListener('change', async () => {
      await db.setSetting('daily_weight_prompt', dw.checked);
      toast(dw.checked ? 'Her gün kilon sorulacak' : 'Günlük kilo sorusu kapatıldı');
    });

  root.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-phase],[data-accent]');
    if (!t) return;
    if (t.dataset.phase) {
      const cur = await db.getProfile();
      cur.phase = t.dataset.phase;
      await db.saveProfile(cur);
      toast('Dönem: ' + t.textContent);
      return refresh();
    }
    if (t.dataset.act === 'avatar-del') {
      await db.setSetting('avatar', null);
      setAvatarCache(null);
      toast('Profil fotoğrafı kaldırıldı');
      return refresh();
    }
    if (t.dataset.accent) {
      await db.setSetting('accent', t.dataset.accent);
      applyAccent(t.dataset.accent);
      return refresh();
    }
    const act = t.dataset.act;
    if (act === 'add-note') {
      const v = root.querySelector('#note-new').value.trim();
      if (!v) return toast('Notu yaz');
      await db.put('coach_notes', { text: v.slice(0, 300) });
      return refresh();
    }
    if (act === 'del-note') {
      await db.remove('coach_notes', t.dataset.id);
      return refresh();
    }
    if (act === 'push-test') {
      try {
        t.disabled = true;
        await push.test();
        toast('Bildirim gönderildi; birkaç saniye içinde gelmeli');
      } catch (err) {
        toast(err.message, 4000);
      } finally {
        t.disabled = false;
      }
      return;
    }
    if (act === 'apply-adapt' && sugA) {
      const cur = await db.getProfile();
      Object.assign(cur, { target_kcal: sugA.kcal, target_protein_g: sugA.protein, target_carb_g: sugA.carb, target_fat_g: sugA.fat });
      await db.saveProfile(cur);
      await db.setSetting('checkin_week', (await import('../util.js')).weekStart(today()));
      toast('Hedefler gerçek harcamana göre güncellendi');
      return refresh();
    }
    if (act === 'apply-sug' && sug) {
      const cur = await db.getProfile();
      Object.assign(cur, { target_kcal: sug.kcal, target_protein_g: sug.protein, target_carb_g: sug.carb, target_fat_g: sug.fat });
      await db.saveProfile(cur);
      toast('Hedefler güncellendi');
      refresh();
    } else if (act === 'add-weight') {
      const v = parseNum(root.querySelector('#w-today').value);
      if (!v || v < 30 || v > 300) return toast('Geçerli bir kilo gir');
      await logWeight(v);
      const cur = await db.getProfile();
      cur.weight_kg = v;
      await db.saveProfile(cur);
      toast('Kilo kaydedildi');
      refresh();
    } else if (act === 'done-first') {
      go('danisman');
    } else if (act === 'save-key') {
      const v = root.querySelector('#api-key').value.trim();
      if (!v || v.startsWith('•')) return toast('Anahtarı yapıştır');
      if (!v.startsWith('sk-ant-')) return toast('Anahtar "sk-ant-" ile başlamalı');
      await db.setSetting('api_key', v);
      toast('API anahtarı kaydedildi');
      refresh();
    } else if (act === 'del-key') {
      await db.remove('settings', 'api_key');
      toast('Anahtar kaldırıldı');
      refresh();
    } else if (act === 'pin-set' || act === 'pin-change') {
      if (act === 'pin-change') await showLock({});
      const ok = await setupPinFlow({ title: act === 'pin-set' ? 'PIN belirle' : 'Yeni PIN' });
      if (ok) toast('PIN kaydedildi');
      refresh();
    } else if (act === 'pin-off') {
      await showLock({});
      await clearPin();
      await disableFaceId();
      toast('PIN kilidi kapatıldı');
      refresh();
    } else if (act === 'ai-share') {
      openAiShareSheet(() => refresh());
    } else if (act === 'cloud-on') {
      const name = root.querySelector('#cl-name').value;
      const a = root.querySelector('#cl-pass').value;
      const b = root.querySelector('#cl-pass2').value;
      const issue = passIssue(a);
      if (issue) return toast(issue, 3500);
      if (a !== b) return toast('Şifreler aynı değil');
      t.disabled = true;
      t.textContent = 'Şifreleniyor…';
      try {
        const r = await enableVault({ name, pass: a });
        toast(`Bulut yedeği açıldı (${Math.max(1, Math.round(r.size / 1024))} KB)`, 3500);
        await refresh();
        openRecoveryCode(r.code, true);
      } catch (err) {
        toast(err.message, 4500);
        t.disabled = false;
        t.textContent = 'Aç ve yedekle';
      }
    } else if (act === 'cloud-upgrade') {
      t.disabled = true;
      t.textContent = 'Taşınıyor…';
      try {
        const r = await upgradeToVault(root.querySelector('#cl-up-name').value);
        toast('Yedeğin yeni biçime taşındı', 3500);
        await refresh();
        openRecoveryCode(r.code, true);
      } catch (err) {
        toast(err.message, 4500);
        t.disabled = false;
        t.textContent = 'Yeni biçime taşı';
      }
    } else if (act === 'cloud-code') {
      openRecoveryCode(await recoveryCode(), false);
    } else if (act === 'cloud-now') {
      t.disabled = true;
      try {
        const r = await backupNow();
        toast(r.ok ? 'Buluta yedeklendi' : 'Az önce yedeklendi; birkaç dakika sonra tekrar dene', 3500);
      } catch (err) {
        toast(err.message, 4000);
      }
      refresh();
    } else if (act === 'cloud-restore') {
      openCloudRestore();
    } else if (act === 'cloud-off') {
      if (!(await confirmSheet({ title: 'Bulut yedeğini kapat', text: 'Sunucudaki şifreli yedek silinir ve otomatik yedekleme durur. Telefondaki verilerin etkilenmez.', okLabel: 'Kapat ve sil', danger: true }))) return;
      await disableCloud();
      toast('Bulut yedeği kapatıldı');
      refresh();
    } else if (act === 'health-on') {
      await inboxToken(true);
      await pullInbox(); // sunucuda kutuyu açar
      await refresh();
      openHealthGuide(await inboxToken());
    } else if (act === 'health-guide') {
      openHealthGuide(inTok);
    } else if (act === 'health-pull') {
      const n = await pullInbox({ quiet: false });
      if (!n) toast('Yeni veri yok');
      refresh();
    } else if (act === 'health-off') {
      await closeInbox();
      toast('Apple Sağlık bağlantısı kapatıldı');
      refresh();
    } else if (act === 'csv') {
      openCsv();
    } else if (act === 'export') {
      const data = await db.exportAll({ photos: !!(await db.getSetting('backup_photos', true)) });
      await downloadOrShare(`procoach-yedek-${today()}.json`, JSON.stringify(data), 'application/json');
      await db.setSetting('last_backup', today());
    } else if (act === 'clear-chat') {
      if (await confirmSheet({ title: 'Sohbeti temizle', text: 'Coach ile tüm konuşma geçmişi silinir. Kayıtlı verilerin (beslenme, antrenman, kür, tahliller) etkilenmez.', okLabel: 'Temizle', danger: true })) {
        await db.clearStore('chat_messages');
        toast('Sohbet temizlendi');
      }
    } else if (act === 'wipe') {
      if (await confirmSheet({ title: 'Tüm verileri sil', text: 'Bu telefondaki bütün kayıtlar silinir ve geri alınamaz. Önce yedek almanı öneririm.', okLabel: 'Her şeyi sil', danger: true })) {
        await db.wipeAll();
        location.hash = '';
        location.reload();
      }
    }
  };

  const wIn = root.querySelector('[data-water]');
  wIn?.addEventListener('change', async () => {
    const v = parseNum(wIn.value);
    if (isNaN(v) || v <= 0) await db.remove('settings', 'water_target_ml');
    else await db.setSetting('water_target_ml', Math.round(v));
    toast('Kaydedildi');
  });
  const bk = root.querySelector('#bk-photos');
  if (bk) bk.addEventListener('change', () => db.setSetting('backup_photos', bk.checked));
  const pOn = root.querySelector('#push-on');
  if (pOn)
    pOn.addEventListener('change', async () => {
      try {
        if (pOn.checked) {
          await push.enable();
          toast('Hatırlatmalar açıldı');
        } else {
          await push.disable();
          toast('Hatırlatmalar kapatıldı');
        }
      } catch (err) {
        pOn.checked = !pOn.checked;
        toast(err.message, 4500);
      }
      refresh();
    });
  root.querySelectorAll('[data-pref]').forEach((inp) =>
    inp.addEventListener('change', async () => {
      const pr = await push.getPrefs();
      pr[inp.dataset.pref] = inp.checked;
      await push.savePrefs(pr);
      refresh();
    })
  );
  root.querySelectorAll('[data-ptime],[data-pinj],[data-pwork]').forEach((inp) =>
    inp.addEventListener('change', async () => {
      if (!/^\d{2}:\d{2}$/.test(inp.value)) return;
      const pr = await push.getPrefs();
      if (inp.dataset.ptime) pr.times[inp.dataset.ptime] = inp.value;
      else if (inp.hasAttribute('data-pinj')) pr.injection_time = inp.value;
      else pr.workout_time = inp.value;
      await push.savePrefs(pr);
      toast('Kaydedildi');
    })
  );

  root.querySelector('#rest-sec')?.addEventListener('change', async (e) => {
    await db.setSetting('rest_seconds', Number(e.target.value));
    toast('Kaydedildi');
  });

  root.querySelector('[data-act="import"]')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 300 * 1024 * 1024) throw new Error('Dosya çok büyük.');
      const obj = db.parseBackupText(await file.text());
      const choice = await restoreSheet(obj);
      if (!choice) return;
      await db.importAll(obj, { keepPhotos: choice.keepPhotos });
      toast('Yedek yüklendi');
      applyAccent(await db.getSetting('accent'));
      refresh();
    } catch (err) {
      toast(err.message || 'Dosya okunamadı', 4500);
    } finally {
      e.target.value = '';
    }
  });
}

// Geri yükleme öncesi özet: doğrulama sonucu, kayıt sayıları, uyarılar ve fotoğraf seçeneği.
// Doğrulama hatası varsa geri yükleme düğmesi gösterilmez; telefondaki veriye dokunulmaz.
const STORE_LABELS = { food_logs: 'besin kaydı', workout_sets: 'set', body_logs: 'kilo kaydı', lab_values: 'tahlil değeri', dose_logs: 'doz kaydı', progress_photos: 'fotoğraf', vitals: 'tansiyon/nabız' };
export async function restoreSheet(obj, { at = null } = {}) {
  const v = db.validateBackup(obj);
  const photosHere = (await db.list('progress_photos')).length;
  const askPhotos = v.ok && !v.photosIncluded && photosHere > 0;
  const when = at || obj.exported_at;
  const counts = Object.entries(STORE_LABELS)
    .filter(([k]) => v.stats[k])
    .map(([k, l]) => `${v.stats[k]} ${l}`)
    .join(' · ');
  return new Promise((resolve) => {
    let result = null;
    const s = openSheet({
      title: v.ok ? 'Yedeği geri yükle' : 'Yedek açılamadı',
      size: 'auto',
      leftLabel: 'Vazgeç',
      body: v.ok
        ? `<p style="font-size:16px;line-height:22px;margin:4px 4px 10px">${when ? esc(trDate(dateStr(new Date(when)))) + ' tarihli yedek. ' : ''}Bu telefondaki veriler bu yedekle değiştirilecek. API anahtarı, PIN ve bulut ayarların korunur.</p>
           ${counts ? `<p class="small muted" style="margin:0 4px 10px;line-height:18px">${esc(counts)}</p>` : ''}
           ${v.warnings.length ? `<p class="small warn" style="margin:0 4px 10px;line-height:18px">${v.warnings.slice(0, 3).map(esc).join('<br>')}</p>` : ''}
           ${askPhotos ? `<div class="kv" style="border-top:0;margin-bottom:10px"><label class="k" for="rs-keep">Bu yedekte fotoğraf yok. Telefondaki ${photosHere} fotoğraf korunsun</label><span class="switch"><input id="rs-keep" type="checkbox" checked><span></span></span></div>` : ''}
           <button type="button" class="btn block primary" data-ok>Geri yükle</button>`
        : `<p style="font-size:16px;line-height:22px;margin:4px 4px 10px">Yedek doğrulamadan geçmedi; telefondaki verilerine dokunulmadı.</p>
           <p class="small warn" style="margin:0 4px 10px;line-height:18px">${v.errors.slice(0, 5).map(esc).join('<br>')}${v.errors.length > 5 ? `<br>+${v.errors.length - 5} sorun daha` : ''}</p>`,
      onClose: () => resolve(result),
    });
    s.el.querySelector('[data-ok]')?.addEventListener('click', () => {
      result = { keepPhotos: askPhotos ? s.el.querySelector('#rs-keep').checked : true };
      s.close();
    });
  });
}

async function logWeight(v) {
  const d = today();
  const existing = (await db.list('body_logs', (r) => r.date === d))[0];
  await db.put('body_logs', { ...(existing || {}), date: d, weight_kg: v });
}


// ---------- Kurtarma kodu ----------
// Kod = kasa kimliği + tuz + sürüm. Tek başına yedeği açmaz; yeni telefonda şifre ayrıca istenir.
async function qrSVG(text) {
  const { default: qrcode } = await import('../../vendor/qrcode/qrcode.mjs');
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  // QR her temada siyah-beyaz (okunabilirlik için)
  return `<svg viewBox="0 0 ${n + 8} ${n + 8}" width="220" height="220" role="img" aria-label="Kurtarma kodu QR" style="display:block;margin:0 auto;background:#fff;border-radius:12px" shape-rendering="crispEdges"><path fill="#000" d="${d}"/></svg>`;
}
async function openRecoveryCode(code, fresh) {
  if (!code) return;
  const s = openSheet({
    title: 'Kurtarma kodu',
    leftLabel: 'Kapat',
    body: `
      <p style="font-size:15px;line-height:21px;margin:0 4px 12px">${fresh ? '<b>Bunu şimdi kaydet.</b> ' : ''}Yedek adını unutursan yeni telefonda bu kod ve şifrenle yedeğini açabilirsin. Kod tek başına yedeği açmaz; şifren ayrıca gerekir.</p>
      <div data-qr style="min-height:220px;margin-bottom:12px"></div>
      <p class="rc-code" style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:22px;overflow-wrap:anywhere;text-align:center;background:var(--card);border-radius:12px;padding:12px;margin:0 0 12px;user-select:all">${esc(code)}</p>
      <div class="btn-row" style="margin-bottom:10px"><button type="button" class="btn" data-copy>Kopyala</button><button type="button" class="btn" data-save>Dosya olarak kaydet</button></div>
      <p class="small muted" style="margin:0 4px 12px;line-height:18px">Ekran görüntüsü alıp Fotoğraflar'da saklayabilir ya da şifre yöneticine yapıştırabilirsin. Şifreni bu kodla aynı yere yazma.</p>
      ${fresh ? '<button type="button" class="btn primary block" data-done>Kaydettim</button>' : ''}`,
  });
  s.el.querySelector('[data-qr]').innerHTML = await qrSVG(code).catch(() => '');
  s.el.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Kopyalandı');
    } catch {
      toast('Kopyalanamadı; kodu basılı tutup seç');
    }
  });
  s.el.querySelector('[data-save]').addEventListener('click', () =>
    downloadOrShare('procoach-kurtarma-kodu.txt', `Pro Coach bulut yedeği kurtarma kodu\n\n${code}\n\nYeni telefonda: Ayarlar › Şifreli bulut yedeği › Geri yükle › bu kodu ve yedek şifreni yaz.\nKod tek başına yedeği açmaz.\n`, 'text/plain')
  );
  s.el.querySelector('[data-done]')?.addEventListener('click', () => s.close());
}

// ---------- Buluttan geri yükle ----------
function openCloudRestore() {
  const s = openSheet({
    title: 'Buluttan geri yükle',
    size: 'auto',
    leftLabel: 'Vazgeç',
    rightLabel: 'Geri yükle',
    body: `<div class="field"><label for="cr-who">Yedek adı ya da kurtarma kodu</label>
        <div style="display:flex;gap:8px"><input id="cr-who" class="input" autocomplete="username" autocapitalize="none" spellcheck="false" style="flex:1"><button type="button" class="btn" data-scan aria-label="Kurtarma kodunun QR'ını okut">QR</button></div></div>
      <div class="field"><label for="cr-pass">Yedek şifresi</label><input id="cr-pass" class="input" type="password" autocomplete="current-password"></div>
      <p class="small muted" style="margin:0 4px;line-height:18px">Bu telefondaki veriler buluttaki yedekle değiştirilir. API anahtarı, PIN ve Face ID ayarların korunur. Yedeğini 2.0 sürümünde açtıysan ad alanını boş bırak, sadece şifreni yaz.</p>`,
    onRight: async (api) => {
      const who = s.el.querySelector('#cr-who').value;
      const pass = s.el.querySelector('#cr-pass').value;
      if (!pass) return toast('Şifreyi yaz');
      const btn = s.el.querySelector('[data-sheet-right]');
      if (btn) btn.disabled = true;
      try {
        const { data, at, vault, legacyPass } = await findBackup({ who, pass });
        const choice = await restoreSheet(data, { at });
        if (!choice) return;
        await db.importAll(data, { keepPhotos: choice.keepPhotos });
        if (vault) await adoptVault(vault);
        else if (legacyPass) await db.setSetting('cloud_pass', legacyPass); // eski biçim: Ayarlar'da yeni biçime taşıma önerilir
        applyAccent(await db.getSetting('accent'));
        api.close();
        toast('Yedek geri yüklendi');
        refresh();
      } catch (err) {
        toast(err.message, 4500);
      } finally {
        if (btn) btn.disabled = false;
      }
    },
  });
  s.el.querySelector('[data-scan]').addEventListener('click', async () => {
    const { scanBarcode } = await import('../barcode.js');
    const code = await scanBarcode({ qr: true, accept: (c) => /^PC3-/i.test(c) });
    if (code) s.el.querySelector('#cr-who').value = code;
  });
}

// ---------- Apple Sağlık (Kestirmeler) kurulum rehberi ----------
function openHealthGuide(token) {
  const url = inboxUrl(token);
  const s = openSheet({
    title: 'Apple Sağlık bağlantısı',
    body: `
      <section class="card">
        <span class="small muted">Bağlantı adresin (gizli tut)</span>
        <div class="url-box">${esc(url)}</div>
        <button type="button" class="btn block" data-copy>Adresi kopyala</button>
      </section>
      <div class="sec"><h2>Kestirmeyi oluştur</h2></div>
      <section class="card guide">
        <ol>
          <li><b>Kestirmeler</b> uygulamasını aç › sağ üstte <b>+</b> › adını <b>Pro Coach Sağlık</b> koy.</li>
          <li><b>Sağlık Örneklerini Bul</b> eylemini ekle: Tür <b>Adımlar</b>, Başlangıç tarihi <b>Bugün</b>.</li>
          <li><b>İstatistikleri Hesapla</b> ekle: <b>Toplam</b> (Sağlık örnekleri için).</li>
          <li>Bir <b>Sağlık Örneklerini Bul</b> daha ekle: Tür <b>Ağırlık</b>, Sıralama <b>En yeni</b>, Sınır <b>1</b>. Sonra <b>Ayrıntıyı Al</b> › <b>Değer</b>.</li>
          <li><b>URL'nin İçeriğini Al</b> ekle: URL'ye yukarıdaki adresi yapıştır. Yöntem <b>POST</b>, İstek gövdesi <b>JSON</b>. Alanlar:
            <ul><li><b>steps</b> → İstatistikler (toplam adım)</li><li><b>weight</b> → Değer (kilo, kg)</li><li><b>date</b> → Geçerli Tarih, biçim <b>yyyy-MM-dd</b></li></ul></li>
          <li>Kestirmeyi bir kez çalıştır; Sağlık izinlerini ver.</li>
        </ol>
      </section>
      <div class="sec"><h2>Her gün otomatik çalışsın</h2></div>
      <section class="card guide">
        <ol>
          <li>Kestirmeler › <b>Otomasyon</b> › <b>+</b> › <b>Günün Saati</b> › örn. <b>22:00</b>, <b>Her Gün</b>.</li>
          <li><b>Hemen çalıştır</b>'ı seç (çalıştırmadan önce sorma) › Pro Coach Sağlık kestirmesini seç.</li>
        </ol>
      </section>
      <p class="small muted" style="margin:0 4px;line-height:18px">Gönderilen adım ve kilo değerleri uygulamayı açana kadar (en fazla 45 gün) sunucuda bekler; uygulama açılınca alınır ve sunucudan silinir. O gün zaten kilo girdiysen Sağlık'tan gelen kilo üzerine yazılmaz. Son 14 günün ortalama adımı aktivite hesabında kullanılır.</p>`,
  });
  s.el.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Adres kopyalandı');
    } catch {
      toast('Kopyalanamadı; adresi basılı tutup kopyala');
    }
  });
}

// ---------- CSV dışa aktarma ----------
const csvCell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (head, rows) => '\ufeff' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');

async function csvFor(kind) {
  if (kind === 'antrenman') {
    const exs = await db.list('exercises');
    const sets = (await db.list('workout_sets', (x) => x.done)).sort((a, b) => a.date.localeCompare(b.date) || a.set_no - b.set_no);
    const name = (id) => (exs.find((e) => e.id === id) || {}).name || '';
    return csv(['Tarih', 'Hareket', 'Set', 'Tür', 'Kg', 'Tekrar', 'RPE', 'Drop setler', 'Süre (dk)', 'Mesafe (km)', 'Rekor'],
      sets.map((x) => [x.date, name(x.exercise_id), x.set_no, x.type === 'warmup' ? 'Isınma' : x.type === 'failure' ? 'Tükeniş' : 'Normal', x.weight_kg || null, x.reps || null, x.rpe, (x.drops || []).map((d) => `${d.weight_kg}x${d.reps}`).join(' '), x.duration_min, x.distance_km, x.pr ? 'evet' : '']));
  }
  if (kind === 'beslenme') {
    const f = (await db.list('food_logs')).sort((a, b) => a.date.localeCompare(b.date));
    return csv(['Tarih', 'Öğün', 'Besin', 'Gram', 'Kalori', 'Protein', 'Karbonhidrat', 'Yağ', 'Lif'], f.map((x) => [x.date, x.meal, x.name, x.grams, Math.round(x.kcal || 0), x.protein_g, x.carb_g, x.fat_g, x.fiber_g]));
  }
  if (kind === 'kilo') {
    const w = (await db.list('body_logs')).sort((a, b) => a.date.localeCompare(b.date));
    return csv(['Tarih', 'Kilo (kg)', 'Kaynak'], w.map((x) => [x.date, x.weight_kg, x.source === 'saglik' ? 'Apple Sağlık' : '']));
  }
  if (kind === 'tansiyon') {
    const v = (await db.list('vitals')).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    return csv(['Tarih', 'Saat', 'Büyük', 'Küçük', 'Nabız', 'Not'], v.map((x) => [x.date, x.time, x.sys, x.dia, x.hr, x.note]));
  }
  if (kind === 'kan') {
    const tests = await db.list('lab_tests');
    const vals = await db.list('lab_values');
    const rows = [];
    for (const t of tests.sort((a, b) => a.date.localeCompare(b.date))) for (const v of vals.filter((x) => x.test_id === t.id)) rows.push([t.date, t.lab_name, v.name, v.value, v.unit, v.ref_low, v.ref_high]);
    return csv(['Tarih', 'Laboratuvar', 'Test', 'Sonuç', 'Birim', 'Ref alt', 'Ref üst'], rows);
  }
  return '';
}

function openCsv() {
  const kinds = [['antrenman', 'Antrenman setleri'], ['beslenme', 'Beslenme kayıtları'], ['kilo', 'Kilo'], ['tansiyon', 'Tansiyon ve nabız'], ['kan', 'Kan değerleri']];
  const s = openSheet({
    title: 'CSV olarak dışa aktar',
    size: 'auto',
    body: `<section class="card flush">${kinds.map(([k, l]) => `<button type="button" class="list-btn" data-csv="${k}" style="padding:0 14px"><span class="k">${l}</span>${icon.chev}</button>`).join('')}</section>
      <p class="small muted" style="margin:0 4px;line-height:18px">Dosyalar Excel ve Numbers'ta açılır (noktalı virgülle ayrılmış, Türkçe ondalık).</p>`,
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-csv]');
    if (!b) return;
    const text = await csvFor(b.dataset.csv);
    await downloadOrShare(`procoach-${b.dataset.csv}-${today()}.csv`, text, 'text/csv');
  });
}
