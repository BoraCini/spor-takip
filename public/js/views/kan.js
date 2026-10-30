import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, trDate, trDateYear, icon, openSheet, confirmSheet, lineChartSVG, parseDate, MONTHS_SHORT, daysBetween, addDays, swipeDelete, timeStr } from '../util.js';
import { bpCategory, cycleInfo } from '../context.js';
import { removeWithUndo } from '../undo.js';
import { syncSoon } from '../push.js';
import { refresh, go } from '../app.js';
import { labTests } from '../context.js';
import { LABS, LAB_CATEGORIES, labByKey, classify, status } from '../data/labs.js';

const state = { testId: null, expanded: {}, showNormal: false };

function rangeBar(v) {
  const lo = v.ref_low;
  const hi = v.ref_high;
  const val = v.value;
  let min;
  let max;
  if (lo != null && hi != null) {
    const span = hi - lo || Math.abs(hi) || 1;
    min = Math.min(lo - span * 0.5, val);
    max = Math.max(hi + span * 0.5, val);
    if (lo === 0) min = 0;
  } else if (hi != null) {
    min = 0;
    max = Math.max(hi * 1.5, val * 1.1);
  } else if (lo != null) {
    min = 0;
    max = Math.max(lo * 2, val * 1.2);
  } else return '';
  const P = (x) => Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100));
  const nz0 = lo != null ? P(lo) : 0;
  const nz1 = hi != null ? P(hi) : 100;
  const out = status(val, lo, hi) !== 'ok';
  return `<div class="range" aria-hidden="true"><span class="tr"></span><span class="nz" style="left:${nz0}%;width:${Math.max(1, nz1 - nz0)}%"></span><span class="mk ${out ? 'out' : ''}" style="left:${P(val)}%"></span></div>`;
}

const refTxt = (v) => (v.ref_low != null && v.ref_high != null ? `${fmt(v.ref_low, 2)}–${fmt(v.ref_high, 2)}` : v.ref_high != null ? `< ${fmt(v.ref_high, 2)}` : v.ref_low != null ? `> ${fmt(v.ref_low, 2)}` : 'referans yok');

