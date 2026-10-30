// Sayfaların ve Coach'un ortak kullandığı veri yardımcıları
import * as db from './db.js';
import { today, weekday, addDays, daysBetween, WD_LONG, round1, weekStart as weekStartOf } from './util.js';
import { classify } from './data/labs.js';
import { EXERCISE_PRESETS } from './data/exercises.js';

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
export const dropsOf = (s) => (Array.isArray(s && s.drops) ? s.drops.filter((d) => d && (d.weight_kg != null || d.reps != null)) : []);
export function setVolume(s) {
  return (Number(s.weight_kg) || 0) * (Number(s.reps) || 0) + dropsOf(s).reduce((a, d) => a + (Number(d.weight_kg) || 0) * (Number(d.reps) || 0), 0);
}
export function dropText(s) {
  const d = dropsOf(s);
  return d.length ? ' → ' + d.map((x) => `${x.weight_kg}kg×${x.reps}`).join(' → ') + ' (drop set)' : '';
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
  const work = prev.sets.filter((s) => s.weight_kg > 0 && s.reps > 0);
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
  const sets = await db.list('workout_sets', (s) => s.done && inWeek(s.date));
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
    danisman_notlari: notes.map((n) => ({ id: n.id, not: n.text })),
  };
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
  const a = String(p.activity || '1.55');
  return { job: a === '1.9' ? 'agir' : 'masa', steps: null, train_days: OLD_TO_DAYS[a] ?? 4, train_min: 60, train_int: 'orta', cardio_min: 0, cardio_int: 'orta' };
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
