import * as db from '../db.js';
import { esc, parseNum, toast, today, addDays, weekStart, trDate, trDateYear, WD_SHORT, WD_LONG, icon, openSheet, confirmSheet, downloadOrShare, parseDate, swipeDelete, daysBetween } from '../util.js';
import { refresh } from '../app.js';
import { removeWithUndo } from '../undo.js';
import { cycleInfo, dueOn, doseText, SITES, suggestSite, SLOTS, slotLabel, stockInfo } from '../context.js';
import { COMPOUND_GROUPS, searchCompounds, compoundInfo, findCompound } from '../data/compounds.js';
import { SUPP_GROUPS, searchSupplements, findSupplement, unitForForm } from '../data/supplements.js';

const UNITS = ['mg', 'mcg', 'IU', 'ml', 'tablet', 'kapsül', 'damla'];
const SUPP_UNITS = ['kapsül', 'tablet', 'damla', 'sıkım', 'ölçek', 'ml', 'g', 'saşe', 'adet'];
const FORMS = ['kapsül', 'yumuşak kapsül', 'tablet', 'dil altı tablet', 'çiğneme tableti', 'efervesan', 'damla', 'sprey', 'toz', 'sıvı', 'şurup', 'saşe', 'enjeksiyon'];
const state = { tab: 'kur' };
export const isSupp = (c) => c && c.category === 'destek';

const segHTML = () => `<div class="seg" role="tablist" aria-label="Kür sekmeleri">
    <button type="button" role="tab" aria-selected="${state.tab === 'kur'}" data-tab="kur">Kür</button>
    <button type="button" role="tab" aria-selected="${state.tab === 'destek'}" data-tab="destek">Koruma &amp; vitamin</button>
  </div>`;