export async function render(root) {
  const tests = await labTests();
  const cycles = await db.list('cycles');
  const comps = await db.list('compounds', (c) => c.active !== false && c.category !== 'destek');

  if (!tests.length) {
    root.innerHTML = `
      <header class="hdr"><div class="hdr-text"><span class="eyebrow">Tahlil takibi</span><h1 class="title">Kan testleri</h1></div>
        <div class="hdr-actions"><button type="button" class="icon-btn" aria-label="Test ekle" data-act="add">${icon.plus}</button></div></header>
      <section class="card" style="text-align:center;padding:24px 16px">
        <p style="margin:0 0 6px;font-size:17px;font-weight:600">Henüz test eklemedin</p>
        <p class="small muted" style="margin:0 0 16px;line-height:18px">Laboratuvarın ya da e-Nabız'ın verdiği PDF'i seç; değerler, birimler ve referans aralıkları telefonda okunur, internete ya da yapay zekâya gönderilmez. Yorum istediğinde "Coach'a yorumlat"ı kullanırsın.</p>
        <label class="btn primary block" style="cursor:pointer;margin-bottom:8px">PDF'ten ekle<input type="file" accept="application/pdf,.pdf" class="sr-only" data-file="pdf"></label>
        <div class="btn-row">
          <label class="btn" style="cursor:pointer">Fotoğraftan (YZ)<input type="file" accept="image/*" class="sr-only" data-file="img"></label>
          <button type="button" class="btn" data-act="manual">Elle ekle</button>
        </div>
      </section>
      ${await healthExtras()}`;
    root.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'manual') openTest(null);
      else if (b.dataset.act === 'add') openAddChooser();
      else extrasClick(b);
    };
    bindFileInputs(root);
    bindExtras(root);
    return;
  }

  if (!state.testId || !tests.find((x) => x.test.id === state.testId)) state.testId = tests[0].test.id;
  const cur = tests.find((x) => x.test.id === state.testId);
  const date = cur.test.date;
  const cyc = cycles.filter((c) => c.start_date && c.start_date <= date).pop();
  const cycWeek = cyc ? Math.floor(daysBetween(cyc.start_date, date) / 7) + 1 : null;
  const onCycle = !!(cyc && (!cyc.weeks || cycWeek <= cyc.weeks + 4)) || (comps.length > 0 && daysBetween(date, today()) <= 60);

  // trend için: marker → [{date, value}]
  const history = {};
  for (const t of tests) for (const v of t.values) {
    const k = v.marker_key || v.name;
    (history[k] = history[k] || []).push({ date: t.test.date, value: v.value });
  }

  const groups = { attention: [], expected: [], normal: [] };
  for (const v of cur.values) {
    const c = classify(v, { onCycle });
    groups[c.group].push({ v, c });
  }
  const sortCat = (a, b) => LAB_CATEGORIES.indexOf((labByKey(a.v.marker_key) || {}).cat || 'Diğer') - LAB_CATEGORIES.indexOf((labByKey(b.v.marker_key) || {}).cat || 'Diğer');
  Object.values(groups).forEach((g) => g.sort(sortCat));

  const valueRow = ({ v, c }, group) => {
    const meta = labByKey(v.marker_key);
    const key = v.marker_key || v.name;
    const hist = (history[key] || []).sort((a, b) => a.date.localeCompare(b.date));
    const exp = !!state.expanded[v.id];
    const flag =
      c.st === 'ok'
        ? '<span class="lab-flag ok">Normal</span>'
        : group === 'expected'
        ? `<span class="lab-flag exp">${c.st === 'high' ? '↑ Yüksek' : '↓ Düşük'} · ${c.reason === 'kür' ? 'kürle beklenen' : 'antrenmanla beklenen'}</span>`
        : `<span class="lab-flag">${c.st === 'high' ? '↑ Yüksek' : '↓ Düşük'}</span>`;
    const prevVal = hist.filter((h) => h.date < date).pop();
    return `<button type="button" class="lab-row" data-act="toggle" data-id="${v.id}" aria-expanded="${exp}">
      <div class="lab-top"><span class="lab-name">${esc(v.name)}</span><span class="lab-val">${fmt(v.value, 2)} <small>${esc(v.unit || '')}</small></span></div>
      <div class="lab-mid">${flag}<span class="muted">Referans ${esc(refTxt(v))}</span></div>
      ${rangeBar(v)}
      ${prevVal ? `<span class="lab-note">Önceki (${esc(trDate(prevVal.date))}): ${fmt(prevVal.value, 2)} ${esc(v.unit || '')}</span>` : ''}
      ${exp && hist.length >= 2 ? lineChartSVG(hist.map((h) => { const d = parseDate(h.date); return { label: `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, value: h.value }; }), { band: [v.ref_low, v.ref_high], color: c.st === 'ok' ? 'var(--accent)' : 'var(--warn)', unit: v.unit }) : ''}
      ${(exp || group !== 'normal') && meta?.note && c.st !== 'ok' ? `<span class="lab-note">${esc(meta.note)}</span>` : ''}
    </button>`;
  };

  root.innerHTML = `
    <header class="hdr">
      <div class="hdr-text"><span class="eyebrow">${tests.length} test kayıtlı</span><h1 class="title">Kan testleri</h1></div>
      <div class="hdr-actions"><button type="button" class="icon-btn" aria-label="Test ekle" data-act="add">${icon.plus}</button></div>
    </header>

    ${
      tests.length > 1
        ? `<div style="padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch" role="tablist" aria-label="Testler">
        ${tests.map((t) => `<button type="button" class="tog" role="tab" aria-pressed="${t.test.id === state.testId}" aria-selected="${t.test.id === state.testId}" data-act="pick" data-id="${t.test.id}" style="flex:none">${esc(trDate(t.test.date))} ${parseDate(t.test.date).getFullYear()}</button>`).join('')}
      </div>`
        : ''
    }

    <section class="card" aria-label="Seçili test" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span style="font-size:17px;font-weight:600">${esc(trDateYear(date))}</span>
          ${cur.test.lab_name ? `<span class="small muted">${esc(cur.test.lab_name)}</span>` : ''}
        </div>
        ${cycWeek && cycWeek > 0 ? `<span class="pill" style="height:28px;font-size:13px;display:inline-flex;align-items:center;color:var(--sub)">Kür haftası ${cycWeek}</span>` : ''}
      </div>
      <div class="stat3">
        <div><b class="${groups.attention.length ? 'warn' : ''}">${groups.attention.length}</b><span>dikkat</span></div>
        <div><b>${groups.expected.length}</b><span>beklenen</span></div>
        <div><b>${groups.normal.length}</b><span>normal</span></div>
      </div>
      <div class="btn-row">
        <button type="button" class="btn" data-act="edit">Düzenle</button>
        <button type="button" class="btn primary" data-act="ask">Yorumlat</button>
      </div>
    </section>

    ${groups.attention.length ? `<div class="sec"><h2>Dikkat edilecekler</h2></div><section class="card flush">${groups.attention.map((x) => valueRow(x, 'attention')).join('')}</section>` : ''}
    ${groups.expected.length ? `<div class="sec"><h2>Kürle / antrenmanla beklenen</h2></div><section class="card flush">${groups.expected.map((x) => valueRow(x, 'expected')).join('')}</section>` : ''}
    ${
      groups.normal.length
        ? `<div class="sec"><h2>Normal aralıkta</h2><button type="button" class="link" data-act="normal">${state.showNormal ? 'Gizle' : `${groups.normal.length} değeri göster`}</button></div>
           ${state.showNormal ? `<section class="card flush">${groups.normal.map((x) => valueRow(x, 'normal')).join('')}</section>` : ''}`
        : ''
    }
    ${await healthExtras()}
    <p class="note">Gruplama uygulamanın kurallarına göre otomatik yapılır ve tıbbi değerlendirme yerine geçmez. Detaylı yorum için "Yorumlat"ı kullan; müdahale gerektiren değerleri doktorunla paylaş. Bir değere dokunursan geçmiş testlerdeki gidişatını görürsün.</p>
  `;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openAddChooser();
    else if (act === 'pick') {
      state.testId = b.dataset.id;
      refresh();
    } else if (act === 'toggle') {
      state.expanded[b.dataset.id] = !state.expanded[b.dataset.id];
      refresh();
    } else if (act === 'normal') {
      state.showNormal = !state.showNormal;
      refresh();
    } else if (act === 'edit') openTest(cur);
    else if (act === 'ask') go(`danisman?ask=lab&test=${encodeURIComponent(cur.test.id)}`);
    else extrasClick(b);
  };
  bindExtras(root);
}

// ---------- Sonraki tahlil + tansiyon/nabız ----------
async function healthExtras() {
  const t = today();
  const next = await db.getSetting('next_lab_date');
  const vit = (await db.list('vitals')).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const last = vit[vit.length - 1];
  const cat = last ? bpCategory(last.sys, last.dia) : null;
  const bpPts = vit.filter((v) => v.sys && v.dia).slice(-14);
  const hrPts = vit.filter((v) => v.hr).slice(-14);
  const lbl = (d) => {
    const x = parseDate(d);
    return `${x.getDate()} ${MONTHS_SHORT[x.getMonth()]}`;
  };
  const days = next ? daysBetween(t, next) : null;
  return `
    <div class="sec"><h2>Sonraki tahlil</h2><button type="button" class="link" data-act="next-lab">${next ? 'Değiştir' : 'Tarih belirle'}</button></div>
    <section class="card next-lab">
      ${
        next
          ? `<div><b>${esc(trDateYear(next))}</b><span class="small ${days < 0 ? 'warn' : 'muted'}">${days > 0 ? `${days} gün sonra` : days === 0 ? 'Bugün' : `${-days} gün geçti — sonucu eklediysen yeni tarih belirle`}</span></div>
             <span class="small muted">Bildirimler açıksa o sabah hatırlatırım.</span>`
          : '<span class="small muted" style="line-height:18px">Kür boyunca düzenli tahlil (ör. başlangıç, 6. hafta ve bitiş sonrası) değişimleri erken görmeni sağlar. Bir tarih belirlersen hatırlatırım.</span>'
      }
    </section>

    <div class="sec"><h2>Tansiyon ve nabız</h2><button type="button" class="link" data-act="vital-add">+ Ölçüm ekle</button></div>
    <section class="card" id="vitals">
      ${
        last
          ? `<div class="vit-top">
              <div><span class="small muted">Son ölçüm · ${esc(trDate(last.date))}${last.time ? ' ' + esc(last.time) : ''}</span>
                <b class="num">${last.sys && last.dia ? `${last.sys}/${last.dia} <small>mmHg</small>` : '–'}</b>${last.hr ? `<span class="num">Nabız ${last.hr} <small>atım/dk</small></span>` : ''}</div>
              ${cat ? `<span class="vit-cat ${cat.warn ? 'warn' : ''}">${esc(cat.label)}</span>` : ''}
            </div>
            ${cat && cat.k === 'kriz' ? '<p class="vit-alert">Bu değer çok yüksek. Baş ağrısı, göğüs ağrısı, nefes darlığı, görme bozukluğu gibi belirtiler varsa hemen 112\'yi ara; yoksa birkaç dakika dinlenip yeniden ölç ve doktoruna danış.</p>' : ''}
            ${bpPts.length >= 2 ? `<span class="small muted">Büyük tansiyon (sistolik)</span>${lineChartSVG(bpPts.map((v) => ({ label: lbl(v.date), value: v.sys })), { band: [90, 130], unit: 'mmHg' })}` : ''}
            ${hrPts.length >= 2 ? `<span class="small muted">Nabız</span>${lineChartSVG(hrPts.map((v) => ({ label: lbl(v.date), value: v.hr })), { band: [50, 90], unit: 'atım/dk' })}` : ''}
            <div class="vit-list">${vit
              .slice(-8)
              .reverse()
              .map(
                (v) => `<div class="row vit-row" data-vid="${v.id}"><span class="row-main"><span class="row-title normal num">${v.sys && v.dia ? `${v.sys}/${v.dia}` : '–'}${v.hr ? ` · ${v.hr} atım` : ''}</span>
                  <span class="row-sub">${esc(trDate(v.date))}${v.time ? ' ' + esc(v.time) : ''}${v.note ? ' · ' + esc(v.note) : ''}</span></span>
                  <span class="small ${bpCategory(v.sys, v.dia)?.warn ? 'warn' : 'muted'}">${esc(bpCategory(v.sys, v.dia)?.label || '')}</span></div>`
              )
              .join('')}</div>`
          : '<span class="small muted" style="line-height:18px">Kür ve yoğun antrenman tansiyonu ve nabzı yükseltebilir. Haftada birkaç kez, sabah oturarak 5 dakika dinlendikten sonra ölçüp kaydetmen değişimi görmeni sağlar.</span>'
      }
    </section>
    ${last ? '<p class="note">Sınıflama ACC/AHA 2017 kılavuzuna göredir, bilgi amaçlıdır. Silmek için ölçümü sola kaydır.</p>' : ''}`;
}

function bindExtras(root) {
  const v = root.querySelector('.vit-list');
  if (v) swipeDelete(v, '.vit-row', (row) => removeWithUndo('vitals', row.dataset.vid, 'Ölçüm silindi'));
}

function extrasClick(b) {
  const act = b.dataset.act;
  if (act === 'vital-add') openVital();
  else if (act === 'next-lab') openNextLab();
}

function openVital() {
  const now = new Date();
  const s = openSheet({
    title: 'Tansiyon / nabız',
    size: 'auto',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <section class="card">
        <div class="grid3">
          <div class="field"><label for="v-sys">Büyük</label><input id="v-sys" class="input" inputmode="numeric" placeholder="120"></div>
          <div class="field"><label for="v-dia">Küçük</label><input id="v-dia" class="input" inputmode="numeric" placeholder="80"></div>
          <div class="field"><label for="v-hr">Nabız</label><input id="v-hr" class="input" inputmode="numeric" placeholder="65"></div>
        </div>
        <div class="grid2">
          <div class="field" style="margin-bottom:0"><label for="v-date">Tarih</label><input id="v-date" class="input" type="date" value="${today()}"></div>
          <div class="field" style="margin-bottom:0"><label for="v-time">Saat</label><input id="v-time" class="input" type="time" value="${timeStr(now.toISOString())}"></div>
        </div>
      </section>
      <div class="field"><label for="v-note">Not (isteğe bağlı)</label><input id="v-note" class="input" placeholder="Örn. antrenman sonrası, kahveden sonra"></div>
      <p class="small muted" style="margin:0 4px;line-height:18px">Büyük ve küçük tansiyonu mmHg olarak gir (ör. 12/8 yerine 120/80). Sadece nabız da kaydedebilirsin.</p>`,
    onRight: async (api) => {
      const n = (id) => {
        const x = parseNum(s.el.querySelector(id).value);
        return isNaN(x) ? null : Math.round(x);
      };
      let sys = n('#v-sys');
      let dia = n('#v-dia');
      const hr = n('#v-hr');
      // 12/8 gibi cmHg yazıldıysa çevir
      if (sys && sys < 30) sys *= 10;
      if (dia && dia < 20) dia *= 10;
      if (!sys && !dia && !hr) return toast('Tansiyon ya da nabız gir');
      if ((sys && !dia) || (!sys && dia)) return toast('Büyük ve küçük tansiyonu birlikte gir');
      if (sys && (sys < 70 || sys > 260 || dia < 40 || dia > 160 || dia >= sys)) return toast('Tansiyon değerlerini kontrol et');
      if (hr && (hr < 30 || hr > 220)) return toast('Nabız değerini kontrol et');
      await db.put('vitals', { date: s.el.querySelector('#v-date').value || today(), time: s.el.querySelector('#v-time').value || null, sys, dia, hr, note: s.el.querySelector('#v-note').value.trim() || null });
      api.close();
      const c = bpCategory(sys, dia);
      toast(c ? `Kaydedildi · ${c.label}` : 'Kaydedildi');
      refresh();
    },
  });
  setTimeout(() => s.el.querySelector('#v-sys')?.focus(), 250);
}

