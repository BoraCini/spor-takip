// Öğün şablonları: kütüphane (Besin ekle → Şablonlar), oluşturma/düzenleme, inceleyip uygulama.
// Hesaplar templates.js'te; yazma her zaman tek işlemde (db.putAtomic) yapılır.
import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, relDay, icon, openSheet, confirmSheet } from '../util.js';
import { refresh } from '../app.js';
import { MEALS } from '../context.js';
import { searchFoods, nutrientsFor, defaultServing, servingText, portionsOf, baseUnit } from '../data/foods.js';
import {
  TEMPLATE_SORTS,
  MAX_TEMPLATE_NAME,
  MAX_TEMPLATE_ITEMS,
  FACTOR_MIN,
  FACTOR_MAX,
  templateFromLogs,
  itemFromFood,
  validateTemplate,
  validFactor,
  resolveTemplateItem,
  itemNutrition,
  templateTotals,
  applyTemplate,
  markUsed,
  searchTemplates,
  sortTemplates,
  copyTemplate,
} from '../templates.js';

const MEAL_LABEL = Object.fromEntries(MEALS);
const cleanName = (n) => String(n || '').replace(/\s*~$/, '');
const markCustom = (list) => list.map((c) => ({ ...c, custom: true }));
const trq = (n) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');
const optTxt = (v, unit, d = 0) => (v == null ? 'bilinmiyor' : `${fmt(v, d)} ${unit}`);
// Toplam tablosu: dar ekranda taşmasın diye her değer ayrı satırda
const totRows = (t, label) => `
  <div class="kv" style="border-top:0"><span class="k">${label}</span><span class="v"><b class="num">${fmt(t.kcal)} kcal</b></span></div>
  <div class="kv"><span class="k">Protein · Karb · Yağ</span><span class="v num">${fmt(t.protein_g, 1)} · ${fmt(t.carb_g, 1)} · ${fmt(t.fat_g, 1)} g</span></div>
  <div class="kv"><span class="k">Lif</span><span class="v">${optTxt(t.fiber_g, 'g', 1)}</span></div>
  <div class="kv"><span class="k">Sodyum · Potasyum</span><span class="v">${optTxt(t.sodium_mg, 'mg')} · ${optTxt(t.potassium_mg, 'mg')}</span></div>`;
const itemAmount = (n, base = 'g') => (n.grams ? servingText(n.unit, n.qty, n.grams, base) : 'sabit değer');
const statusNote = (st) => (st === 'snapshot' ? 'besin listende yok · kayıtlı değerlerle' : st === 'missing' ? 'değeri bilinmiyor · eklenemez' : st === 'fixed' ? 'sabit kalori' : '');

async function pool() {
  return markCustom(await db.list('custom_foods'));
}

