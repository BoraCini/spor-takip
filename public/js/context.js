// Sayfaların ve Coach'un ortak kullandığı veri yardımcıları
import * as db from './db.js';
import { today, weekday, addDays, daysBetween, WD_LONG, round1, weekStart as weekStartOf } from './util.js';
import { classify } from './data/labs.js';
import { EXERCISE_PRESETS } from './data/exercises.js';
import { musclesOf, REGIONS } from './data/muscles.js';

export const MEALS = [
  ['kahvalti', 'Kahvaltı'],
  ['ogle', 'Öğle'],
  ['aksam', 'Akşam'],
  ['ara', 'Ara öğün'],
];
export const mealLabel = (k) => (MEALS.find((m) => m[0] === k) || [k, k])[1];

export const SLOTS = [
  ['sabah', 'Sabah'],
  ['ogle', 'Öğle'],
  ['aksam', 'Akşam'],
];
export const slotLabel = (k) => (SLOTS.find((m) => m[0] === k) || [k, k])[1];

// ---------- Beslenme ----------
export async function dayNutrition(date = today()) {
  const entries = await db.list('food_logs', (r) => r.date === date);
  const t = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0, potassium_mg: 0 };
  for (const e of entries) for (const k of Object.keys(t)) t[k] += Number(e[k]) || 0;
  for (const k of Object.keys(t)) t[k] = round1(t[k]);
  return { entries, totals: t };
}

export function targetsOf(p) {
  return {
    kcal: Number(p.target_kcal) || 0,
    protein_g: Number(p.target_protein_g) || 0,
    carb_g: Number(p.target_carb_g) || 0,
    fat_g: Number(p.target_fat_g) || 0,
    fiber_g: p.sex === 'kadin' ? 25 : 38,
    sodium_mg: 2300,
    potassium_mg: p.sex === 'kadin' ? 2600 : 3400,
  };
}