export async function render(root, params = {}) {
  if (params.tab === 'kur' || params.tab === 'destek') state.tab = params.tab;
  if (state.tab === 'destek') return renderSupp(root);
  const t = today();
  const ci = await cycleInfo(t);
  const dueAll = await dueOn(t);
  const due = { ...dueAll, pills: dueAll.pills.filter((x) => !isSupp(x.compound)), injections: dueAll.injections.filter((x) => !isSupp(x.compound)) };
  due.total = due.pills.length + due.injections.length;
  due.done = due.pills.filter((x) => x.done).length + due.injections.filter((x) => x.done).length;
  const comps = (await db.list('compounds')).filter((c) => !isSupp(c));
  const stock = await stockMap(comps);
  const sug = await suggestSite();
  const ws = weekStart(t);
  const weekInj = await db.list('injection_logs', (l) => l.date >= ws && l.date <= addDays(ws, 6));

  // haftalık takvim: hangi gün enjeksiyon var
  const injComps = comps.filter((c) => c.active !== false && c.kind === 'enjeksiyon');
  const calDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const has = injComps.some((c) => (c.days || []).includes(i));
    const done = weekInj.some((l) => l.date === d);
    return { d, i, has, done };
  });


  root.innerHTML = `
    <header class="hdr">
      <div class="hdr-text">
        <span class="eyebrow">${esc(trDate(t, true))}</span>
        <h1 class="title">Kür</h1>
      </div>
      <div class="hdr-actions">
        <button type="button" class="icon-btn" aria-label="Takvime aktar" data-act="ics">${icon.calendar}</button>
        <button type="button" class="icon-btn" aria-label="Madde ekle" data-act="add">${icon.plus}</button>
      </div>
    </header>
    ${segHTML()}

    ${cycleCard(ci)}

    <div class="sec"><h2>Bugün</h2>${due.total ? `<span class="meta">${due.done} / ${due.total} tamamlandı</span>` : ''}</div>
    ${
      !comps.length
        ? `<section class="card" style="text-align:center;padding:22px 16px">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600">Henüz madde eklemedin</p>
            <p class="small muted" style="margin:0 0 14px;line-height:18px">Kullandığın enjeksiyonları ve hapları, dozlarını ve hangi gün/saatte alındıklarını ekle. Bugün ne alacağını burada görürsün.</p>
            <button type="button" class="btn primary" data-act="add">Madde ekle</button>
          </section>`
        : !due.total
        ? `<section class="card"><div class="empty" style="padding:8px 0">Bugün için planlanmış bir şey yok.</div></section>`
        : ''
    }
    ${due.injections
      .map(
        (x) => `
      <section class="card" aria-label="Enjeksiyon: ${esc(x.compound.name)}" style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:12px;align-items:center">
          <span class="badge-ic" style="${x.done ? 'background:var(--ok)' : ''}">${x.done ? icon.check.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round"') : icon.syringe}</span>
          <div style="display:flex;flex-direction:column;min-width:0">
            <span style="font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.02em">${x.done ? 'Yapıldı' : 'Enjeksiyon günü'}</span>
            <span style="font-size:17px;font-weight:600">${esc(x.compound.name)}</span>
            <span class="small muted">${esc(doseText(x.compound) || 'Doz girilmedi')}</span>
          </div>
        </div>
        ${
          x.done
            ? `<div class="inset"><span style="font-size:15px;font-weight:500">${esc(x.log.site || 'Bölge belirtilmedi')}</span></div>
               <button type="button" class="btn" data-act="inj-undo" data-id="${x.log.id}">Geri al</button>`
            : `<div class="inset"><span style="font-size:15px;font-weight:500">Bölge önerisi: ${esc(sug.site)}</span>
                 <span class="small muted">${sug.last ? `Son: ${esc(sug.last.site)} · ${esc(trDate(sug.last.date, true))}` : 'Henüz bölge kaydı yok'}</span></div>
               <div class="btn-row">
                 <button type="button" class="btn" data-act="inj-site" data-id="${x.compound.id}">Bölge seç</button>
                 <button type="button" class="btn primary" data-act="inj-done" data-id="${x.compound.id}" data-site="${esc(sug.site)}">Yapıldı</button>
               </div>`
        }
      </section>`
      )
      .join('')}
    ${
      due.pills.length
        ? `<section class="card flush" aria-label="Bugünkü haplar" style="margin-top:10px">
          ${due.pills
            .map(
              (p) => `<div class="row">
                <span style="width:52px;flex:none;font-size:13px;font-weight:600;color:var(--sub)">${esc(slotLabel(p.slot))}</span>
                <span class="row-main"><span class="row-title normal">${esc(p.compound.name)}</span><span class="row-sub">${esc(doseText(p.compound) || '')}</span></span>
                <button type="button" class="check-btn" aria-pressed="${p.done}" aria-label="${esc(slotLabel(p.slot))} ${esc(p.compound.name)}: ${p.done ? 'alındı, geri al' : 'alındı olarak işaretle'}"
                  data-act="pill" data-id="${p.compound.id}" data-slot="${p.slot}" ${p.log ? `data-log="${p.log.id}"` : ''}><span class="check">${icon.check}</span></button>
              </div>`
            )
            .join('')}
        </section>`
        : ''
    }

    ${
      injComps.length
        ? `<div class="sec"><h2>Bu hafta</h2><span class="meta">enjeksiyon günleri</span></div>
      <section class="card cal" aria-label="Haftalık enjeksiyon takvimi">
        ${calDays
          .map(
            (c) => `<div><span class="wd">${WD_SHORT[c.i]}</span><span class="dn ${c.d === t ? 'today' : ''}">${parseDate(c.d).getDate()}</span>
            <span class="dot ${c.done ? 'done' : c.has ? 'on' : ''}" ${c.has ? `title="${c.done ? 'yapıldı' : 'planlı'}"` : ''}></span></div>`
          )
          .join('')}
      </section>`
        : ''
    }

    ${
      comps.length
        ? `<div class="sec"><h2>Kullandıklarım</h2></div>
      <section class="card flush" aria-label="Kullanılan maddeler" data-swipe-list>
        ${comps
          .map((c) => {
            const days = c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
            const dayTxt = days.length === 7 ? 'Her gün' : days.map((d) => WD_SHORT[d]).join(', ');
            const timeTxt = c.kind === 'enjeksiyon' ? 'Enjeksiyon' : (c.times && c.times.length ? c.times : ['sabah']).map(slotLabel).join(', ').toLocaleLowerCase('tr-TR');
            return `<button type="button" class="row" data-act="edit" data-id="${c.id}">
              <span class="row-main"><span class="row-title normal">${esc(c.name)}${c.active === false ? ' <span class="muted small">(pasif)</span>' : ''}</span>
              <span class="row-sub">${esc(c.kind === 'enjeksiyon' ? `Enjeksiyon · ${dayTxt}` : `${dayTxt} · ${timeTxt}`)}${doseText(c) ? ' · ' + esc(doseText(c)) : ''}</span>${stockLine(stock[c.id])}</span>${icon.chev}</button>`;
          })
          .join('')}
      </section>
      <p class="note">Takvim simgesiyle bu programı iPhone Takvim'e aktarabilirsin; hatırlatmaları Takvim yapar.</p>`
        : ''
    }
  `;

  swipeDelete(root.querySelector('[data-swipe-list]'), '.row[data-act="edit"]', (row) => removeWithUndo('compounds', row.dataset.id, 'Silindi · geçmiş kayıtların duruyor'));
  root.onclick = async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      state.tab = tb.dataset.tab;
      return refresh();
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openCompoundPicker();
    else if (act === 'edit') openCompound(comps.find((c) => c.id === b.dataset.id));
    else if (act === 'cycle') openCycle(ci.cycle);
    else if (act === 'ics') openIcs(comps, ci);
    else if (act === 'pill') {
      if (b.dataset.log) await db.remove('dose_logs', b.dataset.log);
      else await db.put('dose_logs', { date: t, compound_id: b.dataset.id, slot: b.dataset.slot, taken_at: new Date().toISOString() });
      refresh();
    } else if (act === 'inj-done') {
      await db.put('injection_logs', { date: t, compound_id: b.dataset.id, site: b.dataset.site, done_at: new Date().toISOString() });
      toast('Enjeksiyon kaydedildi');
      refresh();
    } else if (act === 'inj-site') {
      const site = await pickSite(sug.site);
      if (!site) return;
      await db.put('injection_logs', { date: t, compound_id: b.dataset.id, site, done_at: new Date().toISOString() });
      toast('Enjeksiyon kaydedildi');
      refresh();
    } else if (act === 'inj-undo') {
      await db.remove('injection_logs', b.dataset.id);
      refresh();
    }
  };
}

// ---------- Koruma & vitamin sekmesi ----------
async function renderSupp(root) {
  const t = today();
  const dueAll = await dueOn(t);
  const pills = dueAll.pills.filter((x) => isSupp(x.compound));
  const inj = dueAll.injections.filter((x) => isSupp(x.compound));
  const items = (await db.list('compounds')).filter(isSupp).sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name, 'tr'));
  const stock = await stockMap(items);
  const total = pills.length + inj.length;
  const done = pills.filter((x) => x.done).length + inj.filter((x) => x.done).length;
  root.innerHTML = `
    <header class="hdr">
      <div class="hdr-text"><span class="eyebrow">${esc(trDate(t, true))}</span><h1 class="title">Kür</h1></div>
      <div class="hdr-actions"><button type="button" class="icon-btn" aria-label="Vitamin veya ilaç ekle" data-act="add">${icon.plus}</button></div>
    </header>
    ${segHTML()}
    ${
      !items.length
        ? `<section class="card" style="text-align:center;padding:22px 16px">
            <p style="margin:0 0 6px;font-size:17px;font-weight:600">Koruyucu ilaç ve vitamin ekle</p>
            <p class="small muted" style="margin:0 0 14px;line-height:18px">Kullandığın vitamin, mineral, karaciğer/kalp koruyucu ve takviyeleri marka, ürün ve içerik bilgisiyle ekle. Her gün ne alacağını burada işaretlersin; Coach da bunları bilir.</p>
            <button type="button" class="btn primary" data-act="add">Ekle</button>
          </section>`
        : `<div class="sec"><h2>Bugün</h2>${total ? `<span class="meta">${done} / ${total} alındı</span>` : ''}</div>
          ${
            total
              ? `<section class="card flush" aria-label="Bugün alınacaklar">
              ${pills
                .map(
                  (p) => `<div class="row">
                  <span style="width:52px;flex:none;font-size:13px;font-weight:600;color:var(--sub)">${esc(slotLabel(p.slot))}</span>
                  <span class="row-main"><span class="row-title normal">${esc(p.compound.name)}</span><span class="row-sub">${esc(doseText(p.compound) || '')}</span></span>
                  <button type="button" class="check-btn" aria-pressed="${p.done}" aria-label="${esc(slotLabel(p.slot))} ${esc(p.compound.name)}: ${p.done ? 'alındı, geri al' : 'alındı olarak işaretle'}"
                    data-act="pill" data-id="${p.compound.id}" data-slot="${p.slot}" ${p.log ? `data-log="${p.log.id}"` : ''}><span class="check">${icon.check}</span></button>
                </div>`
                )
                .join('')}
              ${inj
                .map(
                  (x) => `<div class="row">
                  <span style="width:52px;flex:none;font-size:13px;font-weight:600;color:var(--sub)">İğne</span>
                  <span class="row-main"><span class="row-title normal">${esc(x.compound.name)}</span><span class="row-sub">${esc(doseText(x.compound) || '')}</span></span>
                  <button type="button" class="check-btn" aria-pressed="${x.done}" aria-label="${esc(x.compound.name)}: ${x.done ? 'yapıldı, geri al' : 'yapıldı olarak işaretle'}"
                    data-act="inj" data-id="${x.compound.id}" ${x.log ? `data-log="${x.log.id}"` : ''}><span class="check">${icon.check}</span></button>
                </div>`
                )
                .join('')}
            </section>`
              : '<section class="card"><div class="empty" style="padding:8px 0">Bugün için planlanmış bir şey yok.</div></section>'
          }
          <div class="sec"><h2>Kullandıklarım</h2><span class="meta">${items.filter((c) => c.active !== false).length} aktif</span></div>
          <section class="card flush" aria-label="Koruyucu ilaç ve vitaminler" data-swipe-list>
            ${items
              .map((c) => {
                const days = c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
                const dayTxt = days.length === 7 ? 'Her gün' : days.map((d) => WD_SHORT[d]).join(', ');
                const timeTxt = c.kind === 'enjeksiyon' ? 'iğne' : (c.times && c.times.length ? c.times : ['sabah']).map(slotLabel).join(', ').toLocaleLowerCase('tr-TR');
                return `<button type="button" class="row" data-act="edit" data-id="${c.id}">
                  <span class="row-main"><span class="row-title normal">${esc(c.name)}${c.active === false ? ' <span class="muted small">(bırakıldı)</span>' : ''}</span>
                  <span class="row-sub">${esc([c.group, `${dayTxt} · ${timeTxt}`, doseText(c)].filter(Boolean).join(' · '))}</span>${stockLine(stock[c.id])}</span>${icon.chev}</button>`;
              })
              .join('')}
          </section>`
    }
    <p class="note">Coach, kullandığın vitamin ve koruyucuları bilir; tahlil yorumlarken ve önerilerde bunları hesaba katar. Reçeteli ilaçların kullanımı ve dozu için doktoruna danış.</p>`;
  swipeDelete(root.querySelector('[data-swipe-list]'), '.row[data-act="edit"]', (row) => removeWithUndo('compounds', row.dataset.id, 'Silindi · geçmiş kayıtların duruyor'));
  root.onclick = async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      state.tab = tb.dataset.tab;
      return refresh();
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openSuppPicker();
    else if (act === 'edit') openSupp((await db.get('compounds', b.dataset.id)) || null);
    else if (act === 'pill') {
      if (b.dataset.log) await db.remove('dose_logs', b.dataset.log);
      else await db.put('dose_logs', { date: t, compound_id: b.dataset.id, slot: b.dataset.slot, taken_at: new Date().toISOString() });
      refresh();
    } else if (act === 'inj') {
      if (b.dataset.log) await db.remove('injection_logs', b.dataset.log);
      else await db.put('injection_logs', { date: t, compound_id: b.dataset.id, site: '', done_at: new Date().toISOString() });
      refresh();
    }
  };
}

function openSuppPicker() {
  const s = openSheet({
    title: 'Vitamin / ilaç ekle',
    body: `
      <label class="sr-only" for="sq">Ara</label>
      <input id="sq" class="input" type="search" placeholder="Ara: d3, magnezyum, tudca, omega…" autocomplete="off" style="margin-bottom:10px">
      <div id="sres"></div>
      <button type="button" class="btn block" data-manual style="margin-top:10px">Listede yok, elle ekle</button>
      <p class="small muted" style="margin:10px 4px 0;line-height:18px">Listeden türü seç; sonraki adımda marka, ürün adı ve içerik/miktar bilgisini (örn. Ocean · D3+K2 · 1000 IU + 100 mcg) girersin. Liste doz önermez.</p>`,
  });
  const q = s.el.querySelector('#sq');
  const res = s.el.querySelector('#sres');
  const draw = () => {
    const hits = searchSupplements(q.value);
    const groups = SUPP_GROUPS.map((g) => [g, hits.filter((c) => c.group === g)]).filter(([, l]) => l.length);
    res.innerHTML = groups.length
      ? groups
          .map(
            ([g, l]) => `<div class="sec" style="padding:8px 14px 6px"><h2>${esc(g)}</h2></div>
            <div class="card flush search-res">${l
              .map(
                (c) => `<button type="button" class="row" data-sid="${c.id}"><span class="row-main"><span class="row-title normal">${esc(c.name)}${c.rx ? ' <span class="tag">reçeteli</span>' : ''}</span>
                  <span class="row-sub">${esc([c.forms.join(', '), c.note].filter(Boolean).join(' · '))}</span></span>${icon.chev}</button>`
              )
              .join('')}</div>`
          )
          .join('')
      : `<div class="empty">"${esc(q.value)}" bulunamadı. Aşağıdan elle ekleyebilirsin.</div>`;
  };
  draw();
  q.addEventListener('input', draw);
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sid) {
      s.close();
      openSupp(null, findSupplement(b.dataset.sid));
    } else if (b.hasAttribute('data-manual')) {
      s.close();
      openSupp(null, null, q.value.trim());
    }
  });
}

// Koruyucu / vitamin düzenleyici: marka, ürün, içerik, biçim, günlük kullanım
async function stockMap(list) {
  const m = {};
  for (const c of list) if (c.active !== false) m[c.id] = await stockInfo(c);
  return m;
}
function stockLine(si) {
  if (!si) return '';
  const fmtN = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
  return `<span class="stock-line ${si.low ? 'low' : ''}">${si.low ? 'Azalıyor · ' : 'Stok: '}${fmtN(si.left)} ${esc(si.unit)}${si.daysLeft != null ? ` · ~${si.daysLeft} gün` : ''}</span>`;
}

// Stok alanı: elde kalan miktar (doz birimiyle). İşaretlenen her doz düşer.
function stockFieldHTML(prefix, st) {
  return `<div class="field"><label for="${prefix}-stock">Elimde kalan (${esc(st.dose_unit || 'doz birimi')}) – isteğe bağlı</label>
    <input id="${prefix}-stock" class="input" inputmode="decimal" value="${esc(String(st.stock ?? '').replace('.', ','))}" placeholder="${st.kind === 'enjeksiyon' || st.form === 'enjeksiyon' ? 'Örn. 10 ml × 250 mg/ml = 2500' : 'Örn. 60'}">
    <span class="small muted" style="line-height:17px">Her işaretlediğin dozda düşer; bitmesine 7 gün kala uyarırım. Yeni kutu alınca buraya yeni miktarı yaz.</span></div>`;
}
async function loadStock(c, st, s, prefix) {
  if (!c) return;
  const si = await stockInfo(c);
  if (!si) return;
  st.stock = si.left;
  st.stock0 = si.left;
  const el = s.el.querySelector(`#${prefix}-stock`);
  if (el && !el.value) el.value = String(si.left).replace('.', ',');
}
function stockPatch(c, st) {
  const raw = String(st.stock ?? '').trim();
  if (raw === '') return c && c.stock ? { stock: null } : {};
  const v = parseNum(raw);
  if (isNaN(v) || v < 0) return {};
  if (st.stock0 != null && Math.abs(v - st.stock0) < 1e-9) return {}; // değişmediyse sayım tarihini koru
  return { stock: { amount: v, at: new Date().toISOString(), date: today() } };
}

