import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, weekStart, weekday, trDate, WD_SHORT, WD_LONG, icon, openSheet, confirmSheet, round1, lineChartSVG, parseDate, MONTHS_SHORT } from '../util.js';
import { refresh } from '../app.js';
import { programDay, previousSession, findOrCreateExercise, weekProgram, isCardio, suggestNext, MUSCLES, MUSCLE_GROUP, routineList, routineDay, sessionFor } from '../context.js';
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
  const routines = await routineList();
  const session = await sessionFor(date);
  let day = null;
  let items = [];
  let srcKind = null; // 'routine' | 'week'
  if (session) {
    const r = await routineDay(session.routine_id);
    if (r.day) {
      day = r.day;
      items = r.items;
      srcKind = 'routine';
    }
  }
  if (!srcKind && week[state.wd].day) {
    day = week[state.wd].day;
    items = week[state.wd].items;
    srcKind = 'week';
  }
  const weekSessions = await db.list('workout_sessions', (x) => x.date >= ws && x.date <= addDays(ws, 6));
  const rTitle = (id) => (routines.find((r) => r.day.id === id) || {}).day?.title;
  const logged = await db.list('workout_sets', (s) => s.date === date);
  const exs = await db.list('exercises');

  // Programda olmayan ama bu gün kaydedilmiş egzersizler (örn. Danışman'dan)
  const progIds = new Set(items.map((x) => x.exercise.id));
  const extraIds = [...new Set([...logged.map((s) => s.exercise_id), ...((state.added || {})[date] || [])])].filter((id) => !progIds.has(id));
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
        // Kutular boş başlar; öneri (önceki set / geçen seans / hedef) gri ipucu olarak görünür
        const min = rec ? rec.duration_min : d && d.min != null ? d.min : null;
        const km = rec ? rec.distance_km : d && d.km != null ? d.km : null;
        const phMin = lastVals ? lastVals.min : p ? p.duration_min : targetMin;
        const phKm = lastVals ? lastVals.km : p ? p.distance_km : null;
        if (done) cardioMin += Number(rec.duration_min) || 0;
        lastVals = { min: min ?? phMin, km: km ?? phKm };
        row = { n, rec, prevTxt: p ? `${p.duration_min || '–'} dk${p.distance_km ? ' · ' + kgTxt(p.distance_km) : ''}` : '–', min, km, phMin, phKm, done, key };
      } else {
        const sugKg = sug ? sug.weight_kg : null;
        const sugReps = sug ? sug.reps : null;
        const kg = rec ? rec.weight_kg : d && d.kg != null ? d.kg : null;
        const reps = rec ? rec.reps : d && d.reps != null ? d.reps : null;
        const phKg = lastVals ? lastVals.kg : sugKg ?? (p ? p.weight_kg : null);
        const phReps = lastVals ? lastVals.reps : sugReps ?? (p ? p.reps : parseInt(it.pe.target_reps, 10) || null);
        const rpe = rec ? rec.rpe ?? null : d ? d.rpe ?? null : null;
        if (done) {
          totalVol += (rec.weight_kg || 0) * (rec.reps || 0);
          doneSets++;
        }
        lastVals = { kg: kg ?? phKg, reps: reps ?? phReps };
        row = { n, rec, prevTxt: p ? `${kgTxt(p.weight_kg)} × ${p.reps}` : '–', kg, reps, phKg, phReps, rpe, done, key };
      }
      rows.push(row);
    }
    const activeN = state.active[`${ex.id}|${date}`] ?? (rows.find((r) => !r.done) || {}).n;
    cards.push({ it, ex, cardio, rows, activeN, prev, sug, target });
  }
  // Düzenleme kutuları yalnızca üzerinde çalışılan harekette açık olsun (ilk yarım kalan hareket)
  state.focus = state.focus || {};
  let focusEx = state.focus[date];
  if (!cards.some((c) => c.ex.id === focusEx && c.rows.some((r) => !r.done))) focusEx = (cards.find((c) => c.rows.some((r) => !r.done)) || {}).ex?.id;
  for (const c of cards) if (c.ex.id !== focusEx) c.activeN = null;

  const isToday = date === t;
  const title = day ? (day.rest ? 'Dinlenme' : day.title || WD_LONG[state.wd]) : 'Antrenman';
  const summary = [doneSets ? `${doneSets} set · ${fmt(totalVol)} kg hacim` : '', cardioMin ? `${fmt(cardioMin)} dk kardiyo` : ''].filter(Boolean).join(' · ');

  const weightRows = (c) =>
    c.rows
      .map((r) => {
        const active = r.n === c.activeN && !r.done;
        return `
      <div class="set-grid set-row ${r.done ? 'done' : ''} ${active ? 'active' : ''}" data-act="pick" data-ex="${c.ex.id}" data-n="${r.n}" role="group" aria-label="Set ${r.n}">
        <span class="n">${r.n}</span>
        <span class="prev">${esc(r.prevTxt)}</span>
        <span class="v ${r.kg == null ? 'ph' : ''}">${kgTxt(r.kg ?? r.phKg)}</span>
        <span class="v ${r.reps == null ? 'ph' : ''}">${r.reps ?? r.phReps ?? '–'}${r.rpe ? `<small class="rpe-tag">@${r.rpe}</small>` : ''}</span>
        <button type="button" class="set-check" aria-pressed="${r.done}" aria-label="Set ${r.n} ${r.done ? 'tamamlandı, geri al' : 'tamamla'}" data-act="done" data-ex="${c.ex.id}" data-n="${r.n}">${icon.check}</button>
      </div>
      ${
        active
          ? `<div class="set-editor">
          <div><label for="kg-${c.ex.id}">Kg</label>
            <div class="stepper"><button type="button" aria-label="Kiloyu 2,5 azalt" data-act="kg" data-d="-2.5" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="kg-${c.ex.id}" inputmode="decimal" value="${r.kg == null ? '' : kgTxt(r.kg)}" data-in="kg" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="${r.phKg == null ? '0' : kgTxt(r.phKg)}">
            <button type="button" aria-label="Kiloyu 2,5 artır" data-act="kg" data-d="2.5" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          <div><label for="rp-${c.ex.id}">Tekrar</label>
            <div class="stepper"><button type="button" aria-label="Tekrarı azalt" data-act="reps" data-d="-1" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="rp-${c.ex.id}" inputmode="numeric" value="${r.reps ?? ''}" data-in="reps" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="${r.phReps ?? '0'}">
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
        <span class="v ${r.min == null ? 'ph' : ''}">${r.min ?? r.phMin ?? '–'}</span>
        <span class="v ${r.km == null ? 'ph' : ''}">${(r.km ?? r.phKm) == null ? '–' : kgTxt(r.km ?? r.phKm)}</span>
        <button type="button" class="set-check" aria-pressed="${r.done}" aria-label="Kayıt ${r.n} ${r.done ? 'tamamlandı, geri al' : 'tamamla'}" data-act="done" data-ex="${c.ex.id}" data-n="${r.n}">${icon.check}</button>
      </div>
      ${
        active
          ? `<div class="set-editor">
          <div><label for="mn-${c.ex.id}">Süre (dk)</label>
            <div class="stepper"><button type="button" aria-label="Süreyi azalt" data-act="min" data-d="-1" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="mn-${c.ex.id}" inputmode="decimal" value="${r.min ?? ''}" data-in="min" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="${r.phMin ?? '0'}">
            <button type="button" aria-label="Süreyi artır" data-act="min" data-d="1" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          <div><label for="km-${c.ex.id}">Mesafe (km)</label>
            <div class="stepper"><button type="button" aria-label="Mesafeyi azalt" data-act="km" data-d="-0.1" data-ex="${c.ex.id}" data-n="${r.n}">−</button>
            <input id="km-${c.ex.id}" inputmode="decimal" value="${r.km == null ? '' : kgTxt(r.km)}" data-in="km" data-ex="${c.ex.id}" data-n="${r.n}" placeholder="${r.phKm == null ? '–' : kgTxt(r.phKm)}">
            <button type="button" aria-label="Mesafeyi artır" data-act="km" data-d="0.1" data-ex="${c.ex.id}" data-n="${r.n}">+</button></div></div>
          ${(r.min ?? r.phMin) && (r.km ?? r.phKm) ? `<p class="small muted" style="grid-column:1/-1;margin:2px 4px 0">Tempo: ${pace(r.min ?? r.phMin, r.km ?? r.phKm)}</p>` : ''}
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
        <button type="button" class="icon-btn" aria-label="Rutinler" data-act="routines">${icon.book}</button>
        <button type="button" class="icon-btn" aria-label="${srcKind === 'routine' ? 'Rutini düzenle' : 'Haftalık programı düzenle'}" data-act="${srcKind === 'routine' ? 'edit-routine' : 'edit-program'}">${icon.edit}</button>
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
          const ses = weekSessions.find((x) => x.date === dd);
          const lbl = ses && rTitle(ses.routine_id) ? rTitle(ses.routine_id) : w.day ? (w.day.rest ? 'Dinlen' : w.day.title || '—') : '—';
          return `<button type="button" aria-pressed="${i === state.wd}" data-wd="${i}" aria-label="${WD_LONG[i]}: ${esc(lbl)}">
            ${dd === t ? '<span class="today-dot" aria-hidden="true"></span>' : ''}
            <span class="d">${WD_SHORT[i]}</span><span class="t">${esc(lbl)}</span></button>`;
        })
        .join('')}
    </nav>

    ${
      !allItems.length
        ? `<section class="card" style="padding:16px">
            <p style="margin:0 0 4px;font-size:17px;font-weight:600">${day && day.rest ? 'Bugün dinlenme günün' : isToday ? 'Bugün ne çalışıyorsun?' : 'Bu gün ne çalıştın?'}</p>
            <p class="small muted" style="margin:0 0 12px;line-height:18px">${
              routines.length
                ? 'Bir rutin seç; hareketler gelsin, her sette kilo ve tekrarı girip ✓ ile işaretle.'
                : 'Push day, Pull day, Leg day gibi rutinlerini bir kez oluştur; antrenmana başlarken seç, hareketler hazır gelsin.'
            }</p>
            ${
              routines.length
                ? `<div class="card flush" style="margin:0 0 10px;background:var(--bg)">${routines
                    .map(
                      (r) => `<button type="button" class="row" data-act="start" data-id="${r.day.id}" style="padding:8px 12px">
                        <span class="row-main"><span class="row-title">${esc(r.day.title || 'Rutin')}</span>
                        <span class="row-sub">${r.items.length ? esc(r.items.map((x) => x.exercise.name).join(', ')) : 'Hareket yok'}</span></span>
                        <span class="pill" aria-hidden="true">Başla</span></button>`
                    )
                    .join('')}</div>`
                : ''
            }
            <div class="btn-row">
              <button type="button" class="btn ${routines.length ? '' : 'primary'}" data-act="new-routine">+ Yeni rutin</button>
              <button type="button" class="btn" data-act="free">Boş antrenman</button>
            </div>
          </section>`
        : `<div class="routine-bar">
            <span class="small muted">${srcKind === 'routine' ? 'Rutin' : srcKind === 'week' ? 'Haftalık program' : 'Serbest antrenman'}${day && day.title ? ': <b style="color:var(--text)">' + esc(day.title) + '</b>' : ''}</span>
            <button type="button" class="link" data-act="routines">${srcKind ? 'Değiştir' : 'Rutin seç'}</button>
          </div>`
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
    ${allItems.length ? `<button type="button" class="btn block" style="margin:12px 16px 0;width:calc(100% - 32px)" data-act="add-ex">+ Hareket ekle</button>` : ''}
    ${allItems.length ? `<p class="note">Gri rakamlar öneridir: boş bırakıp ✓'e basarsan onlar kaydedilir, istersen dokunup kendi değerini yaz. "Öneri" geçen seferki performansına göre kademeli yüklenme önerir. Başka bir harekete geçmek için satırına dokun. RPE isteğe bağlı: 10 = tükeniş, 8 = 2 tekrar daha yapabilirdin.</p>` : ''}
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
    else if (act === 'edit-routine') openProgramEditor(null, day, () => refresh());
    else if (act === 'routines') openRoutines(date, session, !!week[state.wd].day);
    else if (act === 'start') {
      await startSession(date, b.dataset.id);
      refresh();
    } else if (act === 'new-routine')
      openProgramEditor(null, null, async (saved) => {
        if (saved) await startSession(date, saved.id);
        refresh();
      });
    else if (act === 'free' || act === 'add-ex') {
      const picked = await pickExercises();
      if (!picked.length) return;
      for (const x of picked) {
        let ex = await findOrCreateExercise(x.name, { cardio: x.muscle === 'Kardiyo' });
        if (x.muscle && !ex.muscle) ex = await db.put('exercises', { ...ex, muscle: x.muscle, kind: x.muscle === 'Kardiyo' ? 'kardiyo' : 'agirlik' });
        state.extra[ex.id] = Math.max(state.extra[ex.id] || 0, 1);
        state.added = state.added || {};
        (state.added[date] = state.added[date] || []).includes(ex.id) || state.added[date].push(ex.id);
      }
      refresh();
    }
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
      state.focus = state.focus || {};
      state.focus[date] = exId;
      refresh();
    } else if (act === 'kg' || act === 'reps' || act === 'min' || act === 'km') {
      const row = rowOf(exId, b.dataset.n);
      const d = Number(b.dataset.d);
      if (act === 'kg') await saveRow(row, exId, { kg: Math.max(0, round1((row.kg ?? row.phKg ?? 0) + d)) });
      else if (act === 'reps') await saveRow(row, exId, { reps: Math.max(0, (row.reps ?? row.phReps ?? 0) + d) });
      else if (act === 'min') await saveRow(row, exId, { min: Math.max(0, round1((row.min ?? row.phMin ?? 0) + d)) });
      else await saveRow(row, exId, { km: Math.max(0, round1((row.km ?? row.phKm ?? 0) + d)) });
      refresh();
    } else if (act === 'rpe') {
      const row = rowOf(exId, b.dataset.n);
      const v = Number(b.dataset.v);
      await saveRow(row, exId, { rpe: row.rpe === v ? null : v });
      refresh();
    } else if (act === 'plates') {
      const row = rowOf(exId, b.dataset.n);
      openPlates(row.kg ?? row.phKg);
    } else if (act === 'done') {
      const c = cardOf(exId);
      const row = rowOf(exId, b.dataset.n);
      if (row.rec && row.rec.done) {
        await db.put('workout_sets', { ...row.rec, done: false });
        state.active[`${exId}|${date}`] = row.n;
      } else if (c.cardio) {
        const min = row.min ?? row.phMin;
        if (!min) return toast('Önce süreyi gir');
        await db.put('workout_sets', { ...(row.rec || {}), date, exercise_id: exId, set_no: row.n, duration_min: min, distance_km: row.km ?? row.phKm ?? null, weight_kg: 0, reps: 0, done: true });
        delete state.active[`${exId}|${date}`];
      } else {
        const kg = row.kg ?? row.phKg;
        const reps = row.reps ?? row.phReps;
        if (kg == null || reps == null) return toast('Önce kilo ve tekrarı gir');
        await db.put('workout_sets', { ...(row.rec || {}), date, exercise_id: exId, set_no: row.n, weight_kg: kg, reps, rpe: row.rpe ?? null, done: true });
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
    const f = inp.dataset.in;
    const empty = inp.value.trim() === '';
    let v = empty ? null : parseNum(inp.value);
    if (!empty && isNaN(v)) return;
    if (f === 'reps' && v != null) v = Math.round(v);
    row[f] = v;
    await saveRow(row, inp.dataset.ex, { [f]: v });
    // satırdaki görünen değeri güncelle (yeniden çizmeden, odak kaybolmasın)
    const rowEl = root.querySelector(`.set-row[data-ex="${inp.dataset.ex}"][data-n="${inp.dataset.n}"]`);
    if (rowEl) {
      const vs = rowEl.querySelectorAll('.v');
      if (f === 'kg' || f === 'reps') {
        vs[0].textContent = kgTxt(row.kg ?? row.phKg);
        vs[0].classList.toggle('ph', row.kg == null);
        vs[1].textContent = row.reps ?? row.phReps ?? '–';
        vs[1].classList.toggle('ph', row.reps == null);
      } else {
        vs[0].textContent = row.min ?? row.phMin ?? '–';
        vs[0].classList.toggle('ph', row.min == null);
        vs[1].textContent = (row.km ?? row.phKm) == null ? '–' : kgTxt(row.km ?? row.phKm);
        vs[1].classList.toggle('ph', row.km == null);
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
// Seçilen rutini o güne bağla (seans)
async function startSession(date, routineId) {
  const cur = await sessionFor(date);
  const r = await routineDay(routineId);
  await db.put('workout_sessions', { ...(cur || {}), date, routine_id: routineId, routine_title: r.day ? r.day.title : '' });
}

function openRoutines(date, session, hasWeekDay) {
  return (async () => {
    const routines = await routineList();
    const s = openSheet({
      title: 'Rutinler',
      body: `
        ${
          routines.length
            ? `<div class="card flush">${routines
                .map(
                  (r) => `<div class="row">
                    <button type="button" class="row-main" style="text-align:left" data-start="${r.day.id}">
                      <span class="row-title">${esc(r.day.title || 'Rutin')}${session && session.routine_id === r.day.id ? ' <span class="tag">bugün</span>' : ''}</span>
                      <span class="row-sub">${r.items.length} hareket${r.items.length ? ' · ' + esc(r.items.map((x) => x.exercise.name).join(', ')) : ''}</span>
                    </button>
                    <button type="button" class="icon-btn" style="background:transparent;color:var(--sub)" aria-label="${esc(r.day.title)} düzenle" data-edit="${r.day.id}">${icon.edit}</button>
                  </div>`
                )
                .join('')}</div>`
            : '<div class="empty">Henüz rutinin yok. Push day, Pull day, Leg day gibi rutinlerini oluştur; antrenmana başlarken buradan seç.</div>'
        }
        <button type="button" class="btn primary block" data-new>+ Yeni rutin</button>
        ${session ? `<button type="button" class="btn block" data-clear style="margin-top:8px">${hasWeekDay ? 'Haftalık programa dön' : 'Bu günden rutini kaldır'}</button>` : ''}
        <p class="small muted" style="margin:10px 4px 0;line-height:18px">Bir rutine dokununca ${esc(trDate(date))} için o rutin açılır; kalemle rutini düzenlersin.</p>`,
    });
    s.el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.start) {
        await startSession(date, b.dataset.start);
        s.close();
        refresh();
      } else if (b.dataset.edit) {
        const r = routines.find((x) => x.day.id === b.dataset.edit);
        s.close();
        openProgramEditor(null, r.day, () => refresh());
      } else if (b.hasAttribute('data-new')) {
        s.close();
        openProgramEditor(null, null, async (saved) => {
          if (saved) await startSession(date, saved.id);
          refresh();
        });
      } else if (b.hasAttribute('data-clear')) {
        await db.remove('workout_sessions', session.id);
        s.close();
        refresh();
      }
    });
  })();
}

// wd: haftanın günü (haftalık program) ya da null (rutin). routine: düzenlenecek rutin, null ise yeni rutin
async function openProgramEditor(wd, routine = null, after = null) {
  const isRoutine = wd == null;
  const { day, items } = isRoutine ? await routineDay(routine && routine.id) : await programDay(wd);
  let title = day?.title || '';
  let subtitle = day?.subtitle || '';
  let isRest = !!day?.rest;
  let list = items.map((x) => ({ id: x.pe.id, exercise_id: x.exercise.id, name: x.exercise.name, sets: x.pe.target_sets ?? '', reps: x.pe.target_reps ?? '' }));
  const removed = [];
  let saved = null;

  const s = openSheet({
    title: isRoutine ? (day ? 'Rutini düzenle' : 'Yeni rutin') : `${WD_LONG[wd]} programı`,
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onClose: () => after && after(saved),
    onRight: async (api) => {
      syncInputs();
      if (isRoutine && !title.trim()) return toast('Rutine bir ad ver (örn. Push Day)');
      const d = await db.put('program_days', isRoutine
        ? { ...(day || {}), routine: true, title: title.trim(), subtitle: subtitle.trim() }
        : { ...(day || {}), weekday: wd, title: title.trim(), subtitle: subtitle.trim(), rest: isRest });
      for (const id of removed) await db.remove('program_exercises', id);
      let order = 0;
      for (const x of list) {
        let ex = x.exercise_id ? { id: x.exercise_id } : await findOrCreateExercise(x.name, { cardio: x.muscle === 'Kardiyo' });
        if (!x.exercise_id && x.muscle && !ex.muscle) ex = await db.put('exercises', { ...ex, muscle: x.muscle, kind: x.muscle === 'Kardiyo' ? 'kardiyo' : 'agirlik' });
        const cardio = x.muscle === 'Kardiyo' || /dk/.test(String(x.reps));
        await db.put('program_exercises', { ...(x.id ? { id: x.id } : {}), day_id: d.id, exercise_id: ex.id, order: order++, target_sets: Number(x.sets) || (cardio ? 1 : 3), target_reps: String(x.reps || '').trim() || (cardio ? '20 dk' : '8-12') });
      }
      saved = d;
      toast(isRoutine ? 'Rutin kaydedildi' : 'Program kaydedildi');
      api.close();
      if (!after) refresh();
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
      ${isRoutine ? '' : `<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="pd-rest" style="font-size:16px">Dinlenme günü</label>
        <span class="switch"><input id="pd-rest" type="checkbox" ${isRest ? 'checked' : ''}><span></span></span>
      </div>`}
      ${
        isRest
          ? ''
          : `
      <div class="grid2">
        <div class="field"><label for="pd-title">${isRoutine ? 'Rutin adı' : 'Gün adı'}</label><input id="pd-title" class="input" value="${esc(title)}" placeholder="Push Day, Leg Day…"></div>
        <div class="field"><label for="pd-sub">Kas grupları</label><input id="pd-sub" class="input" value="${esc(subtitle)}" placeholder="Göğüs · Omuz · Triceps"></div>
      </div>
      <div class="sec" style="padding-top:4px"><h2>Hareketler</h2></div>
      <div class="card flush">
        ${
          list.length
            ? list
                .map(
                  (x, i) => `<div class="row" data-row="${i}" style="flex-wrap:wrap;gap:8px">
              <span class="row-main" style="flex-basis:100%"><span class="row-title">${esc(x.name)}</span></span>
              <label class="sr-only" for="ps-${i}">Set sayısı</label>
              <input id="ps-${i}" class="input" style="width:56px;text-align:center" inputmode="numeric" data-f="sets" value="${esc(x.sets)}" placeholder="${x.muscle === 'Kardiyo' ? '1' : '3'}">
              <span class="muted">×</span>
              <label class="sr-only" for="pr-${i}">Tekrar hedefi</label>
              <input id="pr-${i}" class="input" style="width:80px;text-align:center" data-f="reps" value="${esc(x.reps)}" placeholder="${x.muscle === 'Kardiyo' ? '20 dk' : '8-12'}">
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
      <button type="button" class="btn primary block" data-add>+ Hareket ekle</button>
      <p class="small muted" style="margin:10px 4px 0">Set × tekrar boş kalırsa 3 × 8-12 kabul edilir. Örnekler: 4 × 8, 5 × 5. Kardiyo için tekrar yerine süre yazabilirsin (örn. 20 dk).</p>
      ${isRoutine && day ? '<button type="button" class="btn danger block" data-del-routine style="margin-top:12px;background:var(--card)">Rutini sil</button>' : ''}`
      }`);
    const restSw = s.el.querySelector('#pd-rest');
    if (restSw) restSw.addEventListener('change', (e) => {
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
      const picked = await pickExercises();
      for (const p of picked) list.push({ name: p.name, muscle: p.muscle, sets: '', reps: '' });
      if (picked.length) draw();
    } else if (b.hasAttribute('data-del-routine')) {
      if (!(await confirmSheet({ title: 'Rutini sil', text: `"${day.title}" rutini silinsin mi? Yaptığın setler ve geçmiş kayıtlar silinmez.`, okLabel: 'Sil', danger: true }))) return;
      for (const x of items) await db.remove('program_exercises', x.pe.id);
      await db.remove('program_days', day.id);
      toast('Rutin silindi');
      s.close();
    }
  });
}

const normTr = (x) =>
  String(x || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
const PICK_GROUPS = ['Tümü', 'Göğüs', 'Sırt', 'Omuz', 'Kol', 'Bacak', 'Karın', 'Kardiyo'];

// Birden fazla hareket seçilebilen liste. resolve([{name, muscle}])
function pickExercises() {
  return new Promise(async (resolve) => {
    const mine = await db.list('exercises');
    const map = new Map();
    for (const p of EXERCISE_PRESETS) map.set(p[0], { name: p[0], muscle: p[1], alias: p[2] || '' });
    for (const m of mine) if (!map.has(m.name)) map.set(m.name, { name: m.name, muscle: m.muscle || '', alias: '', mine: true });
    const all = [...map.values()];
    const picked = new Map();
    let group = 'Tümü';
    let done = false;
    const s = openSheet({
      title: 'Hareket seç',
      leftLabel: 'Vazgeç',
      body: `<label class="sr-only" for="exq">Hareket ara</label>
        <input id="exq" class="input" type="search" placeholder="Ara: bench, squat, lateral raise…" autocomplete="off" style="margin-bottom:10px">
        <div class="toggle-row" id="exg" style="margin-bottom:10px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px"></div>
        <div class="card flush search-res" id="exres"></div>`,
      onClose: () => resolve(done ? [...picked.values()] : []),
    });
    const ft = document.createElement('div');
    ft.className = 'sheet-ft';
    ft.hidden = true;
    s.sheet.appendChild(ft);
    const res = s.el.querySelector('#exres');
    const q = s.el.querySelector('#exq');
    const grp = s.el.querySelector('#exg');
    const updFt = () => {
      ft.hidden = !picked.size;
      ft.innerHTML = `<button type="button" class="btn primary block" data-ok>${picked.size} hareket ekle</button>`;
    };
    const draw = () => {
      const v = normTr(q.value.trim());
      grp.innerHTML = PICK_GROUPS.map((g) => `<button type="button" class="tog sm" aria-pressed="${g === group}" data-g="${g}" style="flex:none">${g}</button>`).join('');
      const hits = all.filter((x) => {
        if (!v) return group === 'Tümü' || (MUSCLE_GROUP[x.muscle] || x.muscle) === group;
        return v.split(' ').every((w) => normTr(x.name + ' ' + x.alias + ' ' + x.muscle).includes(w));
      });
      const exact = all.some((x) => normTr(x.name) === v);
      res.innerHTML =
        (v && !exact ? `<button type="button" class="row" data-new="${esc(q.value.trim())}"><span class="row-main"><span class="row-title" style="color:var(--accent)">+ "${esc(q.value.trim())}" adında yeni hareket</span></span></button>` : '') +
        (hits.length
          ? hits
              .map(
                (x) => `<button type="button" class="row" data-name="${esc(x.name)}" aria-pressed="${picked.has(x.name)}">
                  <span class="row-main"><span class="row-title normal">${esc(x.name)}</span><span class="row-sub">${esc(x.muscle || 'Kas grubu yok')}${x.mine ? ' · senin' : ''}</span></span>
                  <span class="check" aria-hidden="true">${icon.check}</span></button>`
              )
              .join('')
          : v ? '' : '<div class="empty">Bu grupta hareket yok.</div>');
    };
    draw();
    q.addEventListener('input', draw);
    s.sheet.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.g) {
        group = b.dataset.g;
        draw();
      } else if (b.dataset.name) {
        const x = map.get(b.dataset.name);
        if (picked.has(x.name)) picked.delete(x.name);
        else picked.set(x.name, { name: x.name, muscle: x.muscle });
        b.setAttribute('aria-pressed', picked.has(x.name));
        updFt();
      } else if (b.dataset.new) {
        const name = b.dataset.new;
        res.innerHTML = `<div style="padding:12px 0"><p style="margin:0 0 10px;font-size:15px">"${esc(name)}" hangi kas grubunu çalıştırıyor?</p>
          <div class="toggle-row">${MUSCLES.map((m) => `<button type="button" class="tog" data-muscle="${esc(m)}" data-for="${esc(name)}">${esc(m)}</button>`).join('')}</div></div>`;
      } else if (b.dataset.muscle) {
        const name = b.dataset.for;
        const x = { name, muscle: b.dataset.muscle, alias: '', mine: true };
        map.set(name, x);
        all.unshift(x);
        picked.set(name, { name, muscle: x.muscle });
        q.value = '';
        draw();
        updFt();
      } else if (b.hasAttribute('data-ok')) {
        done = true;
        s.close();
      }
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
