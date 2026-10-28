import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, weekStart, weekday, trDate, WD_SHORT, WD_LONG, icon, openSheet, confirmSheet, round1, lineChartSVG, parseDate, MONTHS_SHORT } from '../util.js';
import { refresh } from '../app.js';
import { programDay, previousSession, findOrCreateExercise, weekProgram, isCardio, suggestNext, MUSCLES } from '../context.js';
import { EXERCISE_PRESETS } from '../data/exercises.js';
import * as rest from '../rest.js';
import { renderProgress } from './ilerleme.js';

const state = { tab: 'workout', wd: null, weekOffset: 0, drafts: {}, active: {}, extra: {} };
let wakeLock = null;

const kgTxt = (v) => (v == null || v === '' || isNaN(v) ? '–' : String(round1(v)).replace('.', ','));
const pace = (min, km) => {
  if (!min || !km) return '';
  const p = min / km;
  return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')} /km`;
};

async function requestWake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
const onVis = () => {
  if (document.visibilityState === 'visible' && state.wakeWanted) requestWake();
};
document.addEventListener('visibilitychange', onVis);

export function destroy() {
  state.wakeWanted = false;
  if (wakeLock) wakeLock.release().catch(() => {});
}

export async function render(root, params = {}) {
  if (params.tab === 'progress' || params.tab === 'workout') state.tab = params.tab;
  if (state.tab === 'progress') {
    root.innerHTML = `
      <header class="hdr"><div class="hdr-text"><span class="eyebrow">Gelişimin</span><h1 class="title">İlerleme</h1></div></header>
      <div class="seg" role="tablist" aria-label="Antrenman görünümü">
        <button type="button" role="tab" aria-selected="false" data-tab="workout">Antrenman</button>
        <button type="button" role="tab" aria-selected="true" data-tab="progress">İlerleme</button>
      </div>
      <div id="progress"></div>`;
    root.querySelector('.seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) {
        state.tab = b.dataset.tab;
        refresh();
      }
    });
    root.onclick = null;
    root.oninput = null;
    await renderProgress(root.querySelector('#progress'));
    return;
  }

  const t = today();
  if (state.wd == null) state.wd = weekday(t);
  const ws = addDays(weekStart(t), state.weekOffset * 7);
  const date = addDays(ws, state.wd);
  const week = await weekProgram();
  const hasAnyProgram = week.some((w) => w.day);
  const { day, items } = week[state.wd];
  const logged = await db.list('workout_sets', (s) => s.date === date);
  const exs = await db.list('exercises');

  // Programda olmayan ama bu gün kaydedilmiş egzersizler (örn. Danışman'dan)
  const progIds = new Set(items.map((x) => x.exercise.id));
  const extraIds = [...new Set(logged.map((s) => s.exercise_id))].filter((id) => !progIds.has(id));
  const allItems = [
    ...items,
    ...extraIds.map((id) => ({ pe: { target_sets: 0, target_reps: '' }, exercise: exs.find((e) => e.id === id) || { id, name: 'Egzersiz' }, extra: true })),
  ];

  const cards = [];
  let totalVol = 0;
  let doneSets = 0;
  let cardioMin = 0;
  for (const it of allItems) {
    const ex = it.exercise;
    const cardio = isCardio(ex);
    const mySets = logged.filter((s) => s.exercise_id === ex.id).sort((a, b) => a.set_no - b.set_no);
    const prev = await previousSession(ex.id, date);
    const sug = suggestNext(ex, it.pe, prev);
    const target = Number(it.pe.target_sets) || 0;
    const count = Math.max(target, mySets.reduce((m, s) => Math.max(m, s.set_no), 0)) + (state.extra[ex.id] || 0) || (mySets.length ? mySets.length : 1);
    const rows = [];
    let lastVals = null;
    for (let n = 1; n <= count; n++) {
      const rec = mySets.find((s) => s.set_no === n) || null;
      const p = prev ? prev.sets.find((s) => s.set_no === n) || prev.sets[prev.sets.length - 1] : null;
      const key = `${ex.id}|${date}|${n}`;
      const d = state.drafts[key];
      const done = !!(rec && rec.done);
      let row;
      if (cardio) {
        const targetMin = parseInt(it.pe.target_reps, 10) || null;
        const min = rec ? rec.duration_min : d ? d.min : lastVals ? lastVals.min : p ? p.duration_min : targetMin;
        const km = rec ? rec.distance_km : d ? d.km : lastVals ? lastVals.km : p ? p.distance_km : null;
        if (done) cardioMin += Number(rec.duration_min) || 0;
        lastVals = { min, km };
        row = { n, rec, prevTxt: p ? `${p.duration_min || '–'} dk${p.distance_km ? ' · ' + kgTxt(p.distance_km) : ''}` : '–', min, km, done, key };
      } else {
        const sugKg = sug ? sug.weight_kg : null;
        const sugReps = sug ? sug.reps : null;
        const kg = rec ? rec.weight_kg : d ? d.kg : lastVals ? lastVals.kg : sugKg ?? (p ? p.weight_kg : null);
        const reps = rec ? rec.reps : d ? d.reps : lastVals ? lastVals.reps : sugReps ?? (p ? p.reps : parseInt(it.pe.target_reps, 10) || null);
        const rpe = rec ? rec.rpe ?? null : d ? d.rpe ?? null : null;
        if (done) {
          totalVol += (rec.weight_kg || 0) * (rec.reps || 0);
          doneSets++;
        }
        lastVals = { kg, reps };
        row = { n, rec, prevTxt: p ? `${kgTxt(p.weight_kg)} × ${p.reps}` : '–', kg, reps, rpe, done, key };
      }
      rows.push(row);
    }
    const activeN = state.active[`${ex.id}|${date}`] ?? (rows.find((r) => !r.done) || {}).n;
    cards.push({ it, ex, cardio, rows, activeN, prev, sug, target });
  }

  const isToday = date === t;
  const title = day ? (day.rest ? 'Dinlenme' : day.title || WD_LONG[state.wd]) : hasAnyProgram ? 'Program yok' : 'Antrenman';
  const summary = [doneSets ? `${doneSets} set · ${fmt(totalVol)} kg hacim` : '', cardioMin ? `${fmt(cardioMin)} dk kardiyo` : ''].filter(Boolean).join(' · ');

  const weightRows = (c) =>
    c.rows
      .map((r) => {
        const active = r.n === c.activeN && !r.done;
        return `
      <div class="set-grid set-row ${r.done ? 'done' : ''} ${active ? 'active' : ''}" data-act="pick" data-ex="${c.ex.id}" data-n="${r.n}" role="group" aria-label="Set ${r.n}">
        <span class="n">${r.n}</span>
        <span class="prev">${esc(r.prevTxt)}</span>
        <span class="v">${kgTxt(r.kg)}</span>
        <span class="v">${r.reps ?? '–'}${r.rpe ? `<small class="rpe-tag">@${r.rpe}</small>` : ''}</span>
        <button type="button" class="set-check" aria-pressed="${r.done}" aria-label="Set ${r.n} ${r.done ? 'tamamlandı, geri al' : 'tamamla'}" data-act="done" data-ex="${c.ex.id}" data-n="${r.n}">${icon.check}</button>
      </div>
      ${
        active
          ? `<div class="set-editor">
          <div><div style="display:flex;justify-content:space-between;align-items:center"><label for="kg-${c.ex.id}">Kg</label>
            <button type="button" class="plate-link" data-act="plates" data-ex="${c.ex.id}" data-n="${r.n}">Plaka</button></div>
            <div class="stepper"><button type="button" aria-label="Kiloyu 2,5 azalt" data-act="kg" data-d="-2.5" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="kg-${c.ex.id}" inputmode="decimal" value="${r.kg == null ? '' : kgTxt(r.kg)}" data-in="kg" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="0">
            <button type="button" aria-label="Kiloyu 2,5 artır" data-act="kg" data-d="2.5" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          <div><label for="rp-${c.ex.id}">Tekrar</label>
            <div class="stepper"><button type="button" aria-label="Tekrarı azalt" data-act="reps" data-d="-1" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="rp-${c.ex.id}" inputmode="numeric" value="${r.reps ?? ''}" data-in="reps" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="0">
            <button type="button" aria-label="Tekrarı artır" data-act="reps" data-d="1" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          <div class="rpe-row" role="group" aria-label="RPE (zorluk, isteğe bağlı)">
            <span class="rpe-lbl">RPE</span>
            ${[6, 7, 8, 9, 10]
              .map((v) => `<button type="button" class="tog" aria-pressed="${r.rpe === v}" data-act="rpe" data-v="${v}" data-ex="${c.ex.id}" data-n="${r.n}">${v}</button>`)
              .join('')}
          </div>
        </div>`
          : ''
      }`;
      })
      .join('');

  const cardioRows = (c) =>
    c.rows
      .map((r) => {
        const active = r.n === c.activeN && !r.done;
        return `
      <div class="set-grid set-row ${r.done ? 'done' : ''} ${active ? 'active' : ''}" data-act="pick" data-ex="${c.ex.id}" data-n="${r.n}" role="group" aria-label="Kayıt ${r.n}">
        <span class="n">${r.n}</span>
        <span class="prev">${esc(r.prevTxt)}</span>
        <span class="v">${r.min ?? '–'}</span>
        <span class="v">${r.km == null ? '–' : kgTxt(r.km)}</span>
        <button type="button" class="set-check" aria-pressed="${r.done}" aria-label="Kayıt ${r.n} ${r.done ? 'tamamlandı, geri al' : 'tamamla'}" data-act="done" data-ex="${c.ex.id}" data-n="${r.n}">${icon.check}</button>
      </div>
      ${
        active
          ? `<div class="set-editor">
          <div><label for="mn-${c.ex.id}">Süre (dk)</label>
            <div class="stepper"><button type="button" aria-label="Süreyi azalt" data-act="min" data-d="-1" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="mn-${c.ex.id}" inputmode="decimal" value="${r.min ?? ''}" data-in="min" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="0">
            <button type="button" aria-label="Süreyi artır" data-act="min" data-d="1" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          <div><label for="km-${c.ex.id}">Mesafe (km)</label>
            <div class="stepper"><button type="button" aria-label="Mesafeyi azalt" data-act="km" data-d="-0.1" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="km-${c.ex.id}" inputmode="decimal" value="${r.km == null ? '' : kgTxt(r.km)}" data-in="km" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="–">
            <button type="button" aria-label="Mesafeyi artır" data-act="km" data-d="0.1" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          ${r.min && r.km ? `<p class="small muted" style="grid-column:1/-1;margin:2px 4px 0">Tempo: ${pace(r.min, r.km)}</p>` : ''}
        </div>`
          : ''
      }`;
      })
      .join('');

  root.innerHTML = `
    <header class="hdr">
      <div class="hdr-text">
        <span class="eyebrow">${esc(WD_LONG[state.wd])} · ${esc(trDate(date))}${state.weekOffset ? ` · ${state.weekOffset < 0 ? Math.abs(state.weekOffset) + ' hafta önce' : 'gelecek hafta'}` : ''}</span>
        <h1 class="title">${esc(title)}</h1>
        ${day && day.subtitle && !day.rest ? `<span class="subtitle">${esc(day.subtitle)}</span>` : ''}
        ${summary ? `<span class="subtitle num">${esc(summary)}</span>` : ''}
      </div>
      <div class="hdr-actions">
        <button type="button" class="icon-btn" aria-label="Önceki hafta" data-act="wprev">${icon.left}</button>
        ${state.weekOffset < 0 ? `<button type="button" class="icon-btn" aria-label="Sonraki hafta" data-act="wnext">${icon.right}</button>` : ''}
        <button type="button" class="icon-btn" aria-label="Programı düzenle" data-act="edit-program">${icon.edit}</button>
      </div>
    </header>

    <div class="seg" role="tablist" aria-label="Antrenman görünümü">
      <button type="button" role="tab" aria-selected="true" data-tab="workout">Antrenman</button>
      <button type="button" role="tab" aria-selected="false" data-tab="progress">İlerleme</button>
    </div>

    <nav class="week" aria-label="Haftanın günleri">
      ${week
        .map((w, i) => {
          const dd = addDays(ws, i);
          const lbl = w.day ? (w.day.rest ? 'Dinlen' : w.day.title || '—') : '—';
          return `<button type="button" aria-pressed="${i === state.wd}" data-wd="${i}" aria-label="${WD_LONG[i]}: ${esc(lbl)}">
            ${dd === t ? '<span class="today-dot" aria-hidden="true"></span>' : ''}
            <span class="d">${WD_SHORT[i]}</span><span class="t">${esc(lbl)}</span></button>`;
        })
        .join('')}
    </nav>

    ${
      !hasAnyProgram && !allItems.length
        ? `<section class="card" style="text-align:center;padding:24px 16px">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600">Henüz bir programın yok</p>
            <p class="small muted" style="margin:0 0 14px;line-height:18px">Haftanın her günü için egzersizlerini, set ve tekrar hedeflerini gir. İstersen Danışman'dan hedefine göre bir program önermesini de isteyebilirsin.</p>
            <button type="button" class="btn primary" data-act="edit-program">Programı oluştur</button>
          </section>`
        : day && day.rest && !allItems.length
        ? `<section class="card" style="text-align:center;padding:24px 16px"><p style="margin:0;font-size:17px;font-weight:600">Dinlenme günü</p><p class="small muted" style="margin:6px 0 0">Toparlanma da antrenmanın parçası.</p></section>`
        : !allItems.length
        ? `<section class="card" style="text-align:center;padding:24px 16px"><p class="muted" style="margin:0 0 12px">Bu gün için egzersiz yok.</p><button type="button" class="btn primary" data-act="edit-program">Güne egzersiz ekle</button></section>`
        : ''
    }

    ${cards
      .map(
        (c) => `
      <section class="card" aria-label="${esc(c.ex.name)}" style="padding:10px 12px 12px">
        <div class="ex-head">
          <button type="button" style="display:flex;flex-direction:column;align-items:flex-start;min-height:44px;justify-content:center;text-align:left" data-act="history" data-ex="${c.ex.id}">
            <span class="ex-name">${esc(c.ex.name)}</span>
            <span class="ex-meta">${c.target ? `Hedef ${c.target} × ${esc(c.it.pe.target_reps || '?')}` : c.it.extra ? 'Program dışı' : ''}${c.prev ? ` · son: ${esc(trDate(c.prev.date))}` : ''}</span>
          </button>
          <button type="button" class="icon-btn" style="background:transparent;color:var(--sub)" aria-label="${esc(c.ex.name)} geçmişi ve ilerleme" data-act="history" data-ex="${c.ex.id}">${icon.chart}</button>
        </div>
        ${
          c.sug && !c.rows.some((r) => r.done)
            ? `<button type="button" class="sug-chip" data-act="sug-info" data-ex="${c.ex.id}">
                <span><b>Öneri:</b> ${kgTxt(c.sug.weight_kg)} kg × ${c.sug.reps}</span><span class="muted">Neden?</span></button>`
            : ''
        }
        ${
          c.cardio
            ? `<div class="set-grid set-hd" aria-hidden="true"><span>#</span><span>Önceki</span><span>Dk</span><span>Km</span><span>Bitti</span></div>${cardioRows(c)}`
            : `<div class="set-grid set-hd" aria-hidden="true"><span>Set</span><span>Önceki</span><span>Kg</span><span>Tekrar</span><span>Bitti</span></div>${weightRows(c)}`
        }
        <button type="button" class="btn block" style="margin-top:6px;background:var(--fill2);color:var(--accent)" data-act="addset" data-ex="${c.ex.id}">+ ${c.cardio ? 'Kayıt' : 'Set'} ekle</button>
      </section>`
      )
      .join('')}
    ${allItems.length ? `<p class="note">Değerleri +/− ile ayarla ya da rakama dokunup yaz; ✓ ile kaydet. "Öneri" geçen seferki performansına göre kademeli yüklenme önerir; ilk sete otomatik yazılır. RPE isteğe bağlı: 10 = tükeniş, 8 = 2 tekrar daha yapabilirdin.</p>` : ''}
  `;

  // Yardımcılar
  const cardOf = (exId) => cards.find((c) => c.ex.id === exId);
  const rowOf = (exId, n) => cardOf(exId).rows.find((r) => r.n === Number(n));

  const saveRow = async (row, exId, patch) => {
    const c = cardOf(exId);
    if (c.cardio) {
      const vals = { min: row.min, km: row.km, ...patch };
      state.drafts[row.key] = vals;
      if (row.rec) await db.put('workout_sets', { ...row.rec, duration_min: vals.min, distance_km: vals.km });
    } else {
      const vals = { kg: row.kg, reps: row.reps, rpe: row.rpe, ...patch };
      state.drafts[row.key] = vals;
      if (row.rec) await db.put('workout_sets', { ...row.rec, weight_kg: vals.kg, reps: vals.reps, rpe: vals.rpe ?? null });
    }
  };

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act],[data-wd],[data-tab]');
    if (!b) return;
    if (b.dataset.tab) {
      state.tab = b.dataset.tab;
      return refresh();
    }
    if (b.dataset.wd) {
      state.wd = Number(b.dataset.wd);
      return refresh();
    }
    const act = b.dataset.act;
    const exId = b.dataset.ex;
    if (act === 'wprev') {
      state.weekOffset -= 1;
      refresh();
    } else if (act === 'wnext') {
      state.weekOffset = Math.min(0, state.weekOffset + 1);
      refresh();
    } else if (act === 'edit-program') openProgramEditor(state.wd);
    else if (act === 'history') openHistory(exs.find((x) => x.id === exId) || cardOf(exId).ex);
    else if (act === 'sug-info') {
      const c = cardOf(exId);
      openSheet({
        title: 'Ağırlık önerisi',
        body: `<div class="card"><p style="margin:0 0 8px;font-size:17px;font-weight:600">${kgTxt(c.sug.weight_kg)} kg × ${c.sug.reps}</p>
          <p style="margin:0;font-size:15px;line-height:21px">${esc(c.sug.reason)}</p></div>
          <p class="small muted" style="margin:0 4px;line-height:18px">Çift ilerleme yöntemi: hedef aralığın (örn. 8-12) üst sınırına tüm setlerde ulaşınca ağırlık artar, aralığın altına düşersen aynı ağırlıkta kalırsın. Kendini kötü hissediyorsan ya da form bozuluyorsa öneriyi uygulamak zorunda değilsin.</p>`,
      });
    } else if (act === 'pick') {
      if (e.target.closest('.set-check')) return;
      state.active[`${exId}|${date}`] = Number(b.dataset.n);
      refresh();
    } else if (act === 'kg' || act === 'reps' || act === 'min' || act === 'km') {
      const row = rowOf(exId, b.dataset.n);
      const d = Number(b.dataset.d);
      if (act === 'kg') await saveRow(row, exId, { kg: Math.max(0, round1((row.kg || 0) + d)) });
      else if (act === 'reps') await saveRow(row, exId, { reps: Math.max(0, (row.reps || 0) + d) });
      else if (act === 'min') await saveRow(row, exId, { min: Math.max(0, round1((row.min || 0) + d)) });
      else await saveRow(row, exId, { km: Math.max(0, round1((row.km || 0) + d)) });
      refresh();
    } else if (act === 'rpe') {
      const row = rowOf(exId, b.dataset.n);
      const v = Number(b.dataset.v);
      await saveRow(row, exId, { rpe: row.rpe === v ? null : v });
      refresh();
    } else if (act === 'plates') {
      const row = rowOf(exId, b.dataset.n);
      openPlates(row.kg);
    } else if (act === 'done') {
      const c = cardOf(exId);
      const row = rowOf(exId, b.dataset.n);
      if (row.rec && row.rec.done) {
        await db.put('workout_sets', { ...row.rec, done: false });
        state.active[`${exId}|${date}`] = row.n;
      } else if (c.cardio) {
        if (!row.min) return toast('Önce süreyi gir');
        await db.put('workout_sets', { ...(row.rec || {}), date, exercise_id: exId, set_no: row.n, duration_min: row.min, distance_km: row.km ?? null, weight_kg: 0, reps: 0, done: true });
        delete state.active[`${exId}|${date}`];
      } else {
        if (row.kg == null || row.reps == null) return toast('Önce kilo ve tekrarı gir');
        await db.put('workout_sets', { ...(row.rec || {}), date, exercise_id: exId, set_no: row.n, weight_kg: row.kg, reps: row.reps, rpe: row.rpe ?? null, done: true });
        delete state.active[`${exId}|${date}`];
        if (isToday) {
          rest.start(await db.getSetting('rest_seconds', 90));
          state.wakeWanted = true;
          requestWake();
        }
      }
      refresh();
    } else if (act === 'addset') {
      state.extra[exId] = (state.extra[exId] || 0) + 1;
      refresh();
    }
  };

  root.oninput = async (e) => {
    const inp = e.target.closest('[data-in]');
    if (!inp) return;
    const row = rowOf(inp.dataset.ex, inp.dataset.n);
    const v = parseNum(inp.value);
    if (isNaN(v)) return;
    const f = inp.dataset.in;
    if (f === 'kg') row.kg = v;
    else if (f === 'reps') row.reps = Math.round(v);
    else if (f === 'min') row.min = v;
    else if (f === 'km') row.km = v;
    await saveRow(row, inp.dataset.ex, { [f]: f === 'reps' ? Math.round(v) : v });
    // satırdaki görünen değeri güncelle (yeniden çizmeden, odak kaybolmasın)
    const rowEl = root.querySelector(`.set-row[data-ex="${inp.dataset.ex}"][data-n="${inp.dataset.n}"]`);
    if (rowEl) {
      const vs = rowEl.querySelectorAll('.v');
      if (f === 'kg' || f === 'reps') {
        vs[0].textContent = kgTxt(row.kg);
        vs[1].textContent = row.reps ?? '–';
      } else {
        vs[0].textContent = row.min ?? '–';
        vs[1].textContent = row.km == null ? '–' : kgTxt(row.km);
      }
    }
  };
}