// ---------- Kütüphane (Besin ekle ekranındaki "Şablonlar" sekmesi) ----------
// el: her çizimde yeni oluşturulan kap; olaylar bu kaba bağlanır. ctx: { pool, meal(), date, onApplied(), reopen() } — şablon ekranları Besin ekle'nin üstünde açılır; seçimler korunur
export async function renderTemplateTab(el, ctx) {
  const all = await db.list('meal_templates');
  let sort = (await db.getSetting('template_sort', 'son')) || 'son';
  let q = '';
  el.innerHTML = `
    <button type="button" class="btn block" data-tnew style="margin-bottom:10px">+ Yeni şablon</button>
    ${all.length ? `<div style="display:flex;gap:8px;margin-bottom:10px">
      <label class="sr-only" for="tp-q">Şablon ara</label><input id="tp-q" class="input" type="search" placeholder="Şablon ara" autocomplete="off" style="flex:1;min-width:0">
      <label class="sr-only" for="tp-sort">Sırala</label><select id="tp-sort" class="input" style="flex:0 1 46%;min-width:0">${TEMPLATE_SORTS.map(([k, l]) => `<option value="${k}"${sort === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
    </div>` : ''}
    <div id="tp-list"></div>`;
  const listEl = el.querySelector('#tp-list');
  const draw = () => {
    const arr = sortTemplates(searchTemplates(all, q), sort);
    listEl.innerHTML = !all.length
      ? '<div class="empty">Sık yediğin öğünleri şablon olarak kaydet; tek dokunuşla istediğin güne ve öğüne ekle. Günlükte dolu bir öğünün altındaki "Şablon olarak kaydet" ile de oluşturabilirsin.</div>'
      : !arr.length
      ? `<div class="empty">"${esc(q)}" ile eşleşen şablon yok.</div>`
      : `<div class="card flush">${arr
          .map((t) => {
            const { totals } = templateTotals(t.items, ctx.pool);
            return `<div class="row frow">
              <button type="button" class="row-main" data-topen="${esc(t.id)}" style="text-align:left">
                <span class="row-title normal">${esc(t.name)}${t.meal ? ` <span class="tag">${esc(MEAL_LABEL[t.meal] || '')}</span>` : ''}</span>
                <span class="row-sub">${t.items.length} besin · <b class="num">${fmt(totals.kcal)} kcal</b>${t.use_count ? ` · ${t.use_count} kez kullanıldı` : ''}</span>
              </button>
              <button type="button" class="star-btn" aria-pressed="${!!t.favorite}" data-tfav="${esc(t.id)}" aria-label="${esc(t.name)}: ${t.favorite ? 'favorilerden çıkar' : 'favorilere ekle'}">${icon.star}</button>
            </div>`;
          })
          .join('')}</div>`;
  };
  draw();
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'tp-q') return;
    q = e.target.value;
    draw();
  });
  el.addEventListener('change', async (e) => {
    if (e.target.id !== 'tp-sort') return;
    sort = e.target.value;
    draw();
    try {
      await db.setSetting('template_sort', sort);
    } catch {}
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-tnew')) {
      openTemplateEdit(null, { meal: ctx.meal(), after: ctx.reopen });
    } else if (b.dataset.topen) {
      const t = all.find((x) => x.id === b.dataset.topen);
      if (!t) return;
      openTemplateDetail(t, { meal: ctx.meal(), date: ctx.date, onApplied: ctx.onApplied, after: ctx.reopen });
    } else if (b.dataset.tfav) {
      const t = all.find((x) => x.id === b.dataset.tfav);
      if (!t) return;
      try {
        Object.assign(t, await db.put('meal_templates', { ...t, favorite: !t.favorite }));
      } catch (err) {
        return toast('Kaydedilemedi: ' + (err.message || err), 4000);
      }
      b.setAttribute('aria-pressed', !!t.favorite);
      b.setAttribute('aria-label', `${t.name}: ${t.favorite ? 'favorilerden çıkar' : 'favorilere ekle'}`);
      toast(t.favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', 1500);
    }
  });
}

// ---------- Oluştur / düzenle ----------
// existing: kayıtlı şablon (düzenleme) | null. opts: { fromLogs, meal, copyOf, after }
export async function openTemplateEdit(existing, { fromLogs = null, meal = null, copyOf = null, after = null } = {}) {
  const P = await pool();
  const base = existing || (copyOf ? copyTemplate(copyOf) : fromLogs ? templateFromLogs(fromLogs, { meal }) : { name: '', meal: meal || null, note: '', items: [], favorite: false, use_count: 0, last_used: null });
  // kalemler: şablon kalemi + çözülmüş besin (ölçü seçenekleri ve güncel değer için)
  let items = base.items.map((it) => resolveTemplateItem({ ...it }, P));
  let done = false;
  let saving = false;
  const defName = fromLogs && meal ? `${MEAL_LABEL[meal] || 'Öğün'} şablonu` : '';
  const s = openSheet({
    title: existing ? 'Şablonu düzenle' : 'Yeni şablon',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onClose: () => {
      if (!done && after) after();
    },
    body: `
      <div class="field"><label for="tp-name">Şablon adı</label><input id="tp-name" class="input" maxlength="${MAX_TEMPLATE_NAME}" value="${esc(base.name || defName)}" placeholder="Örn. Hafta içi kahvaltım"></div>
      <div class="field"><label for="tp-meal">Varsayılan öğün</label><select id="tp-meal" class="input"><option value="">Seçme (eklerken sorulur)</option>${MEALS.map(([k, l]) => `<option value="${k}"${base.meal === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="tp-note">Not – isteğe bağlı</label><textarea id="tp-note" class="input" rows="2" maxlength="300">${esc(base.note || '')}</textarea></div>
      <div class="sec" style="padding:4px 4px 6px"><h2>Besinler</h2><span class="meta" id="tp-count"></span></div>
      <div id="tp-items"></div>
      <label class="sr-only" for="tp-fq">Besin ara</label>
      <input id="tp-fq" class="input" type="search" placeholder="Besin ara ve ekle" autocomplete="off" style="margin:4px 0 8px">
      <div id="tp-fres"></div>
      <div class="card" id="tp-tot"></div>`,
    onRight: async (api) => {
      if (saving) return;
      const tpl = {
        ...(existing || {}),
        name: s.el.querySelector('#tp-name').value.trim(),
        meal: s.el.querySelector('#tp-meal').value || null,
        note: s.el.querySelector('#tp-note').value.trim().slice(0, 300),
        // güncel besini bulunan kalemin anlık görüntüsü kayıt anındaki değerlerle yenilenir
        items: items.map(({ food, status: _s, _per: _p, ...it }) => (food ? { ...itemFromFood(food, { grams: it.grams, unit: it.unit, qty: it.qty }), ...(it.estimated ? { estimated: true } : {}) } : it)),
        favorite: existing ? !!existing.favorite : false,
        use_count: existing ? existing.use_count || 0 : 0,
        last_used: existing ? existing.last_used || null : null,
      };
      const err = validateTemplate(tpl);
      if (err) return toast(err, 3500);
      saving = true;
      let saved;
      try {
        saved = await db.put('meal_templates', tpl);
      } catch (e) {
        saving = false;
        return toast('Kaydedilemedi: ' + (e.message || e), 4000);
      }
      done = true;
      api.close();
      toast(existing ? 'Şablon güncellendi' : 'Şablon kaydedildi');
      if (after) after(saved);
    },
  });
  const itemsEl = s.el.querySelector('#tp-items');
  const resEl = s.el.querySelector('#tp-fres');
  const q = s.el.querySelector('#tp-fq');
  const drawTot = () => {
    const { totals: t, missing, fallback } = templateTotals(items, P);
    s.el.querySelector('#tp-count').textContent = items.length ? `${items.length} besin` : '';
    s.el.querySelector('#tp-tot').innerHTML = `
      ${fallback.length ? `<p class="small warn" style="margin:0 0 8px;line-height:18px">Listende artık olmayan besin: ${esc(fallback.join(', '))}. Şablondaki kayıtlı değerler kullanılır.</p>` : ''}
      ${missing.length ? `<p class="small warn" style="margin:0 0 8px;line-height:18px">Değeri bilinmeyen besin: ${esc(missing.join(', '))}. Uygularken eklenmez; çıkarabilirsin.</p>` : ''}
      ${totRows(t, 'Toplam')}`;
  };
  const unitOpts = (x) => [['gram', 1], ...(x.food ? portionsOf(x.food) : [])].map(([l, g]) => `<option value="${esc(l)}" ${x.unit === l ? 'selected' : ''}>${l === 'gram' ? (x.base === 'ml' ? 'ml' : 'g') : `${esc(l)} (${fmt(g)} g)`}</option>`).join('');
  const sub = (x) => {
    const n = itemNutrition(x, 1);
    const note = statusNote(x.status);
    return `${n ? `${n.grams ? `${fmt(n.grams)} ${x.base === 'ml' ? 'ml' : 'g'} · ` : ''}${fmt(n.kcal)} kcal` : '–'}${note ? ` · ${note}` : ''}`;
  };
  const drawItems = () => {
    itemsEl.innerHTML = items.length
      ? `<div class="card flush">${items
          .map(
            (x, i) => `<div class="row rc-row" style="flex-wrap:wrap;gap:6px">
              <span class="row-main" style="flex:1 1 100%"><span class="row-title normal">${esc(cleanName(x.name))}</span>
                <span class="row-sub num ${x.status === 'missing' ? 'warn' : ''}" data-tk="${i}">${sub(x)}</span></span>
              ${x.status === 'fixed'
                ? '<span class="small muted" style="flex:1">Miktarı olmayan kayıt (hızlı kalori / tahmin)</span>'
                : `<label class="sr-only" for="tq-${i}">${esc(x.name)} miktar</label>
              <input id="tq-${i}" class="input num" data-tq="${i}" inputmode="decimal" value="${trq(x.qty ?? x.grams)}" style="width:72px;flex:none;text-align:right;min-height:38px;padding:6px 8px">
              <label class="sr-only" for="tu-${i}">${esc(x.name)} ölçü</label>
              <select id="tu-${i}" class="input" data-tu="${i}" style="flex:1;min-width:0;min-height:38px;padding:6px 8px" ${x.food ? '' : 'disabled'}>${unitOpts(x)}</select>`}
              <button type="button" class="icon-btn" data-trm="${i}" aria-label="${esc(x.name)} çıkar" style="flex:none;color:var(--sub)">${icon.close}</button>
            </div>`
          )
          .join('')}</div>`
      : '<div class="empty">Henüz besin yok. Aşağıdan ara ve ekle.</div>';
    drawTot();
  };
  let found = [];
  const drawRes = () => {
    const v = q.value.trim();
    found = v ? searchFoods(v, P).slice(0, 8) : [];
    resEl.innerHTML = found.length
      ? `<div class="card flush search-res" style="margin-bottom:10px">${found
          .map((f, i) => {
            const d = defaultServing(f);
            return `<button type="button" class="row" data-tadd="${i}"><span class="row-main"><span class="row-title normal">${esc(cleanName(f.name))}</span>
              <span class="row-sub">${esc(servingText(d.unit, d.qty, d.grams, baseUnit(f)))} · ${fmt(nutrientsFor(f, d.grams).kcal)} kcal</span></span><span class="pill" aria-hidden="true">+</span></button>`;
          })
          .join('')}</div>`
      : v
      ? '<div class="empty" style="padding:8px 0 14px">Bulunamadı.</div>'
      : '';
  };
  const recalc = (i, per = 1) => {
    const x = items[i];
    const qv = parseNum(String(x.qty));
    let g = 0;
    if (qv > 0) {
      if (!x.unit || x.unit === 'gram') g = qv;
      else {
        const p = x.food ? portionsOf(x.food).find((pp) => pp[0] === x.unit) : null;
        g = Math.round(qv * (p ? p[1] : per) * 10) / 10;
      }
    }
    x.grams = g;
    const el = s.el.querySelector(`[data-tk="${i}"]`);
    if (el) el.textContent = sub(x);
    drawTot();
  };
  drawItems();
  q.addEventListener('input', drawRes);
  s.el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.tq == null) return;
    const x = items[Number(t.dataset.tq)];
    // besini listede olmayan kalemde ölçünün gram karşılığı mevcut miktardan bulunur
    if (!x._per) x._per = x.qty > 0 && x.grams > 0 ? x.grams / x.qty : 1;
    x.qty = parseNum(t.value);
    recalc(Number(t.dataset.tq), x._per);
  });
  s.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.tu == null) return;
    const x = items[Number(t.dataset.tu)];
    const p = t.value === 'gram' ? 1 : (portionsOf(x.food).find((pp) => pp[0] === t.value) || [null, 0])[1];
    x.unit = t.value;
    x.qty = p ? Math.round((x.grams / p) * 100) / 100 : x.qty;
    drawItems();
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tadd != null) {
      if (items.length >= MAX_TEMPLATE_ITEMS) return toast(`Bir şablonda en fazla ${MAX_TEMPLATE_ITEMS} besin olabilir.`);
      const f = found[Number(b.dataset.tadd)];
      const d = defaultServing(f);
      items.push(resolveTemplateItem(itemFromFood(f, { grams: d.grams, unit: d.unit, qty: d.qty }), [f, ...P]));
      q.value = '';
      drawRes();
      drawItems();
    } else if (b.dataset.trm != null) {
      items.splice(Number(b.dataset.trm), 1);
      drawItems();
    }
  });
  if (!base.name && !defName) setTimeout(() => s.el.querySelector('#tp-name').focus(), 50);
}

