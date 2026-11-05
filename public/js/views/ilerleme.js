// İlerleme: haftalık hacim, kilo, vücut ölçüleri, ilerleme fotoğrafları, rekorlar
import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, addDays, weekStart, trDate, trDateYear, openSheet, confirmSheet, round1, lineChartSVG, trendChartSVG, parseDate, MONTHS_SHORT, MONTHS } from '../util.js';
import { refresh, go } from '../app.js';
import { weeklySummary, MEASURES, isCardio, isWarmup, e1rmOf, regionSets, weightTrend, trendRate, monthlyReport } from '../context.js';
import { bodyMapSVG, heatLegend } from '../bodymap.js';
import { REGIONS, regionLabel } from '../data/muscles.js';

const st = { open: {}, mapRange: 'this', month: null };
const GROUPS = ['Göğüs', 'Sırt', 'Omuz', 'Kol', 'Bacak', 'Karın'];
const POSES = ['Ön', 'Yan', 'Arka'];
const kg = (v) => (v == null || isNaN(v) ? '–' : String(round1(v)).replace('.', ','));
const lbl = (d) => {
  const dt = parseDate(d);
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`;
};
const signed = (v, u = '') => (v == null || isNaN(v) || v === 0 ? '±0' + u : (v > 0 ? '+' : '−') + kg(Math.abs(v)) + u);

export async function renderProgress(el) {
  const t = today();
  const ws = weekStart(t);
  const cur = await weeklySummary(ws);
  const prev = await weeklySummary(addDays(ws, -7));
  const weights = (await db.list('body_logs')).sort((a, b) => a.date.localeCompare(b.date));
  const measures = (await db.list('body_measurements')).sort((a, b) => a.date.localeCompare(b.date));
  const photos = (await db.list('progress_photos')).sort((a, b) => b.date.localeCompare(a.date) || POSES.indexOf(a.pose) - POSES.indexOf(b.pose));
  const records = await bestLifts();
  // Kas haritası aralığı
  const ranges = { this: [ws, addDays(ws, 6), 1], last: [addDays(ws, -7), addDays(ws, -1), 1], four: [addDays(ws, -28), addDays(ws, -1), 4] };
  const [r0, r1, div] = ranges[st.mapRange] || ranges.this;
  const regRaw = await regionSets(r0, r1);
  const reg = Object.fromEntries(Object.entries(regRaw).map(([k, v]) => [k, v / div]));
  const regSorted = Object.entries(reg).sort((a, b) => b[1] - a[1]);
  // Kilo eğilimi
  const trend = weightTrend(weights);
  const rate = trendRate(trend, 14);
  const lastT = trend[trend.length - 1];
  // Aylık rapor
  const ym = st.month || t.slice(0, 7);
  const rep = await monthlyReport(ym);
  const [ry, rm] = ym.split('-').map(Number);
  const prevYm = rm === 1 ? `${ry - 1}-12` : `${ry}-${String(rm - 1).padStart(2, '0')}`;
  const nextYm = rm === 12 ? `${ry + 1}-01` : `${ry}-${String(rm + 1).padStart(2, '0')}`;
  const isCurMonth = ym === t.slice(0, 7);
  const topRegions = Object.entries(rep.training.regions).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const maxSets = Math.max(20, ...GROUPS.map((g) => cur.training.sets_by_muscle[g] || 0));
  const lastW = weights[weights.length - 1];
  const firstW = weights[0];
  const lastM = measures[measures.length - 1];
  const prevM = measures[measures.length - 2];
  const firstM = measures[0];

  el.innerHTML = `
    <div class="sec"><h2>Bu hafta</h2><span class="meta">${esc(lbl(cur.start))} – ${esc(lbl(cur.end))}</span></div>
    <section class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="stat3">
        <div><b>${cur.training.sessions}</b><span>antrenman${prev.training.sessions ? ` (geçen: ${prev.training.sessions})` : ''}</span></div>
        <div><b>${cur.training.sets}</b><span>set${prev.training.sets ? ` (geçen: ${prev.training.sets})` : ''}</span></div>
        <div><b>${cur.training.volume_kg >= 10000 ? fmt(cur.training.volume_kg / 1000, 1) : fmt(cur.training.volume_kg)}</b><span>${cur.training.volume_kg >= 10000 ? 'ton' : 'kg'} hacim</span></div>
      </div>
      ${cur.training.cardio_min ? `<span class="small muted">Kardiyo: ${fmt(cur.training.cardio_min)} dk</span>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px" aria-label="Kas grubu başına haftalık set">
        ${GROUPS.map((g) => {
          const n = cur.training.sets_by_muscle[g] || 0;
          const p = prev.training.sets_by_muscle[g] || 0;
          return `<div class="mbar">
            <span class="mbar-l">${g}</span>
            <span class="mbar-t"><span class="mbar-band" style="left:${(10 / maxSets) * 100}%;width:${(10 / maxSets) * 100}%"></span><span class="mbar-f" style="width:${(n / maxSets) * 100}%"></span></span>
            <span class="mbar-v num">${n}${p ? `<small class="muted"> / ${p}</small>` : ''}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="small muted" style="margin:0;line-height:18px">Kas grubu başına haftalık set sayısı (sağdaki küçük rakam geçen hafta). Gölgeli alan, kas gelişimi için çoğu kişide etkili bulunan 10–20 set aralığı.</p>
    </section>

    <div class="sec"><h2>Kas haritası</h2></div>
    <section class="card">
      <div class="seg sm" role="tablist" aria-label="Dönem" style="margin:0 0 10px">
        ${[['this', 'Bu hafta'], ['last', 'Geçen hafta'], ['four', '4 hafta ort.']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.mapRange === k}" data-pact="range" data-k="${k}">${l}</button>`).join('')}
      </div>
      ${bodyMapSVG(reg)}
      ${heatLegend()}
      <div class="bm-list">${regSorted
        .map(([k, v]) => `<div class="${v > 0 && v < 4 ? '' : ''}"><span>${esc(regionLabel(k))}</span><b>${fmt(v, 1)}</b></div>`)
        .join('')}</div>
      ${regSorted.some(([, v]) => v > 0) ? `<p class="small muted" style="margin:8px 0 0;line-height:17px">Hiç çalışmadığın bölgeler: ${esc(regSorted.filter(([, v]) => v === 0).map(([k]) => regionLabel(k)).join(', ') || 'yok')}.</p>` : ''}
    </section>

    <div class="sec"><h2>Kilo</h2>${lastW ? `<span class="meta">${kg(lastW.weight_kg)} kg${firstW && firstW !== lastW ? ` · başlangıçtan ${signed(round1(lastW.weight_kg - firstW.weight_kg), ' kg')}` : ''}</span>` : ''}</div>
    <section class="card">
      ${
        trend.length >= 2
          ? `<div class="trend-head">
              <div><span class="small muted">Eğilim</span><b class="num">${kg(lastT.trend)} kg</b></div>
              <div><span class="small muted">Haftalık değişim</span><b class="num ${rate != null && Math.abs(rate) > 1 ? 'warn' : ''}">${rate == null ? '–' : signed(rate, ' kg')}</b></div>
              <div><span class="small muted">Son tartı</span><b class="num">${kg(lastT.weight)} kg</b></div>
            </div>
            ${trendChartSVG(trend.slice(-30).map((w) => ({ label: lbl(w.date), value: w.weight, trend: w.trend })))}
            <p class="small muted" style="margin:6px 0 0;line-height:17px">Noktalar günlük tartılar, çizgi gerçek eğilim. Günlük ±1 kg oynamalar su ve tuzdan kaynaklanır; eğilime bak.</p>`
          : '<p class="small muted" style="margin:0 0 10px">Kilonu girdikçe burada grafik oluşur.</p>'
      }
      <div style="display:flex;gap:8px;margin-top:10px">
        <label class="sr-only" for="pw-today">Bugünkü kilo</label>
        <input id="pw-today" class="input" inputmode="decimal" placeholder="Bugünkü kilo (kg)" style="flex:1">
        <button type="button" class="btn primary" data-pact="weight">Ekle</button>
      </div>
    </section>

    <div class="sec"><h2>Vücut ölçüleri</h2><button type="button" class="link" data-pact="measure">+ Ölçü ekle</button></div>
    <section class="card flush">
      ${
        lastM
          ? MEASURES.filter(([k]) => measures.some((m) => m[k] != null))
              .map(([k, l, u]) => {
                const hist = measures.filter((m) => m[k] != null);
                const last = hist[hist.length - 1];
                const first = hist[0];
                const open = st.open[k];
                return `<button type="button" class="lab-row" data-pact="toggle" data-k="${k}" aria-expanded="${!!open}">
                  <div class="lab-top"><span class="lab-name" style="font-weight:500">${l}</span><span class="lab-val">${kg(last[k])} <small>${u}</small></span></div>
                  <div class="lab-mid"><span class="muted">${esc(trDate(last.date))}</span><span class="muted">${hist.length > 1 ? `başlangıçtan ${signed(round1(last[k] - first[k]), ' ' + u)}` : ''}</span></div>
                  ${open && hist.length >= 2 ? lineChartSVG(hist.map((m) => ({ label: lbl(m.date), value: m[k] })), { unit: u }) : ''}
                </button>`;
              })
              .join('')
          : '<div class="empty">Bel, kol, göğüs gibi ölçülerini ara ara gir; değişim burada görünür.</div>'
      }
    </section>
    ${lastM ? `<p class="note">Ölçüleri her seferinde aynı koşullarda (örn. sabah, aç karnına) almak karşılaştırmayı daha anlamlı yapar.${prevM ? ` Son ölçüm ${esc(trDate(lastM.date))}, önceki ${esc(trDate(prevM.date))}.` : ''}</p>` : ''}

    <div class="sec"><h2>Aylık rapor</h2>
      <span class="month-nav">
        <button type="button" class="dw-nav" data-pact="month" data-m="${prevYm}" aria-label="Önceki ay">‹</button>
        <span class="meta">${MONTHS[rm - 1]} ${ry}</span>
        <button type="button" class="dw-nav" data-pact="month" data-m="${nextYm}" aria-label="Sonraki ay" ${isCurMonth ? 'disabled' : ''}>›</button>
      </span></div>
    <section class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="stat3">
        <div><b>${rep.training.sessions}</b><span>antrenman</span></div>
        <div><b>${rep.training.sets}</b><span>çalışma seti</span></div>
        <div><b>${rep.training.volume_kg >= 10000 ? fmt(rep.training.volume_kg / 1000, 1) : fmt(rep.training.volume_kg)}</b><span>${rep.training.volume_kg >= 10000 ? 'ton' : 'kg'} hacim</span></div>
      </div>
      <div class="kv"><span class="k">Kilo eğilimi</span><span class="v num">${rep.weight.change == null ? '–' : `${kg(rep.weight.start)} → ${kg(rep.weight.end)} kg (${signed(rep.weight.change, ' kg')})`}</span></div>
      <div class="kv"><span class="k">Ortalama kalori / protein</span><span class="v num">${rep.nutrition.avg_kcal ? `${fmt(rep.nutrition.avg_kcal)} kcal · ${fmt(rep.nutrition.avg_protein)} g` : '–'}${rep.nutrition.logged_days ? ` <small>(${rep.nutrition.logged_days} gün)</small>` : ''}</span></div>
      ${rep.training.cardio_min ? `<div class="kv"><span class="k">Kardiyo</span><span class="v num">${fmt(rep.training.cardio_min)} dk</span></div>` : ''}
      ${rep.doses.total ? `<div class="kv"><span class="k">Protokol / ilaç uyumu</span><span class="v num">%${Math.round((rep.doses.done / rep.doses.total) * 100)} (${rep.doses.done}/${rep.doses.total})</span></div>` : ''}
      ${rep.vitals.n ? `<div class="kv"><span class="k">Ortalama tansiyon / nabız</span><span class="v num">${rep.vitals.sys ? `${rep.vitals.sys}/${rep.vitals.dia}` : '–'}${rep.vitals.hr ? ` · ${rep.vitals.hr} atım` : ''}</span></div>` : ''}
      ${topRegions.length ? `<div class="kv"><span class="k">En çok çalışan</span><span class="v">${esc(topRegions.slice(0, 3).map(([k]) => regionLabel(k)).join(', '))}</span></div>` : ''}
      ${
        rep.training.prs.length
          ? `<div><span class="small muted">Bu ayki rekorlar (${rep.training.prs.length})</span>
              ${rep.training.prs.slice(-8).reverse().map((p) => `<div class="pr-row"><span class="pr-tag" style="margin:0">PR</span><span><b>${esc(p.ex)}</b> · ${esc(p.labels.join(', '))}</span><span class="muted small">${esc(lbl(p.date))}</span></div>`).join('')}</div>`
          : ''
      }
      <button type="button" class="btn" data-pact="ask-month">Coach'a bu ayı yorumlat</button>
    </section>

    <div class="sec"><h2>İlerleme fotoğrafları</h2>
      <label class="link" style="display:flex;align-items:center;cursor:pointer">+ Fotoğraf ekle<input type="file" accept="image/*" class="sr-only" data-pact="photo"></label></div>
    <section class="card">
      ${
        photos.length
          ? `<div class="photo-grid">${photos
              .map((p) => `<button type="button" class="photo-th" data-pact="view" data-id="${p.id}" aria-label="${esc(trDate(p.date))} ${esc(p.pose)} fotoğrafı">
                  <img src="${p.thumb}" alt=""><span>${esc(lbl(p.date))} · ${esc(p.pose)}</span></button>`)
              .join('')}</div>
             <p class="small muted" style="margin:10px 0 0">Bir fotoğrafa dokunup "Karşılaştır" ile iki tarihi yan yana görebilirsin.</p>`
          : '<div class="empty">Aynı ışıkta ve aynı pozda (ön, yan, arka) düzenli fotoğraf çekmek değişimi görmenin en iyi yolu. Fotoğraflar sadece bu telefonda saklanır.</div>'
      }
    </section>

    ${
      records.length
        ? `<div class="sec"><h2>Rekorlar</h2><span class="meta">tahmini 1RM</span></div>
      <section class="card flush">${records
        .map((r) => `<div class="row"><span class="row-main"><span class="row-title normal">${esc(r.name)}</span>
          <span class="row-sub num">${kg(r.set.weight_kg)} kg × ${r.set.reps} · ${esc(trDate(r.set.date))}</span></span><span class="row-end">${kg(r.e1rm)}</span></div>`)
        .join('')}</section>`
        : ''
    }
  `;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-pact]');
    if (!b) return;
    const a = b.dataset.pact;
    if (a === 'weight') {
      const v = parseNum(el.querySelector('#pw-today').value);
      if (!v || v < 30 || v > 300) return toast('Geçerli bir kilo gir');
      const existing = (await db.list('body_logs', (r) => r.date === t))[0];
      await db.put('body_logs', { ...(existing || {}), date: t, weight_kg: v });
      const p = await db.getProfile();
      p.weight_kg = v;
      await db.saveProfile(p);
      toast('Kilo kaydedildi');
      refresh();
    } else if (a === 'range') {
      st.mapRange = b.dataset.k;
      refresh();
    } else if (a === 'month') {
      st.month = b.dataset.m;
      refresh();
    } else if (a === 'ask-month') {
      go(`danisman?ask=month&m=${encodeURIComponent(ym)}`);
    } else if (a === 'measure') openMeasure(lastM);
    else if (a === 'toggle') {
      st.open[b.dataset.k] = !st.open[b.dataset.k];
      refresh();
    } else if (a === 'view') openPhoto(photos.find((p) => p.id === b.dataset.id), photos);
  };
  const fi = el.querySelector('[data-pact="photo"]');
  fi.addEventListener('change', async () => {
    const f = fi.files && fi.files[0];
    fi.value = '';
    if (f) addPhoto(f);
  });
}

async function bestLifts() {
  const sets = await db.list('workout_sets', (s) => s.done && s.weight_kg > 0 && s.reps > 0 && !isWarmup(s));
  const exs = await db.list('exercises');
  const best = {};
  for (const s of sets) {
    const ex = exs.find((x) => x.id === s.exercise_id);
    if (!ex || isCardio(ex)) continue;
    const e1 = e1rmOf(s);
    if (!best[ex.id] || e1 > best[ex.id].e1rm) best[ex.id] = { name: ex.name, e1rm: round1(e1), set: s };
  }
  return Object.values(best)
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, 8);
}

function openMeasure(last) {
  const s = openSheet({
    title: 'Vücut ölçüleri',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <div class="field"><label for="m-date">Tarih</label><input id="m-date" class="input" type="date" value="${today()}"></div>
      <div class="grid2">
        ${MEASURES.map(([k, l, u]) => `<div class="field"><label for="m-${k}">${l} (${u})</label><input id="m-${k}" class="input" inputmode="decimal" placeholder="${last && last[k] != null ? 'son: ' + kg(last[k]) : ''}"></div>`).join('')}
      </div>
      <p class="small muted" style="margin:0 4px;line-height:18px">Sadece ölçtüğün alanları doldur. Bel: göbek hizasından; kol: pazunun en kalın yeri, kasılı; bacak: uyluğun en kalın yeri.</p>`,
    onRight: async (api) => {
      const rec = { date: s.el.querySelector('#m-date').value || today() };
      let any = false;
      for (const [k] of MEASURES) {
        const v = parseNum(s.el.querySelector(`#m-${k}`).value);
        if (!isNaN(v) && v > 0) {
          rec[k] = v;
          any = true;
        }
      }
      if (!any) return toast('En az bir ölçü gir');
      const existing = (await db.list('body_measurements', (m) => m.date === rec.date))[0];
      await db.put('body_measurements', { ...(existing || {}), ...rec });
      api.close();
      toast('Ölçüler kaydedildi');
      refresh();
    },
  });
}