// ---------- Plaka hesaplayıcı ----------
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
function platesFor(total, bar) {
  let side = (total - bar) / 2;
  if (side < 0) return null;
  const out = [];
  for (const p of PLATES) {
    while (side >= p - 1e-9) {
      out.push(p);
      side = round1((side - p) * 100) / 100;
    }
  }
  return { plates: out, rest: Math.round(side * 100) / 100 };
}
function openPlates(initial) {
  let target = initial || 60;
  let bar = 20;
  const s = openSheet({ title: 'Plaka hesaplayıcı' });
  const draw = () => {
    const r = platesFor(target, bar);
    s.setBody(`
      <div class="field"><label for="pl-t">Toplam ağırlık (kg)</label>
        <div class="stepper"><button type="button" data-d="-2.5" aria-label="Azalt">−</button>
        <input id="pl-t" inputmode="decimal" value="${kgTxt(target)}"><button type="button" data-d="2.5" aria-label="Artır">+</button></div></div>
      <div class="field"><span class="lbl">Bar</span>
        <div class="toggle-row">${[20, 15, 10, 0].map((b) => `<button type="button" class="tog" aria-pressed="${bar === b}" data-bar="${b}">${b ? b + ' kg' : 'Bar yok'}</button>`).join('')}</div></div>
      <div class="card" style="margin:0">
        ${
          !r
            ? '<p style="margin:0" class="muted">Toplam ağırlık bardan hafif olamaz.</p>'
            : `<p class="small muted" style="margin:0 0 10px">Her iki tarafa:</p>
               <div class="plates" aria-label="Bir taraf: ${r.plates.map((p) => String(p).replace('.', ',')).join(', ') || 'plaka yok'}">
                 ${r.plates.length ? r.plates.map((p) => `<span class="plate p${String(p).replace('.', '_')}">${String(p).replace('.', ',')}</span>`).join('') : '<span class="muted">Plaka gerekmiyor</span>'}
               </div>
               ${r.rest > 0 ? `<p class="small warn" style="margin:10px 0 0">${kgTxt(r.rest * 2)} kg tam karşılanamıyor (en küçük plaka 1,25 kg).</p>` : ''}`
        }
      </div>`);
    s.el.querySelector('#pl-t').addEventListener('change', (e) => {
      const v = parseNum(e.target.value);
      if (!isNaN(v)) {
        target = v;
        draw();
      }
    });
  };
  draw();
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.d) {
      target = Math.max(0, round1(target + Number(b.dataset.d)));
      draw();
    } else if (b.dataset.bar != null) {
      bar = Number(b.dataset.bar);
      draw();
    }
  });
}