async function openNextLab() {
  const cur = await db.getSetting('next_lab_date');
  const ci = await cycleInfo();
  const opts = [
    ['4 hafta sonra', addDays(today(), 28)],
    ['6 hafta sonra', addDays(today(), 42)],
    ['8 hafta sonra', addDays(today(), 56)],
  ];
  if (ci.cycle && ci.cycle.start_date) {
    const w6 = addDays(ci.cycle.start_date, 35);
    if (w6 > today()) opts.push(['Kürün 6. haftası', w6]);
    if (ci.end) opts.push(['Kür bitiminden 4 hafta sonra', addDays(ci.end, 28)]);
  }
  const s = openSheet({
    title: 'Sonraki tahlil',
    size: 'auto',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <div class="toggle-row" style="margin-bottom:12px">${opts.map(([l, d]) => `<button type="button" class="tog sm" data-d="${d}">${esc(l)}</button>`).join('')}</div>
      <div class="field"><label for="nl-date">Tarih</label><input id="nl-date" class="input" type="date" value="${esc(cur || '')}"></div>
      ${cur ? '<button type="button" class="btn danger block" data-clear style="background:var(--card)">Tarihi kaldır</button>' : ''}`,
    onRight: async (api) => {
      const v = s.el.querySelector('#nl-date').value;
      if (!v) return toast('Tarih seç');
      await db.setSetting('next_lab_date', v);
      syncSoon();
      api.close();
      toast('Tahlil tarihi kaydedildi');
      refresh();
    },
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d],[data-clear]');
    if (!b) return;
    if (b.dataset.d) s.el.querySelector('#nl-date').value = b.dataset.d;
    else {
      await db.setSetting('next_lab_date', null);
      syncSoon();
      s.close();
      refresh();
    }
  });
}

// ---------- PDF / fotoğraftan ekle ----------
function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Dosya okunamadı'));
    r.readAsDataURL(file);
  });
}

async function importReport(file, kind) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return toast('Dosya çok büyük (en fazla 25 MB)', 4000);
  if (kind === 'pdf') {
    // Yapay zekâ yok: PDF'teki metin telefonda okunur
    toast('PDF okunuyor…', 2000);
    try {
      const { readLabPdf } = await import('../labpdf.js');
      const res = await readLabPdf(file);
      if (!res.values.length) {
        openTest(null, { test: { date: res.date || today(), lab_name: res.lab_name }, values: [], note: 'PDF açıldı ama içinde tahlil satırı bulunamadı (rapor düzeni tanınmadı). Değerleri "+ Değer ekle" ile elle girebilirsin.' });
        return;
      }
      openTest(null, {
        test: { date: res.date || today(), lab_name: res.lab_name },
        values: res.values,
        note: `PDF'ten ${res.values.length} değer okundu${res.date ? '' : '; tarih bulunamadı, kontrol et'}. Raporla karşılaştırıp kaydet; eksik değer varsa "+ Değer ekle" ile ekle.`,
      });
    } catch (e) {
      toast(e && e.code === 'NO_TEXT' ? e.message : `PDF okunamadı: ${(e && (e.message || e.name)) || 'bilinmeyen hata'}`, 7000);
      if (!e || e.code !== 'NO_TEXT') console.error(e);
    }
    return;
  }
  const wait = openSheet({
    title: 'Rapor okunuyor',
    size: 'auto',
    body: `<div class="empty" style="padding:30px 0"><div class="typing" style="margin:0 auto 12px;align-self:center;display:inline-flex"><i></i><i></i><i></i></div><br>Değerler ${kind === 'pdf' ? "PDF'ten" : 'fotoğraftan'} okunuyor…<br><span class="small">Uzun raporlarda 20–40 saniye sürebilir.</span></div>`,
  });
  try {
    let data;
    let media_type;
    if (kind === 'pdf') {
      data = await readFile(file);
      media_type = 'application/pdf';
    } else {
      const { fileToImage } = await import('../barcode.js');
      const img = await fileToImage(file);
      data = img.data;
      media_type = img.media_type;
    }
    const { extractLabs } = await import('../ai.js');
    const res = await extractLabs({ data, media_type });
    wait.close();
    openTest(null, { test: { date: res.date || today(), lab_name: res.lab_name }, values: res.values, note: `${kind === 'pdf' ? "PDF'ten" : 'Fotoğraftan'} ${res.values.length} değer okundu${res.date ? '' : '; tarih okunamadı, kontrol et'}. Raporla karşılaştırıp kaydet.` });
  } catch (e) {
    wait.close();
    toast(e.message || 'Rapor okunamadı', 5000);
  }
}