function openSupp(c, preset = null, typed = '') {
  const cat = preset || (c && c.catalog_id ? findSupplement(c.catalog_id) : null);
  const form0 = c?.form || (cat ? cat.forms[0] : 'kapsül');
  const st = {
    brand: c?.brand || '',
    product: c?.product || (cat ? cat.name : typed),
    strength: c?.strength || '',
    pack: c?.pack || '',
    form: form0,
    dose_amount: c?.dose_amount ?? '',
    dose_unit: c?.dose_unit || unitForForm(form0),
    days: c?.days ? [...c.days] : [],
    times: c?.times ? [...c.times] : [],
    active: c?.active !== false,
    notes: c?.notes || '',
    stock: '',
    stock0: null,
  };
  const s = openSheet({
    title: c ? 'Düzenle' : 'Vitamin / ilaç ekle',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onRight: async (api) => {
      sync();
      if (!st.product.trim()) return toast('Ürün adını yaz');
      const n = parseNum(st.dose_amount);
      const inj = st.form === 'enjeksiyon';
      const name = [st.brand.trim(), st.product.trim(), st.strength.trim()].filter(Boolean).join(' ');
      await db.put('compounds', {
        ...(c || {}),
        category: 'destek',
        ...(cat ? { catalog_id: cat.id } : {}),
        group: cat ? cat.group : c?.group || 'Diğer',
        name,
        brand: st.brand.trim(),
        product: st.product.trim(),
        strength: st.strength.trim(),
        pack: st.pack.trim(),
        form: st.form,
        kind: inj ? 'enjeksiyon' : 'hap',
        dose_amount: isNaN(n) ? null : n,
        dose_unit: st.dose_unit,
        days: !inj && !st.days.length ? [0, 1, 2, 3, 4, 5, 6] : st.days.sort(),
        times: inj ? [] : st.times.length ? st.times : ['sabah'],
        active: st.active,
        notes: st.notes.trim(),
        ...stockPatch(c, st),
      });
      api.close();
      toast('Kaydedildi');
      refresh();
    },
  });
  const sync = () => {
    const g = (id) => s.el.querySelector(id);
    if (g('#sp-stock')) st.stock = g('#sp-stock').value;
    if (g('#sp-brand')) st.brand = g('#sp-brand').value;
    if (g('#sp-product')) st.product = g('#sp-product').value;
    if (g('#sp-strength')) st.strength = g('#sp-strength').value;
    if (g('#sp-pack')) st.pack = g('#sp-pack').value;
    if (g('#sp-dose')) st.dose_amount = g('#sp-dose').value;
    if (g('#sp-unit')) st.dose_unit = g('#sp-unit').value;
    if (g('#sp-notes')) st.notes = g('#sp-notes').value;
    if (g('#sp-active')) st.active = g('#sp-active').checked;
  };
  const draw = () => {
    const inj = st.form === 'enjeksiyon';
    const forms = cat ? [...new Set([...cat.forms, st.form])] : FORMS;
    s.setBody(`
      ${cat ? `<div class="card" style="margin:0 0 12px"><span class="small muted">${esc(cat.group)}${cat.rx ? ' · reçeteli' : ''}</span>
        <p style="margin:2px 0 0;font-size:15px;font-weight:600">${esc(cat.name)}</p>${cat.note ? `<p class="small muted" style="margin:4px 0 0;line-height:18px">${esc(cat.note)}</p>` : ''}</div>` : ''}
      <div class="grid2">
        <div class="field"><label for="sp-brand">Marka</label><input id="sp-brand" class="input" value="${esc(st.brand)}" placeholder="Örn. Ocean"></div>
        <div class="field"><label for="sp-product">Ürün</label><input id="sp-product" class="input" value="${esc(st.product)}" placeholder="Örn. D3+K2"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="sp-strength">İçerik / miktar</label><input id="sp-strength" class="input" value="${esc(st.strength)}" placeholder="Örn. 1000 IU + 100 mcg"></div>
        <div class="field"><label for="sp-pack">Paket – isteğe bağlı</label><input id="sp-pack" class="input" value="${esc(st.pack)}" placeholder="Örn. 60 kapsül, 500 g"></div>
      </div>
      <div class="field"><span class="lbl">Biçim</span>
        <div class="toggle-row">${forms.map((f) => `<button type="button" class="tog sm" aria-pressed="${st.form === f}" data-form="${esc(f)}">${esc(f)}</button>`).join('')}</div></div>
      <div class="grid2">
        <div class="field"><label for="sp-dose">Bir seferde</label><input id="sp-dose" class="input" inputmode="decimal" value="${esc(String(st.dose_amount).replace('.', ','))}" placeholder="Örn. 1"></div>
        <div class="field"><label for="sp-unit">Birim</label><select id="sp-unit" class="input">${[...new Set([...SUPP_UNITS, ...UNITS, st.dose_unit])].map((u) => `<option ${st.dose_unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><span class="lbl">${inj ? 'Günler' : 'Günler (boş bırakırsan her gün)'}</span>
        <div class="toggle-row">${WD_SHORT.map((d, i) => `<button type="button" class="tog" aria-pressed="${st.days.includes(i)}" aria-label="${WD_LONG[i]}" data-day="${i}">${d}</button>`).join('')}</div></div>
      ${
        inj
          ? ''
          : `<div class="field"><span class="lbl">Ne zaman</span>
        <div class="toggle-row">${SLOTS.map(([k, l]) => `<button type="button" class="tog" aria-pressed="${st.times.includes(k)}" data-time="${k}">${l}</button>`).join('')}</div></div>`
      }
      ${stockFieldHTML('sp', st)}
      <div class="field"><label for="sp-notes">Not</label><textarea id="sp-notes" class="input" placeholder="Örn. yağlı öğünle, akşam yemeğinden sonra">${esc(st.notes)}</textarea></div>
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="sp-active" style="font-size:16px">Şu an kullanıyorum</label>
        <span class="switch"><input id="sp-active" type="checkbox" ${st.active ? 'checked' : ''}><span></span></span>
      </div>
      ${c ? '<button type="button" class="btn danger block" data-del style="background:var(--card)">Sil</button>' : ''}`);
  };
  draw();
  loadStock(c, st, s, 'sp');
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.form) {
      sync();
      const prevDefault = unitForForm(st.form);
      st.form = b.dataset.form;
      if (st.dose_unit === prevDefault) st.dose_unit = unitForForm(st.form);
      draw();
    } else if (b.dataset.day) {
      sync();
      const d = Number(b.dataset.day);
      st.days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d];
      draw();
    } else if (b.dataset.time) {
      sync();
      const k = b.dataset.time;
      st.times = st.times.includes(k) ? st.times.filter((x) => x !== k) : [...st.times, k];
      draw();
    } else if (b.hasAttribute('data-del')) {
      if (!(await confirmSheet({ title: 'Sil', text: `"${c.name}" silinsin mi? Geçmiş kayıtların kalır. Sadece bıraktıysan "Şu an kullanıyorum"u kapatabilirsin.`, okLabel: 'Sil', danger: true }))) return;
      await db.remove('compounds', c.id);
      s.close();
      refresh();
    }
  });
}

function pickSite(suggested) {
  return new Promise((resolve) => {
    let result = null;
    const s = openSheet({
      title: 'Enjeksiyon bölgesi',
      leftLabel: 'Vazgeç',
      body: `<div class="card flush">${SITES.map(
        (x) => `<button type="button" class="row" data-site="${esc(x)}"><span class="row-main"><span class="row-title normal">${esc(x)}</span></span>${x === suggested ? '<span class="small" style="color:var(--accent);font-weight:600">önerilen</span>' : ''}</button>`
      ).join('')}</div>`,
      onClose: () => resolve(result),
    });
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-site]');
      if (!b) return;
      result = b.dataset.site;
      s.close();
    });
  });
}

// Katalogdan madde seç (besin listesi gibi): ara ya da gruplara göz at
function openCompoundPicker() {
  const s = openSheet({
    title: 'Madde ekle',
    body: `
      <label class="sr-only" for="cq">Madde ara</label>
      <input id="cq" class="input" type="search" placeholder="Ara: enantat, boldenon, anastrozol…" autocomplete="off" style="margin-bottom:10px">
      <div id="cres"></div>
      <button type="button" class="btn block" data-manual style="margin-top:10px">Listede yok, elle ekle</button>
      <p class="small muted" style="margin:10px 4px 0;line-height:18px">Ester ve yarılanma süreleri literatürdeki yaklaşık değerlerdir, kaynağa göre değişir. Liste doz önermez; dozu kendin girersin.</p>`,
  });
  const q = s.el.querySelector('#cq');
  const res = s.el.querySelector('#cres');
  const draw = () => {
    const hits = searchCompounds(q.value);
    const groups = COMPOUND_GROUPS.map((g) => [g, hits.filter((c) => c.group === g)]).filter(([, l]) => l.length);
    res.innerHTML = groups.length
      ? groups
          .map(
            ([g, l]) => `<div class="sec" style="padding:8px 14px 6px"><h2>${esc(g)}</h2></div>
            <div class="card flush search-res">${l
              .map(
                (c) => `<button type="button" class="row" data-cid="${c.id}"><span class="row-main"><span class="row-title normal">${esc(c.name)}</span>
                  <span class="row-sub">${esc(compoundInfo(c))}</span></span>${icon.chev}</button>`
              )
              .join('')}</div>`
          )
          .join('')
      : `<div class="empty">"${esc(q.value)}" bulunamadı. Aşağıdan elle ekleyebilirsin.</div>`;
  };
  draw();
  q.addEventListener('input', draw);
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cid) {
      const c = findCompound(b.dataset.cid);
      s.close();
      openCompound(null, c);
    } else if (b.hasAttribute('data-manual')) {
      s.close();
      openCompound(null, null, q.value.trim());
    }
  });
}

function openCompound(c, preset = null, typedName = '') {
  const cat = preset || (c && c.catalog_id ? findCompound(c.catalog_id) : null);
  const st = {
    name: c?.name || preset?.name || typedName || '',
    kind: c?.kind || preset?.kind || 'enjeksiyon',
    dose_amount: c?.dose_amount ?? '',
    dose_unit: c?.dose_unit || 'mg',
    days: c?.days ? [...c.days] : [],
    times: c?.times ? [...c.times] : [],
    active: c?.active !== false,
    notes: c?.notes || '',
    stock: '',
    stock0: null,
  };
  const s = openSheet({
    title: c ? 'Maddeyi düzenle' : 'Madde ekle',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    onRight: async (api) => {
      sync();
      if (!st.name.trim()) return toast('Ad gerekli');
      if (st.kind === 'enjeksiyon' && !st.days.length) return toast('Enjeksiyon günlerini seç');
      const n = parseNum(st.dose_amount);
      await db.put('compounds', {
        ...(c || {}),
        ...(cat ? { catalog_id: cat.id } : {}),
        name: st.name.trim(),
        kind: st.kind,
        dose_amount: isNaN(n) ? null : n,
        dose_unit: st.dose_unit,
        days: st.kind === 'hap' && !st.days.length ? [0, 1, 2, 3, 4, 5, 6] : st.days.sort(),
        times: st.kind === 'hap' ? (st.times.length ? st.times : ['sabah']) : [],
        active: st.active,
        notes: st.notes.trim(),
        ...stockPatch(c, st),
      });
      api.close();
      toast('Kaydedildi');
      refresh();
    },
  });
  const sync = () => {
    const g = (id) => s.el.querySelector(id);
    if (g('#c-name')) st.name = g('#c-name').value;
    if (g('#c-stock')) st.stock = g('#c-stock').value;
    if (g('#c-dose')) st.dose_amount = g('#c-dose').value;
    if (g('#c-unit')) st.dose_unit = g('#c-unit').value;
    if (g('#c-notes')) st.notes = g('#c-notes').value;
    if (g('#c-active')) st.active = g('#c-active').checked;
  };
  const draw = () => {
    const isInj = st.kind === 'enjeksiyon';
    s.setBody(`
      ${cat ? `<div class="card" style="margin:0 0 12px"><span class="small muted">${esc(cat.group)}</span>
        <p style="margin:2px 0 0;font-size:15px;font-weight:600">${esc(compoundInfo(cat))}</p>${cat.note ? `<p class="small muted" style="margin:4px 0 0;line-height:18px">${esc(cat.note)}</p>` : ''}</div>` : ''}
      <div class="field"><label for="c-name">Ad</label><input id="c-name" class="input" value="${esc(st.name)}" placeholder="Maddenin adı"></div>
      <div class="field"><span class="lbl">Tür</span>
        <div class="seg" style="margin:0" role="radiogroup" aria-label="Tür">
          <button type="button" role="radio" aria-checked="${isInj}" aria-selected="${isInj}" data-kind="enjeksiyon">Enjeksiyon</button>
          <button type="button" role="radio" aria-checked="${!isInj}" aria-selected="${!isInj}" data-kind="hap">Hap / oral</button>
        </div></div>
      <div class="grid2">
        <div class="field"><label for="c-dose">Doz</label><input id="c-dose" class="input" inputmode="decimal" value="${esc(String(st.dose_amount).replace('.', ','))}" placeholder="Kendi dozun"></div>
        <div class="field"><label for="c-unit">Birim</label><select id="c-unit" class="input">${UNITS.map((u) => `<option ${st.dose_unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>
      <div class="field"><span class="lbl">${isInj ? 'Enjeksiyon günleri' : 'Günler (boş bırakırsan her gün)'}</span>
        <div class="toggle-row">${WD_SHORT.map((d, i) => `<button type="button" class="tog" aria-pressed="${st.days.includes(i)}" aria-label="${WD_LONG[i]}" data-day="${i}">${d}</button>`).join('')}</div></div>
      ${
        isInj
          ? ''
          : `<div class="field"><span class="lbl">Ne zaman</span>
        <div class="toggle-row">${SLOTS.map(([k, l]) => `<button type="button" class="tog" aria-pressed="${st.times.includes(k)}" data-time="${k}">${l}</button>`).join('')}</div></div>`
      }
      ${stockFieldHTML('c', st)}
      <div class="field"><label for="c-notes">Not</label><textarea id="c-notes" class="input" placeholder="Örn. yemekle birlikte, aç karnına">${esc(st.notes)}</textarea></div>
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="c-active" style="font-size:16px">Şu an kullanıyorum</label>
        <span class="switch"><input id="c-active" type="checkbox" ${st.active ? 'checked' : ''}><span></span></span>
      </div>
      ${c ? '<button type="button" class="btn danger block" data-del style="background:var(--card)">Maddeyi sil</button>' : ''}`);
  };
  draw();
  loadStock(c, st, s, 'c');
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.kind) {
      sync();
      st.kind = b.dataset.kind;
      draw();
    } else if (b.dataset.day) {
      sync();
      const d = Number(b.dataset.day);
      st.days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d];
      draw();
    } else if (b.dataset.time) {
      sync();
      const k = b.dataset.time;
      st.times = st.times.includes(k) ? st.times.filter((x) => x !== k) : [...st.times, k];
      draw();
    } else if (b.hasAttribute('data-del')) {
      if (!(await confirmSheet({ title: 'Maddeyi sil', text: `"${c.name}" ve takvimdeki planı silinsin mi? Geçmiş kayıtların kalır. Sadece bıraktıysan silmek yerine "Şu an kullanıyorum"u kapatabilirsin.`, okLabel: 'Sil', danger: true }))) return;
      await db.remove('compounds', c.id);
      s.close();
      refresh();
    }
  });
}