// ---------- Program düzenleyici ----------
async function openProgramEditor(wd) {
  const { day, items } = await programDay(wd);
  let title = day?.title || '';
  let subtitle = day?.subtitle || '';
  let isRest = !!day?.rest;
  let list = items.map((x) => ({ id: x.pe.id, exercise_id: x.exercise.id, name: x.exercise.name, sets: x.pe.target_sets ?? 3, reps: x.pe.target_reps ?? '8-12' }));
  const removed = [];

  const s = openSheet({
    title: `${WD_LONG[wd]} programı`,
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onRight: async (api) => {
      syncInputs();
      const d = await db.put('program_days', { ...(day || {}), weekday: wd, title: title.trim(), subtitle: subtitle.trim(), rest: isRest });
      for (const id of removed) await db.remove('program_exercises', id);
      let order = 0;
      for (const x of list) {
        let ex = x.exercise_id ? { id: x.exercise_id } : await findOrCreateExercise(x.name, { cardio: x.muscle === 'Kardiyo' });
        if (!x.exercise_id && x.muscle && !ex.muscle) ex = await db.put('exercises', { ...ex, muscle: x.muscle, kind: x.muscle === 'Kardiyo' ? 'kardiyo' : 'agirlik' });
        await db.put('program_exercises', { ...(x.id ? { id: x.id } : {}), day_id: d.id, exercise_id: ex.id, order: order++, target_sets: Number(x.sets) || 0, target_reps: String(x.reps || '').trim() });
      }
      api.close();
      toast('Program kaydedildi');
      refresh();
    },
  });

  const syncInputs = () => {
    const ti = s.el.querySelector('#pd-title');
    if (ti) title = ti.value;
    const st = s.el.querySelector('#pd-sub');
    if (st) subtitle = st.value;
    s.el.querySelectorAll('[data-row]').forEach((rowEl) => {
      const i = Number(rowEl.dataset.row);
      list[i].sets = rowEl.querySelector('[data-f="sets"]').value;
      list[i].reps = rowEl.querySelector('[data-f="reps"]').value;
    });
  };

  const draw = () => {
    s.setBody(`
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="pd-rest" style="font-size:16px">Dinlenme günü</label>
        <span class="switch"><input id="pd-rest" type="checkbox" ${isRest ? 'checked' : ''}><span></span></span>
      </div>
      ${
        isRest
          ? ''
          : `
      <div class="grid2">
        <div class="field"><label for="pd-title">Gün adı</label><input id="pd-title" class="input" value="${esc(title)}" placeholder="Push, Pull, Bacak…"></div>
        <div class="field"><label for="pd-sub">Kas grupları</label><input id="pd-sub" class="input" value="${esc(subtitle)}" placeholder="Göğüs · Omuz · Triceps"></div>
      </div>
      <div class="sec" style="padding-top:4px"><h2>Egzersizler</h2></div>
      <div class="card flush">
        ${
          list.length
            ? list
                .map(
                  (x, i) => `<div class="row" data-row="${i}" style="flex-wrap:wrap;gap:8px">
              <span class="row-main" style="flex-basis:100%"><span class="row-title">${esc(x.name)}</span></span>
              <label class="sr-only" for="ps-${i}">Set sayısı</label>
              <input id="ps-${i}" class="input" style="width:56px;text-align:center" inputmode="numeric" data-f="sets" value="${esc(x.sets)}">
              <span class="muted">×</span>
              <label class="sr-only" for="pr-${i}">Tekrar hedefi</label>
              <input id="pr-${i}" class="input" style="width:80px;text-align:center" data-f="reps" value="${esc(x.reps)}" placeholder="8-12">
              <span style="flex:1"></span>
              <button type="button" class="icon-btn ed-ic" aria-label="Yukarı taşı" data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''}>${icon.up}</button>
              <button type="button" class="icon-btn ed-ic" aria-label="Aşağı taşı" data-mv="1" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''}>${icon.down}</button>
              <button type="button" class="icon-btn ed-ic" style="color:var(--warn)" aria-label="${esc(x.name)} çıkar" data-rm="${i}">${icon.trash}</button>
            </div>`
                )
                .join('')
            : '<div class="empty">Henüz egzersiz yok</div>'
        }
      </div>
      <button type="button" class="btn primary block" data-add>+ Egzersiz ekle</button>
      <p class="small muted" style="margin:10px 4px 0">Set × tekrar örnekleri: 4 × 8, 3 × 8-12, 5 × 5. Kardiyo için tekrar yerine süre yazabilirsin (örn. 20 dk).</p>`
      }`);
    s.el.querySelector('#pd-rest').addEventListener('change', (e) => {
      syncInputs();
      isRest = e.target.checked;
      draw();
    });
  };
  draw();

  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mv) {
      syncInputs();
      const i = Number(b.dataset.i);
      const j = i + Number(b.dataset.mv);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      draw();
    } else if (b.dataset.rm) {
      syncInputs();
      const [x] = list.splice(Number(b.dataset.rm), 1);
      if (x.id) removed.push(x.id);
      draw();
    } else if (b.hasAttribute('data-add')) {
      syncInputs();
      const picked = await pickExercise();
      if (picked) {
        const cardio = picked.muscle === 'Kardiyo';
        list.push({ name: picked.name, muscle: picked.muscle, sets: cardio ? 1 : 3, reps: cardio ? '20 dk' : '8-12' });
        draw();
      }
    }
  });
}

