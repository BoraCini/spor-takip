import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, relDay, icon, openSheet, confirmSheet, round1, weekStart, parseDate, swipeDelete } from '../util.js';
import { refresh, go } from '../app.js';
import { removeWithUndo } from '../undo.js';
import { dayNutrition, targetsOf, MEALS, waterDay, waterTarget, adaptiveExpenditure, macrosFor } from '../context.js';
import { scanBarcode, foodFromBarcode, reviewFood, searchProducts, fileToImage } from '../barcode.js';
import { searchFoods, nutrientsFor, findFood, defaultServing, servingText, FOOD_ATTRIBUTION, portionsOf, baseUnit, UNIT_TYPES, MAX_PORTIONS, validAmount, parsePortionRows } from '../data/foods.js';
import { FOOD_CATEGORIES } from '../data/food_categories.js';
import { RECIPE_CATEGORIES, RECIPE_CAT_LABEL, RECIPE_TAGS, normalizeRecipe, resolveItem, recipeTotals, recipeNutrition, scaleItems, itemGrams } from '../recipes.js';

let state = { tab: 'log', date: today(), collapsed: null };
const WD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

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
  if (!state.collapsed) state.collapsed = new Set(await db.getSetting('meal_collapsed', []));
  // Haftanın günleri: kayıt olan günlerde ✓
  const ws = weekStart(state.date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const logged = new Set((await db.list('food_logs', (r) => r.date >= ws && r.date <= weekDays[6])).map((r) => r.date));
  const t0 = today();
  const weekHTML = `<div class="dweek" role="group" aria-label="Hafta">
      <button type="button" class="dw-nav" data-act="week-prev" aria-label="Önceki hafta">${icon.left}</button>
      ${weekDays
        .map((d, i) => {
          const sel = d === state.date;
          const fut = d > t0;
          const has = logged.has(d);
          return `<button type="button" class="dw${sel ? ' sel' : ''}${has ? ' has' : ''}${d === t0 ? ' today' : ''}" data-act="day" data-d="${d}" ${fut ? 'disabled' : ''} aria-pressed="${sel}" aria-label="${esc(relDay(d))}${has ? ', kayıt var' : ''}">
            <span class="dw-l">${WD[i]}</span><span class="dw-c">${has ? icon.check : parseDate(d).getDate()}</span></button>`;
        })
        .join('')}
      <button type="button" class="dw-nav" data-act="week-next" aria-label="Sonraki hafta" ${weekDays[6] >= t0 ? 'disabled' : ''}>${icon.right}</button>
    </div>`;

  let body = '';
  // Haftalık kontrol: gerçek harcama hedeften belirgin farklıysa öner (haftada bir)
  let checkin = null;
  if (isLog && state.date === today() && tg.kcal && (await db.getSetting('checkin_week')) !== weekStart(today())) {
    const ad = await adaptiveExpenditure(21);
    if (ad.ready) {
      const m = macrosFor(p, ad.tdee);
      if (Math.abs(m.kcal - tg.kcal) >= 80) checkin = { ad, m };
    }
  }
  if (checkin)
    body += `<section class="card checkin" aria-label="Haftalık kontrol">
      <span class="cyc-lbl">Haftalık kontrol</span>
      <p style="margin:4px 0 8px;font-size:15px;line-height:21px">Son 3 haftada gerçek harcaman <b>≈ ${fmt(checkin.ad.tdee)} kcal</b> (kilo eğilimin ${checkin.ad.rate_kg_week > 0 ? '+' : ''}${String(checkin.ad.rate_kg_week).replace('.', ',')} kg/hafta). Hedefini <b>${fmt(tg.kcal)} → ${fmt(checkin.m.kcal)} kcal</b> yapalım mı?</p>
      <div class="btn-row"><button type="button" class="btn" data-act="checkin-skip">Bu hafta değil</button><button type="button" class="btn primary" data-act="checkin-ok">Güncelle</button></div>
    </section>`;
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

    body += '<div id="meals">';
    for (const [mk, ml] of MEALS) {
      const items = entries.filter((e) => e.meal === mk);
      const sum = (k) => items.reduce((a, e) => a + (Number(e[k]) || 0), 0);
      const kcal = sum('kcal');
      const open = !state.collapsed.has(mk);
      const y = items.length ? [] : yEntries.filter((e) => e.meal === mk && !e.plan_item_id);
      body += `
        <section class="card meal-card${open ? ' open' : ''}" aria-label="${ml}">
          <div class="meal-hd">
            <button type="button" class="meal-tg" data-act="toggle-meal" data-meal="${mk}" aria-expanded="${open}">
              <span class="meal-t">${ml}</span>
              <span class="meal-k num">${items.length ? `${fmt(kcal)} <small>kcal</small>` : ''}</span>
              <span class="meal-chev">${icon.chev}</span>
            </button>
            <button type="button" class="meal-add" data-act="add" data-meal="${mk}" aria-label="${ml} öğününe ekle">${icon.plus}</button>
          </div>
          ${
            items.length
              ? `<div class="meal-mac" aria-label="${ml} makroları">
                  <span><small>Yağ</small><b class="num">${fmt(sum('fat_g'), 1)}</b></span>
                  <span><small>Karb</small><b class="num">${fmt(sum('carb_g'), 1)}</b></span>
                  <span><small>Prot</small><b class="num">${fmt(sum('protein_g'), 1)}</b></span>
                  <span><small>TGD</small><b class="num">${tg.kcal ? `%${fmt((kcal / tg.kcal) * 100)}` : '—'}</b></span>
                  <span><small>Kalori</small><b class="num">${fmt(kcal)}</b></span>
                </div>`
              : ''
          }
          ${
            !open
              ? ''
              : items.length
              ? `<div class="meal-list">${items
                  .map(
                    (e) => `<button type="button" class="row meal-row" data-act="edit-entry" data-id="${e.id}">
                      <span class="row-main"><span class="row-title normal">${esc(e.name)}${e.estimated ? '<span class="est">tahmini</span>' : ''}</span>
                      <span class="row-sub">${e.grams ? esc(servingText(e.unit, e.qty, e.grams, e.base || 'g')) + ' · ' : ''}P ${fmt(e.protein_g)} · K ${fmt(e.carb_g)} · Y ${fmt(e.fat_g)}</span></span>
                      <span class="row-end">${fmt(e.kcal)}</span></button>`
                  )
                  .join('')}</div>`
              : y.length
              ? `<div class="meal-empty"><button type="button" class="pill" data-act="copy-meal" data-meal="${mk}" style="display:flex;align-items:center;gap:6px">${icon.copy}<span>Dünkü ${({ kahvalti: 'kahvaltıyı', ogle: 'öğle yemeğini', aksam: 'akşam yemeğini', ara: 'ara öğünü' })[mk]} ekle (${y.length})</span></button></div>`
              : `<button type="button" class="meal-empty muted" data-act="add" data-meal="${mk}">Henüz bir şey yok · eklemek için dokun</button>`
          }
        </section>`;
    }
    body += '</div>';
    if (entries.length) body += `<p class="note" style="margin-top:6px">Bir besini silmek için sola kaydır.</p>`;

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
      <p class="note">Kalori ve makrolar besin veritabanından hesaplanır; "tahmini" işaretli olanlar Coach'un tahminidir. Mikro besinler yalnızca lif, sodyum ve potasyum için izlenir.</p>`;
  } else {
    const pt = plan.reduce(
      (a, x) => ({ kcal: a.kcal + (Number(x.kcal) || 0), p: a.p + (Number(x.protein_g) || 0), c: a.c + (Number(x.carb_g) || 0), f: a.f + (Number(x.fat_g) || 0) }),
      { kcal: 0, p: 0, c: 0, f: 0 }
    );
    const doneIds = new Set(entries.filter((e) => e.plan_item_id).map((e) => e.plan_item_id));
    body += `
      <section class="card" aria-label="Plan özeti" style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <span style="font-size:17px;font-weight:600">${esc(phaseLbl)} planı</span>
          <button type="button" class="pill" data-act="plan-add">Öğün ekle</button>
        </div>
        <div class="kv" style="min-height:0;border:0;font-size:14px"><span class="k muted">Plan</span><span class="v num">${fmt(pt.kcal)} kcal · P ${fmt(pt.p)} · K ${fmt(pt.c)} · Y ${fmt(pt.f)}</span></div>
        ${tg.kcal ? `<div class="kv" style="min-height:0;border:0;font-size:14px"><span class="k muted">Hedef</span><span class="v num">${fmt(tg.kcal)} kcal · P ${fmt(tg.protein_g)} · K ${fmt(tg.carb_g)} · Y ${fmt(tg.fat_g)}</span></div>` : ''}
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
            : `<div class="empty">Henüz plan yok. "Öğün ekle" ile kendi beslenme planını yaz;<br>istersen Coach'tan hedefine göre plan hazırlamasını da isteyebilirsin.</div>`
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
        <button type="button" class="icon-btn" aria-label="Söyleyerek ya da yazarak ekle" data-act="say">${icon.mic}</button>
        <button type="button" class="icon-btn" aria-label="Barkod okut" data-act="scan">${icon.barcode}</button>
        <button type="button" class="icon-btn" aria-label="Besin ekle" data-act="add">${icon.plus}</button>
      </div>
    </header>
    <div class="seg" role="tablist" aria-label="Beslenme görünümü">
      <button type="button" role="tab" aria-selected="${isLog}" data-tab="log">Günlük</button>
      <button type="button" role="tab" aria-selected="${!isLog}" data-tab="plan">Planım</button>
    </div>
    ${weekHTML}
    ${body}`;

  // Sola kaydırınca sil
  const mealsEl = root.querySelector('#meals');
  if (mealsEl) swipeDelete(mealsEl, '.meal-row', (row) => removeWithUndo('food_logs', row.dataset.id, 'Besin silindi'));

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
    } else if (act === 'day') {
      state.date = t.dataset.d;
      refresh();
    } else if (act === 'week-prev') {
      state.date = addDays(state.date, -7);
      refresh();
    } else if (act === 'week-next') {
      const n = addDays(state.date, 7);
      state.date = n > today() ? today() : n;
      refresh();
    } else if (act === 'checkin-ok' || act === 'checkin-skip') {
      if (act === 'checkin-ok' && checkin) {
        const cur = await db.getProfile();
        Object.assign(cur, { target_kcal: checkin.m.kcal, target_protein_g: checkin.m.protein, target_carb_g: checkin.m.carb, target_fat_g: checkin.m.fat });
        await db.saveProfile(cur);
        toast('Hedefler güncellendi');
      }
      await db.setSetting('checkin_week', weekStart(today()));
      refresh();
    } else if (act === 'toggle-meal') {
      const mk = t.dataset.meal;
      if (state.collapsed.has(mk)) state.collapsed.delete(mk);
      else state.collapsed.add(mk);
      await db.setSetting('meal_collapsed', [...state.collapsed]);
      refresh();
    } else if (act === 'add') openAddFood(t.dataset.meal || (state.date === today() ? guessMeal() : 'ara'));
    else if (act === 'scan') scanAndAdd(state.date === today() ? guessMeal() : 'ara');
    else if (act === 'say') openSayAdd(state.date === today() ? guessMeal() : 'ara', { listen: true });
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

// ---------- Besin ekleme (FatSecret tarzı) ----------
async function scanAndAdd(meal) {
  const code = await scanBarcode();
  if (!code) return;
  const food = await foodFromBarcode(code);
  if (food) openAmount({ ...food, custom: true }, meal);
}

const markCustom = (list) => list.map((c) => ({ ...c, custom: true }));
const cleanName = (n) => String(n || '').replace(/\s*~$/, '');

// Kayıt geçmişinden son ve sık kullanılanlar
async function foodHistory(custom) {
  const logs = (await db.list('food_logs', (x) => x.food_id && x.grams)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const last = new Map();
  const count = new Map();
  for (const l of logs) {
    count.set(l.food_id, (count.get(l.food_id) || 0) + 1);
    if (!last.has(l.food_id)) last.set(l.food_id, l);
  }
  const recent = [...last.keys()].map((id) => findFood(id, custom)).filter(Boolean).slice(0, 30);
  const frequent = [...count.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => findFood(id, custom))
    .filter(Boolean)
    .slice(0, 30);
  return { last, count, recent, frequent };
}

function srcTag(f) {
  if (f.overrides) return 'düzeltildi';
  if (f.recipe) return 'tarif';
  if (f.custom) return 'benim';
  if (f.src === 'marka') return 'marka';
  if (f.approx || /~$/.test(f.name)) return 'yaklaşık';
  return '';
}

function srcLine(f) {
  if (f.overrides) return 'Senin düzelttiğin değerler';
  if (f.recipe) return `Tarifin · ${fmt(f.recipe.servings)} porsiyon`;
  if (f.custom) {
    if (f.source === 'Yapay zekâ tahmini') return 'Kendi besinin · yapay zekâ tahmini';
    if (f.source === 'Etiketten okundu') return 'Kendi besinin · etiketten okundu';
    if (f.barcode) return 'Kendi besinin · Open Food Facts';
    return 'Kendi besinin';
  }
  if (f.src === 'usda') return 'Kaynak: USDA FoodData Central';
  if (f.src === 'marka') return 'Etiket değerleri (marketteki ürün sayfasından)';
  if (f.approx || /~$/.test(f.name)) return 'Yaklaşık değer: tarife ve markaya göre değişir';
  return 'Kaynak: USDA ortalamaları';
}

// Günlük kayıt: besin değerleri kayıt anında kopyalanır (snapshot); besin/tarif sonradan değişse de bu kayıt değişmez
function logRecord(food, sv, { date, meal, source = 'manuel', existing = null } = {}) {
  return {
    ...(existing || {}),
    date,
    meal,
    food_id: food.id,
    name: cleanName(food.name),
    grams: sv.grams,
    unit: sv.unit,
    qty: sv.qty,
    ...(baseUnit(food) === 'ml' ? { base: 'ml' } : {}),
    estimated: false,
    source,
    ...nutrientsFor(food, sv.grams),
  };
}

async function openAddFood(meal, startTab = null) {
  const custom = markCustom(await db.list('custom_foods'));
  const hist = await foodHistory(custom);
  const mine = custom.filter((c) => !c.recipe).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const recipes = custom.filter((c) => c.recipe).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  let tab = startTab || 'son';
  let selMeal = meal;
  const picked = new Map(); // id -> { food, unit, qty, grams }
  const serv = (f) => picked.get(f.id) || defaultServing(f, hist.last.get(f.id));
  const TABS = [
    ['son', 'Son'],
    ['sik', 'Sık'],
    ['benim', 'Benim'],
    ['tarif', 'Tarifler'],
  ];

  const s = openSheet({
    title: 'Besin ekle',
    body: `
      <div class="toggle-row" style="margin-bottom:10px" role="group" aria-label="Öğün">${MEALS.map(
        ([k, l]) => `<button type="button" class="tog" aria-pressed="${k === selMeal}" data-meal="${k}">${l}</button>`
      ).join('')}</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <label class="sr-only" for="fsearch">Besin ara</label>
        <input id="fsearch" class="input" type="search" placeholder="Ara ya da cümle yaz: 3 yumurta, 200 g tavuk" autocomplete="off" enterkeyhint="search" style="flex:1">
        <button type="button" class="icon-btn" data-act="say" aria-label="Söyleyerek ekle" style="flex:none;height:44px;width:44px">${icon.mic}</button>
      </div>
      <div class="qa-grid" id="fqa">
        <button type="button" class="qa" data-act="scan">${icon.barcode}<span>Barkod</span></button>
        <label class="qa">${icon.camera}<span>Fotoğraf</span><input type="file" accept="image/*" capture="environment" class="sr-only" data-photo></label>
        <button type="button" class="qa" data-act="quick">${icon.bolt}<span>Hızlı kalori</span></button>
        <button type="button" class="qa" data-act="custom">${icon.plus}<span>Yeni besin</span></button>
      </div>
      <div class="seg" role="tablist" aria-label="Listeler" id="ftabs" style="margin:12px 0 10px"></div>
      <div id="flist"></div>
      <div id="fmore"></div>
      <p class="small muted" style="margin:16px 4px 0;line-height:17px">${esc(FOOD_ATTRIBUTION)}</p>`,
  });
  const ft = document.createElement('div');
  ft.className = 'sheet-ft';
  ft.hidden = true;
  s.sheet.appendChild(ft);
  const inp = s.el.querySelector('#fsearch');
  const listEl = s.el.querySelector('#flist');
  const moreEl = s.el.querySelector('#fmore');
  const tabsEl = s.el.querySelector('#ftabs');
  const qaEl = s.el.querySelector('#fqa');
  const byId = new Map();

  const row = (f) => {
    byId.set(f.id, f);
    const sv = serv(f);
    const n = nutrientsFor(f, sv.grams);
    const tag = srcTag(f);
    const on = picked.has(f.id);
    return `<div class="row frow">
      <button type="button" class="row-main" data-open="${esc(f.id)}" style="text-align:left">
        <span class="row-title normal">${esc(cleanName(f.name))}${tag ? ` <span class="tag">${tag}</span>` : ''}</span>
        <span class="row-sub"><span data-sv>${esc(servingText(sv.unit, sv.qty, sv.grams, baseUnit(f)))}</span> · <b class="num" data-kc>${fmt(n.kcal)} kcal</b></span>
        <span class="row-sub num" data-mc>P ${fmt(n.protein_g, 1)} · K ${fmt(n.carb_g, 1)} · Y ${fmt(n.fat_g, 1)}</span>
      </button>
      <button type="button" class="check-btn" aria-pressed="${on}" data-pick="${esc(f.id)}" aria-label="${esc(cleanName(f.name))}: ${on ? 'seçimi kaldır' : 'seç'}"><span class="check">${icon.check}</span></button>
    </div>`;
  };
  const list = (arr, empty) => (arr.length ? `<div class="card flush search-res">${arr.map(row).join('')}</div>` : `<div class="empty">${empty}</div>`);

  const draw = () => {
    const q = inp.value.trim();
    tabsEl.hidden = !!q;
    qaEl.hidden = !!q;
    if (q) {
      const res = searchFoods(q, custom, hist.count);
      // Sayı içeren cümle yazıldıysa (örn. "3 yumurta 200 g tavuk") tek seferde eklemeyi öner
      const sentence = /\d|\b(bir|iki|üç|dört|beş|yarım)\b/i.test(q) && q.split(/\s+/).length >= 2;
      listEl.innerHTML = (sentence
        ? `<button type="button" class="card" data-act="say-text" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;margin-bottom:10px;padding:12px 14px">
             <span style="color:var(--accent)">${icon.mic}</span><span style="display:flex;flex-direction:column;min-width:0"><span style="font-weight:600;color:var(--accent)">Cümle olarak ekle</span>
             <span class="small muted">"${esc(q)}" içindeki besinleri miktarlarıyla tek seferde ekle</span></span></button>`
        : '') + (res.length
        ? `<div class="sec" style="padding:0 14px 6px"><h2>Sonuçlar</h2><span class="meta">${res.length >= 60 ? '60+' : res.length} besin</span></div>${list(res, '')}`
        : `<div class="empty">Listede "${esc(q)}" bulunamadı.</div>`);
      moreEl.innerHTML = `<div class="sec" style="padding:14px 14px 6px"><h2>${res.length ? 'Aradığın bu değil mi?' : 'Başka yollar'}</h2></div>
         <div class="card flush">
           <button type="button" class="row" data-act="ai-est"><span class="row-main"><span class="row-title" style="color:var(--accent)">Yapay zekâyla hesapla: "${esc(q)}"</span>
             <span class="row-sub">Ev ve restoran yemekleri için kalori ve makro tahmini</span></span>${icon.chev}</button>
           <button type="button" class="row" data-act="off-search"><span class="row-main"><span class="row-title" style="color:var(--accent)">Paketli ürünlerde ara</span>
             <span class="row-sub">Open Food Facts'te marka veya ürün adıyla</span></span>${icon.chev}</button>
         </div>`;
      return;
    }
    moreEl.innerHTML = '';
    tabsEl.innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-tab="${k}">${l}</button>`).join('');
    if (tab === 'son') listEl.innerHTML = list(hist.recent, 'Henüz kayıt yok. Yukarıdan ara ya da barkod okut.');
    else if (tab === 'sik') listEl.innerHTML = list(hist.frequent, 'En az iki kez eklediğin besinler burada görünür.');
    else if (tab === 'benim')
      listEl.innerHTML = `<button type="button" class="btn block" data-act="custom" style="margin-bottom:10px">+ Yeni besin</button>${list(mine, 'Kendi eklediğin, barkodla okuttuğun veya yapay zekâya hesaplattığın besinler burada durur.')}`;
    else
      listEl.innerHTML = `<button type="button" class="btn block" data-act="recipe" style="margin-bottom:10px">+ Yeni tarif</button>${list(
        recipes,
        'Evde yaptığın yemeği malzemeleriyle bir kez gir; porsiyon başına kalori ve makroyu uygulama hesaplasın.'
      )}`;
  };

  const updateRow = (id) => {
    const f = byId.get(id);
    if (!f) return;
    const sv = serv(f);
    const n = nutrientsFor(f, sv.grams);
    s.el.querySelectorAll(`[data-open="${CSS.escape(id)}"]`).forEach((b) => {
      b.querySelector('[data-sv]').textContent = servingText(sv.unit, sv.qty, sv.grams, baseUnit(f));
      b.querySelector('[data-kc]').textContent = `${fmt(n.kcal)} kcal`;
      b.querySelector('[data-mc]').textContent = `P ${fmt(n.protein_g, 1)} · K ${fmt(n.carb_g, 1)} · Y ${fmt(n.fat_g, 1)}`;
    });
    s.el.querySelectorAll(`[data-pick="${CSS.escape(id)}"]`).forEach((b) => {
      const on = picked.has(id);
      b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-label', `${cleanName(f.name)}: ${on ? 'seçimi kaldır' : 'seç'}`);
    });
  };
  const updateFt = () => {
    if (!picked.size) {
      ft.hidden = true;
      return;
    }
    const tot = [...picked.values()].reduce((a, x) => a + nutrientsFor(x.food, x.grams).kcal, 0);
    ft.hidden = false;
    ft.innerHTML = `<button type="button" class="btn primary block" data-addall>${picked.size} besini ekle · ${fmt(tot)} kcal</button>`;
  };

  const logEntry = (food, sv, src = 'manuel') => logRecord(food, sv, { date: state.date, meal: selMeal, source: src });

  draw();
  inp.addEventListener('input', draw);
  s.sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-meal],[data-tab],[data-pick],[data-open],[data-act],[data-addall]');
    if (!b) return;
    if (b.dataset.meal) {
      selMeal = b.dataset.meal;
      s.el.querySelectorAll('[data-meal]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.meal === selMeal));
      return;
    }
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      draw();
      return;
    }
    if (b.dataset.pick) {
      const id = b.dataset.pick;
      const f = byId.get(id);
      if (picked.has(id)) picked.delete(id);
      else picked.set(id, { food: f, ...defaultServing(f, hist.last.get(id)) });
      updateRow(id);
      updateFt();
      return;
    }
    if (b.dataset.open) {
      const f = byId.get(b.dataset.open);
      if (!f) return;
      if (f.recipe && !picked.size) {
        s.close();
        return openRecipeDetail(f, selMeal, () => openAddFood(selMeal, tab));
      }
      openAmount(f, selMeal, null, {
        serving: serv(f),
        selecting: picked.size > 0,
        onSelect: (sv) => {
          picked.set(f.id, { food: f, ...sv });
          updateRow(f.id);
          updateFt();
        },
        onLogged: () => s.close(),
        onChanged: () => {
          s.close();
          openAddFood(selMeal, tab);
        },
      });
      return;
    }
    if (b.hasAttribute('data-addall')) {
      if (b.disabled) return;
      b.disabled = true; // art arda basınca iki kez eklenmesin
      const items = [...picked.values()];
      try {
        // hepsi ya da hiçbiri: yarıda kalırsa kısmi kayıt oluşmaz
        await db.putAtomic(items.map((x) => ({ store: 'food_logs', obj: logEntry(x.food, x, 'coklu') })));
      } catch (err) {
        b.disabled = false;
        return toast('Eklenemedi: ' + (err.message || err), 4000);
      }
      toast(`${items.length} besin eklendi`);
      s.close();
      refresh();
      return;
    }
    const act = b.dataset.act;
    const q = inp.value.trim();
    if (act === 'say' || act === 'say-text') {
      s.close();
      openSayAdd(selMeal, act === 'say' ? { listen: true } : { text: q });
    } else if (act === 'scan') {
      s.close();
      scanAndAdd(selMeal);
    } else if (act === 'quick') {
      s.close();
      openQuickAdd(selMeal);
    } else if (act === 'custom') {
      s.close();
      openSmartCustom(selMeal, q);
    } else if (act === 'recipe') {
      s.close();
      openRecipe(null, () => openAddFood(selMeal, 'tarif'));
    } else if (act === 'ai-est') {
      s.close();
      openEstimate(selMeal, q);
    } else if (act === 'off-search') {
      s.close();
      openProductSearch(selMeal, q);
    }
  });
  s.el.querySelector('[data-photo]').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    s.close();
    await runEstimate(selMeal, { name: inp.value.trim(), image: await fileToImage(f), mode: 'photo' });
  });
}

