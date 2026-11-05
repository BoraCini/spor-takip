// Coach gizlilik merkezi: hangi veri kategorilerinin Coach'a (Anthropic API) gönderileceğini kullanıcı seçer.
import * as db from './db.js';
import { esc, openSheet, toast } from './util.js';
import { AI_CATEGORIES, aiShare } from './context.js';

export async function sharedLabels() {
  const s = await aiShare();
  return AI_CATEGORIES.filter(([k]) => s[k]).map(([, l]) => l);
}

const SHORT = { profil: 'Profil', beslenme: 'Beslenme', antrenman: 'Antrenman', vucut: 'Vücut', tahlil: 'Tahlil', tansiyon: 'Tansiyon', ilac: 'İlaç/protokol' };

// Mesaj kutusunun üstünde: bu mesajla neler paylaşılacak
export async function shareLineHTML(attachments = []) {
  const s = await aiShare();
  const on = AI_CATEGORIES.filter(([k]) => s[k]);
  const imgs = attachments.filter((a) => a.kind === 'image').length;
  const files = attachments.filter((a) => a.kind !== 'image').map((a) => a.name);
  const extra = [imgs ? `${imgs} fotoğraf` : '', ...files].filter(Boolean);
  return `<button type="button" class="share-line" data-share-open aria-label="Coach'un görebildiği verileri ayarla">
    <span class="sl-k">Paylaşılır:</span> ${on.length ? esc(on.map(([k]) => SHORT[k]).join(' · ')) : 'yalnızca mesajın'}${extra.length ? ` <span class="sl-att">+ ${esc(extra.join(', '))}</span>` : ''}</button>`;
}

export async function openAiShareSheet(onChange) {
  const s = await aiShare();
  const sheet = openSheet({
    title: 'Coach neleri görebilir',
    body: `
      <p style="font-size:15px;line-height:21px;margin:0 4px 12px">Coach'a yazdığında yalnızca açık olan kategoriler gönderilir. Kapalı kategorilerin hiçbir verisi gönderilmez; Coach onlar hakkında tahmin de yürütmez. Gönderilen veri, kendi API anahtarınla Anthropic'e gider.</p>
      <section class="card">
        ${AI_CATEGORIES.map(
          ([k, l, d]) => `<div class="kv" style="align-items:flex-start;padding:10px 0">
            <label class="k" for="ais-${k}" style="display:flex;flex-direction:column;gap:2px"><span>${esc(l)}</span><span class="small muted" style="line-height:17px">${esc(d)}</span></label>
            <span class="switch"><input id="ais-${k}" type="checkbox" data-cat="${k}" ${s[k] ? 'checked' : ''}><span></span></span></div>`
        ).join('')}
      </section>
      <p class="small muted" style="margin:10px 4px 0;line-height:18px">Coach her mesajda kısa bir özet görür; geçmiş antrenmanlar, tahlil değerleri, tansiyon ölçümleri ya da protokol ayrıntıları gibi verileri yalnızca sorunun cevabı için gerektiğinde ister ve sohbette "baktı" olarak gösterilir. Eklediğin fotoğraf ve dosyalar ise her zaman gönderilir.</p>`,
    onClose: () => onChange && onChange(),
  });
  sheet.el.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-cat]');
    if (!inp) return;
    const cur = await aiShare();
    cur[inp.dataset.cat] = inp.checked;
    await db.setSetting('ai_share', cur);
    await db.setSetting('ai_share_notice', false);
    toast(inp.checked ? 'Paylaşım açıldı' : 'Paylaşım kapatıldı', 1500);
  });
}
