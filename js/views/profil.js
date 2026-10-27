import * as db from '../db.js';
import { esc, fmt, parseNum, toast, today, trDate, icon, confirmSheet, downloadOrShare, lineChartSVG, MONTHS_SHORT, parseDate } from '../util.js';
import { ACCENTS, applyAccent, go, refresh, APP_VERSION } from '../app.js';
import { hasPin, setupPinFlow, clearPin, showLock } from '../lock.js';
import { monthUsage } from '../ai.js';

const ACT = [
  ['1.2', 'Hareketsiz (masa başı, antrenman yok)'],
  ['1.375', 'Hafif (haftada 1–3 antrenman)'],
  ['1.55', 'Orta (haftada 3–5 antrenman)'],
  ['1.725', 'Yüksek (haftada 6–7 antrenman)'],
  ['1.9', 'Çok yüksek (ağır iş + antrenman)'],
];

function suggestTargets(p) {
  const w = Number(p.weight_kg);
  const h = Number(p.height_cm);
  const age = p.birth_year ? new Date().getFullYear() - Number(p.birth_year) : null;
  if (!w || !h || !age) return null;
  const bmr = 10 * w + 6.25 * h - 5 * age + (p.sex === 'kadin' ? -161 : 5);
  const tdee = bmr * Number(p.activity || 1.55);
  const phase = p.phase || 'koruma';
  const kcal = Math.round((tdee + (phase === 'bulk' ? 300 : phase === 'cut' ? -500 : 0)) / 10) * 10;
  const protein = Math.round(w * (phase === 'cut' ? 2.2 : 2.0));
  const fat = Math.round(Math.max(w * 0.9, (kcal * 0.25) / 9));
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carb, fat, tdee: Math.round(tdee) };
}