function pickExercise() {
  return new Promise(async (resolve) => {
    const mine = await db.list('exercises');
    const names = [...new Set([...mine.map((m) => m.name), ...EXERCISE_PRESETS.map((p) => p[0])])];
    const muscle = Object.fromEntries([...EXERCISE_PRESETS.map((p) => [p[0], p[1]]), ...mine.filter((m) => m.muscle).map((m) => [m.name, m.muscle])]);
    let result = null;
    const s = openSheet({
      title: 'Egzersiz seç',
      leftLabel: 'Vazgeç',
      body: `<label class="sr-only" for="exq">Egzersiz ara</label>
        <input id="exq" class="input" type="search" placeholder="Ara ya da yeni egzersiz adı yaz" autocomplete="off" style="margin-bottom:10px">
        <div class="card flush search-res" id="exres"></div>`,
      onClose: () => resolve(result),
    });
    const res = s.el.querySelector('#exres');
    const q = s.el.querySelector('#exq');
    const draw = () => {
      const v = q.value.trim().toLocaleLowerCase('tr-TR');
      const hits = names.filter((n) => !v || n.toLocaleLowerCase('tr-TR').includes(v)).slice(0, 60);
      const exact = names.some((n) => n.toLocaleLowerCase('tr-TR') === v);
      res.innerHTML =
        (v && !exact ? `<button type="button" class="row" data-name="${esc(q.value.trim())}"><span class="row-main"><span class="row-title" style="color:var(--accent)">+ "${esc(q.value.trim())}" ekle</span></span></button>` : '') +
        hits.map((n) => `<button type="button" class="row" data-name="${esc(n)}"><span class="row-main"><span class="row-title normal">${esc(n)}</span>${muscle[n] ? `<span class="row-sub">${esc(muscle[n])}</span>` : ''}</span></button>`).join('');
    };
    draw();
    q.addEventListener('input', draw);
    res.addEventListener('click', (e) => {
      const b = e.target.closest('[data-name]');
      if (!b) return;
      const name = b.dataset.name;
      if (muscle[name]) {
        result = { name, muscle: muscle[name] };
        s.close();
        return;
      }
      // yeni egzersiz: kas grubunu sor
      s.setBody(`<p style="margin:0 4px 12px;font-size:15px">"${esc(name)}" hangi kas grubunu çalıştırıyor?</p>
        <div class="toggle-row">${MUSCLES.map((m) => `<button type="button" class="tog" data-muscle="${esc(m)}">${esc(m)}</button>`).join('')}</div>`);
      s.el.addEventListener('click', (ev) => {
        const mb = ev.target.closest('[data-muscle]');
        if (!mb) return;
        result = { name, muscle: mb.dataset.muscle };
        s.close();
      });
    });
  });
}