// ---------- Söyle ya da yaz: cümleden öğüne ekle (yapay zekâsız) ----------
async function openSayAdd(meal, { text = '', listen: startListen = false } = {}) {
  const { parseMealText, gramsFor } = await import('../foodparse.js');
  const { listen, sttSupported } = await import('../voice.js');
  const custom = markCustom(await db.list('custom_foods'));
  const hist = await foodHistory(custom);
  const aliases = (await db.getSetting('say_aliases', {})) || {};
  let selMeal = meal;
  let dayOffset = 0;
  let items = [];
  let stop = null;
  const s = openSheet({
    title: 'Söyle ya da yaz',
    onClose: () => stop && stop(),
    body: `
      <label class="sr-only" for="say-t">Ne yedin?</label>
      <textarea id="say-t" class="input" style="min-height:76px" placeholder="Örn. kahvaltıda 3 yumurta, 50 g Lifalif yulaf ve 150 ml yarım yağlı süt">${esc(text)}</textarea>
      <div class="btn-row" style="margin:8px 0 12px">
        ${sttSupported() ? `<button type="button" class="btn" data-mic style="display:flex;align-items:center;gap:6px">${icon.mic}<span>Konuş</span></button>` : ''}
        <button type="button" class="btn primary" data-parse>Çözümle</button>
      </div>
      <div id="say-meal"></div>
      <div id="say-res"></div>
      <p class="small muted" style="margin:12px 4px 0;line-height:18px">Yapay zekâ kullanılmaz, ücretsizdir. Miktarı söylemezsen 1 porsiyon alınır. Yanlış eşleşeni "Değiştir"le düzeltirsen bir dahaki sefere hatırlar.</p>`,
  });
  const ft = document.createElement('div');
  ft.className = 'sheet-ft';
  ft.hidden = true;
  s.sheet.appendChild(ft);
  const ta = s.el.querySelector('#say-t');
  const resEl = s.el.querySelector('#say-res');
  const mealEl = s.el.querySelector('#say-meal');
  const micBtn = s.el.querySelector('[data-mic]');

  const drawMeal = () => {
    mealEl.innerHTML = items.length
      ? `<div class="toggle-row" style="margin-bottom:10px">${MEALS.map(([k, l]) => `<button type="button" class="tog sm" aria-pressed="${k === selMeal}" data-meal="${k}">${l}</button>`).join('')}</div>
         ${dayOffset ? `<p class="small" style="margin:0 4px 8px;color:var(--warn)">${relDay(addDays(state.date, dayOffset))} için eklenecek</p>` : ''}`
      : '';
  };
  const draw = () => {
    drawMeal();
    resEl.innerHTML = items.length
      ? `<div class="card flush">${items
          .map((it, i) => {
            if (!it.food)
              return `<div class="row"><span class="row-main"><span class="row-title normal" style="color:var(--warn)">Bulunamadı: "${esc(it.text)}"</span>
                <span class="row-sub">Listede yok; aramadan seçebilirsin</span></span><button type="button" class="pill" data-change="${i}">Ara</button></div>`;
            const n = nutrientsFor(it.food, it.grams);
            return `<div class="row frow">
              <button type="button" class="row-main" data-amount="${i}" style="text-align:left">
                <span class="row-title normal">${esc(cleanName(it.food.name))}${it.match === 'partial' ? ' <span class="tag" style="color:var(--warn)">kontrol et</span>' : ''}</span>
                <span class="row-sub">${esc(servingText(it.unit, it.qty, it.grams))} · <b class="num">${fmt(n.kcal)} kcal</b>${it.approx ? ' · miktar tahmini' : ''}</span>
                ${it.match !== 'full' ? `<span class="row-sub">Söylediğin: "${esc(it.text)}"</span>` : ''}
              </button>
              <button type="button" class="pill" data-change="${i}" style="flex:none">Değiştir</button>
              <button type="button" class="check-btn" aria-pressed="${it.on !== false}" data-toggle="${i}" aria-label="${esc(cleanName(it.food.name))}: ${it.on !== false ? 'ekleme' : 'ekle'}"><span class="check">${icon.check}</span></button>
            </div>`;
          })
          .join('')}</div>`
      : ta.value.trim()
      ? '<div class="empty">Cümlede besin bulamadım. Miktar ve besin adını yaz: "2 dilim ekmek, 1 yumurta" gibi.</div>'
      : '';
    const on = items.filter((x) => x.food && x.on !== false);
    const kcal = on.reduce((a, x) => a + nutrientsFor(x.food, x.grams).kcal, 0);
    ft.hidden = !on.length;
    ft.innerHTML = `<button type="button" class="btn primary block" data-addall>${on.length} besini ekle · ${fmt(kcal)} kcal</button>`;
  };
  const run = () => {
    const t = ta.value.trim();
    if (!t) return;
    const r = parseMealText(t, custom, hist.count, aliases);
    items = r.items.map((x) => ({ ...x, on: true }));
    if (r.meal) selMeal = r.meal;
    dayOffset = r.dayOffset;
    draw();
  };
  const startMic = () => {
    if (stop) {
      stop();
      return;
    }
    if (micBtn) micBtn.classList.add('primary');
    stop = listen({
      onInterim: (t) => (ta.value = t),
      onFinal: (t) => {
        ta.value = t;
        run();
      },
      onEnd: () => {
        stop = null;
        if (micBtn) micBtn.classList.remove('primary');
      },
      onError: (e) => {
        stop = null;
        if (micBtn) micBtn.classList.remove('primary');
        if (e === 'not-allowed' || e === 'service-not-allowed') toast('Mikrofon izni yok. Klavyedeki mikrofonla da söyleyebilirsin.', 4500);
        else if (e !== 'aborted' && e !== 'no-speech') toast('Ses tanınamadı, yeniden dene ya da yaz.', 3500);
      },
    });
  };
  // Bir kalemin besinini değiştir (yerel liste + Open Food Facts)
  const changeFood = (i) => {
    const it = items[i];
    const pk = openSheet({
      title: 'Besini seç',
      body: `<input id="pk-q" class="input" type="search" value="${esc(it.text)}" autocomplete="off" style="margin-bottom:10px">
        <div id="pk-res"></div>
        <button type="button" class="btn block" data-off style="margin-top:10px">Paketli ürünlerde ara (Open Food Facts)</button>
        <div id="pk-off"></div>`,
    });
    const q = pk.el.querySelector('#pk-q');
    let offItems = [];
    const drawPk = () => {
      const r = searchFoods(q.value, custom, hist.count).slice(0, 15);
      pk.el.querySelector('#pk-res').innerHTML = r.length
        ? `<div class="card flush search-res">${r
            .map((f) => `<button type="button" class="row" data-pick="${esc(f.id)}"><span class="row-main"><span class="row-title normal">${esc(cleanName(f.name))}${srcTag(f) ? ` <span class="tag">${srcTag(f)}</span>` : ''}</span>
              <span class="row-sub">100 g: ${fmt(f.k)} kcal · P ${fmt(f.p, 1)} · K ${fmt(f.c, 1)} · Y ${fmt(f.f, 1)}</span></span>${icon.chev}</button>`)
            .join('')}</div>`
        : '<div class="empty">Listede yok.</div>';
    };
    drawPk();
    q.addEventListener('input', drawPk);
    const choose = async (food) => {
      it.food = food;
      it.match = 'full';
      Object.assign(it, gramsFor(food, it.said.qty, it.said.unit));
      aliases[it.text] = food.id;
      await db.setSetting('say_aliases', aliases);
      pk.close();
      draw();
    };
    pk.el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pick) choose(findFood(b.dataset.pick, custom));
      else if (b.dataset.offi != null) {
        const f = offItems[Number(b.dataset.offi)];
        const mine = f.barcode ? custom.find((x) => x.barcode === f.barcode) : null;
        const saved = mine || markCustom([await db.put('custom_foods', { ...f, alias: it.text })])[0];
        if (!mine) custom.push(saved);
        choose(saved);
      } else if (b.hasAttribute('data-off')) {
        const box = pk.el.querySelector('#pk-off');
        box.innerHTML = '<div class="empty">Aranıyor…</div>';
        try {
          offItems = await searchProducts(q.value.trim());
          box.innerHTML = offItems.length
            ? `<div class="card flush" style="margin-top:10px">${offItems
                .map((f, k) => `<button type="button" class="row" data-offi="${k}"><span class="row-main"><span class="row-title normal">${esc(f.name)}</span>
                  <span class="row-sub">100 g: ${fmt(f.k)} kcal · P ${fmt(f.p, 1)} · K ${fmt(f.c, 1)} · Y ${fmt(f.f, 1)}</span></span>${icon.chev}</button>`)
                .join('')}</div>`
            : '<div class="empty">Sonuç yok.</div>';
        } catch (err) {
          box.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
        }
      }
    });
  };

  s.sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-parse')) run();
    else if (b.hasAttribute('data-mic')) startMic();
    else if (b.dataset.meal) {
      selMeal = b.dataset.meal;
      drawMeal();
    } else if (b.dataset.toggle != null) {
      const it = items[Number(b.dataset.toggle)];
      it.on = it.on === false;
      draw();
    } else if (b.dataset.change != null) changeFood(Number(b.dataset.change));
    else if (b.dataset.amount != null) {
      const it = items[Number(b.dataset.amount)];
      openAmount(it.food, selMeal, null, {
        serving: { unit: it.unit, qty: it.qty, grams: it.grams },
        selecting: true,
        onSelect: (sv) => {
          Object.assign(it, { unit: sv.unit, qty: sv.qty, grams: sv.grams, approx: false });
          draw();
        },
      });
    } else if (b.hasAttribute('data-addall')) {
      if (b.disabled) return;
      b.disabled = true; // art arda basınca iki kez eklenmesin
      const date = addDays(state.date, dayOffset);
      const on = items.filter((x) => x.food && x.on !== false);
      for (const it of on)
        await db.put('food_logs', {
          date,
          meal: selMeal,
          food_id: it.food.id,
          name: cleanName(it.food.name),
          grams: it.grams,
          unit: it.unit,
          qty: it.qty,
          estimated: false,
          source: 'cumle',
          ...nutrientsFor(it.food, it.grams),
        });
      toast(`${on.length} besin eklendi`);
      s.close();
      refresh();
    }
  });
  if (text) run();
  if (startListen && sttSupported()) setTimeout(startMic, 300);
  else setTimeout(() => ta.focus(), 300);
}

