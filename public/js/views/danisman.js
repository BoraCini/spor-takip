import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, trDate, relDay, timeStr, icon, miniMarkdown, dateStr } from '../util.js';
import { go, refresh } from '../app.js';
import { dayNutrition, targetsOf, programDay, sessionFor, routineDay, dueOn, mealLabel, slotLabel, suggestSite, SITES, MEASURES } from '../context.js';
import { daysBetween, addDays, weekStart, downloadOrShare } from '../util.js';
import { weekday } from '../util.js';
import { runTurn, commitCard, cardNutrition, AIError, undoNote } from '../ai.js';
import { listen, sttSupported, ttsSupported, speak, stopSpeaking, unlockSpeech } from '../voice.js';

let voiceReply = false;
let stopListen = null;

let busy = false;
let pendingImage = null; // { media_type, data, thumb }
let rootEl = null;
let vvHandler = null;

export function destroy() {
  if (stopListen) stopListen();
  stopListen = null;
  stopSpeaking();
  document.body.classList.remove('chat-mode', 'kb-open');
  if (vvHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', vvHandler);
    window.visualViewport.removeEventListener('scroll', vvHandler);
  }
  vvHandler = null;
}

export async function render(root, params) {
  rootEl = root;
  document.body.classList.add('chat-mode');
  const t = today();
  const p = await db.getProfile();
  const tg = targetsOf(p);
  const { totals } = await dayNutrition(t);
  // Bugün seçilen rutin varsa onu, yoksa haftalık programı göster
  const ses = await sessionFor(t);
  let { day, items } = ses ? await routineDay(ses.routine_id) : { day: null, items: [] };
  if (!day) ({ day, items } = await programDay(weekday(t)));
  const doneSets = (await db.list('workout_sets', (x) => x.date === t && x.done)).length;
  const due = await dueOn(t);
  const hasKey = !!(await db.getSetting('api_key'));
  voiceReply = !!(await db.getSetting('voice_reply', false));
  const left = tg.kcal ? tg.kcal - totals.kcal : null;

  root.innerHTML = `
    <div class="chat-wrap">
      <div class="chat-top">
        <header class="hdr">
          <div class="hdr-text">
            <span class="eyebrow">${esc(trDate(t, true))}</span>
            <h1 class="title">Danışman</h1>
          </div>
          <div class="hdr-actions">
            ${ttsSupported() ? `<button type="button" class="icon-btn" id="voicetog" aria-pressed="${voiceReply}" aria-label="Cevapları sesli oku">${voiceReply ? icon.speaker : icon.speakerOff}</button>` : ''}
            <a href="#/profil" class="icon-btn" aria-label="Profil ve ayarlar">${icon.person}</a>
          </div>
        </header>
        <nav class="chips" aria-label="Bugünün özeti">
          <a href="#/beslenme?tab=log" class="chipcard">
            <span class="lbl">Beslenme</span>
            <span class="val">${left == null ? fmt(totals.kcal) : fmt(Math.abs(left))}</span>
            <span class="sub">${left == null ? 'kcal yenen' : left < 0 ? 'kcal fazla' : 'kcal kaldı'}</span>
            ${tg.kcal ? `<span class="bar"><span style="width:${Math.min(100, Math.round((totals.kcal / tg.kcal) * 100))}%"></span></span>` : ''}
          </a>
          <a href="#/antrenman" class="chipcard">
            <span class="lbl">Antrenman</span>
            <span class="val">${esc(day ? (day.rest ? 'Dinlenme' : day.title || 'Antrenman') : '—')}</span>
            <span class="sub">${esc(doneSets ? `${doneSets} set yapıldı` : day && !day.rest ? `${items.length} hareket` : day ? 'toparlanma' : 'rutin seç')}</span>
          </a>
          <a href="#/kur" class="chipcard">
            <span class="lbl">Kür</span>
            <span class="val">${due.total ? `${due.done} / ${due.total}` : '—'}</span>
            <span class="sub">${due.total ? 'tamamlandı' : 'bugün plan yok'}</span>
          </a>
        </nav>
      </div>
      <div id="banners"></div>
      <div class="chat-list" id="chat" aria-live="polite"></div>
      <div class="attach-preview" id="attach" hidden></div>
      <form class="composer" id="composer">
        <label class="icon-btn" style="cursor:pointer" aria-label="Fotoğraf ekle">
          ${icon.camera}
          <input type="file" accept="image/*" id="photo" class="sr-only">
        </label>
        <label for="msg" class="sr-only">Mesaj</label>
        <textarea id="msg" rows="1" placeholder="Yaz ya da sor…" enterkeyhint="send"></textarea>
        <button type="button" class="icon-btn mic" id="micbtn" aria-pressed="false" aria-label="Sesli mesaj">${icon.mic}</button>
        <button type="submit" class="icon-btn send" aria-label="Gönder">${icon.send}</button>
      </form>
    </div>`;

  await drawMessages({ hasKey, name: p.name, params });
  await drawBanners();

  const form = root.querySelector('#composer');
  const ta = root.querySelector('#msg');
  const autosize = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
  };
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (voiceReply) unlockSpeech();
    send(ta.value);
  });
  root.querySelector('#photo').addEventListener('change', onPhoto);

  // ---- Ses ----
  const vt = root.querySelector('#voicetog');
  if (vt)
    vt.addEventListener('click', async () => {
      voiceReply = !voiceReply;
      await db.setSetting('voice_reply', voiceReply);
      vt.setAttribute('aria-pressed', String(voiceReply));
      vt.innerHTML = voiceReply ? icon.speaker : icon.speakerOff;
      if (voiceReply) {
        unlockSpeech();
        toast('Cevaplar sesli okunacak');
      } else {
        stopSpeaking();
        toast('Sesli okuma kapalı');
      }
    });
  const mic = root.querySelector('#micbtn');
  mic.addEventListener('click', () => {
    if (stopListen) {
      stopListen();
      return;
    }
    if (!sttSupported()) {
      toast('Bu cihazda uygulama içi ses tanıma yok. Klavyedeki mikrofon simgesiyle dikte edebilirsin.', 4000);
      ta.focus();
      return;
    }
    if (busy) return;
    if (voiceReply) unlockSpeech();
    const before = ta.value.trim();
    mic.classList.add('rec');
    mic.setAttribute('aria-pressed', 'true');
    ta.placeholder = 'Dinliyorum…';
    stopListen = listen({
      onInterim: (txt) => {
        ta.value = (before ? before + ' ' : '') + txt;
        autosize();
      },
      onFinal: (txt) => {
        const full = (before ? before + ' ' : '') + txt;
        ta.value = full;
        autosize();
        send(full);
      },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') toast('Mikrofon izni verilmedi. Ayarlar > Safari > Mikrofon\'dan izin verebilirsin.', 4000);
        else if (err !== 'no-speech' && err !== 'aborted') toast('Ses anlaşılamadı, tekrar dene.');
      },
      onEnd: () => {
        stopListen = null;
        mic.classList.remove('rec');
        mic.setAttribute('aria-pressed', 'false');
        ta.placeholder = 'Yaz ya da sor…';
      },
    });
  });

  if (params.ask === 'lab' && params.test) {
    const test = await db.get('lab_tests', params.test);
    if (test) {
      ta.value = `${trDate(test.date)} tarihli kan testimi kürümü ve antrenmanımı dikkate alarak yorumlar mısın? Hangileri beklenen etki, hangileri dikkat gerektiriyor?`;
      autosize();
    }
    history.replaceState(null, '', '#/danisman');
  }
  if (params.photo === '1') history.replaceState(null, '', '#/danisman');

  // iOS klavye: görünür alan küçüldüğünde sohbeti ona sığdır
  if (window.visualViewport) {
    vvHandler = () => {
      const vv = window.visualViewport;
      const kb = window.innerHeight - vv.height > 120;
      document.body.classList.toggle('kb-open', kb);
      document.documentElement.style.setProperty('--vvh', vv.height + 'px');
      if (kb) {
        window.scrollTo(0, 0);
        scrollBottom();
      }
    };
    window.visualViewport.addEventListener('resize', vvHandler);
    window.visualViewport.addEventListener('scroll', vvHandler);
  }
}

