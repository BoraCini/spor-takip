import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, relDay, icon, openSheet, confirmSheet, round1 } from '../util.js';
import { refresh, go } from '../app.js';
import { dayNutrition, targetsOf, MEALS, mealLabel, waterDay, waterTarget } from '../context.js';
import { scanBarcode, foodFromBarcode } from '../barcode.js';
import { searchFoods, nutrientsFor, findFood } from '../data/foods.js';

let state = { tab: 'log', date: today() };

const pct = (v, t) => (t ? Math.min(100, Math.round((v / t) * 100)) : 0);

function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'kahvalti';
  if (h < 15) return 'ogle';
  if (h < 17) return 'ara';
  if (h < 22) return 'aksam';
  return 'ara';
}

export async function render(root, params) {
  if (params.tab === 'plan' || params.tab === 'log') state.tab = params.tab;
  const p = await db.getProfile();
  const tg = targetsOf(p);
  const { entries, totals } = await dayNutrition(state.date);
  const plan = (await db.list('plan_items')).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const isLog = state.tab === 'log';
  const water = await waterDay(state.date);
  const wTarget = await waterTarget(p);
  const yEntries = isLog ? (await dayNutrition(addDays(state.date, -1))).entries : [];
  const phaseLbl = { bulk: 'Bulk', cut: 'Cut', koruma: 'Koruma' }[p.phase || 'koruma'];

  let body = '';
  if (isLog) {
    const left = tg.kcal ? tg.kcal - totals.kcal : null;
    body += `
      <section class="card" aria-label="Günün özeti">
        ${
          tg.kcal
            ? `<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px">
                <div style="display:flex;flex-direction:column">
                  <span class="big-num ${left < 0 ? 'warn' : ''}">${fmt(Math.abs(left))}</span>
                  <span class="small muted">${left < 0 ? 'kcal hedefin üstünde' : 'kcal kaldı'}</span>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end">
                  <span class="num" style="font-size:15px;font-weight:600">${fmt(totals.kcal)} / ${fmt(tg.kcal)}</span>
                  <span class="small muted">yenen / hedef</span>
                </div>
              </div>`
            : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <div style="display:flex;flex-direction:column"><span class="big-num">${fmt(totals.kcal)}</span><span class="small muted">kcal yenen</span></div>
                <a class="pill" href="#/profil" style="display:flex;align-items:center">Hedef belirle</a>
              </div>`
        }
        <div class="macros" style="margin-top:12px">
          ${[
            ['Protein', totals.protein_g, tg.protein_g],
            ['Karbonhidrat', totals.carb_g, tg.carb_g],
            ['Yağ', totals.fat_g, tg.fat_g],
          ]
            .map(
              ([l, v, t]) => `<div class="macro"><span class="lbl">${l}</span><span class="val">${fmt(v)}${t ? ' / ' + fmt(t) : ''} g</span>
              <span class="bar ${t && v > t * 1.1 ? 'over' : ''}"><span style="width:${t ? pct(v, t) : 0}%"></span></span></div>`
            )
            .join('')}
        </div>
      </section>
      <section class="card" aria-label="Su" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <span style="display:flex;align-items:center;gap:6px;font-size:16px;font-weight:600"><span style="color:var(--accent)">${icon.drop}</span>Su</span>
          <span class="num" style="font-size:15px;font-weight:600">${fmt(water.total / 1000, 2)} / ${fmt(wTarget / 1000, 2)} L</span>
        </div>
        <span class="bar thick"><span style="width:${pct(water.total, wTarget)}%"></span></span>
        <div class="btn-row">
          <button type="button" class="btn" data-act="water" data-ml="250">+250 ml</button>
          <button type="button" class="btn" data-act="water" data-ml="500">+500 ml</button>
          <button type="button" class="btn" data-act="water-undo" aria-label="Son su kaydını geri al" ${water.logs.length ? '' : 'disabled'} style="flex:0 0 56px">−</button>
        </div>
      </section>`;

    for (const [mk, ml] of MEALS) {
      const items = entries.filter((e) => e.meal === mk);
      const kcal = items.reduce((s, e) => s + (e.kcal || 0), 0);
      body += `
        <div class="sec"><h2>${ml}${items.length ? ` · <span class="num">${fmt(kcal)}</span> kcal` : ''}</h2>
          <button type="button" class="link" data-act="add" data-meal="${mk}">+ Ekle</button></div>
        <section class="card flush" aria-label="${ml}">
          ${
            items.length
              ? items
                  .map(
                    (e) => `<button type="button" class="row" data-act="edit-entry" data-id="${e.id}">
                      <span class="row-main"><span class="row-title normal">${esc(e.name)}${e.estimated ? '<span class="est">tahmini</span>' : ''}</span>
                      <span class="row-sub">${e.grams ? fmt(e.grams) + ' g · ' : ''}P ${fmt(e.protein_g)} · K ${fmt(e.carb_g)} · Y ${fmt(e.fat_g)}</span></span>
                      <span class="row-end">${fmt(e.kcal)}</span></button>`
                  )
                  .join('')
              : (() => {
                  const y = yEntries.filter((e) => e.meal === mk && !e.plan_item_id);
                  return y.length
                    ? `<div class="empty" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 0">Henüz bir şey yok
                        <button type="button" class="pill" data-act="copy-meal" data-meal="${mk}" style="display:flex;align-items:center;gap:6px">${icon.copy}<span>Dünkü ${({ kahvalti: 'kahvaltıyı', ogle: 'öğle yemeğini', aksam: 'akşam yemeğini', ara: 'ara öğünü' })[mk]} ekle (${y.length})</span></button></div>`
                    : `<div class="empty">Henüz bir şey yok</div>`;
                })()
          }
        </section>`;
    }

    body += `
      <div class="sec"><h2>Mikro besinler</h2></div>
      <section class="card flush" aria-label="Mikro besinler">
        ${[
          ['Lif', totals.fiber_g, tg.fiber_g, 'g'],
          ['Sodyum', totals.sodium_mg, tg.sodium_mg, 'mg', true],
          ['Potasyum', totals.potassium_mg, tg.potassium_mg, 'mg'],
        ]
          .map(
            ([l, v, t, u, isMax]) => `<div class="kv" style="padding:0">
              <span class="k">${l}</span><span class="v ${isMax && v > t ? 'warn' : ''}">${fmt(v)} / ${fmt(t)} ${u}${isMax ? ' (üst sınır)' : ''}</span></div>`
          )
          .join('')}
      </section>
      <p class="note">Kalori ve makrolar besin veritabanından hesaplanır; "tahmini" işaretli olanlar Danışman'ın tahminidir. Mikro besinler yalnızca lif, sodyum ve potasyum için izlenir.</p>`;
  } else {
    const pt = plan.reduce(
      (a, x) => ({ kcal: a.kcal + (Number(x.kcal) || 0), p: a.p + (Number(x.protein_g) || 0), c: a.c + (Number(x.carb_g) || 0), f: a.f + (Number(x.fat_g) || 0) }),
      { kcal: 0, p: 0, c: 0, f: 0 }
    );
    const doneIds = new Set(entries.filter((e) => e.plan_item_id).map((e) => e.plan_item_id));
    body += `
      <section class="card" aria-label="Plan özeti" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span style="font-size:17px;font-weight:600">${esc(phaseLbl)} planı</span>
          <span class="small muted num">${fmt(pt.kcal)} kcal · P ${fmt(pt.p)} · K ${fmt(pt.c)} · Y ${fmt(pt.f)}</span>
          ${tg.kcal ? `<span class="small muted num">Hedef: ${fmt(tg.kcal)} kcal · P ${fmt(tg.protein_g)} · K ${fmt(tg.carb_g)} · Y ${fmt(tg.fat_g)}</span>` : ''}
        </div>
        <button type="button" class="pill" data-act="plan-add">Öğün ekle</button>
      </section>
      <div class="sec"><h2>${state.date === today() ? 'Bugünkü öğünler' : relDay(state.date)}</h2><span class="meta">${doneIds.size} / ${plan.length} öğün</span></div>
      <section class="card flush" aria-label="Plan öğünleri">
        ${
          plan.length
            ? plan
                .map((x) => {
                  const done = doneIds.has(x.id);
                  return `<div class="row">
                    <span class="num muted" style="width:44px;flex:none;font-size:13px;font-weight:600">${esc(x.time || '')}</span>
                    <button type="button" class="row-main" style="text-align:left" data-act="plan-edit" data-id="${x.id}">
                      <span class="row-title">${esc(x.name)} <span class="muted" style="font-weight:400;font-size:14px">· ${fmt(x.kcal)} kcal</span></span>
                      <span class="row-sub">${esc(x.items || '')}</span>
                    </button>
                    <button type="button" class="check-btn" aria-pressed="${done}" aria-label="${esc(x.name)}: ${done ? 'yendi, geri al' : 'yendi olarak işaretle'}" data-act="plan-toggle" data-id="${x.id}">
                      <span class="check">${icon.check}</span></button>
                  </div>`;
                })
                .join('')
            : `<div class="empty">Henüz plan yok. "Öğün ekle" ile kendi beslenme planını yaz;<br>istersen Danışman'dan hedefine göre plan hazırlamasını da isteyebilirsin.</div>`
        }
      </section>
      <p class="note">İşaretlediğin öğün, plandaki değerlerle Günlük'e eklenir. Farklı bir şey yediysen Günlük'ten düzeltebilirsin.</p>`;
  }

  root.innerHTML = `
    <header class="hdr">
      <div class="hdr-text">
        <span class="eyebrow" style="display:flex;align-items:center;gap:4px">
          <button type="button" data-act="prev" aria-label="Önceki gün" style="height:28px;width:28px;display:flex;align-items:center;justify-content:center;margin-left:-6px">${icon.left}</button>
          <span>${esc(relDay(state.date))} · ${esc(phaseLbl)}</span>
          <button type="button" data-act="next" aria-label="Sonraki gün" style="height:28px;width:28px;display:flex;align-items:center;justify-content:center;opacity:${state.date >= today() ? '.3' : '1'}" ${state.date >= today() ? 'disabled' : ''}>${icon.right}</button>
        </span>
        <h1 class="title">Beslenme</h1>
      </div>
      <div class="hdr-actions">
        <button type="button" class="icon-btn" aria-label="Barkod okut" data-act="scan">${icon.barcode}</button>
        <button type="button" class="icon-btn" aria-label="Besin ekle" data-act="add">${icon.plus}</button>
      </div>
    </header>
    <div class="seg" role="tablist" aria-label="Beslenme görünümü">
      <button type="button" role="tab" aria-selected="${isLog}" data-tab="log">Günlük</button>
      <button type="button" role="tab" aria-selected="${!isLog}" data-tab="plan">Planım</button>
    </div>
    ${body}`;

  root.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-tab]');
    if (!t) return;
    if (t.dataset.tab) {
      state.tab = t.dataset.tab;
      return refresh();
    }
    const act = t.dataset.act;
    if (act === 'prev') {
      state.date = addDays(state.date, -1);
      refresh();
    } else if (act === 'next') {
      if (state.date < today()) state.date = addDays(state.date, 1);
      refresh();
    } else if (act === 'add') openAddFood(t.dataset.meal || (state.date === today() ? guessMeal() : 'ara'));
    else if (act === 'scan') scanAndAdd(state.date === today() ? guessMeal() : 'ara');
    else if (act === 'water') {
      await db.put('water_logs', { date: state.date, ml: Number(t.dataset.ml) });
      refresh();
    } else if (act === 'water-undo') {
      const last = water.logs[water.logs.length - 1];
      if (last) await db.remove('water_logs', last.id);
      refresh();
    } else if (act === 'copy-meal') {
      const mk = t.dataset.meal;
      const y = yEntries.filter((x) => x.meal === mk && !x.plan_item_id);
      for (const x of y) {
        const { id, created_at, updated_at, user_id, ...rest } = x;
        await db.put('food_logs', { ...rest, date: state.date, source: 'kopya' });
      }
      toast(`${y.length} besin eklendi`);
      refresh();
    }
    else if (act === 'edit-entry') openEditEntry(entries.find((x) => x.id === t.dataset.id));
    else if (act === 'plan-add') openPlanItem(null);
    else if (act === 'plan-edit') openPlanItem(plan.find((x) => x.id === t.dataset.id));
    else if (act === 'plan-toggle') {
      const item = plan.find((x) => x.id === t.dataset.id);
      const existing = entries.find((x) => x.plan_item_id === item.id);
      if (existing) await db.remove('food_logs', existing.id);
      else
        await db.put('food_logs', {
          date: state.date,
          meal: mealForTime(item.time),
          plan_item_id: item.id,
          name: item.name + ' (plan)',
          grams: null,
          kcal: Number(item.kcal) || 0,
          protein_g: Number(item.protein_g) || 0,
          carb_g: Number(item.carb_g) || 0,
          fat_g: Number(item.fat_g) || 0,
          fiber_g: 0,
          sodium_mg: 0,
          potassium_mg: 0,
          source: 'plan',
        });
      refresh();
    }
  };
}

function mealForTime(t) {
  const h = parseInt((t || '12').split(':')[0], 10);
  if (h < 11) return 'kahvalti';
  if (h < 15) return 'ogle';
  if (h < 17) return 'ara';
  if (h < 22) return 'aksam';
  return 'ara';
}

// ---------- Besin ekleme ----------
async function scanAndAdd(meal) {
  const code = await scanBarcode();
  if (!code) return;
  const food = await foodFromBarcode(code);
  if (food) openAmount({ ...food, custom: true }, meal);
}

async function openAddFood(meal) {
  const custom = await db.list('custom_foods');
  const recentLogs = (await db.list('food_logs', (x) => x.food_id && x.grams)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const recent = [];
  const seen = new Set();
  for (const l of recentLogs) {
    if (seen.has(l.food_id)) continue;
    const f = findFood(l.food_id, custom);
    if (!f) continue;
    seen.add(l.food_id);
    recent.push({ food: f, grams: l.grams });
    if (recent.length >= 8) break;
  }
  const s = openSheet({
    title: 'Besin ekle',
    body: `
      <div class="btn-row" style="margin-bottom:10px">
        <button type="button" class="btn primary" data-act="scan" style="display:flex;align-items:center;gap:6px">${icon.barcode}<span>Barkod okut</span></button>
        <button type="button" class="btn" data-act="custom">Kendi besinim</button>
      </div>
      <label class="sr-only" for="fsearch">Besin ara</label>
      <input id="fsearch" class="input" type="search" placeholder="Ara: yumurta, tavuk, pilav…" autocomplete="off" style="margin-bottom:10px">
      <div id="frecent"></div>
      <div class="card flush search-res" id="fres"></div>`,
  });
  const res = s.el.querySelector('#fres');
  const rec = s.el.querySelector('#frecent');
  const draw = (q) => {
    let list = searchFoods(q, custom);
    rec.innerHTML =
      !q && recent.length
        ? `<div class="sec" style="padding:0 14px 6px"><h2>Son eklediklerin</h2><span class="meta">+ ile aynı miktarı ekle</span></div>
           <div class="card flush" style="margin-bottom:14px">${recent
             .map(
               (r, i) => `<div class="row">
                 <button type="button" class="row-main" style="text-align:left" data-id="${esc(r.food.id)}"><span class="row-title normal">${esc(r.food.name)}</span>
                 <span class="row-sub">${fmt(r.grams)} g · ${fmt(nutrientsFor(r.food, r.grams).kcal)} kcal</span></button>
                 <button type="button" class="pill" data-quick="${i}" aria-label="${esc(r.food.name)} ${fmt(r.grams)} g ekle">+</button>
               </div>`
             )
             .join('')}</div>
           <div class="sec" style="padding:0 14px 6px"><h2>Tüm besinler</h2></div>`
        : '';
    res.innerHTML = list.length
      ? list
          .map(
            (f) => `<button type="button" class="row" data-id="${esc(f.id)}">
              <span class="row-main"><span class="row-title normal">${esc(f.name)}${f.custom ? ' <span class="muted small">(benim)</span>' : ''}</span>
              <span class="row-sub">100 g: ${fmt(f.k)} kcal · P ${fmt(f.p, 1)} · K ${fmt(f.c, 1)} · Y ${fmt(f.f, 1)}</span></span>${icon.chev}</button>`
          )
          .join('')
      : `<div class="empty">Bulunamadı. Aşağıdan kendi besinini ekleyebilirsin.</div>`;
  };
  draw('');
  const inp = s.el.querySelector('#fsearch');
  inp.addEventListener('input', () => draw(inp.value));
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-id],[data-act],[data-quick]');
    if (!b) return;
    if (b.dataset.quick) {
      const r = recent[Number(b.dataset.quick)];
      await db.put('food_logs', { date: state.date, meal, food_id: r.food.id, name: r.food.name, grams: r.grams, estimated: false, source: 'hizli', ...nutrientsFor(r.food, r.grams) });
      toast(`${r.food.name} eklendi`);
      s.close();
      refresh();
      return;
    }
    if (b.dataset.act === 'scan') {
      s.close();
      scanAndAdd(meal);
      return;
    }
    if (b.dataset.act === 'custom') {
      s.close();
      openCustomFood(meal);
      return;
    }
    const food = findFood(b.dataset.id, custom);
    if (!food) return;
    s.close();
    openAmount(food, meal);
  });
}

async function openAmount(food, meal, existing = null) {
  const portions = [['gram', 1], ...(food.portions || [])];
  let unit = existing ? 'gram' : portions.length > 1 ? portions[1][0] : 'gram';
  let qty = existing ? existing.grams : unit === 'gram' ? 100 : 1;
  let selMeal = meal;
  const grams = () => {
    const u = portions.find((p) => p[0] === unit);
    return round1(qty * (u ? u[1] : 1));
  };
  const s = openSheet({
    title: food.name,
    leftLabel: 'Vazgeç',
    rightLabel: existing ? 'Kaydet' : 'Ekle',
    onRight: async (api) => {
      const g = grams();
      if (!g || g <= 0) return toast('Miktar gir');
      const n = nutrientsFor(food, g);
      await db.put('food_logs', { ...(existing || {}), date: existing ? existing.date : state.date, meal: selMeal, food_id: food.id, name: food.name, grams: g, estimated: false, source: 'manuel', ...n });
      api.close();
      toast(existing ? 'Güncellendi' : `${food.name} eklendi`);
      refresh();
    },
  });
  const draw = () => {
    const g = grams();
    const n = nutrientsFor(food, g || 0);
    s.setBody(`
      <div class="field"><span class="lbl">Birim</span>
        <div class="toggle-row">${portions
          .map(([l, gr]) => `<button type="button" class="tog" aria-pressed="${unit === l}" data-unit="${esc(l)}">${esc(l)}${gr !== 1 ? ` (${fmt(gr)} g)` : ''}</button>`)
          .join('')}</div></div>
      <div class="field"><label for="qty">Miktar (${esc(unit)})</label>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="Azalt">−</button>
          <input id="qty" inputmode="decimal" value="${String(qty).replace('.', ',')}">
          <button type="button" data-step="1" aria-label="Artır">+</button>
        </div></div>
      <div class="field"><span class="lbl">Öğün</span>
        <div class="toggle-row">${MEALS.map(([k, l]) => `<button type="button" class="tog" aria-pressed="${selMeal === k}" data-meal="${k}">${l}</button>`).join('')}</div></div>
      <div class="card" style="margin:0">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:17px;font-weight:600">${fmt(g)} g</span><span class="big-num" style="font-size:24px">${fmt(n.kcal)} kcal</span></div>
        <div class="macros" style="margin-top:8px">
          <div class="macro"><span class="lbl">Protein</span><span class="val">${fmt(n.protein_g, 1)} g</span></div>
          <div class="macro"><span class="lbl">Karbonhidrat</span><span class="val">${fmt(n.carb_g, 1)} g</span></div>
          <div class="macro"><span class="lbl">Yağ</span><span class="val">${fmt(n.fat_g, 1)} g</span></div>
        </div>
      </div>
      ${existing ? `<button type="button" class="btn danger block" data-del style="margin-top:12px">Kaydı sil</button>` : ''}`);
    const q = s.el.querySelector('#qty');
    q.addEventListener('input', () => {
      const v = parseNum(q.value);
      if (!isNaN(v)) {
        qty = v;
        updatePreview();
      }
    });
  };
  const updatePreview = () => {
    const g = grams();
    const n = nutrientsFor(food, g || 0);
    const card = s.el.querySelector('.card');
    card.querySelector('span[style*="17px"]').textContent = `${fmt(g)} g`;
    card.querySelector('.big-num').textContent = `${fmt(n.kcal)} kcal`;
    const vals = card.querySelectorAll('.macro .val');
    vals[0].textContent = `${fmt(n.protein_g, 1)} g`;
    vals[1].textContent = `${fmt(n.carb_g, 1)} g`;
    vals[2].textContent = `${fmt(n.fat_g, 1)} g`;
  };
  draw();
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.unit) {
      const g = grams();
      unit = b.dataset.unit;
      const u = portions.find((p) => p[0] === unit);
      qty = unit === 'gram' ? g || 100 : Math.max(1, Math.round((g / u[1]) * 2) / 2) || 1;
      draw();
    } else if (b.dataset.meal) {
      selMeal = b.dataset.meal;
      draw();
    } else if (b.dataset.step) {
      const step = unit === 'gram' ? 10 : 0.5;
      qty = Math.max(0, round1(qty + Number(b.dataset.step) * step));
      s.el.querySelector('#qty').value = String(qty).replace('.', ',');
      updatePreview();
    } else if (b.hasAttribute('data-del')) {
      await db.remove('food_logs', existing.id);
      s.close();
      toast('Silindi');
      refresh();
    }
  });
}

async function openEditEntry(entry) {
  if (!entry) return;
  if (entry.food_id) {
    const custom = await db.list('custom_foods');
    const food = findFood(entry.food_id, custom);
    if (food) return openAmount(food, entry.meal, entry);
  }
  // Veritabanında olmayan (tahmini/plan) kayıt: oranla ölçekle
  const s = openSheet({
    title: entry.name,
    leftLabel: 'Vazgeç',
    rightLabel: entry.grams ? 'Kaydet' : '',
    onRight: async (api) => {
      const g = parseNum(s.el.querySelector('#eg').value);
      if (!g || g <= 0) return toast('Miktar gir');
      const r = g / entry.grams;
      const upd = { ...entry, grams: g };
      for (const k of ['kcal', 'sodium_mg', 'potassium_mg']) upd[k] = Math.round((entry[k] || 0) * r);
      for (const k of ['protein_g', 'carb_g', 'fat_g', 'fiber_g']) upd[k] = round1((entry[k] || 0) * r);
      await db.put('food_logs', upd);
      api.close();
      toast('Güncellendi');
      refresh();
    },
    body: `
      ${entry.grams ? `<div class="field"><label for="eg">Miktar (g)</label><input id="eg" class="input" inputmode="decimal" value="${entry.grams}"></div>` : ''}
      <div class="card" style="margin:0 0 12px">
        <div class="kv"><span class="k">Kalori</span><span class="v">${fmt(entry.kcal)} kcal</span></div>
        <div class="kv"><span class="k">Protein · Karb · Yağ</span><span class="v">${fmt(entry.protein_g)} · ${fmt(entry.carb_g)} · ${fmt(entry.fat_g)} g</span></div>
        <div class="kv"><span class="k">Kaynak</span><span class="v">${entry.source === 'plan' ? 'Beslenme planı' : entry.estimated ? 'Danışman tahmini' : 'Veritabanı'}</span></div>
      </div>
      <button type="button" class="btn danger block" data-del style="background:var(--card)">Kaydı sil</button>`,
  });
  s.el.querySelector('[data-del]').addEventListener('click', async () => {
    await db.remove('food_logs', entry.id);
    s.close();
    toast('Silindi');
    refresh();
  });
}

function openCustomFood(meal) {
  const s = openSheet({
    title: 'Kendi besinin',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <div class="field"><label for="cf-name">Ad</label><input id="cf-name" class="input" placeholder="Örn. Annemin mercimek köftesi"></div>
      <p class="small muted" style="margin:0 0 10px">100 g için değerler (paketin üzerindeki tablodan alabilirsin):</p>
      <div class="grid2">
        <div class="field"><label for="cf-k">Kalori (kcal)</label><input id="cf-k" class="input" inputmode="decimal"></div>
        <div class="field"><label for="cf-p">Protein (g)</label><input id="cf-p" class="input" inputmode="decimal"></div>
        <div class="field"><label for="cf-c">Karbonhidrat (g)</label><input id="cf-c" class="input" inputmode="decimal"></div>
        <div class="field"><label for="cf-f">Yağ (g)</label><input id="cf-f" class="input" inputmode="decimal"></div>
        <div class="field"><label for="cf-fb">Lif (g) – isteğe bağlı</label><input id="cf-fb" class="input" inputmode="decimal"></div>
        <div class="field"><label for="cf-na">Sodyum (mg) – isteğe bağlı</label><input id="cf-na" class="input" inputmode="decimal"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="cf-pl">Porsiyon adı – isteğe bağlı</label><input id="cf-pl" class="input" placeholder="adet, kase…"></div>
        <div class="field"><label for="cf-pg">Porsiyon (g)</label><input id="cf-pg" class="input" inputmode="decimal"></div>
      </div>`,
    onRight: async (api) => {
      const v = (id) => parseNum(s.el.querySelector(id).value);
      const name = s.el.querySelector('#cf-name').value.trim();
      const k = v('#cf-k');
      if (!name || isNaN(k)) return toast('Ad ve kalori gerekli');
      const pl = s.el.querySelector('#cf-pl').value.trim();
      const pg = v('#cf-pg');
      const food = await db.put('custom_foods', {
        name,
        alias: '',
        k,
        p: v('#cf-p') || 0,
        c: v('#cf-c') || 0,
        f: v('#cf-f') || 0,
        fb: v('#cf-fb') || 0,
        na: v('#cf-na') || 0,
        ka: 0,
        portions: pl && pg ? [[pl, pg]] : [],
      });
      api.close();
      openAmount({ ...food, custom: true }, meal);
    },
  });
}

