// Sayfaların ve Danışman'ın ortak kullandığı veri yardımcıları
import * as db from './db.js';
import { today, weekday, addDays, daysBetween, WD_LONG, round1 } from './util.js';
import { classify } from './data/labs.js';

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
export async function programDay(wd) {
  const days = await db.list('program_days', (d) => d.weekday === wd);
  const day = days[0] || null;
  if (!day) return { day: null, items: [] };
  const pes = (await db.list('program_exercises', (x) => x.day_id === day.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const exs = await db.list('exercises');
  const items = pes.map((pe) => ({ pe, exercise: exs.find((e) => e.id === pe.exercise_id) })).filter((x) => x.exercise);
  return { day, items };
}

export async function weekProgram() {
  const out = [];
  for (let wd = 0; wd < 7; wd++) out.push(await programDay(wd));
  return out;
}

export async function findOrCreateExercise(name) {
  const n = name.trim();
  const all = await db.list('exercises');
  const low = n.toLocaleLowerCase('tr-TR');
  const hit = all.find((e) => e.name.toLocaleLowerCase('tr-TR') === low);
  if (hit) return hit;
  return db.put('exercises', { name: n, muscle: '' });
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
  const d = daysBetween(c.start_date, date);
  const week = d >= 0 ? Math.floor(d / 7) + 1 : null;
  const end = c.weeks ? addDays(c.start_date, c.weeks * 7 - 1) : null;
  return { cycle: c, week, end, active: d >= 0 && (!c.weeks || week <= c.weeks) };
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

// ---------- Danışman için bağlam özeti ----------
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
    byDate[k][n].push(`${s.weight_kg}kg×${s.reps}`);
  }
  const cyc = await cycleInfo(t);
  const comps = await db.list('compounds');
  const due = await dueOn(t);
  const injLogs = (await db.list('injection_logs')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const tests = (await labTests()).slice(0, 3);
  const onCycle = !!cyc.active || comps.some((c) => c.active !== false);
  const weights = (await db.list('body_logs')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const plan = (await db.list('plan_items')).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

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
      toplam_hafta: cyc.cycle?.weeks || null,
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
      bugun: due.pills.map((x) => `${x.compound.name} (${x.slot}): ${x.done ? 'alındı' : 'alınmadı'}`).concat(due.injections.map((x) => `${x.compound.name} enjeksiyon: ${x.done ? 'yapıldı' + (x.log?.site ? ' - ' + x.log.site : '') : 'yapılmadı'}`)),
      son_enjeksiyonlar: injLogs.map((l) => `${l.date} ${(comps.find((c) => c.id === l.compound_id) || {}).name || ''} ${l.site || ''}`.trim()),
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
  };
}