// ---------- Fotoğraflar ----------
function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => reject(new Error('Fotoğraf açılamadı'));
    img.src = url;
  });
}
function jpeg(img, max, q) {
  const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * sc);
  c.height = Math.round(img.naturalHeight * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

async function addPhoto(file) {
  let image;
  let thumb;
  try {
    const { img, url } = await loadImg(file);
    image = jpeg(img, 1280, 0.82);
    thumb = jpeg(img, 320, 0.7);
    URL.revokeObjectURL(url);
  } catch (e) {
    return toast(e.message);
  }
  let pose = 'Ön';
  const s = openSheet({
    title: 'Fotoğrafı kaydet',
    leftLabel: 'Vazgeç',
    rightLabel: 'Kaydet',
    body: `
      <img src="${thumb}" alt="Seçilen fotoğraf" style="display:block;max-width:60%;max-height:40dvh;margin:0 auto 14px;border-radius:12px">
      <div class="field"><label for="ph-date">Tarih</label><input id="ph-date" class="input" type="date" value="${today()}"></div>
      <div class="field"><span class="lbl">Poz</span><div class="toggle-row" id="ph-pose">${POSES.map((p) => `<button type="button" class="tog" aria-pressed="${p === pose}" data-pose="${p}">${p}</button>`).join('')}</div></div>`,
    onRight: async (api) => {
      await db.put('progress_photos', { date: s.el.querySelector('#ph-date').value || today(), pose, image, thumb });
      api.close();
      toast('Fotoğraf kaydedildi');
      refresh();
    },
  });
  s.el.querySelector('#ph-pose').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pose]');
    if (!b) return;
    pose = b.dataset.pose;
    s.el.querySelectorAll('[data-pose]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pose === pose)));
  });
}