// Porsiyon seçimi ve besin detayı
// Eski bir kaydı açarken hesap, kaydın KENDİ değerleriyle yapılır (geçmiş sessizce değişmesin).
// Besinin güncel değerleri farklıysa kullanıcı isterse onlara geçebilir.
function snapshotFood(food, entry) {
  const g = entry.grams;
  const per = (x) => (x == null ? null : (Number(x) / g) * 100);
  return { ...food, k: per(entry.kcal), p: per(entry.protein_g), c: per(entry.carb_g), f: per(entry.fat_g), fb: per(entry.fiber_g), na: per(entry.sodium_mg), ka: per(entry.potassium_mg) };
}
function differs(a, b) {
  return ['k', 'p', 'c', 'f'].some((k) => Math.abs((Number(a[k]) || 0) - (Number(b[k]) || 0)) > Math.max(1, Math.abs(Number(b[k]) || 0) * 0.02));
}

async function openAmount(liveFood, meal, existing = null, opts = {}) {
  const snap = existing && existing.grams > 0 && existing.kcal != null ? snapshotFood(liveFood, existing) : null;
  let useLive = !snap;
  const changed = snap ? differs(snap, liveFood) : false;
  let food = useLive ? liveFood : snap;
  const base = baseUnit(liveFood);
  const portions = [...portionsOf(liveFood), ['gram', 1]];
  let sv;
  if (existing) {
    sv =
      existing.unit && existing.unit !== 'gram' && portions.some((p) => p[0] === existing.unit)
        ? { unit: existing.unit, qty: existing.qty || 1 }
        : { unit: 'gram', qty: existing.grams };
  } else if (opts.serving) sv = { unit: opts.serving.unit, qty: opts.serving.qty };
  else {
    const last = (await db.list('food_logs', (x) => x.food_id === food.id && x.grams)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
    sv = defaultServing(food, last);
  }
  if (!portions.some((p) => p[0] === sv.unit)) sv = { unit: 'gram', qty: sv.grams || 100 };
  let unit = sv.unit;
  let qty = sv.qty;
  let typed = !!existing; // kullanıcı miktarı kendisi girdi mi (girmediyse öneri gri görünür)
  let selMeal = meal;
  const selecting = !!opts.selecting;
  const grams = () => {
    const u = portions.find((p) => p[0] === unit);
    return round1(qty * (u ? u[1] : 1));
  };
  const s = openSheet({
    title: cleanName(food.name),
    leftLabel: 'Vazgeç',
    rightLabel: selecting ? 'Seç' : existing ? 'Kaydet' : 'Ekle',
    onRight: async (api) => {
      const g = grams();
      if (!validAmount(g)) return toast('Sıfırdan büyük bir miktar gir');
      if (selecting) {
        opts.onSelect && opts.onSelect({ unit, qty, grams: g });
        api.close();
        return;
      }
      try {
        await db.put('food_logs', logRecord({ ...food, id: liveFood.id, name: liveFood.name }, { unit, qty, grams: g }, { date: existing ? existing.date : state.date, meal: selMeal, source: existing ? existing.source || 'manuel' : 'manuel', existing }));
      } catch (err) {
        return toast('Kaydedilemedi: ' + (err.message || err), 4000);
      }
      api.close();
      opts.onLogged && opts.onLogged();
      toast(existing ? 'Güncellendi' : `${cleanName(food.name)} eklendi`);
      refresh();
    },
  });
  const sumHTML = () => {
    const g = grams() || 0;
    const n = nutrientsFor(food, g);
    const ek = { p: n.protein_g * 4, c: n.carb_g * 4, f: n.fat_g * 9 };
    const tot = ek.p + ek.c + ek.f;
    const pc = (x) => (tot ? Math.round((x / tot) * 100) : 0);
    return `
      <div class="fs-head">
        <div class="fs-kcal"><span class="big-num">${fmt(n.kcal)}</span><span class="small muted">kcal · ${fmt(g)} ${base}</span></div>
        <div class="fs-macs">
          <div class="fs-mac"><span class="lbl"><i class="dot c"></i>Karb.</span><span class="val">${fmt(n.carb_g, 1)} g</span><span class="small muted">%${pc(ek.c)}</span></div>
          <div class="fs-mac"><span class="lbl"><i class="dot f"></i>Yağ</span><span class="val">${fmt(n.fat_g, 1)} g</span><span class="small muted">%${pc(ek.f)}</span></div>
          <div class="fs-mac"><span class="lbl"><i class="dot p"></i>Protein</span><span class="val">${fmt(n.protein_g, 1)} g</span><span class="small muted">%${pc(ek.p)}</span></div>
        </div>
      </div>
      <div class="mbar3" aria-hidden="true">${tot ? `<span class="c" style="width:${pc(ek.c)}%"></span><span class="f" style="width:${pc(ek.f)}%"></span><span class="p" style="width:${pc(ek.p)}%"></span>` : ''}</div>`;
  };
  const tblHTML = () => {
    const g = grams() || 0;
    const n = nutrientsFor(food, g);
    const rows = [
      ['Kalori', `${fmt(n.kcal)} kcal`],
      ['Protein', `${fmt(n.protein_g, 1)} g`],
      ['Karbonhidrat', `${fmt(n.carb_g, 1)} g`],
      ['Lif', food.fb == null ? '– (bilinmiyor)' : `${fmt(n.fiber_g, 1)} g`],
      ['Yağ', `${fmt(n.fat_g, 1)} g`],
      ['Sodyum', food.na == null ? '– (bilinmiyor)' : `${fmt(n.sodium_mg)} mg`],
    ];
    if (food.ka) rows.push(['Potasyum', `${fmt(n.potassium_mg)} mg`]);
    return rows.map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('') +
      `<p class="small muted" style="margin:8px 0 0">100 ${base}: ${fmt(food.k)} kcal · P ${fmt(food.p, 1)} · K ${fmt(food.c, 1)} · Y ${fmt(food.f, 1)}</p>`;
  };
  const refreshNums = () => {
    s.el.querySelector('#fs-sum').innerHTML = sumHTML();
    s.el.querySelector('#fs-tbl').innerHTML = tblHTML();
  };
  const draw = () => {
    s.setBody(`
      <p class="small muted" style="margin:-2px 4px 10px;text-align:center">${esc(srcLine(liveFood))}</p>
      ${snap && changed ? `<div class="card" style="padding:10px 14px;margin-bottom:10px"><p class="small" style="margin:0 0 8px;line-height:18px">${useLive ? 'Besinin güncel değerleri kullanılıyor.' : 'Bu kayıt, eklendiği andaki değerlerle açıldı. Besin ya da tarif sonradan değişmiş.'}</p><button type="button" class="btn block" data-live>${useLive ? 'Kaydın kendi değerlerine dön' : 'Güncel değerlerle hesapla'}</button></div>` : ''}
      <div class="card" id="fs-sum">${sumHTML()}</div>
      <div class="field"><span class="lbl">Porsiyon</span>
        <div class="toggle-row">${portions
          .map(([l, gr]) => `<button type="button" class="tog" aria-pressed="${unit === l}" data-unit="${esc(l)}">${l === 'gram' ? base : `${esc(l)} · ${fmt(gr)} ${base}`}</button>`)
          .join('')}</div></div>
      <div class="field"><label for="qty">Miktar (${esc(unit === 'gram' ? base : unit)})</label>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="Azalt">−</button>
          <input id="qty" inputmode="decimal" value="${typed ? String(qty).replace('.', ',') : ''}" placeholder="${String(qty).replace('.', ',')}">
          <button type="button" data-step="1" aria-label="Artır">+</button>
        </div>
        ${unit !== 'gram' ? `<div class="toggle-row" style="margin-top:4px">${[0.5, 1, 1.5, 2, 3].map((v) => `<button type="button" class="tog sm" data-q="${v}" aria-pressed="${qty === v}">${String(v).replace('.', ',')}</button>`).join('')}</div>` : ''}
      </div>
      ${
        selecting
          ? ''
          : `<div class="field"><span class="lbl">Öğün</span>
        <div class="toggle-row">${MEALS.map(([k, l]) => `<button type="button" class="tog" aria-pressed="${selMeal === k}" data-meal="${k}">${l}</button>`).join('')}</div></div>`
      }
      <div class="sec" style="padding:4px 14px 6px"><h2>Besin değerleri</h2></div>
      <div class="card" id="fs-tbl">${tblHTML()}</div>
      ${liveFood.recipe ? `<div class="btn-row" style="margin-top:4px"><button type="button" class="btn" data-recipe-detail>Tarif ayrıntıları</button><button type="button" class="btn" data-edit-recipe>Tarifi düzenle</button></div>` : food.custom && !existing ? `<button type="button" class="btn block" data-edit-food style="margin-top:4px">Besini düzenle</button>` : ''}
      ${!food.custom && !existing ? `<button type="button" class="btn block" data-fix style="margin-top:4px">Değerleri düzelt</button>` : ''}
      ${food.custom && !existing ? `<button type="button" class="btn danger block" data-del-food style="margin-top:4px">${food.overrides ? 'Orijinal değerlere dön' : 'Listemden sil'}</button>` : ''}
      ${existing ? `<button type="button" class="btn danger block" data-del style="margin-top:12px">Kaydı sil</button>` : ''}`);
    const q = s.el.querySelector('#qty');
    const ph = qty;
    q.addEventListener('input', () => {
      const v = q.value.trim() === '' ? ph : parseNum(q.value);
      if (!isNaN(v)) {
        typed = q.value.trim() !== '';
        qty = v;
        s.el.querySelectorAll('[data-q]').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.q) === qty));
        refreshNums();
      }
    });
  };
  draw();
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-live')) {
      useLive = !useLive;
      food = useLive ? liveFood : snap;
      draw();
    } else if (b.dataset.unit) {
      const g = grams();
      unit = b.dataset.unit;
      const u = portions.find((p) => p[0] === unit);
      qty = unit === 'gram' ? Math.round(g) || 100 : Math.max(0.5, Math.round((g / u[1]) * 2) / 2) || 1;
      typed = false;
      draw();
    } else if (b.dataset.q) {
      qty = Number(b.dataset.q);
      typed = true;
      draw();
    } else if (b.dataset.meal) {
      selMeal = b.dataset.meal;
      s.el.querySelectorAll('[data-meal]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.meal === selMeal));
    } else if (b.dataset.step) {
      const step = unit === 'gram' ? 10 : 0.5;
      qty = Math.max(0, round1(qty + Number(b.dataset.step) * step));
      typed = true;
      s.el.querySelector('#qty').value = String(qty).replace('.', ',');
      s.el.querySelectorAll('[data-q]').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.q) === qty));
      refreshNums();
    } else if (b.hasAttribute('data-del')) {
      await db.remove('food_logs', existing.id);
      s.close();
      toast('Silindi');
      refresh();
    } else if (b.hasAttribute('data-edit-recipe')) {
      s.close();
      openRecipe(liveFood, () => (opts.onChanged ? opts.onChanged() : refresh()));
    } else if (b.hasAttribute('data-recipe-detail')) {
      s.close();
      openRecipeDetail(liveFood, selMeal, () => (opts.onChanged ? opts.onChanged() : refresh()));
    } else if (b.hasAttribute('data-edit-food')) {
      s.close();
      openCustomFood(selMeal, liveFood, () => opts.onChanged && opts.onChanged());
    } else if (b.hasAttribute('data-fix')) {
      s.close();
      const { custom: _c, id: origId, ...raw } = liveFood;
      const saved = await reviewFood({ ...raw, name: cleanName(liveFood.name), overrides: origId, source: 'düzeltme' });
      if (saved) toast('Değerler kaydedildi');
      if (opts.onChanged) opts.onChanged();
      else if (saved) refresh();
    } else if (b.hasAttribute('data-del-food')) {
      const ov = !!food.overrides;
      if (!(await confirmSheet({ title: ov ? 'Orijinal değerlere dön' : 'Listemden sil', text: ov ? `"${cleanName(food.name)}" için girdiğin değerler silinsin ve uygulamanın değerleri kullanılsın mı? Daha önceki kayıtların etkilenmez.` : `"${cleanName(food.name)}" listenden silinsin mi? Daha önceki kayıtların etkilenmez.`, okLabel: ov ? 'Geri dön' : 'Sil', danger: true }))) return;
      await db.remove('custom_foods', food.id);
      s.close();
      toast(ov ? 'Orijinal değerlere dönüldü' : 'Silindi');
      opts.onChanged && opts.onChanged();
    }
  });
}