async function drawBanners() {
  const box = rootEl && rootEl.querySelector('#banners');
  if (!box) return;
  const t = today();
  let html = '';
  const last = await db.getSetting('last_backup');
  const snooze = await db.getSetting('backup_snooze');
  const hasData = (await db.list('food_logs')).length + (await db.list('workout_sets')).length + (await db.list('compounds')).length > 3;
  const age = last ? daysBetween(last, t) : null;
  if (hasData && (age == null || age >= 7) && (!snooze || snooze < t)) {
    html = `<div class="banner" role="status"><span>${age == null ? 'Henüz hiç yedek almadın.' : `Son yedeğin ${age} gün önce.`} Veriler sadece bu telefonda; yedek almak iyi olur.</span>
      <button type="button" class="pill" data-banner="backup">Yedek al</button><button type="button" class="x" data-banner="snooze-backup" aria-label="Kapat">×</button></div>`;
  } else {
    const wd = weekday(t);
    const ws = weekStart(t);
    const key = wd === 6 ? ws : addDays(ws, -7);
    const dismissed = await db.getSetting('report_seen');
    if ((wd === 6 || wd === 0) && dismissed !== key && (await db.getSetting('api_key'))) {
      html = `<div class="banner" role="status"><span>${wd === 6 ? 'Bu haftanın' : 'Geçen haftanın'} raporu hazır.</span>
        <button type="button" class="pill" data-banner="report" data-key="${key}" data-which="${wd === 6 ? 'bu' : 'gecen'}">Göster</button><button type="button" class="x" data-banner="dismiss-report" data-key="${key}" aria-label="Kapat">×</button></div>`;
    }
  }
  box.innerHTML = html;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-banner]');
    if (!b) return;
    const a = b.dataset.banner;
    if (a === 'backup') {
      const data = await db.exportAll();
      await downloadOrShare(`sporcoach-yedek-${today()}.json`, JSON.stringify(data), 'application/json');
      await db.setSetting('last_backup', today());
    } else if (a === 'snooze-backup') await db.setSetting('backup_snooze', addDays(today(), 3));
    else if (a === 'report' || a === 'dismiss-report') {
      await db.setSetting('report_seen', b.dataset.key);
      if (a === 'report') send(b.dataset.which === 'bu' ? 'Bu haftanın raporunu hazırlar mısın?' : 'Geçen haftanın raporunu hazırlar mısın?');
    }
    drawBanners();
  };
}