// ---------- Antrenman ----------
// Drop set: ana setin ardından dinlenmeden yapılan düşük ağırlıklı devamlar → set.drops = [{ weight_kg, reps }]
export const isWarmup = (s) => !!s && s.type === 'warmup';
export const SET_TYPES = { warmup: 'Isınma', failure: 'Tükeniş' };
export const dropsOf = (s) => (Array.isArray(s && s.drops) ? s.drops.filter((d) => d && (d.weight_kg != null || d.reps != null)) : []);
export function setVolume(s) {
  return (Number(s.weight_kg) || 0) * (Number(s.reps) || 0) + dropsOf(s).reduce((a, d) => a + (Number(d.weight_kg) || 0) * (Number(d.reps) || 0), 0);
}
export function dropText(s) {
  const d = dropsOf(s);
  return (d.length ? ' → ' + d.map((x) => `${x.weight_kg}kg×${x.reps}`).join(' → ') + ' (drop set)' : '') + (s.type === 'warmup' ? ' (ısınma)' : s.type === 'failure' ? ' (tükenişe kadar)' : '');
}
export async function programDay(wd) {
  const days = await db.list('program_days', (d) => d.weekday === wd);
  const day = days[0] || null;
  if (!day) return { day: null, items: [] };
  const pes = (await db.list('program_exercises', (x) => x.day_id === day.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const exs = await db.list('exercises');
  const items = pes.map((pe) => ({ pe, exercise: exs.find((e) => e.id === pe.exercise_id) })).filter((x) => x.exercise);
  return { day, items };
}

// Bugünün kilosunu kaydet (aynı gün tekrar girilirse günceller) ve profildeki kiloyu da güncelle
export async function logWeightToday(v) {
  const d = today();
  const existing = (await db.list('body_logs', (r) => r.date === d))[0];
  await db.put('body_logs', { ...(existing || {}), date: d, weight_kg: v });
  const p = await db.getProfile();
  p.weight_kg = v;
  await db.saveProfile(p);
}

// ---------- Rutinler (Push day, Leg day gibi isimli antrenmanlar) ----------
export async function routineList() {
  const days = (await db.list('program_days', (d) => d.routine)).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'tr'));
  const pes = await db.list('program_exercises');
  const exs = await db.list('exercises');
  return days.map((day) => {
    const items = pes
      .filter((x) => x.day_id === day.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((pe) => ({ pe, exercise: exs.find((e) => e.id === pe.exercise_id) }))
      .filter((x) => x.exercise);
    return { day, items };
  });
}

export async function routineDay(id) {
  const day = id ? await db.get('program_days', id) : null;
  if (!day || day.deleted_at) return { day: null, items: [] };
  const pes = (await db.list('program_exercises', (x) => x.day_id === day.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const exs = await db.list('exercises');
  return { day, items: pes.map((pe) => ({ pe, exercise: exs.find((e) => e.id === pe.exercise_id) })).filter((x) => x.exercise) };
}

// O gün için seçilen rutin (seans)
export async function sessionFor(date) {
  return (await db.list('workout_sessions', (s) => s.date === date))[0] || null;
}

export async function weekProgram() {
  const out = [];
  for (let wd = 0; wd < 7; wd++) out.push(await programDay(wd));
  return out;
}

export const MUSCLES = ['Göğüs', 'Sırt', 'Omuz', 'Arka omuz', 'Trapez', 'Biceps', 'Triceps', 'Ön kol', 'Bacak', 'Ön bacak', 'Arka bacak', 'Kalça', 'Baldır', 'Karın', 'Kardiyo', 'Diğer'];
// Haftalık hacim için kas gruplarını ana gruplara topla
export const MUSCLE_GROUP = {
  Göğüs: 'Göğüs', Sırt: 'Sırt', Trapez: 'Sırt', Omuz: 'Omuz', 'Arka omuz': 'Omuz', Biceps: 'Kol', Triceps: 'Kol', 'Ön kol': 'Kol',
  Bacak: 'Bacak', 'Ön bacak': 'Bacak', 'Arka bacak': 'Bacak', Kalça: 'Bacak', Baldır: 'Bacak', Karın: 'Karın', Kardiyo: 'Kardiyo', Diğer: 'Diğer',
};

function presetFor(name) {
  const low = name.toLocaleLowerCase('tr-TR');
  return EXERCISE_PRESETS.find((p) => p[0].toLocaleLowerCase('tr-TR') === low) || null;
}

export function isCardio(ex) {
  return !!ex && (ex.kind === 'kardiyo' || ex.muscle === 'Kardiyo');
}

export async function findOrCreateExercise(name, { cardio } = {}) {
  const n = name.trim();
  const all = await db.list('exercises');
  const low = n.toLocaleLowerCase('tr-TR');
  const hit = all.find((e) => e.name.toLocaleLowerCase('tr-TR') === low);
  if (hit) {
    if (!hit.muscle) {
      const pr = presetFor(n);
      if (pr) return db.put('exercises', { ...hit, muscle: pr[1], kind: pr[1] === 'Kardiyo' ? 'kardiyo' : 'agirlik' });
    }
    return hit;
  }
  const pr = presetFor(n);
  const muscle = pr ? pr[1] : cardio ? 'Kardiyo' : '';
  return db.put('exercises', { name: n, muscle, kind: muscle === 'Kardiyo' || cardio ? 'kardiyo' : 'agirlik' });
}

// Kademeli yüklenme önerisi (çift ilerleme): hedef aralığın üst sınırına tüm setlerde ulaşıldıysa ağırlığı artır
export function parseRepRange(txt) {
  const m = String(txt || '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = String(txt || '').match(/^\s*(\d+)\s*$/);
  if (one) return [Number(one[1]), Number(one[1])];
  return null;
}

export function suggestNext(ex, pe, prev) {
  if (!prev || !prev.sets.length || isCardio(ex)) return null;
  const range = parseRepRange(pe?.target_reps);
  const work = prev.sets.filter((s) => s.weight_kg > 0 && s.reps > 0 && !isWarmup(s));
  if (!work.length) return null;
  const topW = Math.max(...work.map((s) => s.weight_kg));
  const top = work.filter((s) => s.weight_kg === topW);
  const minReps = Math.min(...top.map((s) => s.reps));
  const lower = /curl|raise|fly|extension|pushdown|kickback|lateral|calf|shrug/i.test(ex.name);
  const inc = topW < 20 || lower ? (topW < 10 ? 1 : 2) : 2.5;
  if (!range) return { weight_kg: topW, reps: Math.max(...top.map((s) => s.reps)), reason: 'Geçen seferki en iyi setini tekrarla ya da bir tekrar artırmayı dene.' };
  const [lo, hi] = range;
  if (minReps >= hi) return { weight_kg: Math.round((topW + inc) * 4) / 4, reps: lo, reason: `Geçen sefer tüm setlerde ${hi} tekrara ulaştın; ağırlığı artırma zamanı.` };
  if (minReps < lo) return { weight_kg: topW, reps: lo, reason: `Geçen sefer ${lo} tekrarın altına düştün; aynı ağırlıkta ${lo} tekrarı hedefle.` };
  return { weight_kg: topW, reps: Math.min(hi, minReps + 1), reason: `Aynı ağırlıkta tekrar sayısını artır; ${hi} tekrara ulaşınca ağırlık artacak.` };
}

// ---------- Su ----------
export async function waterDay(date = today()) {
  const logs = await db.list('water_logs', (w) => w.date === date);
  return { logs, total: logs.reduce((s, w) => s + (Number(w.ml) || 0), 0) };
}
export async function waterTarget(p) {
  const custom = await db.getSetting('water_target_ml');
  if (custom) return Number(custom);
  const w = Number(p?.weight_kg) || 75;
  return Math.round((w * 35) / 250) * 250;
}

// ---------- Vücut ölçüleri ----------
export const MEASURES = [
  ['waist_cm', 'Bel', 'cm'],
  ['chest_cm', 'Göğüs', 'cm'],
  ['arm_cm', 'Kol', 'cm'],
  ['shoulder_cm', 'Omuz', 'cm'],
  ['thigh_cm', 'Bacak', 'cm'],
  ['hip_cm', 'Kalça', 'cm'],
  ['neck_cm', 'Boyun', 'cm'],
  ['bodyfat_pct', 'Yağ oranı', '%'],
];

// ---------- Haftalık özet ----------
export async function weeklySummary(ws) {
  const we = addDays(ws, 6);
  const inWeek = (d) => d >= ws && d <= we;
  const p = await db.getProfile();
  const tg = targetsOf(p);
  const food = await db.list('food_logs', (f) => inWeek(f.date));
  const days = {};
  for (const f of food) {
    const d = (days[f.date] = days[f.date] || { kcal: 0, protein_g: 0 });
    d.kcal += Number(f.kcal) || 0;
    d.protein_g += Number(f.protein_g) || 0;
  }
  const dlist = Object.values(days);
  const avg = (k) => (dlist.length ? Math.round(dlist.reduce((s, d) => s + d[k], 0) / dlist.length) : 0);
  const sets = await db.list('workout_sets', (s) => s.done && inWeek(s.date) && !isWarmup(s));
  const exs = await db.list('exercises');
  const byMuscle = {};
  let volume = 0;
  let cardioMin = 0;
  for (const s of sets) {
    const ex = exs.find((e) => e.id === s.exercise_id);
    if (isCardio(ex)) {
      cardioMin += Number(s.duration_min) || 0;
      continue;
    }
    const g = MUSCLE_GROUP[ex?.muscle] || 'Diğer';
    byMuscle[g] = (byMuscle[g] || 0) + 1;
    volume += setVolume(s);
  }
  const sessions = new Set(sets.map((s) => s.date)).size;
  const weights = (await db.list('body_logs', (b) => b.date <= we)).sort((a, b) => a.date.localeCompare(b.date));
  const wIn = weights.filter((b) => inWeek(b.date));
  const before = weights.filter((b) => b.date < ws).pop();
  const wStart = before || wIn[0] || null;
  const wEnd = wIn[wIn.length - 1] || null;
  let doseDone = 0;
  let doseTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    if (d > today()) break;
    const due = await dueOn(d);
    doseDone += due.done;
    doseTotal += due.total;
  }
  const water = await db.list('water_logs', (w) => inWeek(w.date));
  const wDays = new Set(water.map((w) => w.date)).size;
  return {
    start: ws,
    end: we,
    nutrition: { logged_days: dlist.length, avg_kcal: avg('kcal'), avg_protein_g: avg('protein_g'), target_kcal: tg.kcal, target_protein_g: tg.protein_g },
    training: { sessions, sets: sets.length, volume_kg: Math.round(volume), sets_by_muscle: byMuscle, cardio_min: Math.round(cardioMin) },
    weight: { start: wStart ? wStart.weight_kg : null, end: wEnd ? wEnd.weight_kg : null, delta: wStart && wEnd ? round1(wEnd.weight_kg - wStart.weight_kg) : null },
    doses: { done: doseDone, total: doseTotal },
    water: { avg_ml: wDays ? Math.round(water.reduce((s, w) => s + (Number(w.ml) || 0), 0) / wDays) : 0 },
  };
}

// Son oturum (verilen tarihten önce) — egzersiz için setler
export async function previousSession(exerciseId, beforeDate) {
  const sets = await db.list('workout_sets', (s) => s.exercise_id === exerciseId && s.date < beforeDate && s.done);
  if (!sets.length) return null;
  const last = sets.reduce((m, s) => (s.date > m ? s.date : m), '');
  return { date: last, sets: sets.filter((s) => s.date === last).sort((a, b) => a.set_no - b.set_no) };
}

// ---------- Kür ----------
export async function cycleInfo(date = today()) {
  const cycles = await db.list('cycles');
  const c = cycles[cycles.length - 1] || null;
  if (!c || !c.start_date) return { cycle: c, week: null };
  const d = daysBetween(c.start_date, date); // 0 = ilk gün
  const end = c.end_date || (c.weeks ? addDays(c.start_date, c.weeks * 7 - 1) : null);
  const totalDays = end ? daysBetween(c.start_date, end) + 1 : null;
  const totalWeeks = totalDays ? Math.ceil(totalDays / 7) : c.weeks || null;
  const week = d >= 0 ? Math.floor(d / 7) + 1 : null;
  const dayNo = d >= 0 ? d + 1 : null;
  const left = end ? daysBetween(date, end) : null; // bugünden bitişe kalan gün (bugün hariç)
  const status = d < 0 ? 'baslamadi' : end && left < 0 ? 'bitti' : 'devam';
  return {
    cycle: c,
    week,
    dayNo,
    end,
    totalDays,
    totalWeeks,
    left,
    startsIn: d < 0 ? -d : 0,
    status,
    pct: totalDays && d >= 0 ? Math.min(100, Math.round((Math.min(dayNo, totalDays) / totalDays) * 100)) : 0,
    active: status === 'devam',
  };
}

// Bugün yapılması gerekenler: hap dozları (slot bazında) + enjeksiyonlar
export async function dueOn(date = today()) {
  const wd = weekday(date);
  const comps = await db.list('compounds', (c) => c.active !== false);
  const doseLogs = await db.list('dose_logs', (l) => l.date === date);
  const injLogs = await db.list('injection_logs', (l) => l.date === date);
  const pills = [];
  const injections = [];
  for (const c of comps) {
    const days = Array.isArray(c.days) && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(wd)) continue;
    if (c.kind === 'enjeksiyon') {
      const log = injLogs.find((l) => l.compound_id === c.id);
      injections.push({ compound: c, log, done: !!log });
    } else {
      const slots = Array.isArray(c.times) && c.times.length ? c.times : ['sabah'];
      for (const s of slots) {
        const log = doseLogs.find((l) => l.compound_id === c.id && l.slot === s);
        pills.push({ compound: c, slot: s, log, done: !!log });
      }
    }
  }
  const order = { sabah: 0, ogle: 1, aksam: 2 };
  pills.sort((a, b) => order[a.slot] - order[b.slot]);
  return { pills, injections, total: pills.length + injections.length, done: pills.filter((p) => p.done).length + injections.filter((i) => i.done).length };
}

export const doseText = (c) => [c.dose_amount != null && c.dose_amount !== '' ? String(c.dose_amount).replace('.', ',') : '', c.dose_unit || ''].join(' ').trim();

export const SITES = ['Sağ omuz', 'Sol omuz', 'Sağ kalça', 'Sol kalça', 'Sağ bacak (dış)', 'Sol bacak (dış)', 'Sağ göğüs', 'Sol göğüs', 'Diğer'];

export async function suggestSite() {
  const logs = (await db.list('injection_logs')).filter((l) => l.site).sort((a, b) => a.date.localeCompare(b.date));
  const lastUse = {};
  for (const l of logs) lastUse[l.site] = l.date;
  const rotation = SITES.slice(0, 6);
  let best = rotation[0];
  let bestDate = '9999';
  for (const s of rotation) {
    const d = lastUse[s] || '0000';
    if (d < bestDate) {
      best = s;
      bestDate = d;
    }
  }
  const last = logs[logs.length - 1] || null;
  return { site: best, last };
}

// ---------- Kan ----------
export async function labTests() {
  const tests = (await db.list('lab_tests')).sort((a, b) => b.date.localeCompare(a.date));
  const values = await db.list('lab_values');
  return tests.map((t) => ({ test: t, values: values.filter((v) => v.test_id === t.id) }));
}

// ---------- Coach için bağlam özeti ----------
export async function buildContext() {
  const t = today();
  const p = await db.getProfile();
  const age = p.birth_year ? new Date().getFullYear() - Number(p.birth_year) : null;
  const { totals, entries } = await dayNutrition(t);
  const week = await weekProgram();
  const recentSets = await db.list('workout_sets', (s) => s.done && s.date >= addDays(t, -21));
  const exs = await db.list('exercises');
  const exName = (id) => (exs.find((e) => e.id === id) || {}).name || '?';
  const byDate = {};
  for (const s of recentSets) {
    const k = s.date;
    byDate[k] = byDate[k] || {};
    const n = exName(s.exercise_id);
    byDate[k][n] = byDate[k][n] || [];
    const ex = exs.find((e) => e.id === s.exercise_id);
    byDate[k][n].push(isCardio(ex) ? `${s.duration_min || '?'} dk${s.distance_km ? ' ' + s.distance_km + ' km' : ''}` : `${s.weight_kg}kg×${s.reps}${s.rpe ? ' @RPE' + s.rpe : ''}${dropText(s)}`);
  }
  const cyc = await cycleInfo(t);
  const allComps = await db.list('compounds');
  const supps = allComps.filter((c) => c.category === 'destek');
  const comps = allComps.filter((c) => c.category !== 'destek');
  const due = await dueOn(t);
  const injLogs = (await db.list('injection_logs')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const tests = (await labTests()).slice(0, 3);
  const onCycle = !!cyc.active || comps.some((c) => c.active !== false);
  const weights = (await db.list('body_logs')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const plan = (await db.list('plan_items')).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const water = await waterDay(t);
  const wTarget = await waterTarget(p);
  const measures = (await db.list('body_measurements')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const notes = await db.list('coach_notes');
  const thisWeek = await weeklySummary(weekStartOf(t));
  const lastWeek = await weeklySummary(addDays(weekStartOf(t), -7));
  // Yeni özetler: kilo eğilimi, gerçek harcama, kas bölgeleri, tansiyon, aylık rapor, stok, sonraki tahlil
  const trAll = weightTrend(await db.list('body_logs'));
  const trLast = trAll[trAll.length - 1];
  const adapt = await adaptiveExpenditure(21, t);
  const regWeek = await regionSets(weekStartOf(t), addDays(weekStartOf(t), 6));
  const vitals = (await db.list('vitals')).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 10);
  const mThis = await monthlyReport(t.slice(0, 7));
  const pm = Number(t.slice(5, 7));
  const mPrev = await monthlyReport(pm === 1 ? `${Number(t.slice(0, 4)) - 1}-12` : `${t.slice(0, 4)}-${String(pm - 1).padStart(2, '0')}`);
  const compactMonth = (r) => ({ ay: r.ym, antrenman: r.training.sessions, calisma_seti: r.training.sets, hacim_kg: r.training.volume_kg, rekorlar: r.training.prs.map((x) => `${x.ex}: ${x.labels.join(', ')}`).slice(-10), kilo_egilimi: r.weight, beslenme: r.nutrition, doz_uyumu: r.doses, tansiyon_ort: r.vitals });
  const stocks = [];
  for (const c of allComps.filter((x) => x.active !== false)) {
    const si = await stockInfo(c);
    if (si) stocks.push(`${c.name}: ${si.left} ${si.unit} kaldı${si.daysLeft != null ? `, yaklaşık ${si.daysLeft} gün` : ''}`);
  }
  const nextLab = await db.getSetting('next_lab_date');

  return {
    bugun: `${t} (${WD_LONG[weekday(t)]})`,
    profil: {
      ad: p.name || null,
      cinsiyet: p.sex || 'erkek',
      yas: age,
      boy_cm: p.height_cm || null,
      kilo_kg: p.weight_kg || null,
      donem: p.phase || 'koruma',
      aktivite_katsayisi: p.activity || null,
      gunluk_harcama_tahmini: (() => {
        const e = energyBreakdown(p);
        return e ? { toplam_kcal: e.tdee, bazal: e.bmr, gunluk_yasam: e.life, adim: e.steps, antrenman: e.train, kardiyo: e.cardio, seviye: e.label, detay: e.act } : null;
      })(),
      hedef: p.goal || null,
      sakatliklar: p.injuries || null,
      notlar: p.notes || null,
    },
    gunluk_hedefler: targetsOf(p),
    bugun_beslenme: {
      toplam: totals,
      kayitlar: entries.map((e) => `${e.meal}: ${e.name} ${e.grams}g (${e.kcal} kcal)`),
    },
    beslenme_plani: plan.map((x) => `${x.time || ''} ${x.name}: ${x.items || ''} (${x.kcal || '?'} kcal, P${x.protein_g || '?'} K${x.carb_g || '?'} Y${x.fat_g || '?'})`),
    rutinler: (await routineList()).map((r) => ({ ad: r.day.title, egzersizler: r.items.map((x) => `${x.exercise.name} ${x.pe.target_sets || '?'}x${x.pe.target_reps || '?'}`) })),
    son_seanslar: (await db.list('workout_sessions', (x) => x.date >= addDays(t, -21))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10).map((x) => `${x.date}: ${x.routine_title || ''}`),
    haftalik_program: week.map((w, i) => ({
      gun: WD_LONG[i],
      baslik: w.day ? (w.day.rest ? 'Dinlenme' : w.day.title || '') : 'Belirlenmedi',
      egzersizler: w.items.map((x) => `${x.exercise.name} ${x.pe.target_sets || '?'}x${x.pe.target_reps || '?'}`),
    })),
    son_antrenmanlar: Object.keys(byDate)
      .sort()
      .reverse()
      .slice(0, 8)
      .map((d) => ({ tarih: d, egzersizler: byDate[d] })),
    kur: {
      baslangic: cyc.cycle?.start_date || null,
      toplam_hafta: cyc.totalWeeks || null,
      bitis: cyc.end || null,
      bugun_kacinci_gun: cyc.dayNo || null,
      kalan_gun: cyc.left != null && cyc.left >= 0 ? cyc.left : null,
      durum: cyc.status || null,
      su_anki_hafta: cyc.week,
      notlar: cyc.cycle?.notes || null,
      maddeler: comps
        .filter((c) => c.active !== false)
        .map((c) => ({
          ad: c.name,
          tur: c.kind,
          doz: doseText(c) || null,
          gunler: (c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6]).map((d) => WD_LONG[d]),
          saatler: c.kind === 'enjeksiyon' ? null : c.times || ['sabah'],
          not: c.notes || null,
        })),
      bugun: due.pills.filter((x) => x.compound.category !== 'destek').map((x) => `${x.compound.name} (${x.slot}): ${x.done ? 'alındı' : 'alınmadı'}`).concat(due.injections.map((x) => `${x.compound.name} enjeksiyon: ${x.done ? 'yapıldı' + (x.log?.site ? ' - ' + x.log.site : '') : 'yapılmadı'}`)),
      son_enjeksiyonlar: injLogs.filter((l) => comps.some((c) => c.id === l.compound_id)).map((l) => `${l.date} ${(comps.find((c) => c.id === l.compound_id) || {}).name || ''} ${l.site || ''}`.trim()),
    },
    koruyucu_ilac_ve_vitaminler: {
      kullanilanlar: supps
        .filter((c) => c.active !== false)
        .map((c) => ({
          ad: c.name,
          grup: c.group || null,
          marka: c.brand || null,
          urun: c.product || null,
          icerik_miktar: c.strength || null,
          bicim: c.form || null,
          bir_seferde: doseText(c) || null,
          gunler: (c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6]).map((d) => WD_LONG[d]),
          saatler: c.kind === 'enjeksiyon' ? null : c.times || ['sabah'],
          not: c.notes || null,
        })),
      birakilanlar: supps.filter((c) => c.active === false).map((c) => c.name),
      bugun: due.pills.filter((x) => x.compound.category === 'destek').map((x) => `${x.compound.name} (${x.slot}): ${x.done ? 'alındı' : 'alınmadı'}`),
    },
    son_tahliller: tests.map(({ test, values }) => ({
      tarih: test.date,
      laboratuvar: test.lab_name || null,
      degerler: values.map((v) => {
        const c = classify(v, { onCycle });
        const ref = [v.ref_low ?? '', v.ref_high ?? ''].join('–');
        return `${v.name}: ${v.value} ${v.unit || ''} (ref ${ref}) ${c.st === 'ok' ? '' : c.st === 'high' ? 'YÜKSEK' : 'DÜŞÜK'}`.trim();
      }),
    })),
    kilo_gecmisi: weights.map((w) => `${w.date}: ${w.weight_kg} kg`),
    bugun_su: `${water.total} / ${wTarget} ml`,
    vucut_olculeri: measures.map((m) => ({ tarih: m.date, ...Object.fromEntries(MEASURES.filter(([k]) => m[k] != null).map(([k, l, u]) => [l, `${m[k]} ${u}`])) })),
    bu_hafta_ozet: thisWeek,
    gecen_hafta_ozet: lastWeek,
    kilo_egilimi: trLast ? { egilim_kg: trLast.trend, son_tarti: trLast.weight, haftalik_degisim_kg: trendRate(trAll, 14) } : null,
    gercek_harcama_tahmini: adapt.ready ? { kcal: adapt.tdee, ort_alinan_kcal: adapt.avg_intake, haftalik_kilo_degisimi: adapt.rate_kg_week, guven: adapt.confidence, gun: adapt.days } : `yetersiz veri (${adapt.logged_days} kayıtlı gün, ${adapt.weigh_ins} tartı)`,
    bu_hafta_kas_bolgesi_setleri: Object.fromEntries(Object.entries(regWeek).filter(([, v]) => v > 0).map(([k, v]) => [REGIONS[k].label, v])),
    tansiyon_nabiz_son: vitals.map((v) => `${v.date}${v.time ? ' ' + v.time : ''}: ${v.sys && v.dia ? v.sys + '/' + v.dia + ' mmHg' : ''}${v.hr ? ' nabız ' + v.hr : ''}`),
    aylik_ozet: { bu_ay: compactMonth(mThis), gecen_ay: compactMonth(mPrev) },
    stok_durumu: stocks,
    sonraki_tahlil: nextLab || null,
    danisman_notlari: notes.map((n) => ({ id: n.id, not: n.text })),
  };
}

// Harcamadan dönem hedefine göre kalori ve makrolar
export function macrosFor(p, tdee) {
  const w = Number(p.weight_kg) || 75;
  const phase = p.phase || 'koruma';
  const kcal = Math.round((tdee + (phase === 'bulk' ? 300 : phase === 'cut' ? -500 : 0)) / 10) * 10;
  const protein = Math.round(w * (phase === 'cut' ? 2.2 : 2.0));
  const fat = Math.round(Math.max(w * 0.9, (kcal * 0.25) / 9));
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carb, fat, tdee: Math.round(tdee) };
}

// ---------- Enerji harcaması (detaylı aktivite) ----------
// Bazal metabolizma (Mifflin-St Jeor) × gün içi yaşam katsayısı + adım + antrenman + kardiyo (MET ile, net)
export const JOBS = [
  ['masa', 'Masa başı', 'Ofis, ders, uzun süre oturarak', 1.2, 3000],
  ['ayakta', 'Ayakta', 'Satış, öğretmenlik, laboratuvar; gün boyu ayakta', 1.3, 5000],
  ['hareketli', 'Hareketli', 'Garson, kurye, depo; sürekli yürüyerek', 1.42, 8000],
  ['agir', 'Ağır iş', 'İnşaat, taşımacılık, tarım; ağır fiziksel iş', 1.55, 9000],
];
export const INTENSITY = {
  agirlik: [['hafif', 'Hafif', 3.5], ['orta', 'Orta', 5], ['yogun', 'Yoğun', 6]],
  kardiyo: [['hafif', 'Yürüyüş', 3.8], ['orta', 'Orta tempo', 7], ['yogun', 'Yüksek', 10]],
};
const OLD_TO_DAYS = { '1.2': 0, '1.375': 2, '1.55': 4, '1.725': 6, '1.9': 6 };

// Kayıtlı detay yoksa eski "aktivite seviyesi"nden makul bir başlangıç çıkar
export function activityOf(p) {
  if (p.act) return { job: 'masa', steps: null, train_days: 0, train_min: 60, train_int: 'orta', cardio_min: 0, cardio_int: 'orta', ...p.act };
  // Eski tek seçimli seviyeden geçenler için hesap eskisine yakın çıksın diye adım tahmini de eklenir
  const a = String(p.activity || '1.55');
  const STEPS = { '1.2': null, '1.375': 6000, '1.55': 8000, '1.725': 10000, '1.9': 12000 };
  return { job: a === '1.9' ? 'agir' : 'masa', steps: STEPS[a] ?? null, train_days: OLD_TO_DAYS[a] ?? 4, train_min: 60, train_int: 'orta', cardio_min: 0, cardio_int: 'orta' };
}

export function energyBreakdown(p) {
  const w = Number(p.weight_kg);
  const h = Number(p.height_cm);
  const age = p.birth_year ? new Date().getFullYear() - Number(p.birth_year) : null;
  if (!w || !h || !age) return null;
  const a = activityOf(p);
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === 'kadin' ? -161 : 5);
  const job = JOBS.find((j) => j[0] === a.job) || JOBS[0];
  const life = bmr * job[3];
  // işin içerdiği adımların üstündeki her adım ≈ 0,0005 kcal/kg
  const steps = a.steps ? Math.max(0, Number(a.steps) - job[4]) * 0.0005 * w : 0;
  const met = (list, k) => (list.find((x) => x[0] === k) || list[1])[2];
  const train = ((Number(a.train_days) || 0) * (Number(a.train_min) || 0) * (met(INTENSITY.agirlik, a.train_int) - 1) * w) / 60 / 7;
  const cardio = ((Number(a.cardio_min) || 0) * (met(INTENSITY.kardiyo, a.cardio_int) - 1) * w) / 60 / 7;
  const tdee = life + steps + train + cardio;
  const factor = tdee / bmr;
  const label = factor < 1.3 ? 'Hareketsiz' : factor < 1.45 ? 'Hafif aktif' : factor < 1.62 ? 'Orta aktif' : factor < 1.8 ? 'Çok aktif' : 'Aşırı aktif';
  return { bmr: Math.round(bmr), life: Math.round(life - bmr), steps: Math.round(steps), train: Math.round(train), cardio: Math.round(cardio), tdee: Math.round(tdee), factor: Math.round(factor * 1000) / 1000, label, act: a };
}


