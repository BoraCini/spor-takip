import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, relDay, icon, openSheet, confirmSheet, round1 } from '../util.js';
import { refresh, go } from '../app.js';
import { dayNutrition, targetsOf, MEALS, mealLabel, waterDay, waterTarget } from '../context.js';
import { scanBarcode, foodFromBarcode, reviewFood, searchProducts, fileToImage } from '../barcode.js';
import { searchFoods, nutrientsFor, findFood, defaultServing, servingText, FOOD_ATTRIBUTION } from '../data/foods.js';

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
                      <span class="row-sub">${e.grams ? esc(servingText(e.unit, e.qty, e.grams)) + ' · ' : ''}P ${fmt(e.protein_g)} · K ${fmt(e.carb_g)} · Y ${fmt(e.fat_g)}</span></span>
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
      <label class="sr-only" for="fsearch">Besin ara</label>
      <input id="fsearch" class="input" type="search" placeholder="Ara: patates, basmati, mantı…" autocomplete="off" enterkeyhint="search" style="margin-bottom:10px">
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
        <span class="row-sub"><span data-sv>${esc(servingText(sv.unit, sv.qty, sv.grams))}</span> · <b class="num" data-kc>${fmt(n.kcal)} kcal</b></span>
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
      listEl.innerHTML = res.length
        ? `<div class="sec" style="padding:0 14px 6px"><h2>Sonuçlar</h2><span class="meta">${res.length >= 60 ? '60+' : res.length} besin</span></div>${list(res, '')}`
        : `<div class="empty">Listede "${esc(q)}" bulunamadı.</div>`;
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
      b.querySelector('[data-sv]').textContent = servingText(sv.unit, sv.qty, sv.grams);
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

  const logOne = (food, sv, src = 'manuel') =>
    db.put('food_logs', {
      date: state.date,
      meal: selMeal,
      food_id: food.id,
      name: cleanName(food.name),
      grams: sv.grams,
      unit: sv.unit,
      qty: sv.qty,
      estimated: false,
      source: src,
      ...nutrientsFor(food, sv.grams),
    });

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
      const items = [...picked.values()];
      for (const x of items) await logOne(x.food, x, 'coklu');
      toast(`${items.length} besin eklendi`);
      s.close();
      refresh();
      return;
    }
    const act = b.dataset.act;
    const q = inp.value.trim();
    if (act === 'scan') {
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

// Porsiyon seçimi ve besin detayı
async function openAmount(food, meal, existing = null, opts = {}) {
  const portions = [...(food.portions || []), ['gram', 1]];
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
      if (!g || g <= 0) return toast('Miktar gir');
      if (selecting) {
        opts.onSelect && opts.onSelect({ unit, qty, grams: g });
        api.close();
        return;
      }
      const n = nutrientsFor(food, g);
      await db.put('food_logs', {
        ...(existing || {}),
        date: existing ? existing.date : state.date,
        meal: selMeal,
        food_id: food.id,
        name: cleanName(food.name),
        grams: g,
        unit,
        qty,
        estimated: false,
        source: existing ? existing.source || 'manuel' : 'manuel',
        ...n,
      });
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
        <div class="fs-kcal"><span class="big-num">${fmt(n.kcal)}</span><span class="small muted">kcal · ${fmt(g)} g</span></div>
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
      ['Lif', `${fmt(n.fiber_g, 1)} g`],
      ['Yağ', `${fmt(n.fat_g, 1)} g`],
      ['Sodyum', food.na == null ? '–' : `${fmt(n.sodium_mg)} mg`],
    ];
    if (food.ka) rows.push(['Potasyum', `${fmt(n.potassium_mg)} mg`]);
    return rows.map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('') +
      `<p class="small muted" style="margin:8px 0 0">100 g: ${fmt(food.k)} kcal · P ${fmt(food.p, 1)} · K ${fmt(food.c, 1)} · Y ${fmt(food.f, 1)}</p>`;
  };
  const refreshNums = () => {
    s.el.querySelector('#fs-sum').innerHTML = sumHTML();
    s.el.querySelector('#fs-tbl').innerHTML = tblHTML();
  };
  const draw = () => {
    s.setBody(`
      <p class="small muted" style="margin:-2px 4px 10px;text-align:center">${esc(srcLine(food))}</p>
      <div class="card" id="fs-sum">${sumHTML()}</div>
      <div class="field"><span class="lbl">Porsiyon</span>
        <div class="toggle-row">${portions
          .map(([l, gr]) => `<button type="button" class="tog" aria-pressed="${unit === l}" data-unit="${esc(l)}">${esc(l)}${gr !== 1 ? ` · ${fmt(gr)} g` : ''}</button>`)
          .join('')}</div></div>
      <div class="field"><label for="qty">Miktar (${esc(unit)})</label>
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
      ${food.recipe ? `<button type="button" class="btn block" data-edit-recipe style="margin-top:4px">Tarifi düzenle</button>` : food.custom && !existing ? `<button type="button" class="btn block" data-edit-food style="margin-top:4px">Besini düzenle</button>` : ''}
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
    if (b.dataset.unit) {
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
      openRecipe(food, () => (opts.onChanged ? opts.onChanged() : refresh()));
    } else if (b.hasAttribute('data-edit-food')) {
      s.close();
      const { custom: _c, ...raw } = food;
      const saved = await reviewFood(raw);
      if (saved) toast('Besin güncellendi');
      opts.onChanged && opts.onChanged();
    } else if (b.hasAttribute('data-fix')) {
      s.close();
      const { custom: _c, id: origId, ...raw } = food;
      const saved = await reviewFood({ ...raw, name: cleanName(food.name), overrides: origId, source: 'düzeltme' });
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
async function openRecipe(existing, after) {
  const custom = markCustom(await db.list('custom_foods'));
  const pool = custom.filter((c) => !existing || c.id !== existing.id);
  const ingr = existing
    ? existing.recipe.items.map((it) => ({ ...it, typed: true, food: findFood(it.food_id, pool) })).filter((x) => x.food)
    : [];
  let servings = existing ? existing.recipe.servings : 4;
  let done = false;
  const totals = () => {
    const t = { g: 0, k: 0, p: 0, c: 0, f: 0, fb: 0, na: 0, ka: 0 };
    for (const x of ingr) {
      const r = (x.grams || 0) / 100;
      t.g += x.grams || 0;
      t.k += (x.food.k || 0) * r;
      t.p += (x.food.p || 0) * r;
      t.c += (x.food.c || 0) * r;
      t.f += (x.food.f || 0) * r;
      t.fb += (x.food.fb || 0) * r;
      t.na += (x.food.na || 0) * r;
      t.ka += (x.food.ka || 0) * r;
    }
    return t;
  };
  const s = openSheet({
    title: existing ? 'Tarifi düzenle' : 'Yeni tarif',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onClose: () => {
      if (!done && after) after();
    },
    body: `
      <div class="field"><label for="rc-name">Tarifin adı</label><input id="rc-name" class="input" value="${esc(existing ? existing.name : '')}" placeholder="Örn. Annemin mercimek köftesi"></div>
      <div class="field"><label for="rc-serv">Kaç porsiyon çıkıyor?</label>
        <div class="stepper">
          <button type="button" data-sstep="-1" aria-label="Azalt">−</button>
          <input id="rc-serv" inputmode="numeric" value="${servings}">
          <button type="button" data-sstep="1" aria-label="Artır">+</button>
        </div></div>
      <div class="sec" style="padding:4px 14px 6px"><h2>Malzemeler</h2><span class="meta" id="rc-count"></span></div>
      <div class="card flush" id="rc-items"></div>
      <label class="sr-only" for="rc-q">Malzeme ara</label>
      <input id="rc-q" class="input" type="search" placeholder="Malzeme ara ve ekle: bulgur, soğan…" autocomplete="off" style="margin-bottom:8px">
      <div id="rc-res"></div>
      <div class="card" id="rc-tot"></div>
      <p class="small muted" style="margin:0 4px 12px;line-height:18px">Malzemeleri çiğ ağırlıklarıyla gir. Kaydettiğin tarif "Tarifler" sekmesinde ve aramada çıkar; Danışman da onu tanır.</p>
      ${existing ? '<button type="button" class="btn danger block" data-del-recipe>Tarifi sil</button>' : ''}`,
    onRight: async (api) => {
      const name = s.el.querySelector('#rc-name').value.trim();
      if (!name) return toast('Tarife bir ad ver');
      if (!ingr.length) return toast('En az bir malzeme ekle');
      const t = totals();
      if (!t.g) return toast('Malzeme miktarlarını gir');
      const per = (x) => Math.round((x / t.g) * 100 * 10) / 10;
      done = true;
      const saved = await db.put('custom_foods', {
        ...(existing ? { id: existing.id } : {}),
        name,
        alias: 'tarif',
        k: Math.round((t.k / t.g) * 100),
        p: per(t.p),
        c: per(t.c),
        f: per(t.f),
        fb: per(t.fb),
        na: Math.round((t.na / t.g) * 100),
        ka: Math.round((t.ka / t.g) * 100),
        portions: [['porsiyon', Math.round(t.g / servings)]],
        recipe: { servings, items: ingr.map((x) => ({ food_id: x.food.id, name: cleanName(x.food.name), grams: x.grams })) },
        source: 'tarif',
      });
      api.close();
      toast(existing ? 'Tarif güncellendi' : 'Tarif kaydedildi');
      if (after) after(saved);
      else refresh();
    },
  });
  const itemsEl = s.el.querySelector('#rc-items');
  const resEl = s.el.querySelector('#rc-res');
  const totEl = s.el.querySelector('#rc-tot');
  const q = s.el.querySelector('#rc-q');
  const drawTot = () => {
    const t = totals();
    const sv = servings || 1;
    s.el.querySelector('#rc-count').textContent = ingr.length ? `${ingr.length} malzeme` : '';
    totEl.innerHTML = `
      <div class="kv"><span class="k">Toplam</span><span class="v">${fmt(t.g)} g · ${fmt(t.k)} kcal</span></div>
      <div class="kv"><span class="k">1 porsiyon</span><span class="v"><b>${fmt(t.k / sv)} kcal</b> · ${fmt(t.g / sv)} g</span></div>
      <div class="kv"><span class="k">Porsiyonda P · K · Y</span><span class="v">${fmt(t.p / sv, 1)} · ${fmt(t.c / sv, 1)} · ${fmt(t.f / sv, 1)} g</span></div>`;
  };
  const drawItems = () => {
    itemsEl.innerHTML = ingr.length
      ? ingr
          .map(
            (x, i) => `<div class="row">
              <span class="row-main"><span class="row-title normal">${esc(cleanName(x.food.name))}</span>
              <span class="row-sub num" data-ik="${i}">${fmt(((x.food.k || 0) * (x.grams || 0)) / 100)} kcal</span></span>
              <label class="sr-only" for="rg-${i}">${esc(cleanName(x.food.name))} gram</label>
              <input id="rg-${i}" class="input num" data-g="${i}" inputmode="decimal" value="${x.typed ? String(x.grams).replace('.', ',') : ''}" placeholder="${String(x.def ?? x.grams).replace('.', ',')}" style="width:76px;flex:none;text-align:right;min-height:38px;padding:6px 10px">
              <span class="small muted" style="flex:none">g</span>
              <button type="button" class="icon-btn" data-rm="${i}" aria-label="${esc(cleanName(x.food.name))} çıkar" style="flex:none;color:var(--sub)">${icon.close}</button>
            </div>`
          )
          .join('')
      : `<div class="empty">Henüz malzeme yok. Aşağıdan ara ve ekle.</div>`;
    drawTot();
  };
  let found = [];
  const drawRes = () => {
    const v = q.value.trim();
    found = v ? searchFoods(v, pool).slice(0, 8) : [];
    resEl.innerHTML = found.length
      ? `<div class="card flush search-res" style="margin-bottom:10px">${found
          .map((f, i) => {
            const d = defaultServing(f);
            return `<button type="button" class="row" data-add="${i}"><span class="row-main"><span class="row-title normal">${esc(cleanName(f.name))}</span>
              <span class="row-sub">${esc(servingText(d.unit, d.qty, d.grams))} · ${fmt(nutrientsFor(f, d.grams).kcal)} kcal</span></span><span class="pill" aria-hidden="true">+</span></button>`;
          })
          .join('')}</div>`
      : v
      ? `<div class="empty" style="padding:8px 0 14px">Bulunamadı. Önce "Yeni besin" ile ekleyebilirsin.</div>`
      : '';
  };
  drawItems();
  q.addEventListener('input', drawRes);
  s.el.addEventListener('input', (e) => {
    const i = e.target.dataset.g;
    if (i != null) {
      const empty = e.target.value.trim() === '';
      const v = empty ? ingr[i].def ?? 0 : parseNum(e.target.value);
      ingr[i].typed = !empty;
      ingr[i].grams = isNaN(v) ? 0 : v;
      s.el.querySelector(`[data-ik="${i}"]`).textContent = `${fmt(((ingr[i].food.k || 0) * ingr[i].grams) / 100)} kcal`;
      drawTot();
    } else if (e.target.id === 'rc-serv') {
      const v = parseInt(e.target.value, 10);
      if (v > 0) {
        servings = v;
        drawTot();
      }
    }
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add != null) {
      const f = found[Number(b.dataset.add)];
      const dg = defaultServing(f).grams;
      ingr.push({ food: f, grams: dg, def: dg, typed: false });
      q.value = '';
      drawRes();
      drawItems();
    } else if (b.dataset.rm != null) {
      ingr.splice(Number(b.dataset.rm), 1);
      drawItems();
    } else if (b.dataset.sstep) {
      servings = Math.max(1, servings + Number(b.dataset.sstep));
      s.el.querySelector('#rc-serv').value = servings;
      drawTot();
    } else if (b.hasAttribute('data-del-recipe')) {
      if (!(await confirmSheet({ title: 'Tarifi sil', text: `"${existing.name}" silinsin mi? Daha önceki kayıtların etkilenmez.`, okLabel: 'Sil', danger: true }))) return;
      await db.remove('custom_foods', existing.id);
      done = true;
      s.close();
      toast('Tarif silindi');
      if (after) after();
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
