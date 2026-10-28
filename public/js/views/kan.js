import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, trDate, trDateYear, icon, openSheet, confirmSheet, lineChartSVG, parseDate, MONTHS_SHORT, daysBetween } from '../util.js';
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
  const comps = await db.list('compounds', (c) => c.active !== false);

  if (!tests.length) {
    root.innerHTML = `
      <header class="hdr"><div class="hdr-text"><span class="eyebrow">Tahlil takibi</span><h1 class="title">Kan testleri</h1></div>
        <div class="hdr-actions"><button type="button" class="icon-btn" aria-label="Test ekle" data-act="add">${icon.plus}</button></div></header>
      <section class="card" style="text-align:center;padding:24px 16px">
        <p style="margin:0 0 6px;font-size:17px;font-weight:600">Henüz test eklemedin</p>
        <p class="small muted" style="margin:0 0 16px;line-height:18px">Sonuçlarını elle girebilir ya da Danışman'a tahlil raporunun fotoğrafını gönderebilirsin; değerleri okuyup buraya kaydeder.</p>
        <div class="btn-row"><button type="button" class="btn" data-act="add">Elle ekle</button><button type="button" class="btn primary" data-act="photo">Fotoğrafla ekle</button></div>
      </section>`;
    root.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'add') openTest(null);
      else go('danisman?photo=1');
    };
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
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <span style="font-size:17px;font-weight:600">${esc(trDateYear(date))}${cur.test.lab_name ? ' · ' + esc(cur.test.lab_name) : ''}</span>
        <span class="small muted" style="white-space:nowrap">${cycWeek && cycWeek > 0 ? `Kür haftası ${cycWeek}` : ''}</span>
      </div>
      <div class="stat3">
        <div><b class="${groups.attention.length ? 'warn' : ''}">${groups.attention.length}</b><span>dikkat</span></div>
        <div><b>${groups.expected.length}</b><span>beklenen</span></div>
        <div><b>${groups.normal.length}</b><span>normal</span></div>
      </div>
      <div class="btn-row">
        <button type="button" class="btn" data-act="edit">Düzenle</button>
        <button type="button" class="btn primary" data-act="ask">Danışmana yorumlat</button>
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
    <p class="note">Gruplama uygulamanın kurallarına göre otomatik yapılır ve tıbbi değerlendirme yerine geçmez. Detaylı yorum için "Danışmana yorumlat"ı kullan; müdahale gerektiren değerleri doktorunla paylaş. Bir değere dokunursan geçmiş testlerdeki gidişatını görürsün.</p>
  `;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openTest(null);
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
  };
}

// ---------- Test ekle / düzenle ----------
function openTest(existing) {
  const st = {
    date: existing?.test.date || today(),
    lab: existing?.test.lab_name || '',
    rows: (existing?.values || []).map((v) => ({ id: v.id, marker_key: v.marker_key, name: v.name, value: v.value, unit: v.unit, ref_low: v.ref_low, ref_high: v.ref_high })),
  };
  const removed = [];
  const s = openSheet({
    title: existing ? 'Testi düzenle' : 'Test ekle',
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
      <div class="grid2">
        <div class="field"><label for="t-date">Tarih</label><input id="t-date" class="input" type="date" value="${esc(st.date)}"></div>
        <div class="field"><label for="t-lab">Laboratuvar</label><input id="t-lab" class="input" value="${esc(st.lab)}" placeholder="İsteğe bağlı"></div>
      </div>
      ${st.rows
        .map(
          (r, i) => `<div class="card" data-vrow="${i}" style="padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:16px;font-weight:600">${esc(r.name)}</span>
              <button type="button" class="icon-btn" style="background:transparent;color:var(--warn);width:36px;height:36px" aria-label="${esc(r.name)} sil" data-rm="${i}">${icon.trash}</button>
            </div>
            <div class="grid2">
              <div class="field" style="margin-bottom:8px"><label for="v-${i}">Değer</label><input id="v-${i}" class="input" inputmode="decimal" data-f="value" value="${esc(show(r.value))}"></div>
              <div class="field" style="margin-bottom:8px"><label for="u-${i}">Birim</label><input id="u-${i}" class="input" data-f="unit" value="${esc(r.unit || '')}"></div>
              <div class="field" style="margin-bottom:0"><label for="lo-${i}">Ref. alt</label><input id="lo-${i}" class="input" inputmode="decimal" data-f="lo" value="${esc(show(r.ref_low))}"></div>
              <div class="field" style="margin-bottom:0"><label for="hi-${i}">Ref. üst</label><input id="hi-${i}" class="input" inputmode="decimal" data-f="hi" value="${esc(show(r.ref_high))}"></div>
            </div>
          </div>`
        )
        .join('')}
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