// ---------- Rekorlar ----------
const trNum = (v) => String(round1(v)).replace('.', ',');
export const e1rmOf = (s) => (s && s.reps > 0 && s.weight_kg > 0 ? s.weight_kg * (1 + Math.min(s.reps, 12) / 30) : 0);
// Bir set, daha önceki tüm setlere göre rekor mu? (ısınmalar ve ilk kayıt sayılmaz)
export async function prsFor(set, exerciseId) {
  if (!set || isWarmup(set) || !(set.weight_kg > 0) || !(set.reps > 0)) return [];
  const hist = await db.list('workout_sets', (x) => x.exercise_id === exerciseId && x.done && !isWarmup(x) && x.id !== set.id && (x.date < set.date || (x.date === set.date && x.set_no < set.set_no)));
  if (!hist.length) return [];
  const out = [];
  const maxW = Math.max(...hist.map((x) => x.weight_kg || 0));
  const maxE = Math.max(...hist.map(e1rmOf));
  const maxV = Math.max(...hist.map((x) => (x.weight_kg || 0) * (x.reps || 0)));
  if (set.weight_kg > maxW) out.push({ k: 'agir', label: `En ağır: ${trNum(set.weight_kg)} kg` });
  if (e1rmOf(set) > maxE + 0.05) out.push({ k: '1rm', label: `Tahmini 1RM: ${trNum(e1rmOf(set))} kg` });
  if (set.weight_kg * set.reps > maxV && !out.length) out.push({ k: 'hacim', label: `En yüksek set hacmi: ${Math.round(set.weight_kg * set.reps)} kg` });
  return out;
}