// Canlı yazılan cevap
function showLive(full) {
  const list = rootEl && rootEl.querySelector('#chat');
  if (!list) return;
  let live = list.querySelector('#live');
  const typing = list.querySelector('.typing');
  if (!full) {
    if (live) {
      live.remove();
      if (!list.querySelector('.typing')) list.insertAdjacentHTML('beforeend', '<div class="typing" aria-label="Danışman yazıyor"><i></i><i></i><i></i></div>');
    }
    return;
  }
  if (!live) {
    if (typing) typing.remove();
    list.insertAdjacentHTML('beforeend', '<div class="bubble ai stream-cursor" id="live" aria-busy="true"></div>');
    live = list.querySelector('#live');
  }
  live.innerHTML = miniMarkdown(full);
  scrollBottom();
}

function scrollBottom() {
  const list = rootEl && rootEl.querySelector('#chat');
  if (list) list.scrollTop = list.scrollHeight;
}

// ---------- Mesaj listesi ----------
async function drawMessages({ hasKey, name, params = {} } = {}) {
  const list = rootEl.querySelector('#chat');
  if (!list) return;
  if (hasKey === undefined) hasKey = !!(await db.getSetting('api_key'));
  const msgs = await db.list('chat_messages');
  let html = '<div class="spacer"></div>';
  if (!msgs.length) {
    html += `<div class="bubble ai">
      <p>Merhaba${name ? ' ' + esc(name) : ''}! Bana yediklerini, yaptığın setleri, aldığın hapları ya da kilonu yazabilirsin; kaydı ben hazırlarım, sen onaylarsın.</p>
      <p>Beslenme, antrenman, kür ve tahlil sonuçların hakkında da soru sorabilirsin. Tahlil raporunun fotoğrafını gönderirsen değerleri okuyup kaydederim.</p></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%">
        ${['3 yumurta ve 2 dilim tam buğday ekmeği yedim', 'Bugün proteinim yeterli mi?', 'Bench press 80 kg 8, 8, 7 yaptım', 'Bu haftanın raporunu hazırla']
          .map((s) => `<button type="button" class="tog suggest" data-suggest="${esc(s)}">${esc(s)}</button>`)
          .join('')}
      </div>`;
  }
  if (!hasKey) {
    html += `<div class="act-card"><div class="ac-head"><span class="ac-title">Kurulum</span></div>
      <p style="margin:0 0 10px;font-size:15px;line-height:21px">Danışmanın çalışması için bir Claude API anahtarı gerekiyor. Anahtarı Profil ve ayarlar sayfasından ekleyebilirsin.</p>
      <a href="#/profil" class="btn primary">Anahtarı ekle</a></div>`;
  }
  if (params.photo === '1') {
    html += `<div class="bubble ai"><p>Sol alttaki kamera simgesine dokunup tahlil raporunun fotoğrafını çek ya da galeriden seç. Değerleri okuyup Kan testleri sayfasına kaydetmen için onay kartı hazırlarım.</p></div>`;
  }
  let lastDay = '';
  for (const m of msgs) {
    const d = (m.created_at || '').slice(0, 10) ? dateStr(new Date(m.created_at)) : '';
    if (d && d !== lastDay) {
      html += `<p class="chat-day">${esc(relDay(d))} ${esc(timeStr(m.created_at))}</p>`;
      lastDay = d;
    }
    if (m.role === 'user') {
      html += `<div class="bubble me">${m.image ? `<img src="${m.image}" alt="Gönderilen fotoğraf">` : ''}${esc(m.text || '')}</div>`;
    } else if (m.role === 'assistant') {
      html += `<div class="bubble ai">${miniMarkdown(m.text || '')}</div>`;
      if (m.model || ttsSupported())
        html += `<span class="model-tag">${m.model ? esc(m.model) : ''}${ttsSupported() ? `${m.model ? ' · ' : ''}<button type="button" class="speak-btn" data-speak="${m.id}">Dinle</button>` : ''}</span>`;
    } else if (m.role === 'card') {
      html += cardHTML(m);
    } else if (m.role === 'error') {
      html += `<div class="bubble err" role="alert">${esc(m.text)}</div>`;
    }
  }
  if (busy) html += `<div class="typing" aria-label="Danışman yazıyor"><i></i><i></i><i></i></div>`;
  list.innerHTML = html;
  scrollBottom();
  list.onclick = onListClick;
  list.oninput = onListInput;
  list.onchange = onListInput;
}

