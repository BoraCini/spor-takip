import { describe, it, expect } from 'vitest';

// Anthropic API'yi taklit eder: her isteğin gövdesini kaydeder, sıradaki cevabı döndürür
function mockClaude(replies) {
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('anthropic.com')) throw new Error('beklenmeyen istek ' + url);
    bodies.push(JSON.parse(init.body));
    const r = replies.shift() || { content: [{ type: 'text', text: 'tamam' }], stop_reason: 'end_turn' };
    return new Response(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 }, ...r }), { headers: { 'content-type': 'application/json' } });
  };
  return bodies;
}
const toolUse = (name) => ({ content: [{ type: 'tool_use', id: 'tu_' + name, name, input: {} }], stop_reason: 'tool_use' });

async function seeded({ existing = false } = {}) {
  const db = await import('../../public/js/db.js');
  await db.init();
  await db.setSetting('onboarded', true);
  await db.saveProfile({ name: 'Test', sex: 'erkek', birth_year: 1995, height_cm: 180, weight_kg: 85, goal: 'kas' });
  const { today } = await import('../../public/js/util.js');
  await db.put('food_logs', { date: today(), meal: 'ogle', name: 'TAVUKPILAV', grams: 300, kcal: 500, protein_g: 40, carb_g: 50, fat_g: 12 });
  const t = await db.put('lab_tests', { date: '2026-10-01', lab_name: 'Lab' });
  await db.put('lab_values', { test_id: t.id, marker_key: 'hct', name: 'HEMATOKRITDEGERI', value: 52.3, unit: '%', ref_low: 40, ref_high: 50 });
  await db.put('compounds', { name: 'GIZLIMADDE', kind: 'hap', category: 'kur', active: true, days: [0, 1, 2, 3, 4, 5, 6], times: ['sabah'] });
  await db.put('vitals', { date: '2026-10-02', time: '08:00', sys: 137, dia: 88, hr: 71 });
  await db.put('body_logs', { date: '2026-10-01', weight_kg: 85.4 });
  if (existing) await db.setSetting('api_key', 'sk-ant-test');
  else await db.setSetting('api_key', null);
  return db;
}
const send = (body) => JSON.stringify(body);

describe('Coach gizlilik ayarları', () => {
  it('yeni kurulumda tahlil, tansiyon ve ilaç kapalı', async () => {
    await seeded();
    const { aiShare } = await import('../../public/js/context.js');
    expect(await aiShare()).toMatchObject({ profil: true, beslenme: true, antrenman: true, vucut: true, tahlil: false, tansiyon: false, ilac: false });
  });

  it('önceden Coach kullanan kurulumda hepsi açık kalır ve bir kerelik bilgi gösterilir', async () => {
    const db = await seeded({ existing: true });
    const { aiShare } = await import('../../public/js/context.js');
    expect(Object.values(await aiShare()).every(Boolean)).toBe(true);
    expect(await db.getSetting('ai_share_notice')).toBe(true);
  });

  it('kapalı kategoriler bağlamın hiçbir yerine girmez', async () => {
    await seeded();
    const { buildContext, splitContext, aiShare } = await import('../../public/js/context.js');
    const full = await buildContext();
    expect(send(full)).toContain('HEMATOKRITDEGERI'); // tam bağlam telefonda hesaplanır
    const { summary, details } = splitContext(full, await aiShare());
    const out = send(summary) + send(details);
    expect(out).toContain('TAVUKPILAV');
    for (const secret of ['HEMATOKRITDEGERI', 'GIZLIMADDE', '137/88']) expect(out).not.toContain(secret);
    expect(details.get_lab_results).toBeUndefined();
    expect(details.get_medications).toBeUndefined();
    expect(summary.bu_hafta_ozet.doses).toBeUndefined();
    expect(summary.aylik_ozet.bu_ay.doz_uyumu).toBeUndefined();
    expect(summary.aylik_ozet.bu_ay.tansiyon_ort).toBeUndefined();
  });

  it('kapalı kategorinin araçları tanımlanmaz (doz işaretleme dahil)', async () => {
    const { toolsFor } = await import('../../public/js/ai.js');
    const names = toolsFor({ profil: true, beslenme: true, antrenman: true, vucut: true, tahlil: false, tansiyon: false, ilac: false }).map((t) => t.name);
    expect(names).toContain('log_food');
    expect(names).toContain('get_workout_history');
    expect(names).not.toContain('get_lab_results');
    expect(names).not.toContain('get_medications');
    expect(names).not.toContain('mark_doses');
  });
});