// ---------- Kas bölgeleri ----------
// Tarih aralığında bölge başına set: birincil 1, ikincil 0,5 (ısınma ve kardiyo hariç)
export async function regionSets(from, to) {
  const sets = await db.list('workout_sets', (s) => s.done && s.date >= from && s.date <= to && !isWarmup(s));
  const exs = await db.list('exercises');
  const out = {};
  for (const k of Object.keys(REGIONS)) out[k] = 0;
  for (const s of sets) {
    const ex = exs.find((e) => e.id === s.exercise_id);
    if (!ex || isCardio(ex)) continue;
    const m = musclesOf(ex);
    for (const r of m.primary) out[r] = (out[r] || 0) + 1;
    for (const r of m.secondary) out[r] = (out[r] || 0) + 0.5;
  }
  return out;
}

// ---------- Kilo trendi ----------
// Günlük tartılar suyla, tuzla dalgalanır; üstel ortalama (günde ~%10 ağırlık) gerçek eğilimi gösterir
export function weightTrend(logs) {
  const ws = logs.filter((w) => w.weight_kg > 0).slice().sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  let tr = null;
  let last = null;
  for (const w of ws) {
    if (tr == null) tr = w.weight_kg;
    else {
      const gap = Math.max(1, daysBetween(last, w.date));
      const a = 1 - Math.pow(0.9, gap);
      tr = tr + a * (w.weight_kg - tr);
    }
    last = w.date;
    out.push({ date: w.date, weight: w.weight_kg, trend: Math.round(tr * 100) / 100 });
  }
  return out;
}
// Son N gündeki trend değişimi (kg/hafta)
export function trendRate(trend, days = 14) {
  if (trend.length < 2) return null;
  const end = trend[trend.length - 1];
  const startDate = addDays(end.date, -days);
  const start = trend.filter((x) => x.date <= startDate).pop() || trend[0];
  const span = daysBetween(start.date, end.date);
  if (span < 6) return null;
  return Math.round(((end.trend - start.trend) / span) * 7 * 100) / 100;
}