// Değerini bildiğin bir şeyi hızlıca ekle (sadece kalori, isteğe bağlı makrolar)
function openQuickAdd(meal) {
  let selMeal = meal;
  const s = openSheet({
    title: 'Hızlı kalori ekle',
    leftLabel: 'Vazgeç',
    rightLabel: 'Ekle',
    body: `
      <div class="field"><label for="qa-k">Kalori (kcal)</label><input id="qa-k" class="input" inputmode="decimal" placeholder="Örn. 450"></div>
      <div class="grid3">
        <div class="field"><label for="qa-p">Protein (g)</label><input id="qa-p" class="input" inputmode="decimal"></div>
        <div class="field"><label for="qa-c">Karb. (g)</label><input id="qa-c" class="input" inputmode="decimal"></div>
        <div class="field"><label for="qa-f">Yağ (g)</label><input id="qa-f" class="input" inputmode="decimal"></div>
      </div>
      <div class="field"><label for="qa-n">Açıklama – isteğe bağlı</label><input id="qa-n" class="input" placeholder="Örn. Restoranda akşam yemeği"></div>
      <div class="field"><span class="lbl">Öğün</span>
        <div class="toggle-row">${MEALS.map(([k, l]) => `<button type="button" class="tog" aria-pressed="${selMeal === k}" data-meal="${k}">${l}</button>`).join('')}</div></div>
      <p class="small muted" style="margin:0 4px;line-height:18px">Paketin üzerinde yazan ya da başka bir yerden bildiğin değerleri doğrudan girmek için.</p>`,
    onRight: async (api) => {
      const v = (id) => parseNum(s.el.querySelector(id).value);
      const k = v('#qa-k');
      if (isNaN(k) || k <= 0) return toast('Kaloriyi gir');
      const name = s.el.querySelector('#qa-n').value.trim() || 'Hızlı ekleme';
      await db.put('food_logs', {
        date: state.date,
        meal: selMeal,
        name,
        grams: null,
        kcal: Math.round(k),
        protein_g: v('#qa-p') || 0,
        carb_g: v('#qa-c') || 0,
        fat_g: v('#qa-f') || 0,
        fiber_g: 0,
        sodium_mg: 0,
        potassium_mg: 0,
        estimated: false,
        source: 'hizli-kalori',
      });
      api.close();
      toast('Eklendi');
      refresh();
    },
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-meal]');
    if (!b) return;
    selMeal = b.dataset.meal;
    s.el.querySelectorAll('[data-meal]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.meal === selMeal));
  });
  setTimeout(() => s.el.querySelector('#qa-k').focus(), 250);
}