function bindFileInputs(el) {
  el.querySelectorAll('input[data-file]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.value = '';
      if (f) importReport(f, inp.dataset.file);
    })
  );
}

function openAddChooser() {
  const s = openSheet({
    title: 'Test ekle',
    size: 'auto',
    body: `
      <div class="card flush">
        <label class="row" style="cursor:pointer"><span class="row-main"><span class="row-title">PDF'ten ekle</span>
          <span class="row-sub">Laboratuvar veya e-Nabız raporu. Telefonda okunur; yapay zekâ kullanılmaz, ücretsiz.</span></span>${icon.chev}
          <input type="file" accept="application/pdf,.pdf" class="sr-only" data-file="pdf"></label>
        <label class="row" style="cursor:pointer"><span class="row-main"><span class="row-title">Fotoğraftan ekle (yapay zekâ ile)</span>
          <span class="row-sub">Kâğıt rapor ya da taranmış PDF için. Fotoğraf yapay zekâya gönderilir.</span></span>${icon.chev}
          <input type="file" accept="image/*" class="sr-only" data-file="img"></label>
        <button type="button" class="row" data-manual><span class="row-main"><span class="row-title">Elle ekle</span></span>${icon.chev}</button>
      </div>
      <p class="small muted" style="margin:10px 4px 0;line-height:18px">Okunan değerleri kaydetmeden önce görüp düzeltebilirsin. Yapay zekâ yalnızca fotoğraftan okurken ve "Coach'a yorumlat" dediğinde devreye girer.</p>`,
  });
  s.el.querySelectorAll('input[data-file]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      s.close();
      if (f) importReport(f, inp.dataset.file);
    })
  );
  s.el.querySelector('[data-manual]').addEventListener('click', () => {
    s.close();
    openTest(null);
  });
}

