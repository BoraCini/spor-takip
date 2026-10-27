import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, weekStart, weekday, trDate, trDateYear, WD_SHORT, WD_LONG, icon, openSheet, confirmSheet, downloadOrShare, parseDate } from '../util.js';
import { refresh } from '../app.js';
import { cycleInfo, dueOn, doseText, SITES, suggestSite, SLOTS, slotLabel } from '../context.js';

const UNITS = ['mg', 'mcg', 'IU', 'ml', 'tablet', 'kapsül', 'damla'];

export async function render(root) {
  const t = today();
  const ci = await cycleInfo(t);
  const due = await dueOn(t);
  const comps = await db.list('compounds');
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

  const pct = ci.cycle?.weeks && ci.week ? Math.min(100, Math.round((ci.week / ci.cycle.weeks) * 100)) : 0;

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

    <button type="button" class="card" style="display:flex;flex-direction:column;gap:8px;width:calc(100% - 32px);text-align:left" data-act="cycle" aria-label="Kür bilgilerini düzenle">
      ${
        ci.cycle?.start_date
          ? `<div style="display:flex;justify-content:space-between;align-items:baseline;width:100%;gap:8px">
              <span style="font-size:17px;font-weight:600">${ci.week == null ? 'Başlamadı' : `Hafta ${ci.week}${ci.cycle.weeks ? ' / ' + ci.cycle.weeks : ''}`}</span>
              <span class="small muted">${esc(trDate(ci.cycle.start_date))}${ci.end ? ' → ' + esc(trDate(ci.end)) : ''}</span>
            </div>
            ${ci.cycle.weeks ? `<span class="bar thick" style="width:100%"><span style="width:${pct}%"></span></span>` : ''}
            ${ci.cycle.weeks && ci.week > ci.cycle.weeks ? '<span class="small muted">Planlanan süre doldu.</span>' : ''}`
          : `<span style="font-size:17px;font-weight:600">Kür bilgisi</span><span class="small muted">Başlangıç tarihini ve süresini gir; hafta takibi ve tahlil yorumları buna göre yapılır.</span>`
      }
    </button>

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
      <section class="card flush" aria-label="Kullanılan maddeler">
        ${comps
          .map((c) => {
            const days = c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
            const dayTxt = days.length === 7 ? 'Her gün' : days.map((d) => WD_SHORT[d]).join(', ');
            const timeTxt = c.kind === 'enjeksiyon' ? 'Enjeksiyon' : (c.times && c.times.length ? c.times : ['sabah']).map(slotLabel).join(', ').toLocaleLowerCase('tr-TR');
            return `<button type="button" class="row" data-act="edit" data-id="${c.id}">
              <span class="row-main"><span class="row-title normal">${esc(c.name)}${c.active === false ? ' <span class="muted small">(pasif)</span>' : ''}</span>
              <span class="row-sub">${esc(c.kind === 'enjeksiyon' ? `Enjeksiyon · ${dayTxt}` : `${dayTxt} · ${timeTxt}`)}${doseText(c) ? ' · ' + esc(doseText(c)) : ''}</span></span>${icon.chev}</button>`;
          })
          .join('')}
      </section>
      <p class="note">Takvim simgesiyle bu programı iPhone Takvim'e aktarabilirsin; hatırlatmaları Takvim yapar.</p>`
        : ''
    }
  `;

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openCompound(null);
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

function openCompound(c) {
  const st = {
    name: c?.name || '',
    kind: c?.kind || 'enjeksiyon',
    dose_amount: c?.dose_amount ?? '',
    dose_unit: c?.dose_unit || 'mg',
    days: c?.days ? [...c.days] : [],
    times: c?.times ? [...c.times] : [],
    active: c?.active !== false,
    notes: c?.notes || '',
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
        name: st.name.trim(),
        kind: st.kind,
        dose_amount: isNaN(n) ? null : n,
        dose_unit: st.dose_unit,
        days: st.kind === 'hap' && !st.days.length ? [0, 1, 2, 3, 4, 5, 6] : st.days.sort(),
        times: st.kind === 'hap' ? (st.times.length ? st.times : ['sabah']) : [],
        active: st.active,
        notes: st.notes.trim(),
      });
      api.close();
      toast('Kaydedildi');
      refresh();
    },
  });
  const sync = () => {
    const g = (id) => s.el.querySelector(id);
    if (g('#c-name')) st.name = g('#c-name').value;
    if (g('#c-dose')) st.dose_amount = g('#c-dose').value;
    if (g('#c-unit')) st.dose_unit = g('#c-unit').value;
    if (g('#c-notes')) st.notes = g('#c-notes').value;
    if (g('#c-active')) st.active = g('#c-active').checked;
  };
  const draw = () => {
    const isInj = st.kind === 'enjeksiyon';
    s.setBody(`
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
      <div class="field"><label for="c-notes">Not</label><textarea id="c-notes" class="input" placeholder="Örn. yemekle birlikte, aç karnına">${esc(st.notes)}</textarea></div>
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <label for="c-active" style="font-size:16px">Şu an kullanıyorum</label>
        <span class="switch"><input id="c-active" type="checkbox" ${st.active ? 'checked' : ''}><span></span></span>
      </div>
      ${c ? '<button type="button" class="btn danger block" data-del style="background:var(--card)">Maddeyi sil</button>' : ''}`);
  };
  draw();
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

function openCycle(cy) {
  const s = openSheet({
    title: 'Kür bilgisi',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <div class="grid2">
        <div class="field"><label for="cy-start">Başlangıç</label><input id="cy-start" class="input" type="date" value="${esc(cy?.start_date || today())}"></div>
        <div class="field"><label for="cy-weeks">Süre (hafta)</label><input id="cy-weeks" class="input" inputmode="numeric" value="${esc(cy?.weeks || '')}" placeholder="Örn. 12"></div>
      </div>
      <div class="field"><label for="cy-notes">Notlar</label><textarea id="cy-notes" class="input" placeholder="Hedef, dikkat ettiğin yan etkiler, kontrol tahlili tarihleri…">${esc(cy?.notes || '')}</textarea></div>
      ${cy ? '<button type="button" class="btn danger block" data-new style="background:var(--card)">Yeni kür başlat</button><p class="small muted" style="margin:8px 4px 0">Yeni kür başlatınca mevcut kür bilgisi geçmişte kalır; maddelerin ve kayıtların silinmez.</p>' : ''}`,
    onRight: async (api) => {
      const start = s.el.querySelector('#cy-start').value;
      const w = parseNum(s.el.querySelector('#cy-weeks').value);
      if (!start) return toast('Başlangıç tarihi gerekli');
      await db.put('cycles', { ...(cy || {}), start_date: start, weeks: isNaN(w) ? null : Math.round(w), notes: s.el.querySelector('#cy-notes').value.trim() });
      api.close();
      toast('Kaydedildi');
      refresh();
    },
  });
  const nb = s.el.querySelector('[data-new]');
  if (nb)
    nb.addEventListener('click', async () => {
      await db.put('cycles', { start_date: today(), weeks: null, notes: '' });
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
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SporCoach//TR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:SporCoach Kür'];
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
    await downloadOrShare('sporcoach-kur.ics', buildIcs(active, ci, hide), 'text/calendar');
    s.close();
  });
}