// ---------- Gerçek harcama (yediklerin + kilo trendinden) ----------
// harcama ≈ ortalama alınan kcal − (trend kilo değişimi × 7700 / gün)
export async function adaptiveExpenditure(days = 21, end = today()) {
  const start = addDays(end, -(days - 1));
  const food = await db.list('food_logs', (f) => f.date >= start && f.date <= end);
  const byDay = {};
  for (const f of food) byDay[f.date] = (byDay[f.date] || 0) + (Number(f.kcal) || 0);
  // çok düşük kayıtlı günler (ör. sadece bir kahve) eksik kayıt sayılır
  const logged = Object.entries(byDay).filter(([, k]) => k >= 800);
  const weights = await db.list('body_logs', (b) => b.date >= addDays(start, -10) && b.date <= end);
  const tr = weightTrend(weights);
  const inWin = tr.filter((x) => x.date >= start);
  const res = { days, logged_days: logged.length, weigh_ins: inWin.length, ready: false };
  if (logged.length < 10 || inWin.length < 5) return res;
  const avgIn = logged.reduce((a, [, k]) => a + k, 0) / logged.length;
  const first = tr.filter((x) => x.date <= start).pop() || inWin[0];
  const last = inWin[inWin.length - 1];
  const span = Math.max(7, daysBetween(first.date, last.date));
  const dKg = last.trend - first.trend;
  const tdee = avgIn - (dKg * 7700) / span;
  const conf = logged.length >= days * 0.85 && inWin.length >= days * 0.5 ? 'yüksek' : logged.length >= days * 0.6 ? 'orta' : 'düşük';
  return { ...res, ready: true, avg_intake: Math.round(avgIn), trend_change_kg: Math.round(dKg * 100) / 100, rate_kg_week: Math.round((dKg / span) * 7 * 100) / 100, tdee: Math.round(tdee / 10) * 10, confidence: conf };
}