// ---------- Test ekle / düzenle ----------
function openTest(existing, prefill = null) {
  const src = existing || prefill;
  const st = {
    date: src?.test.date || today(),
    lab: src?.test.lab_name || '',
    rows: (src?.values || []).map((v) => ({ id: v.id, marker_key: v.marker_key, name: v.name, value: v.value, unit: v.unit, ref_low: v.ref_low, ref_high: v.ref_high })),
  };
  const removed = [];
  const s = openSheet({
    title: existing ? 'Testi düzenle' : prefill ? 'Okunan değerler' : 'Test ekle',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onRight: async (api) => {
      sync();
      const rows = st.rows.filter((r) => r.name && !isNaN(r.value));
      if (!rows.length) return toast('En az bir değer gir');
      const test = await db.put('lab_tests', { ...(existing?.test || {}), date: st.date, lab_name: st.lab.trim() });
      for (const id of removed) await db.remove('lab_values', id);
      for (const r of rows) {
        await db.put('lab_values', { ...(r.id ? { id: r.id } : {}), test_id: test.id, marker_key: r.marker_key || null, name: r.name, value: r.value, unit: r.unit || '', ref_low: r.ref_low ?? null, ref_high: r.ref_high ?? null });
      }
      state.testId = test.id;
      api.close();
      toast('Test kaydedildi');
      refresh();
    },
  });
  const num = (v) => {
    const n = parseNum(v);
    return isNaN(n) ? null : n;
  };
  const sync = () => {
    const g = (sel) => s.el.querySelector(sel);
    if (g('#t-date')) st.date = g('#t-date').value || st.date;
    if (g('#t-lab')) st.lab = g('#t-lab').value;
    s.el.querySelectorAll('[data-vrow]').forEach((el) => {
      const r = st.rows[Number(el.dataset.vrow)];
      const v = num(el.querySelector('[data-f="value"]').value);
      r.value = v == null ? NaN : v;
      r.unit = el.querySelector('[data-f="unit"]').value.trim();
      r.ref_low = num(el.querySelector('[data-f="lo"]').value);
      r.ref_high = num(el.querySelector('[data-f="hi"]').value);
    });
  };
  const show = (n) => (n == null || isNaN(n) ? '' : String(n).replace('.', ','));
  const draw = () => {
    s.setBody(`
      ${prefill && prefill.note ? `<p class="small muted" style="margin:0 4px 12px;line-height:18px">${esc(prefill.note)}</p>` : ''}
      <div class="grid2">
        <div class="field"><label for="t-date">Tarih</label><input id="t-date" class="input" type="date" value="${esc(st.date)}"></div>
        <div class="field"><label for="t-lab">Laboratuvar</label><input id="t-lab" class="input" value="${esc(st.lab)}" placeholder="İsteğe bağlı"></div>
      </div>
      ${st.rows.length ? `<div class="lab-ed-hd" aria-hidden="true"><span>Değer</span><span>Birim</span><span>Ref. alt</span><span>Ref. üst</span></div>` : ''}
      <div class="card flush" style="padding:0 12px">
      ${st.rows
        .map(
          (r, i) => `<div class="lab-ed" data-vrow="${i}">
            <div class="lab-ed-top">
              <span class="lab-ed-name">${esc(r.name)}</span>
              <button type="button" class="icon-btn" style="background:transparent;color:var(--warn);width:32px;height:32px" aria-label="${esc(r.name)} sil" data-rm="${i}">${icon.trash}</button>
            </div>
            <div class="lab-ed-grid">
              <input class="input" inputmode="decimal" data-f="value" value="${esc(show(r.value))}" aria-label="${esc(r.name)} değer" id="v-${i}">
              <input class="input" data-f="unit" value="${esc(r.unit || '')}" aria-label="${esc(r.name)} birim">
              <input class="input" inputmode="decimal" data-f="lo" value="${esc(show(r.ref_low))}" aria-label="${esc(r.name)} referans alt" placeholder="–">
              <input class="input" inputmode="decimal" data-f="hi" value="${esc(show(r.ref_high))}" aria-label="${esc(r.name)} referans üst" placeholder="–">
            </div>
          </div>`
        )
        .join('')}
      </div>
      <button type="button" class="btn primary block" data-addv>+ Değer ekle</button>
      <p class="small muted" style="margin:10px 4px 0;line-height:18px">Referans aralıkları otomatik dolar; raporundaki aralık farklıysa onu yaz, çünkü laboratuvarlar farklı aralık kullanır.</p>
      ${existing ? '<button type="button" class="btn danger block" data-del style="margin-top:14px;background:var(--card)">Testi sil</button>' : ''}`);
  };
  draw();
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rm) {
      sync();
      const [r] = st.rows.splice(Number(b.dataset.rm), 1);
      if (r.id) removed.push(r.id);
      draw();
    } else if (b.hasAttribute('data-addv')) {
      sync();
      const used = new Set(st.rows.map((r) => r.marker_key).filter(Boolean));
      const pick = await pickMarker(used);
      if (!pick) return;
      st.rows.push(pick.custom ? { name: pick.name, value: NaN, unit: '', ref_low: null, ref_high: null } : { marker_key: pick.key, name: pick.name, value: NaN, unit: pick.unit, ref_low: pick.lo, ref_high: pick.hi });
      draw();
      const last = s.el.querySelector(`#v-${st.rows.length - 1}`);
      if (last) last.focus();
    } else if (b.hasAttribute('data-del')) {
      if (!(await confirmSheet({ title: 'Testi sil', text: 'Bu test ve tüm değerleri silinsin mi?', okLabel: 'Sil', danger: true }))) return;
      for (const v of existing.values) await db.remove('lab_values', v.id);
      await db.remove('lab_tests', existing.test.id);
      state.testId = null;
      s.close();
      refresh();
    }
  });
}