// Kür kartı: başlangıç, bitiş, kaçıncı hafta/gün, kalan süre
function cycleCard(ci) {
  if (!ci.cycle?.start_date)
    return `<button type="button" class="card cyc-card" data-act="cycle" aria-label="Kür bilgisi ekle">
      <span class="cyc-empty-t">Kür takvimi</span>
      <span class="small muted" style="line-height:18px">Başlangıç ve bitiş tarihini gir; kaçıncı haftada olduğun, kalan süre ve tahlil yorumları buna göre hesaplanır.</span>
      <span class="pill" style="align-self:flex-start;margin-top:4px">Tarihleri gir</span></button>`;
  const left = ci.left;
  const leftTxt =
    ci.status === 'baslamadi'
      ? `${ci.startsIn} gün sonra başlıyor`
      : ci.status === 'bitti'
      ? `Planlanan süre ${-left} gün önce doldu`
      : left == null
      ? 'Bitiş tarihi girilmedi'
      : left === 0
      ? 'Bugün son gün'
      : `${Math.floor(left / 7) ? Math.floor(left / 7) + ' hafta ' : ''}${left % 7 ? (left % 7) + ' gün ' : ''}kaldı`;
  const ticks = ci.totalWeeks && ci.totalWeeks <= 30 ? Array.from({ length: ci.totalWeeks }, (_, i) => i + 1) : [];
  return `<button type="button" class="card cyc-card" data-act="cycle" aria-label="Kür bilgilerini düzenle">
    <div class="cyc-top">
      <div class="cyc-week">
        <span class="cyc-lbl">${ci.status === 'baslamadi' ? 'Başlamadı' : ci.status === 'bitti' ? 'Tamamlandı' : 'Şu an'}</span>
        <span class="cyc-big num">${ci.status === 'devam' ? `${ci.week}.<small> hafta</small>` : ci.status === 'bitti' ? `${ci.totalWeeks || ci.week}<small> hafta</small>` : `${ci.startsIn}<small> gün</small>`}</span>
        <span class="small muted num">${ci.status === 'devam' ? `${ci.dayNo}. gün${ci.totalWeeks ? ` · ${ci.totalWeeks} haftalık kür` : ''}` : ci.status === 'baslamadi' ? 'sonra başlıyor' : `${ci.totalDays || ''}${ci.totalDays ? ' gün sürdü' : ''}`}</span>
      </div>
      <div class="cyc-dates">
        <span><small>Başlangıç</small><b>${esc(trDateYear(ci.cycle.start_date))}</b></span>
        <span><small>Bitiş</small><b>${ci.end ? esc(trDateYear(ci.end)) : '—'}</b></span>
      </div>
    </div>
    ${
      ticks.length
        ? `<div class="cyc-ticks" style="grid-template-columns:repeat(${ticks.length}, minmax(0, 1fr))" aria-hidden="true">${ticks
            .map((w) => `<span class="${ci.status === 'bitti' || (ci.week && w < ci.week) ? 'done' : ci.week === w && ci.status === 'devam' ? 'cur' : ''}"></span>`)
            .join('')}</div>`
        : ci.end
        ? `<span class="bar thick" style="width:100%"><span style="width:${ci.pct}%"></span></span>`
        : ''
    }
    <div class="cyc-foot"><span class="small ${ci.status === 'bitti' ? '' : 'muted'}">${esc(leftTxt)}</span>${ci.end && ci.status === 'devam' ? `<span class="small muted num">%${ci.pct}</span>` : ''}</div>
  </button>`;
}