describe('Coach isteği — yalnızca gereken veri', () => {
  it('kalori sorusunda tahlil, tansiyon ve kür ayrıntısı gönderilmez (hepsi açık olsa bile)', async () => {
    await seeded({ existing: true });
    const bodies = mockClaude([{ content: [{ type: 'text', text: 'Bugün 500 kcal yedin.' }], stop_reason: 'end_turn' }]);
    const { runTurn } = await import('../../public/js/ai.js');
    const r = await runTurn({ text: 'Bugün kaç kalori yedim?' });
    expect(r.looked).toEqual([]);
    const req = send(bodies[0]);
    expect(req).toContain('TAVUKPILAV');
    for (const s of ['HEMATOKRITDEGERI', '52.3', '137/88']) expect(req).not.toContain(s);
    expect(bodies[0].tools.map((t) => t.name)).toContain('get_lab_results');
  });

  it('tahlil yorumunda izinli tahlil verisi araçla gönderilir ve "baktı" olarak işaretlenir', async () => {
    await seeded({ existing: true });
    const bodies = mockClaude([toolUse('get_lab_results'), { content: [{ type: 'text', text: 'Hematokrit yüksek.' }], stop_reason: 'end_turn' }]);
    const { runTurn } = await import('../../public/js/ai.js');
    const r = await runTurn({ text: 'Tahlilimi yorumlar mısın?' });
    expect(r.looked).toEqual(['tahlil']);
    expect(send(bodies[1])).toContain('HEMATOKRITDEGERI');
    expect(send(bodies[1])).not.toContain('137/88'); // istenmeyen kategori yine gitmez
  });

  it('izin kapalıyken model aracı isterse veri verilmez', async () => {
    await seeded();
    await (await import('../../public/js/context.js')).aiShare(); // yeni kurulum varsayılanları
    const bodies = mockClaude([toolUse('get_lab_results'), { content: [{ type: 'text', text: 'Göremiyorum.' }], stop_reason: 'end_turn' }]);
    const { runTurn } = await import('../../public/js/ai.js');
    await (await import('../../public/js/db.js')).setSetting('api_key', 'sk-ant-test');
    const r = await runTurn({ text: 'Tahlilimi yorumla' });
    expect(r.looked).toEqual([]);
    const all = bodies.map(send).join('');
    expect(all).not.toContain('HEMATOKRITDEGERI');
    expect(all).toContain('paylaşmıyor');
  });

  it('istekte paylaşılan ve paylaşılmayan kategoriler modele bildirilir', async () => {
    await seeded();
    await (await import('../../public/js/context.js')).aiShare(); // yeni kurulum varsayılanları
    await (await import('../../public/js/db.js')).setSetting('api_key', 'sk-ant-test');
    const bodies = mockClaude([]);
    const { runTurn } = await import('../../public/js/ai.js');
    await runTurn({ text: 'merhaba' });
    const sys = bodies[0].system.map((b) => b.text).join('\n');
    expect(sys).toMatch(/Paylaşmadıkları: Kan tahlilleri, Tansiyon ve nabız, İlaç, kür ve takviyeler/);
  });

  it('API anahtarı yedeğe ve isteğin gövdesine girmez', async () => {
    const db = await seeded({ existing: true });
    const bodies = mockClaude([]);
    const { runTurn } = await import('../../public/js/ai.js');
    await runTurn({ text: 'merhaba' });
    expect(send(bodies[0])).not.toContain('sk-ant-test');
    expect(send(await db.exportAll())).not.toContain('sk-ant-test');
  });
});