function itemNutr(it) {
  return cardNutrition(it);
}

function cardHTML(m) {
  const c = m.card;
  const pending = m.status === 'pending';
  const status =
    m.status === 'saved'
      ? `<div class="ac-status">✓ ${esc(m.result || 'Kaydedildi')}</div>`
      : m.status === 'cancelled'
      ? `<div class="ac-status">İptal edildi</div>`
      : '';
  const buttons = pending
    ? `<div class="btn-row"><button type="button" class="btn" data-card="cancel" data-id="${m.id}">İptal</button><button type="button" class="btn primary" data-card="save" data-id="${m.id}">Kaydet</button></div>`
    : '';
  const dateNote = c.date && c.date !== today() ? ` · ${esc(trDate(c.date))}` : '';

  if (c.type === 'food') {
    const tot = c.items.reduce(
      (a, it) => {
        const n = itemNutr(it);
        return { k: a.k + n.kcal, p: a.p + n.protein_g, c: a.c + n.carb_g, f: a.f + n.fat_g };
      },
      { k: 0, p: 0, c: 0, f: 0 }
    );
    return `<section class="act-card" aria-label="Kayıt onayı" data-cardid="${m.id}">
      <div class="ac-head"><span class="ac-title">${esc(mealLabel(c.meal))}${dateNote}</span>
        ${pending ? `<select class="ac-src" data-meal="${m.id}" aria-label="Öğün" style="border:0;background:transparent;font-size:13px;color:var(--accent)">
          ${['kahvalti', 'ogle', 'aksam', 'ara'].map((k) => `<option value="${k}" ${c.meal === k ? 'selected' : ''}>${esc(mealLabel(k))}</option>`).join('')}</select>` : ''}</div>
      ${c.items
        .map((it, i) => {
          const n = itemNutr(it);
          return `<div class="ac-item">
            <span class="row-main"><span style="font-size:15px;font-weight:500">${esc(it.name)}${it.estimated ? '<span class="est">tahmini</span>' : ''}</span>
            <span class="small muted num" data-kcal="${m.id}-${i}">${fmt(n.kcal)} kcal · P ${fmt(n.protein_g)} · K ${fmt(n.carb_g)} · Y ${fmt(n.fat_g)}</span></span>
            ${
              pending
                ? `<label class="sr-only" for="g-${m.id}-${i}">${esc(it.name)} gram</label>
                   <input id="g-${m.id}-${i}" class="ac-amt" inputmode="decimal" value="${fmt(it.grams)}" data-grams="${m.id}" data-i="${i}" aria-describedby="gu-${m.id}-${i}">
                   <span id="gu-${m.id}-${i}" class="small muted">g</span>
                   <button type="button" class="ac-x" aria-label="${esc(it.name)} çıkar" data-rmitem="${m.id}" data-i="${i}">×</button>`
                : `<span class="num" style="font-size:15px">${fmt(it.grams)} g</span>`
            }
          </div>`;
        })
        .join('')}
      <div class="ac-total"><span>Toplam</span><span class="num" data-total="${m.id}">${fmt(tot.k)} kcal</span></div>
      <span class="small muted num" data-macros="${m.id}">P ${fmt(tot.p)} g · K ${fmt(tot.c)} g · Y ${fmt(tot.f)} g</span>
      ${buttons}${status}
    </section>`;
  }
  if (c.type === 'sets') {
    return `<section class="act-card" aria-label="Set kaydı onayı">
      <div class="ac-head"><span class="ac-title">Antrenman${dateNote}</span></div>
      <div class="ac-item"><span class="row-main"><span style="font-size:15px;font-weight:600">${esc(c.exercise)}</span>
        <span class="small muted num">${c.sets.map((s, i) => `${i + 1}. set: ${fmt(s.weight_kg, 1)} kg × ${s.reps}`).join(' · ')}</span></span></div>
      ${buttons}${status}</section>`;
  }
  if (c.type === 'doses') {
    return `<section class="act-card" aria-label="Doz işaretleme onayı">
      <div class="ac-head"><span class="ac-title">Kür${dateNote}</span></div>
      ${c.items
        .map(
          (it, i) => `<div class="ac-item"><span class="row-main"><span style="font-size:15px;font-weight:500">${esc(it.name)}</span>
            <span class="small muted">${it.kind === 'inj' ? 'Enjeksiyon' : esc(slotLabel(it.slot))}</span></span>
            ${
              it.kind === 'inj' && pending
                ? `<label class="sr-only" for="site-${m.id}-${i}">Bölge</label><select id="site-${m.id}-${i}" class="ac-amt" style="width:auto" data-site="${m.id}" data-i="${i}">
                    ${SITES.map((s) => `<option ${it.site === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`
                : it.site
                ? `<span class="small muted">${esc(it.site)}</span>`
                : ''
            }</div>`
        )
        .join('')}
      ${buttons}${status}</section>`;
  }
  if (c.type === 'labs') {
    return `<section class="act-card" aria-label="Tahlil kaydı onayı">
      <div class="ac-head"><span class="ac-title">Kan testi · ${esc(trDate(c.date))}</span><span class="ac-src">${c.values.length} değer</span></div>
      ${c.values
        .map(
          (v, i) => `<div class="ac-item"><span class="row-main"><span style="font-size:15px;font-weight:500">${esc(v.name)}</span>
          <span class="small muted">ref ${v.ref_low ?? ''}–${v.ref_high ?? ''}</span></span>
          <span class="num" style="font-size:15px;font-weight:600">${fmt(v.value, 2)} <span class="small muted">${esc(v.unit || '')}</span></span>
          ${pending ? `<button type="button" class="ac-x" aria-label="${esc(v.name)} çıkar" data-rmval="${m.id}" data-i="${i}">×</button>` : ''}</div>`
        )
        .join('')}
      ${pending ? `<p class="small muted" style="margin:8px 0 0">Değerleri rapordakiyle karşılaştır; yanlış okunan varsa çıkar, sonra Kan testleri sayfasından düzeltebilirsin.</p>` : ''}
      ${buttons}${status}</section>`;
  }
  if (c.type === 'water') {
    return `<section class="act-card" aria-label="Su kaydı onayı"><div class="ac-head"><span class="ac-title">Su${dateNote}</span></div>
      <div class="ac-item"><span class="row-main"><span style="font-size:17px;font-weight:600" class="num">${fmt(c.ml)} ml</span></span></div>${buttons}${status}</section>`;
  }
  if (c.type === 'cardio') {
    return `<section class="act-card" aria-label="Kardiyo kaydı onayı"><div class="ac-head"><span class="ac-title">Kardiyo${dateNote}</span></div>
      <div class="ac-item"><span class="row-main"><span style="font-size:15px;font-weight:600">${esc(c.exercise)}</span>
      <span class="small muted num">${fmt(c.duration_min, 1)} dk${c.distance_km ? ` · ${fmt(c.distance_km, 1)} km` : ''}</span></span></div>${buttons}${status}</section>`;
  }
  if (c.type === 'measures') {
    return `<section class="act-card" aria-label="Ölçü kaydı onayı"><div class="ac-head"><span class="ac-title">Vücut ölçüleri${dateNote}</span></div>
      ${MEASURES.filter(([k]) => c.values[k] != null).map(([k, l, u]) => `<div class="ac-item"><span class="row-main"><span style="font-size:15px">${l}</span></span><span class="num" style="font-size:15px;font-weight:600">${fmt(c.values[k], 1)} ${u}</span></div>`).join('')}
      ${buttons}${status}</section>`;
  }
  if (c.type === 'note') {
    const undone = m.status === 'undone';
    return `<section class="act-card" aria-label="Danışman notu"><div class="ac-head"><span class="ac-title">${c.action === 'add' ? 'Not aldım' : 'Notu sildim'}</span>
      ${undone ? '<span class="ac-src">geri alındı</span>' : `<button type="button" class="ac-src" style="color:var(--accent);font-weight:600;min-height:32px" data-card="undo-note" data-id="${m.id}">Geri al</button>`}</div>
      <p style="margin:0;font-size:15px;line-height:21px;${undone ? 'text-decoration:line-through;color:var(--sub)' : ''}">${esc(c.text)}</p></section>`;
  }
  if (c.type === 'weight') {
    return `<section class="act-card" aria-label="Kilo kaydı onayı"><div class="ac-head"><span class="ac-title">Kilo${dateNote}</span></div>
      <div class="ac-item"><span class="row-main"><span style="font-size:17px;font-weight:600" class="num">${fmt(c.weight_kg, 1)} kg</span></span></div>${buttons}${status}</section>`;
  }
  if (c.type === 'profile') {
    const L = { phase: 'Dönem', goal: 'Hedef', injuries: 'Sakatlıklar', notes: 'Notlar' };
    return `<section class="act-card" aria-label="Profil güncelleme onayı"><div class="ac-head"><span class="ac-title">Profil</span></div>
      ${Object.entries(c.changes)
        .map(([k, v]) => `<div class="ac-item"><span class="row-main"><span class="small muted">${L[k] || k}</span><span style="font-size:15px">${esc(k === 'phase' ? { bulk: 'Bulk', cut: 'Cut', koruma: 'Koruma' }[v] || v : v)}</span></span></div>`)
        .join('')}${buttons}${status}</section>`;
  }
  return '';
}

async function onListClick(e) {
  const sp = e.target.closest('[data-speak]');
  if (sp) {
    const m = await db.get('chat_messages', sp.dataset.speak);
    if (m) {
      unlockSpeech();
      speak(m.text);
    }
    return;
  }
  const sug = e.target.closest('[data-suggest]');
  if (sug) {
    const ta = rootEl.querySelector('#msg');
    ta.value = sug.dataset.suggest;
    ta.dispatchEvent(new Event('input'));
    ta.focus();
    return;
  }
  const b = e.target.closest('[data-card],[data-rmitem],[data-rmval]');
  if (!b) return;
  if (b.dataset.rmitem || b.dataset.rmval) {
    const id = b.dataset.rmitem || b.dataset.rmval;
    const m = await db.get('chat_messages', id);
    if (!m || m.status !== 'pending') return;
    clearTimeout(pendingSaves[id]);
    if (edits[id]) m.card = edits[id];
    delete edits[id];
    const arr = b.dataset.rmitem ? m.card.items : m.card.values;
    arr.splice(Number(b.dataset.i), 1);
    if (!arr.length) m.status = 'cancelled';
    await db.put('chat_messages', m);
    return drawMessages();
  }
  const m = await db.get('chat_messages', b.dataset.id);
  if (m && b.dataset.card === 'undo-note') {
    if (m.status === 'undone') return;
    await undoNote(m.card);
    m.status = 'undone';
    await db.put('chat_messages', m);
    return drawMessages();
  }
  if (!m || m.status !== 'pending') return;
  clearTimeout(pendingSaves[m.id]);
  if (edits[m.id]) m.card = edits[m.id];
  delete edits[m.id];
  if (b.dataset.card === 'cancel') {
    m.status = 'cancelled';
  } else {
    try {
      b.disabled = true;
      m.result = await commitCard(m.card);
      m.status = 'saved';
      toast(m.result);
    } catch (err) {
      console.error(err);
      b.disabled = false;
      return toast('Kaydedilemedi: ' + err.message);
    }
  }
  await db.put('chat_messages', m);
  if (m.status === 'saved') refresh();
  else drawMessages();
}

const pendingSaves = {};
const edits = {}; // onaylanmamış kartlardaki düzenlemeler (id → kart)
async function onListInput(e) {
  const g = e.target.closest('[data-grams]');
  const site = e.target.closest('[data-site]');
  const meal = e.target.closest('[data-meal]');
  if (!g && !site && !meal) return;
  const id = (g || site || meal).dataset.grams || (g || site || meal).dataset.site || (g || site || meal).dataset.meal;
  const m = await db.get('chat_messages', id);
  if (!m || m.status !== 'pending') return;
  if (edits[id]) m.card = edits[id];
  if (g) {
    const v = parseNum(g.value);
    if (isNaN(v) || v <= 0) return;
    const i = Number(g.dataset.i);
    m.card.items[i].grams = v;
    // kartı yeniden çizmeden rakamları güncelle
    const n = itemNutr(m.card.items[i]);
    const kEl = rootEl.querySelector(`[data-kcal="${id}-${i}"]`);
    if (kEl) kEl.textContent = `${fmt(n.kcal)} kcal · P ${fmt(n.protein_g)} · K ${fmt(n.carb_g)} · Y ${fmt(n.fat_g)}`;
    const tot = m.card.items.reduce(
      (a, it) => {
        const x = itemNutr(it);
        return { k: a.k + x.kcal, p: a.p + x.protein_g, c: a.c + x.carb_g, f: a.f + x.fat_g };
      },
      { k: 0, p: 0, c: 0, f: 0 }
    );
    const tEl = rootEl.querySelector(`[data-total="${id}"]`);
    if (tEl) tEl.textContent = `${fmt(tot.k)} kcal`;
    const mEl = rootEl.querySelector(`[data-macros="${id}"]`);
    if (mEl) mEl.textContent = `P ${fmt(tot.p)} g · K ${fmt(tot.c)} g · Y ${fmt(tot.f)} g`;
  } else if (site) {
    m.card.items[Number(site.dataset.i)].site = site.value;
  } else if (meal) {
    m.card.meal = meal.value;
  }
  edits[id] = m.card;
  clearTimeout(pendingSaves[id]);
  pendingSaves[id] = setTimeout(async () => {
    const cur = await db.get('chat_messages', id);
    if (cur && cur.status === 'pending' && edits[id]) {
      cur.card = edits[id];
      await db.put('chat_messages', cur);
    }
  }, 250);
}

// ---------- Fotoğraf ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => reject(new Error('Fotoğraf açılamadı'));
    img.src = url;
  });
}
function toJpeg(img, maxSide, q) {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function onPhoto(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { img, url } = await loadImage(file);
    const full = toJpeg(img, 1568, 0.85);
    const thumb = toJpeg(img, 360, 0.7);
    URL.revokeObjectURL(url);
    pendingImage = { media_type: 'image/jpeg', data: full.split(',')[1], thumb };
    const box = rootEl.querySelector('#attach');
    box.hidden = false;
    box.innerHTML = `<img src="${thumb}" alt="Eklenecek fotoğraf"><span style="flex:1">Fotoğraf eklendi. İstersen bir not yaz ve gönder.</span>
      <button type="button" class="btn ghost" data-rmimg>Kaldır</button>`;
    box.querySelector('[data-rmimg]').addEventListener('click', () => {
      pendingImage = null;
      box.hidden = true;
      box.innerHTML = '';
    });
    rootEl.querySelector('#msg').focus();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- Gönder ----------
async function send(raw) {
  const text = (raw || '').trim();
  if (busy || (!text && !pendingImage)) return;
  stopSpeaking();
  const image = pendingImage;
  pendingImage = null;
  const ta = rootEl.querySelector('#msg');
  ta.value = '';
  ta.style.height = 'auto';
  const box = rootEl.querySelector('#attach');
  box.hidden = true;
  box.innerHTML = '';

  await db.put('chat_messages', { role: 'user', text, image: image ? image.thumb : null });
  busy = true;
  await drawMessages();
  try {
    const res = await runTurn({ text, image: image ? { media_type: image.media_type, data: image.data } : null, onText: showLive });
    for (const card of res.cards) {
      if (card.type === 'doses') {
        const sg = await suggestSite();
        for (const it of card.items) if (it.kind === 'inj' && !it.site) it.site = sg.site;
      }
      await db.put('chat_messages', { role: 'card', card, status: card.autoSaved ? 'saved' : 'pending' });
    }
    if (res.text) {
      await db.put('chat_messages', { role: 'assistant', text: res.text, model: res.model.label });
      if (voiceReply) speak(res.text);
    }
    else if (!res.cards.length) await db.put('chat_messages', { role: 'assistant', text: 'Bir cevap oluşturamadım, yeniden dener misin?', model: res.model.label });
  } catch (err) {
    console.error(err);
    await db.put('chat_messages', { role: 'error', text: err instanceof AIError ? err.message : 'Beklenmeyen bir hata oluştu: ' + err.message });
  } finally {
    busy = false;
  }
  if (rootEl && document.body.contains(rootEl.querySelector('#chat'))) await drawMessages();
}