function openPlanItem(item) {
  const it = item || { time: '', name: '', items: '', kcal: '', protein_g: '', carb_g: '', fat_g: '' };
  const s = openSheet({
    title: item ? 'Öğünü düzenle' : 'Plana öğün ekle',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <div class="grid2">
        <div class="field"><label for="pi-time">Saat</label><input id="pi-time" class="input" type="time" value="${esc(it.time)}"></div>
        <div class="field"><label for="pi-name">Ad</label><input id="pi-name" class="input" value="${esc(it.name)}" placeholder="Öğün 1"></div>
      </div>
      <div class="field"><label for="pi-items">İçerik</label><textarea id="pi-items" class="input" placeholder="Yumurta ×4, yulaf 80 g, muz">${esc(it.items)}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="pi-k">Kalori (kcal)</label><input id="pi-k" class="input" inputmode="decimal" value="${esc(it.kcal)}"></div>
        <div class="field"><label for="pi-p">Protein (g)</label><input id="pi-p" class="input" inputmode="decimal" value="${esc(it.protein_g)}"></div>
        <div class="field"><label for="pi-c">Karbonhidrat (g)</label><input id="pi-c" class="input" inputmode="decimal" value="${esc(it.carb_g)}"></div>
        <div class="field"><label for="pi-f">Yağ (g)</label><input id="pi-f" class="input" inputmode="decimal" value="${esc(it.fat_g)}"></div>
      </div>
      <p class="small muted" style="margin:0 0 12px">Değerleri bilmiyorsan Danışman'a "şu öğünün kalorisi ne" diye sorabilirsin.</p>
      ${item ? '<button type="button" class="btn danger block" data-del style="background:var(--card)">Öğünü plandan sil</button>' : ''}`,
    onRight: async (api) => {
      const g = (id) => s.el.querySelector(id).value.trim();
      const n = (id) => {
        const x = parseNum(g(id));
        return isNaN(x) ? null : x;
      };
      if (!g('#pi-name')) return toast('Öğüne bir ad ver');
      await db.put('plan_items', { ...(item || {}), time: g('#pi-time'), name: g('#pi-name'), items: g('#pi-items'), kcal: n('#pi-k'), protein_g: n('#pi-p'), carb_g: n('#pi-c'), fat_g: n('#pi-f') });
      api.close();
      toast('Plan kaydedildi');
      refresh();
    },
  });
  const del = s.el.querySelector('[data-del]');
  if (del)
    del.addEventListener('click', async () => {
      if (!(await confirmSheet({ title: 'Öğünü sil', text: `"${it.name}" plandan silinsin mi?`, okLabel: 'Sil', danger: true }))) return;
      await db.remove('plan_items', item.id);
      s.close();
      refresh();
    });
}

export { go };