export async function render(root, params) {
  const p = await db.getProfile();
  const accent = (await db.getSetting('accent')) || ACCENTS[0].value;
  const restSec = await db.getSetting('rest_seconds', 90);
  const pin = await hasPin();
  const apiKey = await db.getSetting('api_key', '');
  const usage = await monthUsage();
  const weights = (await db.list('body_logs')).sort((a, b) => a.date.localeCompare(b.date));
  const first = params.first === '1';
  const sug = suggestTargets(p);
  const phase = p.phase || 'koruma';

  const wPoints = weights.slice(-12).map((w) => {
    const d = parseDate(w.date);
    return { label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, value: w.weight_kg };
  });

  root.innerHTML = `
    <header class="hdr">
      <div class="hdr-text">
        ${first ? '<span class="eyebrow">İlk kurulum</span>' : `<a href="#/danisman" class="btn ghost" style="padding:0;height:32px;justify-content:flex-start">‹ Geri</a>`}
        <h1 class="title">Profil ve ayarlar</h1>
      </div>
    </header>

    ${first ? `<p class="note" style="margin-top:0;margin-bottom:12px">Kendini kısaca tanıt. Danışman bu bilgileri her soruda kullanır, böylece her seferinde anlatman gerekmez. Hepsini sonra değiştirebilirsin.</p>` : ''}

    <div class="sec"><h2>Profil</h2></div>
    <section class="card" id="pform">
      <div class="field"><label for="p-name">Adın</label><input id="p-name" class="input" data-p="name" value="${esc(p.name || '')}" autocomplete="given-name"></div>
      <div class="grid2">
        <div class="field"><label for="p-sex">Cinsiyet</label>
          <select id="p-sex" class="input" data-p="sex">
            <option value="erkek" ${p.sex !== 'kadin' ? 'selected' : ''}>Erkek</option>
            <option value="kadin" ${p.sex === 'kadin' ? 'selected' : ''}>Kadın</option>
          </select></div>
        <div class="field"><label for="p-by">Doğum yılı</label><input id="p-by" class="input" data-p="birth_year" inputmode="numeric" value="${esc(p.birth_year || '')}" placeholder="1995"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="p-h">Boy (cm)</label><input id="p-h" class="input" data-p="height_cm" inputmode="decimal" value="${esc(p.height_cm || '')}"></div>
        <div class="field"><label for="p-w">Kilo (kg)</label><input id="p-w" class="input" data-p="weight_kg" inputmode="decimal" value="${esc(p.weight_kg ?? '')}"></div>
      </div>
      <div class="field"><span class="lbl">Dönem</span>
        <div class="seg" style="margin:0" role="radiogroup" aria-label="Dönem">
          ${[['bulk', 'Bulk'], ['cut', 'Cut'], ['koruma', 'Koruma']]
            .map(([v, l]) => `<button type="button" role="radio" aria-checked="${phase === v}" aria-selected="${phase === v}" data-phase="${v}">${l}</button>`)
            .join('')}
        </div>
      </div>
      <div class="field"><label for="p-act">Aktivite seviyesi</label>
        <select id="p-act" class="input" data-p="activity">
          ${ACT.map(([v, l]) => `<option value="${v}" ${String(p.activity || '1.55') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      <div class="field"><label for="p-goal">Hedefin</label><textarea id="p-goal" class="input" data-p="goal" placeholder="Örn. yazın 8 kg temiz kilo almak, bench'te 120 kg">${esc(p.goal || '')}</textarea></div>
      <div class="field"><label for="p-inj">Sakatlıklar / dikkat edilecekler</label><textarea id="p-inj" class="input" data-p="injuries" placeholder="Örn. sol omuzda impingement, bel fıtığı geçmişi">${esc(p.injuries || '')}</textarea></div>
      <div class="field" style="margin-bottom:0"><label for="p-notes">Diğer notlar</label><textarea id="p-notes" class="input" data-p="notes" placeholder="Danışmanın bilmesini istediğin başka şeyler">${esc(p.notes || '')}</textarea></div>
    </section>

    <div class="sec"><h2>Günlük hedefler</h2></div>
    <section class="card">
      <div class="grid2">
        <div class="field"><label for="t-k">Kalori (kcal)</label><input id="t-k" class="input" data-p="target_kcal" inputmode="numeric" value="${esc(p.target_kcal || '')}"></div>
        <div class="field"><label for="t-p">Protein (g)</label><input id="t-p" class="input" data-p="target_protein_g" inputmode="numeric" value="${esc(p.target_protein_g || '')}"></div>
        <div class="field" style="margin-bottom:0"><label for="t-c">Karbonhidrat (g)</label><input id="t-c" class="input" data-p="target_carb_g" inputmode="numeric" value="${esc(p.target_carb_g || '')}"></div>
        <div class="field" style="margin-bottom:0"><label for="t-f">Yağ (g)</label><input id="t-f" class="input" data-p="target_fat_g" inputmode="numeric" value="${esc(p.target_fat_g || '')}"></div>
      </div>
      ${
        sug
          ? `<div class="inset" style="margin-top:14px">
              <span style="font-size:15px;font-weight:600">Önerilen: ${fmt(sug.kcal)} kcal · P ${sug.protein} · K ${sug.carb} · Y ${sug.fat}</span>
              <span class="small muted">Günlük harcaman yaklaşık ${fmt(sug.tdee)} kcal (Mifflin-St Jeor). ${phase === 'bulk' ? '+300 kcal fazla' : phase === 'cut' ? '−500 kcal açık' : 'Koruma'} ile hesaplandı. Kilo değişimine göre 2–3 haftada bir güncellemek iyi olur.</span>
              <button type="button" class="btn primary" style="margin-top:8px" data-act="apply-sug">Önerileri uygula</button>
            </div>`
          : `<p class="small muted" style="margin:12px 0 0">Doğum yılı, boy ve kilonu girersen sana bir başlangıç hedefi hesaplarım.</p>`
      }
    </section>

    <div class="sec"><h2>Kilo geçmişi</h2>${weights.length ? `<span class="meta">${weights.length} kayıt</span>` : ''}</div>
    <section class="card">
      ${wPoints.length >= 2 ? lineChartSVG(wPoints, { unit: 'kg' }) : `<p class="small muted" style="margin:0 0 10px">Kilonu girdikçe burada grafik oluşur.</p>`}
      <div style="display:flex;gap:8px;margin-top:10px">
        <label class="sr-only" for="w-today">Bugünkü kilo</label>
        <input id="w-today" class="input" inputmode="decimal" placeholder="Bugünkü kilo (kg)" style="flex:1">
        <button type="button" class="btn primary" data-act="add-weight">Ekle</button>
      </div>
    </section>

    ${first ? `<div style="padding:16px"><button type="button" class="btn primary block" data-act="done-first">Bitti, başlayalım</button></div>` : ''}

    <div class="sec"><h2>Danışman (yapay zekâ)</h2></div>
    <section class="card">
      <p class="small muted" style="margin:0 0 10px;line-height:18px">Danışman, Anthropic'in Claude modelini kullanır. Bunun için Claude Console'dan aldığın bir API anahtarı gerekir. Anahtar yalnızca bu telefonda saklanır ve yedeğe dahil edilmez.</p>
      <div class="field"><label for="api-key">API anahtarı</label>
        <input id="api-key" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-..." value="${apiKey ? '••••••••••••' : ''}">
      </div>
      <div class="btn-row">
        <button type="button" class="btn primary" data-act="save-key">Kaydet</button>
        ${apiKey ? '<button type="button" class="btn" data-act="del-key">Kaldır</button>' : ''}
      </div>
      <div class="kv" style="margin-top:12px"><span class="k">Bu ayki harcama (tahmini)</span><span class="v">$${usage.cost.toFixed(2)}</span></div>
      <div class="kv"><span class="k">Bu ay mesaj</span><span class="v">${fmt(usage.calls)}</span></div>
      <p class="small muted" style="margin:6px 0 0;line-height:18px">Console'da aylık harcama limiti koymanı öneririm; limit aşılırsa Danışman durur, uygulamanın geri kalanı çalışmaya devam eder.</p>
    </section>

    <div class="sec"><h2>Ayarlar</h2></div>
    <section class="card">
      <div class="field"><span class="lbl">Ana renk</span>
        <div class="swatches">
          ${ACCENTS.map((a) => `<button type="button" class="swatch" style="background:${a.value}" aria-label="${a.label}" aria-pressed="${accent === a.value}" data-accent="${a.value}"></button>`).join('')}
        </div>
      </div>
      <div class="field"><label for="rest-sec">Dinlenme süresi (setler arası)</label>
        <select id="rest-sec" class="input">
          ${[45, 60, 75, 90, 120, 150, 180, 240].map((s) => `<option value="${s}" ${Number(restSec) === s ? 'selected' : ''}>${Math.floor(s / 60) ? Math.floor(s / 60) + ' dk ' : ''}${s % 60 ? (s % 60) + ' sn' : ''}</option>`).join('')}
        </select></div>
      <div style="display:flex;flex-direction:column">
        ${
          pin
            ? `<button type="button" class="list-btn" data-act="pin-change"><span class="k">PIN'i değiştir</span>${icon.chev}</button>
               <button type="button" class="list-btn" data-act="pin-off"><span class="k">PIN kilidini kapat</span>${icon.chev}</button>`
            : `<button type="button" class="list-btn" data-act="pin-set"><span class="k">PIN kilidi belirle</span>${icon.chev}</button>`
        }
      </div>
      <p class="small muted" style="margin:6px 0 0;line-height:18px">PIN bir ekran kilididir; telefonunun kendi şifresi asıl korumadır.</p>
    </section>

    <div class="sec"><h2>Yedekleme</h2></div>
    <section class="card">
      <p class="small muted" style="margin:0 0 6px;line-height:18px">Veriler yalnızca bu telefonda durur. Uygulamayı silersen ya da telefon değiştirirsen kaybolmaması için ara ara yedek al ve Dosyalar'a kaydet.</p>
      <button type="button" class="list-btn" data-act="export"><span class="k">Yedek al</span>${icon.chev}</button>
      <label class="list-btn" style="cursor:pointer"><span class="k">Yedekten geri yükle</span>${icon.chev}<input type="file" accept="application/json,.json" data-act="import" class="sr-only"></label>
      <button type="button" class="list-btn" data-act="clear-chat"><span class="k">Sohbet geçmişini temizle</span>${icon.chev}</button>
      <button type="button" class="list-btn danger" data-act="wipe"><span class="k">Tüm verileri sil</span></button>
    </section>
    <p class="note" style="text-align:center;margin-bottom:12px">SporCoach ${APP_VERSION}</p>
  `;

  // ---- Profil alanları: değişince kaydet ----
  root.querySelectorAll('[data-p]').forEach((inp) => {
    inp.addEventListener('change', async () => {
      const cur = await db.getProfile();
      const key = inp.dataset.p;
      let val = inp.value.trim();
      if (['height_cm', 'weight_kg', 'birth_year', 'target_kcal', 'target_protein_g', 'target_carb_g', 'target_fat_g'].includes(key)) {
        const n = parseNum(val);
        val = isNaN(n) ? null : n;
      }
      cur[key] = val;
      await db.saveProfile(cur);
      if (key === 'weight_kg' && val) await logWeight(val);
      toast('Kaydedildi');
      if (['height_cm', 'weight_kg', 'birth_year', 'sex', 'activity'].includes(key)) refresh();
    });
  });

  root.onclick = async (e) => {
    const t = e.target.closest('[data-act],[data-phase],[data-accent]');
    if (!t) return;
    if (t.dataset.phase) {
      const cur = await db.getProfile();
      cur.phase = t.dataset.phase;
      await db.saveProfile(cur);
      toast('Dönem: ' + t.textContent);
      return refresh();
    }
    if (t.dataset.accent) {
      await db.setSetting('accent', t.dataset.accent);
      applyAccent(t.dataset.accent);
      return refresh();
    }
    const act = t.dataset.act;
    if (act === 'apply-sug' && sug) {
      const cur = await db.getProfile();
      Object.assign(cur, { target_kcal: sug.kcal, target_protein_g: sug.protein, target_carb_g: sug.carb, target_fat_g: sug.fat });
      await db.saveProfile(cur);
      toast('Hedefler güncellendi');
      refresh();
    } else if (act === 'add-weight') {
      const v = parseNum(root.querySelector('#w-today').value);
      if (!v || v < 30 || v > 300) return toast('Geçerli bir kilo gir');
      await logWeight(v);
      const cur = await db.getProfile();
      cur.weight_kg = v;
      await db.saveProfile(cur);
      toast('Kilo kaydedildi');
      refresh();
    } else if (act === 'done-first') {
      go('danisman');
    } else if (act === 'save-key') {
      const v = root.querySelector('#api-key').value.trim();
      if (!v || v.startsWith('•')) return toast('Anahtarı yapıştır');
      if (!v.startsWith('sk-ant-')) return toast('Anahtar "sk-ant-" ile başlamalı');
      await db.setSetting('api_key', v);
      toast('API anahtarı kaydedildi');
      refresh();
    } else if (act === 'del-key') {
      await db.remove('settings', 'api_key');
      toast('Anahtar kaldırıldı');
      refresh();
    } else if (act === 'pin-set' || act === 'pin-change') {
      if (act === 'pin-change') await showLock({});
      const ok = await setupPinFlow({ title: act === 'pin-set' ? 'PIN belirle' : 'Yeni PIN' });
      if (ok) toast('PIN kaydedildi');
      refresh();
    } else if (act === 'pin-off') {
      await showLock({});
      await clearPin();
      toast('PIN kilidi kapatıldı');
      refresh();
    } else if (act === 'export') {
      const data = await db.exportAll();
      await downloadOrShare(`sporcoach-yedek-${today()}.json`, JSON.stringify(data), 'application/json');
      await db.setSetting('last_backup', today());
    } else if (act === 'clear-chat') {
      if (await confirmSheet({ title: 'Sohbeti temizle', text: 'Danışmanla tüm konuşma geçmişi silinir. Kayıtlı verilerin (beslenme, antrenman, kür, tahliller) etkilenmez.', okLabel: 'Temizle', danger: true })) {
        await db.clearStore('chat_messages');
        toast('Sohbet temizlendi');
      }
    } else if (act === 'wipe') {
      if (await confirmSheet({ title: 'Tüm verileri sil', text: 'Bu telefondaki bütün kayıtlar silinir ve geri alınamaz. Önce yedek almanı öneririm.', okLabel: 'Her şeyi sil', danger: true })) {
        await db.wipeAll();
        location.hash = '';
        location.reload();
      }
    }
  };

  root.querySelector('#rest-sec').addEventListener('change', async (e) => {
    await db.setSetting('rest_seconds', Number(e.target.value));
    toast('Kaydedildi');
  });

  root.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const ok = await confirmSheet({
        title: 'Yedeği geri yükle',
        text: `${obj.exported_at ? trDate(obj.exported_at.slice(0, 10)) + ' tarihli yedek. ' : ''}Mevcut verilerin bu yedekle değiştirilecek.`,
        okLabel: 'Geri yükle',
      });
      if (!ok) return;
      await db.importAll(obj);
      toast('Yedek yüklendi');
      applyAccent(await db.getSetting('accent'));
      refresh();
    } catch (err) {
      toast(err.message || 'Dosya okunamadı');
    } finally {
      e.target.value = '';
    }
  });
}

async function logWeight(v) {
  const d = today();
  const existing = (await db.list('body_logs', (r) => r.date === d))[0];
  await db.put('body_logs', { ...(existing || {}), date: d, weight_kg: v });
}