function openCycle(cy) {
  const s = openSheet({
    title: 'Kür takvimi',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <section class="card">
        <div class="field"><label for="cy-start">Başlangıç tarihi</label><input id="cy-start" class="input" type="date" value="${esc(cy?.start_date || today())}"></div>
        <div class="grid2">
          <div class="field" style="margin-bottom:0"><label for="cy-weeks">Süre (hafta)</label><input id="cy-weeks" class="input" inputmode="numeric" value="${esc(cy?.weeks || '')}" placeholder="Örn. 12"></div>
          <div class="field" style="margin-bottom:0"><label for="cy-end">Bitiş tarihi</label><input id="cy-end" class="input" type="date" value="${esc(cy?.end_date || (cy?.start_date && cy?.weeks ? addDays(cy.start_date, cy.weeks * 7 - 1) : ''))}"></div>
        </div>
        <p class="small muted" id="cy-sum" style="margin:10px 0 0;line-height:18px"></p>
      </section>
      <div class="field"><label for="cy-notes">Notlar</label><textarea id="cy-notes" class="input" placeholder="Hedef, dikkat ettiğin yan etkiler, kontrol tahlili tarihleri…">${esc(cy?.notes || '')}</textarea></div>
      ${cy ? '<button type="button" class="btn danger block" data-new style="background:var(--card)">Yeni kür başlat</button><p class="small muted" style="margin:8px 4px 0">Yeni kür başlatınca mevcut kür bilgisi geçmişte kalır; maddelerin ve kayıtların silinmez.</p>' : ''}`,
    onRight: async (api) => {
      const start = st.value;
      if (!start) return toast('Başlangıç tarihi gerekli');
      const end = en.value || null;
      if (end && end < start) return toast('Bitiş tarihi başlangıçtan önce olamaz');
      const w = parseNum(wk.value);
      const weeks = end ? Math.ceil((daysBetween(start, end) + 1) / 7) : isNaN(w) ? null : Math.round(w);
      await db.put('cycles', { ...(cy || {}), start_date: start, end_date: end || (weeks ? addDays(start, weeks * 7 - 1) : null), weeks, notes: s.el.querySelector('#cy-notes').value.trim() });
      api.close();
      toast('Kaydedildi');
      refresh();
    },
  });
  const st = s.el.querySelector('#cy-start');
  const wk = s.el.querySelector('#cy-weeks');
  const en = s.el.querySelector('#cy-end');
  const sum = s.el.querySelector('#cy-sum');
  const showSum = () => {
    if (!st.value || !en.value || en.value < st.value) {
      sum.textContent = 'Süreyi hafta olarak ya da bitiş tarihini gir; biri diğerini doldurur.';
      return;
    }
    const days = daysBetween(st.value, en.value) + 1;
    const d = daysBetween(st.value, today());
    sum.textContent = `${days} gün (${Math.floor(days / 7)} hafta${days % 7 ? ' ' + (days % 7) + ' gün' : ''}). ${d < 0 ? `${-d} gün sonra başlıyor.` : d >= days ? 'Bu kürün süresi dolmuş.' : `Bugün ${Math.floor(d / 7) + 1}. haftadasın (${d + 1}. gün).`}`;
  };
  // hafta ↔ bitiş tarihi birbirini doldurur
  const fromWeeks = () => {
    const w = parseNum(wk.value);
    if (st.value && !isNaN(w) && w > 0) en.value = addDays(st.value, Math.round(w) * 7 - 1);
    showSum();
  };
  wk.addEventListener('input', fromWeeks);
  st.addEventListener('change', fromWeeks);
  en.addEventListener('change', () => {
    if (st.value && en.value && en.value >= st.value) wk.value = Math.ceil((daysBetween(st.value, en.value) + 1) / 7);
    showSum();
  });
  showSum();
  const nb = s.el.querySelector('[data-new]');
  if (nb)
    nb.addEventListener('click', async () => {
      await db.put('cycles', { start_date: today(), weeks: null, end_date: null, notes: '' });
      s.close();
      openCycle((await db.list('cycles')).pop());
    });
}

// ---------- Takvime aktar (.ics) ----------
const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const SLOT_TIME = { sabah: '090000', ogle: '130000', aksam: '210000' };

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildIcs(comps, ci, hideNames) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const startDate = today().replace(/-/g, '');
  const until = ci.end ? ci.end.replace(/-/g, '') + 'T235959' : null;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProCoach//TR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Pro Coach Kür'];
  let n = 0;
  for (const c of comps.filter((x) => x.active !== false)) {
    const days = c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
    const byday = days.map((d) => ICS_DAYS[d]).join(',');
    const slots = c.kind === 'enjeksiyon' ? ['sabah'] : c.times && c.times.length ? c.times : ['sabah'];
    for (const s of slots) {
      const title = hideNames
        ? c.kind === 'enjeksiyon'
          ? 'Enjeksiyon'
          : `${slotLabel(s)} dozu`
        : `${c.kind === 'enjeksiyon' ? 'Enjeksiyon' : slotLabel(s)}: ${c.name}${doseText(c) ? ' ' + doseText(c) : ''}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:sporcoach-${c.id}-${s}-${++n}@sporcoach`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${startDate}T${SLOT_TIME[s]}`,
        'DURATION:PT10M',
        `RRULE:FREQ=WEEKLY;BYDAY=${byday}${until ? ';UNTIL=' + until : ''}`,
        `SUMMARY:${icsEscape(title)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(title)}`,
        'TRIGGER:PT0M',
        'END:VALARM',
        'END:VEVENT'
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function openIcs(comps, ci) {
  const active = comps.filter((c) => c.active !== false);
  if (!active.length) return toast('Önce madde ekle');
  const s = openSheet({
    title: 'Takvime aktar',
    body: `
      <p style="margin:0 4px 14px;font-size:15px;line-height:21px">Aktif maddelerin için tekrarlayan etkinlikler ve hatırlatmalar içeren bir takvim dosyası oluşturulur. Paylaş menüsünden <b>Takvim</b>'i seçip ekleyebilirsin. Hatırlatma saatleri: sabah 09:00, öğle 13:00, akşam 21:00, enjeksiyon 09:00 — Takvim'de istediğin gibi değiştirebilirsin.</p>
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="ics-hide" style="font-size:16px">Etkinliklerde madde adlarını gizle</label>
        <span class="switch"><input id="ics-hide" type="checkbox" checked><span></span></span>
      </div>
      <p class="small muted" style="margin:0 4px 14px">Takvim bildirimleri kilit ekranında görünebileceği için adları gizli tutmak daha güvenli.</p>
      ${ci.end ? `<p class="small muted" style="margin:0 4px 14px">Etkinlikler kürün bitiş tarihi olan ${esc(trDateYear(ci.end))}'e kadar tekrarlanır.</p>` : ''}
      <button type="button" class="btn primary block" data-go>Dosyayı oluştur</button>`,
  });
  s.el.querySelector('[data-go]').addEventListener('click', async () => {
    const hide = s.el.querySelector('#ics-hide').checked;
    await downloadOrShare('procoach-kur.ics', buildIcs(active, ci, hide), 'text/calendar');
    s.close();
  });
}