// Tarif oluşturucu: malzemeleri gir, porsiyon başına değerleri hesapla
// ---------- Tarifler ----------
// Tarif custom_foods'ta normal bir besin olarak durur (aramada, Tarifler sekmesinde, günlüğe eklenebilir).
// Hesap gram üzerinden; her malzemenin 100 g değerleri anlık görüntü olarak tarifte de saklanır, böylece
// malzeme sonradan silinse bile tarif bozulmaz. Pişmiş son ağırlık girilirse 100 g ve porsiyon ona göre hesaplanır.
const trq = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
const nutLine = (t, sv = 1, d = 1) => `P ${fmt(t.p / sv, d)} · K ${fmt(t.c / sv, d)} · Y ${fmt(t.f / sv, d)} g`;
const optTxt = (v, sv, unit, d = 0) => (v == null ? 'bilinmiyor' : `${fmt(v / sv, d)} ${unit}`);

async function openRecipe(existing, after, { copy = false } = {}) {
  const custom = markCustom(await db.list('custom_foods'));
  const pool = custom.filter((c) => !existing || copy || c.id !== existing.id);
  const R = normalizeRecipe(existing);
  // malzemeler: { food_id, name, grams, unit, qty, snap, food, per100, status }
  let ingr = R.items.map((it) => resolveItem({ ...it, unit: it.unit || 'gram', qty: it.qty ?? it.grams }, pool));
  let servings = R.servings;
  let scaleOn = true;
  let steps = [...R.steps];
  let tags = [...R.tags];
  let done = false;
  let saving = false;
  const s = openSheet({
    title: existing && !copy ? 'Tarifi düzenle' : 'Yeni tarif',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onClose: () => {
      if (!done && after) after();
    },
    body: `
      <div class="field"><label for="rc-name">Tarifin adı</label><input id="rc-name" class="input" value="${esc(existing ? (copy ? cleanName(existing.name) + ' (kopya)' : cleanName(existing.name)) : '')}" placeholder="Örn. Tavuklu bulgur pilavı"></div>
      <div class="grid2">
        <div class="field"><label for="rc-cat">Kategori</label><select id="rc-cat" class="input">${RECIPE_CATEGORIES.map(([k, l]) => `<option value="${k}" ${R.category === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="rc-serv">Porsiyon sayısı</label>
          <div class="stepper"><button type="button" data-sstep="-0.5" aria-label="Azalt">−</button><input id="rc-serv" inputmode="decimal" value="${trq(servings)}"><button type="button" data-sstep="0.5" aria-label="Artır">+</button></div></div>
      </div>
      <label class="kv" style="border-top:0;min-height:36px"><span class="k small">Porsiyon sayısı değişince malzemeleri ölçekle</span><span class="switch"><input id="rc-scale" type="checkbox" checked><span></span></span></label>
      <div class="field"><label for="rc-desc">Kısa açıklama – isteğe bağlı</label><textarea id="rc-desc" class="input" rows="2">${esc(R.description)}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="rc-prep">Hazırlama (dk)</label><input id="rc-prep" class="input" inputmode="numeric" value="${R.prep_min ?? ''}"></div>
        <div class="field"><label for="rc-cook">Pişirme (dk)</label><input id="rc-cook" class="input" inputmode="numeric" value="${R.cook_min ?? ''}"></div>
      </div>
      <div class="field"><span class="lbl">Etiketler</span><div class="toggle-row" id="rc-tags"></div>
        <input id="rc-tag-new" class="input" placeholder="Kendi etiketin (Enter ile ekle)" style="margin-top:6px"></div>
      <div class="sec" style="padding:4px 4px 6px"><h2>Malzemeler</h2><span class="meta" id="rc-count"></span></div>
      <div id="rc-items"></div>
      <label class="sr-only" for="rc-q">Malzeme ara</label>
      <input id="rc-q" class="input" type="search" placeholder="Malzeme ara ve ekle: yumurta, bulgur…" autocomplete="off" style="margin:4px 0 8px">
      <div id="rc-res"></div>
      <div class="field"><label for="rc-cooked">Pişmiş son ağırlık (g) – isteğe bağlı</label><input id="rc-cooked" class="input" inputmode="decimal" value="${R.cooked_weight ? trq(R.cooked_weight) : ''}" placeholder="Tencerenin pişmiş hâli, kap hariç"></div>
      <div class="card" id="rc-tot"></div>
      <div class="sec" style="padding:4px 4px 6px"><h2>Hazırlanışı</h2></div>
      <div id="rc-steps"></div>
      <button type="button" class="btn block" data-step-add style="margin:4px 0 12px">+ Adım ekle</button>
      ${existing && !copy ? '<button type="button" class="btn danger block" data-del-recipe>Tarifi sil</button>' : ''}`,
    onRight: async (api) => {
      if (saving) return;
      syncSteps();
      const name = s.el.querySelector('#rc-name').value.trim();
      if (!name) return toast('Tarife bir ad ver');
      if (!ingr.length) return toast('En az bir malzeme ekle');
      if (ingr.some((x) => !(x.grams > 0))) return toast('Her malzemenin miktarı sıfırdan büyük olmalı');
      const { totals, missing } = recipeTotals(ingr);
      if (missing.length) return toast(`Değeri bilinmeyen malzeme var: ${missing.join(', ')}. Çıkar ya da yerine besin seç.`, 4500);
      const cooked = parseNum(s.el.querySelector('#rc-cooked').value);
      if (s.el.querySelector('#rc-cooked').value.trim() && !(cooked > 0)) return toast('Pişmiş ağırlık sıfırdan büyük olmalı');
      const nu = recipeNutrition(totals, servings, cooked > 0 ? cooked : null);
      saving = true;
      let saved;
      try {
        const keep = existing && !copy ? (({ custom: _c, ...rest }) => rest)(existing) : {};
        saved = await db.put('custom_foods', {
          ...keep,
          ...(existing && !copy ? { id: existing.id } : {}),
          name,
          alias: 'tarif',
          k: nu.k,
          p: nu.p,
          c: nu.c,
          f: nu.f,
          fb: nu.fb,
          na: nu.na,
          ka: nu.ka,
          portions: [['porsiyon', nu.portion_g]],
          default_portion: 'porsiyon',
          category: keep.category || 'yemek',
          source: 'tarif',
          recipe: {
            servings,
            items: ingr.map((x) => ({ food_id: x.food_id || null, name: x.name, grams: x.grams, unit: x.unit, qty: x.qty, snap: x.per100 })),
            cooked_weight: cooked > 0 ? cooked : null,
            category: s.el.querySelector('#rc-cat').value,
            description: s.el.querySelector('#rc-desc').value.trim().slice(0, 500),
            prep_min: parseInt(s.el.querySelector('#rc-prep').value, 10) || null,
            cook_min: parseInt(s.el.querySelector('#rc-cook').value, 10) || null,
            tags,
            steps: steps.map((x) => x.trim()).filter(Boolean),
          },
        });
      } catch (err) {
        saving = false;
        return toast('Kaydedilemedi: ' + (err.message || err), 4000);
      }
      done = true;
      api.close();
      toast(existing && !copy ? 'Tarif güncellendi' : 'Tarif kaydedildi');
      if (after) after(saved);
      else refresh();
    },
  });
  const itemsEl = s.el.querySelector('#rc-items');
  const resEl = s.el.querySelector('#rc-res');
  const totEl = s.el.querySelector('#rc-tot');
  const stepsEl = s.el.querySelector('#rc-steps');
  const q = s.el.querySelector('#rc-q');

  const drawTags = () => {
    const all = [...new Set([...RECIPE_TAGS, ...tags])];
    s.el.querySelector('#rc-tags').innerHTML = all.map((t) => `<button type="button" class="tog" data-tag="${esc(t)}" aria-pressed="${tags.includes(t)}">${esc(t)}</button>`).join('');
  };
  const drawTot = () => {
    const { totals: t, missing } = recipeTotals(ingr);
    const cookedV = parseNum(s.el.querySelector('#rc-cooked').value);
    const nu = recipeNutrition(t, servings, cookedV > 0 ? cookedV : null);
    const sv = servings || 1;
    s.el.querySelector('#rc-count').textContent = ingr.length ? `${ingr.length} malzeme` : '';
    totEl.innerHTML = `
      ${missing.length ? `<p class="small warn" style="margin:0 0 8px;line-height:18px">Değeri bilinmeyen malzeme: ${esc(missing.join(', '))}. Toplamlar eksik; kaydetmeden önce çıkar ya da yerine besin seç.</p>` : ''}
      <div class="kv" style="border-top:0"><span class="k">Toplam</span><span class="v">${fmt(t.k)} kcal · ${nutLine(t, 1, 0)}</span></div>
      <div class="kv"><span class="k">1 porsiyon (${fmt(nu.portion_g)} g)</span><span class="v"><b>${fmt(t.k / sv)} kcal</b> · ${nutLine(t, sv)}</span></div>
      <div class="kv"><span class="k">100 g</span><span class="v">${fmt(nu.k)} kcal · P ${fmt(nu.p, 1)} · K ${fmt(nu.c, 1)} · Y ${fmt(nu.f, 1)}</span></div>
      <div class="kv"><span class="k">Lif · sodyum · potasyum (toplam)</span><span class="v">${optTxt(t.fb, 1, 'g', 1)} · ${optTxt(t.na, 1, 'mg')} · ${optTxt(t.ka, 1, 'mg')}</span></div>
      <p class="small muted" style="margin:6px 0 0;line-height:17px">${nu.basis.cooked ? `100 g ve porsiyon, girdiğin pişmiş son ağırlığa (${fmt(nu.basis.grams)} g) göre hesaplandı.` : `Pişmiş ağırlık girilmedi: 100 g ve porsiyon, çiğ malzemelerin toplam ağırlığına (${fmt(t.g)} g) göre hesaplanıyor. Pişince su kaybı ya da emme olacağı için pişmiş ağırlığı tartıp girersen daha doğru olur.`}</p>`;
  };
  const unitOpts = (x) => {
    const ps = x.food ? portionsOf(x.food) : [];
    return [['gram', 1], ...ps].map(([l, g]) => `<option value="${esc(l)}" ${x.unit === l ? 'selected' : ''}>${l === 'gram' ? 'g' : `${esc(l)} (${fmt(g)} g)`}</option>`).join('');
  };
  const drawItems = () => {
    itemsEl.innerHTML = ingr.length
      ? `<div class="card flush">${ingr
          .map((x, i) => {
            const kc = x.per100 ? fmt(((x.per100.k || 0) * (x.grams || 0)) / 100) + ' kcal' : 'değeri bilinmiyor';
            const note = x.status === 'snapshot' ? ' · kayıtlı değerlerle (besin listende yok)' : x.status === 'missing' ? ' · besin bulunamadı' : '';
            return `<div class="row rc-row" style="flex-wrap:wrap;gap:6px">
              <span class="row-main" style="flex:1 1 100%"><span class="row-title normal">${esc(cleanName(x.name))}</span>
                <span class="row-sub num ${x.status === 'missing' ? 'warn' : ''}" data-ik="${i}">${fmt(x.grams)} g · ${kc}${note}</span></span>
              <label class="sr-only" for="rq-${i}">${esc(x.name)} miktar</label>
              <input id="rq-${i}" class="input num" data-iq="${i}" inputmode="decimal" value="${trq(x.qty ?? x.grams)}" style="width:72px;flex:none;text-align:right;min-height:38px;padding:6px 8px">
              <label class="sr-only" for="ru-${i}">${esc(x.name)} ölçü</label>
              <select id="ru-${i}" class="input" data-iu="${i}" style="flex:1;min-width:0;min-height:38px;padding:6px 8px" ${x.food ? '' : 'disabled'}>${unitOpts(x)}</select>
              <button type="button" class="icon-btn" data-rm="${i}" aria-label="${esc(x.name)} çıkar" style="flex:none;color:var(--sub)">${icon.close}</button>
            </div>`;
          })
          .join('')}</div>`
      : `<div class="empty">Henüz malzeme yok. Aşağıdan ara ve ekle.</div>`;
    drawTot();
  };
  const drawSteps = () => {
    stepsEl.innerHTML = steps.length
      ? steps
          .map(
            (t, i) => `<div class="card rc-step" style="padding:8px 10px;margin-bottom:8px;display:flex;gap:8px;align-items:flex-start">
              <b style="flex:none;min-width:22px;padding-top:9px">${i + 1}.</b>
              <label class="sr-only" for="rs-${i}">Adım ${i + 1}</label>
              <textarea id="rs-${i}" class="input" data-st="${i}" rows="2" style="flex:1;min-width:0">${esc(t)}</textarea>
              <div style="display:flex;flex-direction:column;gap:2px;flex:none">
                <button type="button" class="icon-btn" data-sup="${i}" aria-label="Adım ${i + 1} yukarı" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="icon-btn" data-sdown="${i}" aria-label="Adım ${i + 1} aşağı" ${i === steps.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="icon-btn" data-srm="${i}" aria-label="Adım ${i + 1} sil" style="color:var(--sub)">${icon.close}</button>
              </div></div>`
          )
          .join('')
      : `<p class="small muted" style="margin:0 4px 8px">Henüz adım yok.</p>`;
  };
  const syncSteps = () => stepsEl.querySelectorAll('[data-st]').forEach((el) => (steps[Number(el.dataset.st)] = el.value));
  let found = [];
  let seq = 0;
  const drawRes = () => {
    const my = ++seq;
    const v = q.value.trim();
    found = v ? searchFoods(v, pool).slice(0, 8) : [];
    if (my !== seq) return;
    resEl.innerHTML = found.length
      ? `<div class="card flush search-res" style="margin-bottom:10px">${found
          .map((f, i) => {
            const d = defaultServing(f);
            return `<button type="button" class="row" data-add="${i}"><span class="row-main"><span class="row-title normal">${esc(cleanName(f.name))}</span>
              <span class="row-sub">${esc(servingText(d.unit, d.qty, d.grams, baseUnit(f)))} · ${fmt(nutrientsFor(f, d.grams).kcal)} kcal</span></span><span class="pill" aria-hidden="true">+</span></button>`;
          })
          .join('')}</div>`
      : v
      ? `<div class="empty" style="padding:8px 0 14px">Bulunamadı. Önce "Yeni besin" ile ekleyebilirsin.</div>`
      : '';
  };
  drawTags();
  drawItems();
  drawSteps();
  q.addEventListener('input', drawRes);
  s.el.querySelector('#rc-scale').addEventListener('change', (e) => (scaleOn = e.target.checked));
  s.el.querySelector('#rc-tag-new').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = e.target.value.trim().slice(0, 30);
    if (t && !tags.includes(t) && tags.length < 12) tags.push(t);
    e.target.value = '';
    drawTags();
  });
  const setServings = (v) => {
    if (!(v > 0) || v > 100) return;
    const old = servings;
    servings = Math.round(v * 100) / 100;
    if (scaleOn && old > 0 && servings !== old) {
      const f = servings / old;
      ingr = scaleItems(ingr, f);
      const cEl = s.el.querySelector('#rc-cooked');
      const cv = parseNum(cEl.value);
      if (cv > 0) cEl.value = trq(Math.round(cv * f * 10) / 10);
      drawItems();
    } else drawTot();
  };
  const recalcItem = (i) => {
    const x = ingr[i];
    const g = x.food ? itemGrams(x.food, x.unit, x.qty) : parseNum(String(x.qty));
    x.grams = g > 0 ? g : 0;
    const el = s.el.querySelector(`[data-ik="${i}"]`);
    if (el) el.textContent = `${fmt(x.grams)} g · ${x.per100 ? fmt(((x.per100.k || 0) * x.grams) / 100) + ' kcal' : 'değeri bilinmiyor'}`;
    drawTot();
  };
  s.el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.iq != null) {
      ingr[Number(t.dataset.iq)].qty = parseNum(t.value);
      recalcItem(Number(t.dataset.iq));
    } else if (t.id === 'rc-cooked') drawTot();
  });
  s.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.iu != null) {
      const i = Number(t.dataset.iu);
      const x = ingr[i];
      // ölçü değişince gramı koru, miktarı yeni ölçüye çevir
      const p = t.value === 'gram' ? 1 : (portionsOf(x.food).find((pp) => pp[0] === t.value) || [null, 0])[1];
      x.unit = t.value;
      x.qty = p ? Math.round((x.grams / p) * 100) / 100 : x.qty;
      drawItems();
    } else if (t.id === 'rc-serv') setServings(parseNum(t.value));
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add != null) {
      const f = found[Number(b.dataset.add)];
      const d = defaultServing(f);
      ingr.push(resolveItem({ food_id: f.id, name: cleanName(f.name), grams: d.grams, unit: d.unit, qty: d.qty }, [f, ...pool]));
      q.value = '';
      drawRes();
      drawItems();
    } else if (b.dataset.rm != null) {
      ingr.splice(Number(b.dataset.rm), 1);
      drawItems();
    } else if (b.dataset.sstep) {
      setServings(Math.max(0.5, servings + Number(b.dataset.sstep)));
      s.el.querySelector('#rc-serv').value = trq(servings);
    } else if (b.dataset.tag) {
      const t = b.dataset.tag;
      tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
      drawTags();
    } else if (b.hasAttribute('data-step-add')) {
      syncSteps();
      if (steps.length >= 30) return;
      steps.push('');
      drawSteps();
      stepsEl.querySelector(`#rs-${steps.length - 1}`)?.focus();
    } else if (b.dataset.sup != null || b.dataset.sdown != null) {
      syncSteps();
      const i = Number(b.dataset.sup ?? b.dataset.sdown);
      const j = b.dataset.sup != null ? i - 1 : i + 1;
      if (j < 0 || j >= steps.length) return;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      drawSteps();
    } else if (b.dataset.srm != null) {
      syncSteps();
      steps.splice(Number(b.dataset.srm), 1);
      drawSteps();
    } else if (b.hasAttribute('data-del-recipe')) {
      if (!(await confirmSheet({ title: 'Tarifi sil', text: `"${cleanName(existing.name)}" silinsin mi? Daha önceki günlük kayıtların etkilenmez.`, okLabel: 'Sil', danger: true }))) return;
      try {
        await db.remove('custom_foods', existing.id);
      } catch (err) {
        return toast('Silinemedi: ' + (err.message || err), 4000);
      }
      done = true;
      s.close();
      toast('Tarif silindi');
      if (after) after();
    }
  });
}

// Tarif detay ekranı: bilgiler, malzemeler, adımlar, toplam / porsiyon / 100 g değerleri ve işlemler
async function openRecipeDetail(food, meal, after = null) {
  const custom = markCustom(await db.list('custom_foods'));
  const R = normalizeRecipe(food);
  const items = R.items.map((it) => resolveItem(it, custom.filter((c) => c.id !== food.id)));
  const { totals: t, missing } = recipeTotals(items);
  const nu = recipeNutrition(t, R.servings, R.cooked_weight);
  const sv = R.servings || 1;
  const s = openSheet({
    title: cleanName(food.name),
    body: `
      <p class="small muted" style="margin:-2px 4px 10px;text-align:center">${esc(RECIPE_CAT_LABEL[R.category] || 'Tarif')}${R.prep_min ? ` · hazırlama ${R.prep_min} dk` : ''}${R.cook_min ? ` · pişirme ${R.cook_min} dk` : ''} · ${trq(sv)} porsiyon</p>
      ${R.tags.length ? `<div class="toggle-row" style="justify-content:center;margin-bottom:10px">${R.tags.map((x) => `<span class="tog" aria-disabled="true">${esc(x)}</span>`).join('')}</div>` : ''}
      ${R.description ? `<p style="margin:0 4px 12px;font-size:15px;line-height:21px">${esc(R.description)}</p>` : ''}
      <div class="card">
        ${missing.length ? `<p class="small warn" style="margin:0 0 8px">Değeri bilinmeyen malzeme: ${esc(missing.join(', '))}. Aşağıdaki değerler eksik olabilir.</p>` : ''}
        <div class="kv" style="border-top:0"><span class="k">1 porsiyon (${fmt(nu.portion_g)} g)</span><span class="v"><b>${fmt(t.k / sv)} kcal</b></span></div>
        <div class="kv"><span class="k">Porsiyonda P · K · Y</span><span class="v">${nutLine(t, sv)}</span></div>
        <div class="kv"><span class="k">Porsiyonda lif · sodyum · potasyum</span><span class="v">${optTxt(t.fb, sv, 'g', 1)} · ${optTxt(t.na, sv, 'mg')} · ${optTxt(t.ka, sv, 'mg')}</span></div>
        <div class="kv"><span class="k">Toplam</span><span class="v">${fmt(t.k)} kcal · ${nutLine(t, 1, 0)}</span></div>
        <div class="kv"><span class="k">100 g</span><span class="v">${fmt(nu.k)} kcal · P ${fmt(nu.p, 1)} · K ${fmt(nu.c, 1)} · Y ${fmt(nu.f, 1)}</span></div>
        <p class="small muted" style="margin:6px 0 0;line-height:17px">${nu.basis.cooked ? `Pişmiş son ağırlık (${fmt(nu.basis.grams)} g) üzerinden.` : `Çiğ malzemelerin toplam ağırlığı (${fmt(t.g)} g) üzerinden; pişmiş ağırlık girilmedi.`}</p>
      </div>
      <div class="btn-row" style="margin-bottom:12px"><button type="button" class="btn primary" data-log>Günlüğe ekle</button><button type="button" class="btn" data-edit>Düzenle</button></div>
      <div class="sec" style="padding:4px 4px 6px"><h2>Malzemeler</h2><span class="meta">${items.length}</span></div>
      <div class="card flush">${items
        .map((x) => `<div class="row"><span class="row-main"><span class="row-title normal">${esc(cleanName(x.name))}</span><span class="row-sub ${x.status === 'missing' ? 'warn' : ''}">${x.unit && x.unit !== 'gram' ? `${trq(x.qty)} ${esc(x.unit)} · ` : ''}${fmt(x.grams)} g${x.status === 'snapshot' ? ' · kayıtlı değerlerle' : x.status === 'missing' ? ' · değeri bilinmiyor' : ''}</span></span><span class="row-end">${x.per100 ? fmt(((x.per100.k || 0) * x.grams) / 100) : '–'}</span></div>`)
        .join('')}</div>
      ${R.steps.length ? `<div class="sec" style="padding:4px 4px 6px"><h2>Hazırlanışı</h2></div><ol class="card" style="margin:0 0 12px;padding:12px 14px 12px 34px;line-height:22px">${R.steps.map((x) => `<li style="margin-bottom:6px">${esc(x)}</li>`).join('')}</ol>` : ''}
      <div class="btn-row"><button type="button" class="btn" data-copy>Kopyala</button><button type="button" class="btn danger" data-del style="background:var(--card)">Sil</button></div>`,
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const back = () => (after ? after() : refresh());
    if (b.hasAttribute('data-log')) {
      s.close();
      openAmount(food, meal, null, { onLogged: () => refresh(), onChanged: back });
    } else if (b.hasAttribute('data-edit')) {
      s.close();
      openRecipe(food, back);
    } else if (b.hasAttribute('data-copy')) {
      s.close();
      openRecipe(food, back, { copy: true });
    } else if (b.hasAttribute('data-del')) {
      if (!(await confirmSheet({ title: 'Tarifi sil', text: `"${cleanName(food.name)}" silinsin mi? Daha önceki günlük kayıtların etkilenmez.`, okLabel: 'Sil', danger: true }))) return;
      try {
        await db.remove('custom_foods', food.id);
      } catch (err) {
        return toast('Silinemedi: ' + (err.message || err), 4000);
      }
      s.close();
      toast('Tarif silindi');
      back();
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
        <div class="kv"><span class="k">Kaynak</span><span class="v">${entry.source === 'plan' ? 'Beslenme planı' : entry.estimated ? 'Coach tahmini' : 'Veritabanı'}</span></div>
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

// ---------- Akıllı ekleme: değerleri bilmeden besin ekle ----------
async function saveAndAmount(food, meal) {
  const saved = await reviewFood(food);
  if (saved) openAmount({ ...saved, custom: true }, meal);
}

function openSmartCustom(meal, name = '') {
  const s = openSheet({
    title: 'Kendi besinini ekle',
    body: `
      <p style="margin:0 4px 12px;font-size:15px;line-height:21px">Değerleri bilmen gerekmiyor. Nasıl eklemek istersin?</p>
      <div class="card flush">
        <button type="button" class="row" data-m="ai"><span class="row-main"><span class="row-title">Adını yaz, yapay zekâ hesaplasın</span>
          <span class="row-sub">Ev yemekleri ve restoran yemekleri için. İstersen tarifini de yazabilirsin.</span></span>${icon.chev}</button>
        <label class="row" style="cursor:pointer"><span class="row-main"><span class="row-title">Besin etiketinin fotoğrafını çek</span>
          <span class="row-sub">Paketli ürünler: arkadaki besin tablosunu okur.</span></span>${icon.chev}
          <input type="file" accept="image/*" capture="environment" class="sr-only" data-m="label"></label>
        <label class="row" style="cursor:pointer"><span class="row-main"><span class="row-title">Tabağın fotoğrafını çek</span>
          <span class="row-sub">Yemeği tanıyıp porsiyonu tahmin eder (en az kesin yöntem).</span></span>${icon.chev}
          <input type="file" accept="image/*" capture="environment" class="sr-only" data-m="photo"></label>
        <button type="button" class="row" data-m="off"><span class="row-main"><span class="row-title">Paketli ürünlerde ara</span>
          <span class="row-sub">Open Food Facts'te marka veya ürün adıyla.</span></span>${icon.chev}</button>
        <button type="button" class="row" data-m="manual"><span class="row-main"><span class="row-title">Değerleri elle gir</span></span>${icon.chev}</button>
      </div>`,
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    s.close();
    if (b.dataset.m === 'ai') openEstimate(meal, name);
    else if (b.dataset.m === 'off') openProductSearch(meal, name);
    else openCustomFood(meal);
  });
  s.el.querySelectorAll('input[data-m]').forEach((inp) =>
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      s.close();
      await runEstimate(meal, { name, image: await fileToImage(f), mode: inp.dataset.m });
    })
  );
}

function openEstimate(meal, name = '') {
  const s = openSheet({
    title: 'Yapay zekâyla hesapla',
    leftLabel: 'Vazgeç',
    rightLabel: 'Hesapla',
    body: `
      <div class="field"><label for="es-name">Yemek veya ürün</label><input id="es-name" class="input" value="${esc(name)}" placeholder="Örn. Kayseri mantısı, annemin karnıyarığı"></div>
      <div class="field"><label for="es-det">Ayrıntı – isteğe bağlı</label>
        <textarea id="es-det" class="input" placeholder="Örn. yoğurtlu ve tereyağlı sos, bol kıymalı; ya da kısa tarif"></textarea></div>
      <p class="small muted" style="margin:0 4px;line-height:18px">Sonucu kaydetmeden önce görüp düzeltebilirsin. Kaydettiğin besin listende kalır, bir dahaki sefere tekrar hesaplatman gerekmez.</p>`,
    onRight: async (api) => {
      const n = s.el.querySelector('#es-name').value.trim();
      if (!n) return toast('Yemeğin adını yaz');
      api.close();
      await runEstimate(meal, { name: n, details: s.el.querySelector('#es-det').value.trim(), mode: 'dish' });
    },
  });
  setTimeout(() => s.el.querySelector(name ? '#es-det' : '#es-name').focus(), 250);
}

async function runEstimate(meal, opts) {
  const { estimateFood } = await import('../ai.js');
  const wait = openSheet({ title: 'Hesaplanıyor', size: 'auto', body: `<div class="empty" style="padding:30px 0"><div class="typing" style="margin:0 auto 12px;align-self:center;display:inline-flex"><i></i><i></i><i></i></div><br>${opts.mode === 'label' ? 'Etiket okunuyor…' : 'Besin değerleri hesaplanıyor…'}</div>` });
  try {
    const food = await estimateFood(opts);
    wait.close();
    await saveAndAmount(food, meal);
  } catch (e) {
    wait.close();
    toast(e.message, 4500);
  }
}

async function openProductSearch(meal, q = '') {
  const s = openSheet({
    title: 'Paketli ürün ara',
    body: `
      <form data-f style="display:flex;gap:8px;margin-bottom:10px">
        <label class="sr-only" for="ps-q">Ürün adı</label>
        <input id="ps-q" class="input" type="search" value="${esc(q)}" placeholder="Örn. Eti Burçak, Pınar labne" style="flex:1">
        <button type="submit" class="btn primary">Ara</button>
      </form>
      <div id="ps-res"></div>
      <p class="small muted" style="margin:10px 4px 0;line-height:18px">Kaynak: Open Food Facts (gönüllülerin girdiği açık veritabanı). Değerleri kaydetmeden önce kontrol edebilirsin.</p>`,
  });
  const res = s.el.querySelector('#ps-res');
  let items = [];
  let local = [];
  let seq = 0;
  const localHTML = () =>
    local.length
      ? `<div class="sec" style="padding:0 14px 6px"><h2>Uygulamadaki markalı ürünler</h2></div>
         <div class="card flush" style="margin-bottom:12px">${local
           .map((f) => `<button type="button" class="row" data-local="${esc(f.id)}"><span class="row-main"><span class="row-title normal">${esc(f.name)}</span>
             <span class="row-sub">100 g: ${fmt(f.k)} kcal · P ${fmt(f.p, 1)} · K ${fmt(f.c, 1)} · Y ${fmt(f.f, 1)}</span></span>${icon.chev}</button>`)
           .join('')}</div>`
      : '';
  const run = async () => {
    const v = s.el.querySelector('#ps-q').value.trim();
    if (v.length < 2) return;
    const my = ++seq;
    local = searchFoods(v).filter((f) => f.src === 'marka').slice(0, 8);
    res.innerHTML = `${localHTML()}<div class="empty"><div class="typing" style="margin:0 auto 8px;display:inline-flex"><i></i><i></i><i></i></div><br>Open Food Facts'te aranıyor…</div>`;
    try {
      const found = await searchProducts(v);
      if (my !== seq) return;
      items = found;
      res.innerHTML =
        localHTML() +
        (items.length
          ? `<div class="sec" style="padding:0 14px 6px"><h2>Open Food Facts</h2><span class="meta">${items.length} ürün</span></div><div class="card flush">${items
              .map((f, i) => `<button type="button" class="row" data-i="${i}"><span class="row-main"><span class="row-title normal">${esc(f.name)}</span>
              <span class="row-sub">100 g: ${fmt(f.k)} kcal · P ${fmt(f.p, 1)} · K ${fmt(f.c, 1)} · Y ${fmt(f.f, 1)}</span></span>${icon.chev}</button>`)
              .join('')}</div>`
          : `<div class="empty">Open Food Facts'te sonuç yok. Barkodu okutmayı, etiketin fotoğrafını çekmeyi ya da yapay zekâyla hesaplatmayı deneyebilirsin.</div>`);
    } catch (e) {
      if (my !== seq) return;
      res.innerHTML = `${localHTML()}<div class="empty">${esc(e.message)}<br><button type="button" class="btn" data-retry style="margin-top:10px">Tekrar dene</button></div>`;
    }
  };
  s.el.querySelector('[data-f]').addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  res.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return run();
    const lb = e.target.closest('[data-local]');
    if (lb) {
      const f = findFood(lb.dataset.local);
      s.close();
      return openAmount(f, meal);
    }
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const f = items[Number(b.dataset.i)];
    s.close();
    const mine = f.barcode ? (await db.list('custom_foods', (x) => x.barcode === f.barcode))[0] : null;
    if (mine) openAmount({ ...mine, custom: true }, meal);
    else saveAndAmount(f, meal);
  });
  if (q.length >= 2) run();
}

// ---------- Kişisel besin: oluştur / düzenle (çoklu porsiyon) ----------
// Porsiyon satırı: miktar × ölçü = gram (ör. 0,5 ölçek = 15 g, 250 ml = 258 g). Gram karşılığı kullanıcıdan alınır;
// ölçüler arası otomatik dönüşüm yapılmaz.
function openCustomFood(meal, existing = null, after = null) {
  const e = existing || {};
  const val = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
  const defLabel = portionsOf(e)[0] ? portionsOf(e)[0][0] : null;
  // mevcut porsiyonları satırlara çevir ("0,5 ölçek" → miktar 0,5 + ölçü ölçek)
  const toRow = ([label, grams]) => {
    const m = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(label);
    const q = m ? m[1] : '1';
    const u = m ? m[2] : label;
    const known = UNIT_TYPES.includes(u);
    return { qty: q.replace('.', ','), unit: known ? u : 'ozel', custom: known ? '' : u, grams: val(grams), def: label === defLabel };
  };
  let rows = (e.portions || []).filter((p) => Array.isArray(p) && p[0] && Number(p[1]) > 0).map(toRow);
  if (!rows.length) rows = [{ qty: '1', unit: 'porsiyon', custom: '', grams: '', def: true }];
  let base = e.base === 'ml' ? 'ml' : 'g';
  let busySave = false;

  const s = openSheet({
    title: existing ? 'Besini düzenle' : 'Kendi besinin',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <div class="field"><label for="cf-name">Ad</label><input id="cf-name" class="input" value="${esc(e.name ? cleanName(e.name) : '')}" placeholder="Örn. Whey protein (çikolatalı)"></div>
      <div class="field"><span class="lbl">Değerler hangi miktar için?</span>
        <div class="toggle-row" role="group" aria-label="Temel birim"><button type="button" class="tog" data-base="g" aria-pressed="${base === 'g'}">100 g</button><button type="button" class="tog" data-base="ml" aria-pressed="${base === 'ml'}">100 ml</button></div></div>
      <div class="grid2">
        <div class="field"><label for="cf-k">Kalori (kcal)</label><input id="cf-k" class="input" inputmode="decimal" value="${val(e.k)}"></div>
        <div class="field"><label for="cf-p">Protein (g)</label><input id="cf-p" class="input" inputmode="decimal" value="${val(e.p)}"></div>
        <div class="field"><label for="cf-c">Karbonhidrat (g)</label><input id="cf-c" class="input" inputmode="decimal" value="${val(e.c)}"></div>
        <div class="field"><label for="cf-f">Yağ (g)</label><input id="cf-f" class="input" inputmode="decimal" value="${val(e.f)}"></div>
        <div class="field"><label for="cf-fb">Lif (g) – isteğe bağlı</label><input id="cf-fb" class="input" inputmode="decimal" value="${val(e.fb)}"></div>
        <div class="field"><label for="cf-na">Sodyum (mg) – isteğe bağlı</label><input id="cf-na" class="input" inputmode="decimal" value="${val(e.na)}"></div>
      </div>
      <p class="small muted" style="margin:-4px 4px 12px;line-height:17px">Boş bıraktığın değerler "bilinmiyor" olarak kalır, sıfır sayılmaz.</p>
      <div class="sec" style="padding:4px 4px 6px"><h2>Porsiyonlar</h2><span class="meta" id="cf-pcount"></span></div>
      <div id="cf-portions"></div>
      <button type="button" class="btn block" data-padd style="margin:6px 0 4px">+ Porsiyon ekle</button>
      <p class="small muted" style="margin:0 4px 12px;line-height:17px">Her ölçünün bu besindeki gram karşılığını yaz (ör. 1 ölçek = 30 g). Yuvarlak işaretli porsiyon, eklerken ilk seçili gelir.</p>
      <div class="field"><label for="cf-cat">Kategori</label><select id="cf-cat" class="input">${FOOD_CATEGORIES.map(([k, l]) => `<option value="${k}" ${(e.category || 'diger') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="cf-desc">Açıklama – isteğe bağlı</label><textarea id="cf-desc" class="input" rows="2" placeholder="Marka, tat, nereden aldığın…">${esc(e.description || '')}</textarea></div>
      <div class="field"><label for="cf-tags">Etiketler – isteğe bağlı</label><input id="cf-tags" class="input" value="${esc((e.tags || []).join(', '))}" placeholder="virgülle ayır: kahvaltı, antrenman sonrası"></div>`,
    onRight: async (api) => {
      if (busySave) return;
      syncRows();
      const v = (id) => {
        const t = s.el.querySelector(id).value.trim();
        return t === '' ? null : parseNum(t);
      };
      const name = s.el.querySelector('#cf-name').value.trim();
      const k = v('#cf-k');
      if (!name) return toast('Besine bir ad ver');
      if (k == null || isNaN(k) || k < 0) return toast('Kalori gerekli');
      for (const id of ['#cf-p', '#cf-c', '#cf-f', '#cf-fb', '#cf-na']) {
        const x = v(id);
        if (x != null && (isNaN(x) || x < 0)) return toast('Değerler sıfır ya da pozitif sayı olmalı');
      }
      const pr = parsePortionRows(rows);
      if (pr.error) return toast(pr.error, 3500);
      busySave = true;
      const tags = s.el.querySelector('#cf-tags').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
      let saved;
      try {
        const { custom: _c, ...keep } = e;
        saved = await db.put('custom_foods', {
          ...keep,
          name,
          alias: e.alias || '',
          k,
          p: v('#cf-p') ?? 0,
          c: v('#cf-c') ?? 0,
          f: v('#cf-f') ?? 0,
          fb: v('#cf-fb'),
          na: v('#cf-na'),
          ka: e.ka ?? null,
          base,
          portions: pr.portions,
          default_portion: pr.default_portion,
          category: s.el.querySelector('#cf-cat').value,
          description: s.el.querySelector('#cf-desc').value.trim().slice(0, 300),
          tags,
          source: e.source || 'manuel',
        });
      } catch (err) {
        busySave = false;
        return toast('Kaydedilemedi: ' + (err.message || err), 4000);
      }
      api.close();
      toast(existing ? 'Besin güncellendi' : `${name} kaydedildi`);
      if (after) after(saved);
      else if (!existing) openAmount({ ...saved, custom: true }, meal);
    },
  });
  const box = s.el.querySelector('#cf-portions');
  const unitOpts = (sel) => [...UNIT_TYPES.map((u) => `<option value="${esc(u)}" ${sel === u ? 'selected' : ''}>${esc(u)}</option>`), `<option value="ozel" ${sel === 'ozel' ? 'selected' : ''}>özel ölçü…</option>`].join('');
  const drawRows = () => {
    box.innerHTML = rows
      .map(
        (r, i) => `<div class="card portion-row" data-prow="${i}" style="padding:10px 12px;margin-bottom:8px">
          <div style="display:flex;gap:8px;align-items:center">
            <label class="sr-only" for="pq-${i}">Miktar</label><input id="pq-${i}" class="input num" data-pf="qty" inputmode="decimal" value="${esc(r.qty)}" style="width:62px;flex:none;text-align:center;min-height:40px;padding:6px">
            <label class="sr-only" for="pu-${i}">Ölçü</label><select id="pu-${i}" class="input" data-pf="unit" style="flex:1;min-width:0;min-height:40px;padding:6px 10px">${unitOpts(r.unit)}</select>
            <button type="button" class="icon-btn" data-prm="${i}" aria-label="Porsiyonu sil" style="flex:none;color:var(--sub)">${icon.close}</button>
          </div>
          ${r.unit === 'ozel' ? `<label class="sr-only" for="pc-${i}">Özel ölçü adı</label><input id="pc-${i}" class="input" data-pf="custom" value="${esc(r.custom)}" placeholder="Ölçünün adı (ör. bar, kapak)" style="margin-top:8px;min-height:40px">` : ''}
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
            <span class="small muted" style="flex:none">=</span>
            <label class="sr-only" for="pg-${i}">Gram karşılığı</label><input id="pg-${i}" class="input num" data-pf="grams" inputmode="decimal" value="${esc(r.grams)}" placeholder="gram" style="flex:1;min-width:0;min-height:40px;padding:6px 10px">
            <span class="small muted" style="flex:none">${base}</span>
            <label class="pdef" style="display:flex;align-items:center;gap:6px;flex:none;font-size:14px"><input type="radio" name="pdef" data-pdef="${i}" ${r.def ? 'checked' : ''}>Varsayılan</label>
          </div>
        </div>`
      )
      .join('');
    s.el.querySelector('#cf-pcount').textContent = `${rows.length} / ${MAX_PORTIONS}`;
    s.el.querySelector('[data-padd]').disabled = rows.length >= MAX_PORTIONS;
  };
  const syncRows = () => {
    box.querySelectorAll('[data-prow]').forEach((el) => {
      const r = rows[Number(el.dataset.prow)];
      for (const f of ['qty', 'unit', 'custom', 'grams']) {
        const inp = el.querySelector(`[data-pf="${f}"]`);
        if (inp) r[f] = inp.value;
      }
    });
  };
  drawRows();
  s.el.addEventListener('change', (ev) => {
    if (ev.target.dataset.pf === 'unit') {
      syncRows();
      drawRows();
    } else if (ev.target.dataset.pdef != null) {
      rows.forEach((r, i) => (r.def = i === Number(ev.target.dataset.pdef)));
    }
  });
  s.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.base) {
      base = b.dataset.base;
      s.el.querySelectorAll('[data-base]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.base === base));
      syncRows();
      drawRows();
    } else if (b.hasAttribute('data-padd')) {
      syncRows();
      if (rows.length >= MAX_PORTIONS) return;
      rows.push({ qty: '1', unit: 'adet', custom: '', grams: '', def: !rows.length });
      drawRows();
      box.querySelector(`#pg-${rows.length - 1}`)?.focus();
    } else if (b.dataset.prm != null) {
      syncRows();
      const i = Number(b.dataset.prm);
      const wasDef = rows[i].def;
      rows.splice(i, 1);
      if (wasDef && rows[0]) rows[0].def = true;
      drawRows();
    }
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
      <p class="small muted" style="margin:0 0 12px">Değerleri bilmiyorsan Coach'a "şu öğünün kalorisi ne" diye sorabilirsin.</p>
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