// ---------- Tansiyon / nabız ----------
// ACC/AHA 2017 sınıflaması (bilgi amaçlı)
export function bpCategory(sys, dia) {
  if (!sys || !dia) return null;
  if (sys > 180 || dia > 120) return { k: 'kriz', label: 'Çok yüksek', warn: true };
  if (sys >= 140 || dia >= 90) return { k: 'evre2', label: 'Yüksek (evre 2)', warn: true };
  if (sys >= 130 || dia >= 80) return { k: 'evre1', label: 'Yüksek (evre 1)', warn: true };
  if (sys >= 120) return { k: 'yuksek', label: 'Normalin üstü', warn: false };
  return { k: 'normal', label: 'Normal', warn: false };
}

// ---------- Stok ----------
// compound.stock = { amount, date } (doz birimiyle). Tarihten bu yana işaretlenen dozlar düşülür.
export async function stockInfo(c) {
  const st = c && c.stock;
  if (!st || !(Number(st.amount) >= 0) || !st.date) return null;
  const per = Number(c.dose_amount) || 1;
  const store = c.kind === 'enjeksiyon' ? 'injection_logs' : 'dose_logs';
  const used = (await db.list(store, (l) => l.compound_id === c.id && (st.at ? (l.created_at || '') > st.at : l.date >= st.date))).length * per;
  const left = Math.max(0, Number(st.amount) - used);
  const days = Array.isArray(c.days) && c.days.length ? c.days.length : 7;
  const slots = c.kind === 'enjeksiyon' ? 1 : (Array.isArray(c.times) && c.times.length ? c.times.length : 1);
  const perDay = (days / 7) * slots * per;
  const daysLeft = perDay > 0 ? Math.floor(left / perDay) : null;
  return { left: Math.round(left * 100) / 100, unit: c.dose_unit || '', daysLeft, low: daysLeft != null && daysLeft <= 7 };
}