// ---------- Egzersiz geçmişi ----------
async function openHistory(ex) {
  if (!ex) return;
  const sets = (await db.list('workout_sets', (s) => s.exercise_id === ex.id && s.done)).sort((a, b) => a.date.localeCompare(b.date) || a.set_no - b.set_no);
  const byDate = {};
  for (const s of sets) (byDate[s.date] = byDate[s.date] || []).push(s);
  const dates = Object.keys(byDate).sort();
  const muscleField = `<div class="field" style="margin-top:12px"><label for="ex-muscle">Kas grubu</label>
    <select id="ex-muscle" class="input">${['', ...MUSCLES].map((m) => `<option value="${esc(m)}" ${(ex.muscle || '') === m ? 'selected' : ''}>${m ? esc(m) : 'Seçilmedi'}</option>`).join('')}</select></div>`;
  const bindMuscle = (sh) => {
    const sel = sh.el.querySelector('#ex-muscle');
    if (sel)
      sel.addEventListener('change', async () => {
        const cur = await db.get('exercises', ex.id);
        if (!cur) return;
        await db.put('exercises', { ...cur, muscle: sel.value, kind: sel.value === 'Kardiyo' ? 'kardiyo' : 'agirlik' });
        toast('Kaydedildi');
        refresh();
      });
  };
  if (isCardio(ex)) {
    const tot = sets.reduce((a, s) => ({ min: a.min + (Number(s.duration_min) || 0), km: a.km + (Number(s.distance_km) || 0) }), { min: 0, km: 0 });
    const pts = dates.slice(-10).map((d) => {
      const dt = parseDate(d);
      return { label: `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`, value: byDate[d].reduce((a, s) => a + (Number(s.duration_min) || 0), 0) };
    });
    const sh = openSheet({
      title: ex.name,
      body: `${dates.length ? `
        <div class="card stat3" style="display:grid">
          <div><b>${fmt(tot.min)}</b><span>toplam dk</span></div>
          <div><b>${kgTxt(round1(tot.km))}</b><span>toplam km</span></div>
          <div><b>${dates.length}</b><span>seans</span></div>
        </div>
        ${pts.length >= 2 ? `<div class="card"><span class="small muted">Seans süresi (dk)</span>${lineChartSVG(pts, { unit: 'dk' })}</div>` : ''}
        <div class="card flush">${dates.slice().reverse().slice(0, 20).map((d) => `<div class="row"><span class="row-main"><span class="row-title normal">${esc(trDate(d, true))}</span>
          <span class="row-sub num">${byDate[d].map((s) => `${s.duration_min || '?'} dk${s.distance_km ? ' · ' + kgTxt(s.distance_km) + ' km · ' + pace(s.duration_min, s.distance_km) : ''}`).join(' | ')}</span></span></div>`).join('')}</div>`
        : '<div class="empty">Henüz kayıt yok.</div>'}${muscleField}`,
    });
    bindMuscle(sh);
    return;
  }
  const e1rm = (s) => (s.reps > 0 ? s.weight_kg * (1 + Math.min(s.reps, 12) / 30) : 0);
  const points = dates.slice(-10).map((d) => {
    const best = Math.max(...byDate[d].map(e1rm));
    const dt = parseDate(d);
    return { label: `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`, value: round1(best) };
  });
  const maxW = sets.reduce((m, s) => Math.max(m, s.weight_kg || 0), 0);
  const prSet = sets.filter((s) => s.weight_kg === maxW).sort((a, b) => b.reps - a.reps)[0];
  const bestE = sets.reduce((m, s) => Math.max(m, e1rm(s)), 0);
  const sh = openSheet({
    title: ex.name,
    body: dates.length
      ? `
      <div class="card stat3" style="display:grid">
        <div><b>${prSet ? kgTxt(prSet.weight_kg) : '–'}</b><span>en ağır (kg)${prSet ? ` × ${prSet.reps}` : ''}</span></div>
        <div><b>${kgTxt(round1(bestE))}</b><span>tahmini 1RM</span></div>
        <div><b>${dates.length}</b><span>antrenman</span></div>
      </div>
      ${points.length >= 2 ? `<div class="card"><span class="small muted">Tahmini 1RM gelişimi (kg)</span>${lineChartSVG(points, { unit: 'kg' })}</div>` : ''}
      <div class="sec" style="padding-top:8px"><h2>Geçmiş</h2></div>
      <div class="card flush">
        ${dates
          .slice()
          .reverse()
          .slice(0, 20)
          .map((d) => `<div class="row"><span class="row-main"><span class="row-title normal">${esc(trDate(d, true))}</span>
            <span class="row-sub num">${byDate[d].map((s) => `${kgTxt(s.weight_kg)}×${s.reps}${s.rpe ? ' @' + s.rpe : ''}`).join(' · ')}</span></span></div>`)
          .join('')}
      </div>
      <p class="small muted" style="margin:8px 4px 0">Tahmini 1RM, Epley formülüyle en iyi setinden hesaplanır.</p>${muscleField}`
      : `<div class="empty">Bu egzersiz için henüz kayıtlı set yok.</div>${muscleField}`,
  });
  bindMuscle(sh);
}