function pickMarker(used) {
  return new Promise((resolve) => {
    let result = null;
    const s = openSheet({
      title: 'Değer seç',
      leftLabel: 'Vazgeç',
      body: `<label class="sr-only" for="mq">Ara</label><input id="mq" class="input" type="search" placeholder="Ara: hematokrit, LDL, testosteron…" style="margin-bottom:10px" autocomplete="off"><div id="mres"></div>`,
      onClose: () => resolve(result),
    });
    const q = s.el.querySelector('#mq');
    const res = s.el.querySelector('#mres');
    const draw = () => {
      const v = q.value.trim().toLocaleLowerCase('tr-TR');
      const hits = LABS.filter((l) => !used.has(l.key) && (!v || (l.name + ' ' + l.alias).toLocaleLowerCase('tr-TR').includes(v)));
      let html = v ? `<div class="card flush"><button type="button" class="row" data-custom="${esc(q.value.trim())}"><span class="row-main"><span class="row-title" style="color:var(--accent)">+ "${esc(q.value.trim())}" olarak ekle</span></span></button></div>` : '';
      for (const cat of LAB_CATEGORIES) {
        const items = hits.filter((h) => h.cat === cat);
        if (!items.length) continue;
        html += `<div class="sec" style="padding-top:10px"><h2>${esc(cat)}</h2></div><div class="card flush">${items
          .map((l) => `<button type="button" class="row" data-key="${l.key}"><span class="row-main"><span class="row-title normal">${esc(l.name)}</span><span class="row-sub">${esc(l.unit)} · ref ${esc(refTxt({ ref_low: l.lo, ref_high: l.hi }))}</span></span></button>`)
          .join('')}</div>`;
      }
      res.innerHTML = html || '<div class="empty">Bulunamadı</div>';
    };
    draw();
    q.addEventListener('input', draw);
    res.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key],[data-custom]');
      if (!b) return;
      result = b.dataset.key ? LABS.find((l) => l.key === b.dataset.key) : { custom: true, name: b.dataset.custom };
      s.close();
    });
  });
}