// ---------- Aylık rapor ----------
export async function monthlyReport(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const endD = m === 12 ? `${y}-12-31` : addDays(`${y}-${String(m + 1).padStart(2, '0')}-01`, -1);
  const inM = (d) => d >= start && d <= endD;
  const sets = await db.list('workout_sets', (s) => s.done && inM(s.date));
  const exs = await db.list('exercises');
  const work = sets.filter((s) => !isWarmup(s) && !isCardio(exs.find((e) => e.id === s.exercise_id)));
  const cardio = sets.filter((s) => isCardio(exs.find((e) => e.id === s.exercise_id)));
  const sessions = new Set(sets.map((s) => s.date)).size;
  const volume = work.reduce((a, s) => a + setVolume(s), 0);
  // Rekorlar: tüm geçmişi bir kez tarayıp her hareket için o ana kadarki en iyileri takip et
  const prs = [];
  const all = (await db.list('workout_sets', (x) => x.done && !isWarmup(x) && x.weight_kg > 0 && x.reps > 0 && x.date <= endD)).sort((a, b) => a.date.localeCompare(b.date) || a.set_no - b.set_no);
  const best = {};
  for (const x of all) {
    const b = best[x.exercise_id];
    const e = e1rmOf(x);
    if (b && x.date >= start) {
      const labels = [];
      if (x.weight_kg > b.w) labels.push(`En ağır: ${trNum(x.weight_kg)} kg`);
      if (e > b.e + 0.05) labels.push(`Tahmini 1RM: ${trNum(e)} kg`);
      if (labels.length) prs.push({ ex: (exs.find((z) => z.id === x.exercise_id) || {}).name || 'Egzersiz', date: x.date, labels });
    }
    best[x.exercise_id] = { w: Math.max(b ? b.w : 0, x.weight_kg), e: Math.max(b ? b.e : 0, e) };
  }
  const regions = await regionSets(start, endD);
  const food = await db.list('food_logs', (f) => inM(f.date));
  const byDay = {};
  for (const f of food) {
    const d = (byDay[f.date] = byDay[f.date] || { k: 0, p: 0 });
    d.k += Number(f.kcal) || 0;
    d.p += Number(f.protein_g) || 0;
  }
  const fd = Object.values(byDay).filter((d) => d.k >= 800);
  const weights = weightTrend(await db.list('body_logs', (b) => b.date <= endD));
  const wIn = weights.filter((w) => inM(w.date));
  const wBefore = weights.filter((w) => w.date < start).pop();
  const w0 = wBefore || wIn[0];
  const w1 = wIn[wIn.length - 1];
  let doseDone = 0;
  let doseTotal = 0;
  for (let d = start; d <= endD && d <= today(); d = addDays(d, 1)) {
    const due = await dueOn(d);
    doseDone += due.done;
    doseTotal += due.total;
  }
  const vit = await db.list('vitals', (v) => inM(v.date));
  const avgV = (k) => {
    const xs = vit.map((v) => Number(v[k])).filter((x) => x > 0);
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  };
  return {
    ym, start, end: endD,
    training: { sessions, sets: work.length, volume_kg: Math.round(volume), cardio_min: Math.round(cardio.reduce((a, s) => a + (Number(s.duration_min) || 0), 0)), prs, regions },
    nutrition: { logged_days: fd.length, avg_kcal: fd.length ? Math.round(fd.reduce((a, d) => a + d.k, 0) / fd.length) : null, avg_protein: fd.length ? Math.round(fd.reduce((a, d) => a + d.p, 0) / fd.length) : null },
    weight: { start: w0 ? w0.trend : null, end: w1 ? w1.trend : null, change: w0 && w1 ? Math.round((w1.trend - w0.trend) * 10) / 10 : null },
    doses: { done: doseDone, total: doseTotal },
    vitals: { n: vit.length, sys: avgV('sys'), dia: avgV('dia'), hr: avgV('hr') },
  };
}