function openPhoto(photo, all) {
  if (!photo) return;
  const s = openSheet({
    title: `${trDate(photo.date)} · ${photo.pose}`,
    body: `
      <img src="${photo.image}" alt="${esc(trDateYear(photo.date))} ${esc(photo.pose)} fotoğrafı" style="display:block;width:100%;border-radius:12px;margin-bottom:12px">
      <div class="btn-row">
        <button type="button" class="btn primary" data-cmp ${all.length < 2 ? 'disabled' : ''}>Karşılaştır</button>
        <button type="button" class="btn danger" data-del style="background:var(--card)">Sil</button>
      </div>`,
  });
  s.el.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmSheet({ title: 'Fotoğrafı sil', text: 'Bu fotoğraf silinsin mi?', okLabel: 'Sil', danger: true }))) return;
    await db.remove('progress_photos', photo.id);
    s.close();
    refresh();
  });
  s.el.querySelector('[data-cmp]').addEventListener('click', () => {
    const others = all.filter((p) => p.id !== photo.id);
    const samePose = others.filter((p) => p.pose === photo.pose);
    const list = samePose.length ? samePose : others;
    s.setBody(`<p style="margin:0 4px 10px;font-size:15px">Hangi fotoğrafla karşılaştıralım?</p>
      <div class="photo-grid">${list.map((p) => `<button type="button" class="photo-th" data-with="${p.id}"><img src="${p.thumb}" alt=""><span>${esc(lbl(p.date))} · ${esc(p.pose)}</span></button>`).join('')}</div>`);
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-with]');
      if (!b) return;
      const other = all.find((p) => p.id === b.dataset.with);
      const [a, c] = [photo, other].sort((x, y) => x.date.localeCompare(y.date));
      s.setBody(`<div class="cmp">
          <figure><img src="${a.image}" alt="${esc(trDateYear(a.date))}"><figcaption>${esc(trDateYear(a.date))}</figcaption></figure>
          <figure><img src="${c.image}" alt="${esc(trDateYear(c.date))}"><figcaption>${esc(trDateYear(c.date))}</figcaption></figure>
        </div>`);
    });
  });
}
