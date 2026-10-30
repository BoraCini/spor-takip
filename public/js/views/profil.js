import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, trDate, icon, confirmSheet, downloadOrShare, lineChartSVG, MONTHS_SHORT, parseDate, avatarHTML, setAvatarCache } from '../util.js';
import { ACCENTS, applyAccent, go, refresh, APP_VERSION } from '../app.js';
import { hasPin, setupPinFlow, clearPin, showLock, faceIdAvailable, hasFaceId, enableFaceId, disableFaceId } from '../lock.js';
import { monthUsage } from '../ai.js';
import { waterTarget, energyBreakdown, activityOf, JOBS, INTENSITY } from '../context.js';
import * as push from '../push.js';


function suggestTargets(p) {
  const e = energyBreakdown(p);
  if (!e) return null;
  const w = Number(p.weight_kg);
  const tdee = e.tdee;
  const phase = p.phase || 'koruma';
  const kcal = Math.round((tdee + (phase === 'bulk' ? 300 : phase === 'cut' ? -500 : 0)) / 10) * 10;
  const protein = Math.round(w * (phase === 'cut' ? 2.2 : 2.0));
  const fat = Math.round(Math.max(w * 0.9, (kcal * 0.25) / 9));
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carb, fat, tdee: Math.round(tdee) };
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
  const photoCount = (await db.list('progress_photos')).length;
  const lastBackup = await db.getSetting('last_backup');
  const weights = (await db.list('body_logs')).sort((a, b) => a.date.localeCompare(b.date));
  const first = params.first === '1';
  const en = energyBreakdown(p);
  const act = activityOf(p);
  const sug = suggestTargets(p);
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
      <p class="small muted" style="margin:0 0 10px;line-height:18px">Coach, Anthropic'in Claude modelini kullanır. Bunun için Claude Console'dan aldığın bir API anahtarı gerekir. Anahtar yalnızca bu telefonda saklanır ve yedeğe dahil edilmez.</p>
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
      ${
        pin
          ? faceAvail || faceOn
            ? `<div class="kv"><label class="k" for="faceid">Face ID ile aç</label><span class="switch"><input id="faceid" type="checkbox" ${faceOn ? 'checked' : ''}><span></span></span></div>`
            : `<p class="small muted" style="margin:6px 0 0;line-height:18px">Face ID, uygulama ana ekrandan açıldığında kullanılabilir.</p>`
          : `<p class="small muted" style="margin:6px 0 0;line-height:18px">Face ID ile açmak için önce PIN belirle (Face ID olmazsa PIN yedek olarak kullanılır).</p>`
      }
      <p class="small muted" style="margin:6px 0 0;line-height:18px">PIN bir ekran kilididir; telefonunun kendi şifresi asıl korumadır.</p>
    </section>

    <div class="sec"><h2>Yedekleme</h2></div>
    <section class="card">
      <p class="small muted" style="margin:0 0 6px;line-height:18px">Veriler yalnızca bu telefonda durur. Uygulamayı silersen ya da telefon değiştirirsen kaybolmaması için ara ara yedek al ve Dosyalar'a kaydet.</p>
      ${lastBackup ? `<p class="small muted" style="margin:0 0 6px">Son yedek: ${esc(trDate(lastBackup))}</p>` : ''}
      ${photoCount ? `<div class="kv" style="border-top:0"><label class="k" for="bk-photos">Fotoğrafları yedeğe dahil et (${photoCount})</label><span class="switch"><input id="bk-photos" type="checkbox" ${backupPhotos ? 'checked' : ''}><span></span></span></div>` : ''}
      <button type="button" class="list-btn" data-act="export"><span class="k">Yedek al</span>${icon.chev}</button>
      <label class="list-btn" style="cursor:pointer"><span class="k">Yedekten geri yükle</span>${icon.chev}<input type="file" accept="application/json,.json" data-act="import" class="sr-only"></label>
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
        <input id="a-steps" class="input" inputmode="numeric" data-acti="steps" value="${esc(act.steps ?? '')}" placeholder="Örn. 7000 (Sağlık uygulamasındaki ortalaman)"></div>
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

    <div class="sec"><h2>Kilo geçmişi</h2>${weights.length ? `<span class="meta">${weights.length} kayıt</span>` : ''}</div>
    <section class="card">
      ${wPoints.length >= 2 ? lineChartSVG(wPoints, { unit: 'kg' }) : `<p class="small muted" style="margin:0 0 10px">Kilonu girdikçe burada grafik oluşur.</p>`}
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
      const obj = JSON.parse(await file.text());
      const ok = await confirmSheet({
        title: 'Yedeği geri yükle',
        text: `${obj.exported_at ? trDate(obj.exported_at.slice(0, 10)) + ' tarihli yedek. ' : ''}Mevcut verilerin bu yedekle değiştirilecek.`,
        okLabel: 'Geri yükle',
      });
      if (!ok) return;
      await db.importAll(obj);
      toast('Yedek yüklendi');
      applyAccent(await db.getSetting('accent'));
      refresh();
    } catch (err) {
      toast(err.message || 'Dosya okunamadı');
    } finally {
      e.target.value = '';
    }
  });
}

async function logWeight(v) {
  const d = today();
  const existing = (await db.list('body_logs', (r) => r.date === d))[0];
  await db.put('body_logs', { ...(existing || {}), date: d, weight_kg: v });
}