// ---------- İncele ve uygula ----------
// opts: { meal, date, onApplied, after }
export async function openTemplateDetail(tpl, { meal = null, date = today(), onApplied = null, after = null } = {}) {
  const P = await pool();
  let factor = 1;
  let selMeal = meal || tpl.meal || 'ara';
  let selDate = date > today() ? today() : date;
  const sel = new Set(tpl.items.map((_, i) => i));
  let busy = false;
  const items = tpl.items.map((it) => resolveTemplateItem(it, P));
  let handled = false; // uygulandı / düzenlemeye geçildi / silindi: kapanınca kütüphaneye dönülmez
  const s = openSheet({
    title: tpl.name,
    body: '',
    onClose: () => {
      if (!handled && after) after();
    },
  });
  const factorOk = () => validFactor(factor);
  const drawSum = () => {
    const chosen = items.filter((_, i) => sel.has(i));
    const { totals: t, missing, fallback } = templateTotals(chosen, P, factorOk() ? factor : 1);
    const n = chosen.length - missing.length;
    s.el.querySelector('#ta-sum').innerHTML = `
      ${fallback.length ? `<p class="small warn" style="margin:0 0 8px;line-height:18px">Listende artık olmayan besin: ${esc(fallback.join(', '))}. Şablondaki kayıtlı değerlerle eklenecek.</p>` : ''}
      ${missing.length ? `<p class="small warn" style="margin:0 0 8px;line-height:18px">Değeri bilinmediği için eklenmeyecek: ${esc(missing.join(', '))}.</p>` : ''}
      ${totRows(t, 'Eklenecek')}`;
    const btn = s.el.querySelector('[data-apply]');
    btn.disabled = !n || !factorOk();
    btn.textContent = n ? `${n} besini ${MEAL_LABEL[selMeal]} öğününe ekle` : 'Eklenecek besin yok';
    items.forEach((x, i) => {
      const el = s.el.querySelector(`[data-ta="${i}"]`);
      if (!el) return;
      const nn = itemNutrition(x, factorOk() ? factor : 1);
      el.textContent = nn ? `${itemAmount(nn, x.base === 'ml' ? 'ml' : 'g')} · ${fmt(nn.kcal)} kcal${statusNote(x.status) ? ' · ' + statusNote(x.status) : ''}` : statusNote(x.status);
    });
  };
  s.setBody(`
    <p class="small muted" style="margin:-2px 4px 10px;text-align:center">${tpl.items.length} besin${tpl.use_count ? ` · ${tpl.use_count} kez kullanıldı` : ''}${tpl.last_used ? ` · son: ${esc(relDay(tpl.last_used.slice(0, 10)))}` : ''}</p>
    ${tpl.note ? `<p style="margin:0 4px 12px;font-size:15px;line-height:21px">${esc(tpl.note)}</p>` : ''}
    <div class="sec" style="padding:0 4px 6px"><h2>Besinler</h2><span class="meta">eklenecekleri seç</span></div>
    <div class="card flush">${items
      .map(
        (x, i) => `<div class="row"><span class="row-main"><span class="row-title normal">${esc(cleanName(x.status === 'ok' ? x.food.name : x.name))}</span><span class="row-sub num ${x.status === 'missing' ? 'warn' : ''}" data-ta="${i}"></span></span>
          <button type="button" class="check-btn" aria-pressed="${x.status !== 'missing'}" data-tsel="${i}" ${x.status === 'missing' ? 'disabled' : ''} aria-label="${esc(x.name)}: ${x.status === 'missing' ? 'eklenemez' : 'eklenecek'}"><span class="check">${icon.check}</span></button></div>`
      )
      .join('')}</div>
    <div class="field" style="margin-top:12px"><label for="ta-factor">Miktar çarpanı</label>
      <div class="toggle-row" style="margin-bottom:6px">${[0.5, 1, 1.5, 2].map((v) => `<button type="button" class="tog sm" data-tf="${v}" aria-pressed="${factor === v}">${trq(v)}×</button>`).join('')}</div>
      <input id="ta-factor" class="input" inputmode="decimal" value="${trq(factor)}" aria-describedby="ta-fh">
      <p class="small muted" id="ta-fh" style="margin:4px 4px 0">${trq(FACTOR_MIN)} ile ${trq(FACTOR_MAX)} arası. Tüm besinlerin miktarı bu oranla değişir.</p></div>
    <div class="field"><span class="lbl">Öğün</span><div class="toggle-row">${MEALS.map(([k, l]) => `<button type="button" class="tog" aria-pressed="${selMeal === k}" data-tmeal="${k}">${l}</button>`).join('')}</div></div>
    <div class="field"><label for="ta-date">Tarih</label><input id="ta-date" class="input" type="date" value="${selDate}" max="${today()}"></div>
    <div class="card" id="ta-sum"></div>
    <button type="button" class="btn primary block" data-apply style="margin:4px 0 12px"></button>
    <div class="btn-row"><button type="button" class="btn" data-tedit>Düzenle</button><button type="button" class="btn" data-tcopy>Kopyala</button></div>
    <div class="btn-row" style="margin-top:8px"><button type="button" class="btn" data-tfavd aria-pressed="${!!tpl.favorite}">${tpl.favorite ? '★ Favorilerde' : '☆ Favorilere ekle'}</button><button type="button" class="btn danger" data-tdel style="background:var(--card)">Sil</button></div>`);
  items.forEach((x, i) => x.status === 'missing' && sel.delete(i));
  drawSum();
  s.el.addEventListener('input', (e) => {
    if (e.target.id !== 'ta-factor') return;
    factor = parseNum(e.target.value);
    s.el.querySelectorAll('[data-tf]').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.tf) === factor));
    e.target.classList.toggle('invalid', !factorOk());
    drawSum();
  });
  s.el.addEventListener('change', (e) => {
    if (e.target.id !== 'ta-date') return;
    const v = e.target.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > today()) {
      e.target.value = selDate;
      return toast('Bugün ya da geçmiş bir tarih seç');
    }
    selDate = v;
  });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tf) {
      factor = Number(b.dataset.tf);
      s.el.querySelector('#ta-factor').value = trq(factor);
      s.el.querySelector('#ta-factor').classList.remove('invalid');
      s.el.querySelectorAll('[data-tf]').forEach((x) => x.setAttribute('aria-pressed', Number(x.dataset.tf) === factor));
      drawSum();
    } else if (b.dataset.tsel != null) {
      const i = Number(b.dataset.tsel);
      if (sel.has(i)) sel.delete(i);
      else sel.add(i);
      b.setAttribute('aria-pressed', sel.has(i));
      drawSum();
    } else if (b.dataset.tmeal) {
      selMeal = b.dataset.tmeal;
      s.el.querySelectorAll('[data-tmeal]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.tmeal === selMeal));
      drawSum();
    } else if (b.hasAttribute('data-apply')) {
      if (busy || b.disabled) return;
      if (!factorOk()) return toast(`Çarpan ${trq(FACTOR_MIN)} ile ${trq(FACTOR_MAX)} arasında olmalı`);
      const { records, fallback } = applyTemplate(tpl, { pool: P, date: selDate, meal: selMeal, factor, selected: sel });
      if (!records.length) return toast('Eklenecek besin yok');
      busy = true;
      b.disabled = true;
      handled = true;
      try {
        // hepsi ya da hiçbiri: kayıtlar ve şablonun kullanım bilgisi tek işlemde
        await db.putAtomic([...records.map((obj) => ({ store: 'food_logs', obj })), { store: 'meal_templates', obj: markUsed(tpl) }]);
      } catch (err) {
        busy = false;
        b.disabled = false;
        handled = false;
        return toast('Eklenemedi: ' + (err.message || err), 4000);
      }
      s.close();
      toast(`${records.length} besin ${selDate === today() ? '' : relDay(selDate) + ' '}${MEAL_LABEL[selMeal]} öğününe eklendi${fallback.length ? ` (${fallback.length} besin kayıtlı değerlerle)` : ''}`, fallback.length ? 4500 : 2500);
      if (onApplied) onApplied({ date: selDate, meal: selMeal });
      refresh();
    } else if (b.hasAttribute('data-tedit')) {
      handled = true;
      s.close();
      openTemplateEdit(tpl, { after });
    } else if (b.hasAttribute('data-tcopy')) {
      handled = true;
      s.close();
      openTemplateEdit(null, { copyOf: tpl, after });
    } else if (b.hasAttribute('data-tfavd')) {
      try {
        Object.assign(tpl, await db.put('meal_templates', { ...tpl, favorite: !tpl.favorite }));
      } catch (err) {
        return toast('Kaydedilemedi: ' + (err.message || err), 4000);
      }
      b.setAttribute('aria-pressed', !!tpl.favorite);
      b.textContent = tpl.favorite ? '★ Favorilerde' : '☆ Favorilere ekle';
      toast(tpl.favorite ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', 1500);
    } else if (b.hasAttribute('data-tdel')) {
      if (!(await confirmSheet({ title: 'Şablonu sil', text: `"${tpl.name}" silinsin mi? Bu şablonla daha önce eklediğin günlük kayıtlar etkilenmez.`, okLabel: 'Sil', danger: true }))) return;
      try {
        await db.remove('meal_templates', tpl.id);
      } catch (err) {
        return toast('Silinemedi: ' + (err.message || err), 4000);
      }
      handled = true;
      s.close();
      toast('Şablon silindi');
      if (after) after();
    }
  });
}

// Günlükteki bir öğünden şablon
export function saveMealAsTemplate(entries, meal) {
  const usable = (entries || []).filter((e) => e && !e.deleted_at);
  if (!usable.length) return toast('Bu öğünde kayıt yok');
  openTemplateEdit(null, { fromLogs: usable, meal });
}

