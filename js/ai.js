// Danışman: Claude API bağlantısı, model seçimi, araçlar (onay kartları) ve harcama takibi
import * as db from './db.js';
import { today, round1 } from './util.js';
import { buildContext, findOrCreateExercise, dueOn, MEALS, slotLabel } from './context.js';
import { FOODS, findFood, bestMatch, nutrientsFor } from './data/foods.js';
import { matchLab, labByKey } from './data/labs.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODELS = {
  fast: { id: 'claude-haiku-5-5', label: 'Haiku', inPrice: 0.1, outPrice: 0.5, maxTokens: 1500 },
  smart: { id: 'claude-sonnet-5-5', label: 'Sonnet', inPrice: 2, outPrice: 10, maxTokens: 3000 },
};
const HISTORY_LIMIT = 16;

// ---------- Harcama ----------
const monthKey = () => today().slice(0, 7);
export async function monthUsage() {
  const r = await db.get('usage', monthKey());
  return { cost: r?.cost || 0, calls: r?.calls || 0 };
}
async function recordUsage(model, usage) {
  if (!usage) return;
  const id = monthKey();
  const r = (await db.get('usage', id)) || { id, calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const outTok = usage.output_tokens || 0;
  r.calls += 1;
  r.input_tokens += inTok;
  r.output_tokens += outTok;
  r.cost += (inTok * model.inPrice + outTok * model.outPrice) / 1e6;
  await db.put('usage', r);
}

// ---------- Model seçimi ----------
const LOG_RE = /(yedim|içtim|ictim|yaptım|yaptim|aldım|aldim|bastım|kaldırdım|tarttım|tartıldım|sabah\s+hap|akşam\s+hap|\bset\b|\btekrar\b|\d+\s*[x×]\s*\d+|\d+\s*(kg|gr|g|gram)\b)/i;
export function chooseModel(text, hasImage) {
  if (hasImage) return MODELS.smart;
  const t = (text || '').trim();
  if (LOG_RE.test(t) && !t.includes('?') && t.length < 400) return MODELS.fast;
  return MODELS.smart;
}

// ---------- Sistem talimatı ----------
function systemPrompt(ctx) {
  const foodList = FOODS.map((f) => `${f.id}: ${f.name}${f.portions?.length ? ' [' + f.portions.map((p) => `1 ${p[0]}=${p[1]}g`).join(', ') + ']' : ''}`).join('\n');
  return `Sen SporCoach uygulamasının içindeki kişisel spor koçu ve danışmanısın. Kullanıcıyla Türkçe, samimi ama net konuş. Cevapların kısa ve öz olsun; gereksiz uyarı, tekrar ve uzun girişlerden kaçın. Liste ve kalın yazıyı sadece gerçekten okumayı kolaylaştırdığında kullan.

GÖREVLERİN
- Kullanıcı yediklerini, yaptığı setleri, aldığı hap/enjeksiyonu, kilosunu ya da tahlil sonuçlarını yazdığında veya fotoğrafını gönderdiğinde uygun aracı çağırarak kaydı hazırla. Araç ekranda bir onay kartı gösterir; kullanıcı onaylayınca kaydedilir. Aracı çağırdıktan sonra 1–2 cümleyle kısa bir not yaz; karttaki değerleri tekrar listeleme. Bir mesajda birden fazla kayıt türü varsa her biri için ayrı araç çağır.
- Yemek kaydı: Besin listesinde karşılığı olan her şey için food_id ver ve miktarı grama çevir (örn. 3 yumurta → 150 g, 2 dilim tam buğday ekmeği → 56 g). Listede olmayanlar için food_id verme; est_per_100g ile 100 g başına gerçekçi tahmini değer ver. Öğün belirtilmemişse saate ve bağlama göre makul olanı seç.
- Antrenman, beslenme ve diyet konusunda kullanıcının hedefine, dönemine (bulk/cut/koruma), sakatlıklarına ve isteklerine göre somut öneriler ver. Güncel bilimsel yaklaşımları ve sahada uzun süredir denenmiş klasik yöntemleri birlikte değerlendir; çelişiyorlarsa bunu açıkça söyle. Kullanıcı bir öneriyi kendi tercihine göre değiştirmek isterse ona uyarla.
- Kan tahlillerini, kullanıcının kullandığı maddeleri, kür haftasını ve antrenmanını bilerek yorumla. Referans dışı her değeri kötü sayma: kürün ya da antrenmanın beklenen etkisi olanları (örn. dışarıdan hormon alımında baskılanmış LH/FSH, kas kütlesine bağlı hafif yüksek kreatinin, antrenman sonrası yüksek CK) ayrı belirt. Gerçekten takip veya müdahale gerektirenleri (örn. yükselen hematokrit, bozulan lipid profili, belirgin karaciğer enzimi yükselmesi, yüksek prolaktin veya estradiol, böbrek fonksiyonunda düşüş) açıkça söyle; neden önemli olduğunu ve önceki testlere göre gidişatı anlat.

SINIRLARIN (her zaman geçerli)
- İlaç, steroid, hormon, peptit ya da yardımcı ilaçlar (örn. kabergolin, aromataz inhibitörü, SERM, hCG) için doz, süre veya kullanım protokolü önermezsin; kullanıcının kürüne madde eklemez, çıkarmaz, dozunu değiştirmezsin. Bu istendiğinde nedenini bir cümleyle söyle; müdahale gereken durumda genelde hangi tür tedavinin değerlendirildiğini ve doktora neyi sorması gerektiğini anlat. Ders verir gibi değil, saygılı ve kısa ol.
- Acil durum belirtilerinde (göğüs ağrısı, nefes darlığı, tek bacakta şişlik ve ağrı, ani şiddetli baş ağrısı, bayılma, enjeksiyon bölgesinde yayılan kızarıklık/sıcaklık ile ateş) beklemeden 112'yi aramasını ya da acile gitmesini söyle.
- Enjeksiyon sonrası şişlik veya ağrı sorularında normal enjeksiyon ağrısını enfeksiyon ve apse belirtilerinden ayırt etmesine yardım et; enfeksiyon şüphesinde doktora yönlendir.
- Kesin teşhis koymazsın; gerektiğinde doktora yönlendirirsin.
- Aşağıdaki verilerde olmayan bir şeyi biliyormuş gibi yapma; bir bilgi eksikse kısa bir soruyla iste.

KULLANICININ GÜNCEL VERİLERİ (uygulamadan otomatik eklenir, kullanıcı her seferinde anlatmak zorunda kalmasın diye kullan):
${JSON.stringify(ctx)}

BESİN LİSTESİ (food_id: ad [porsiyonlar]):
${foodList}`;
}

// ---------- Araçlar ----------
const dateProp = { type: 'string', description: 'YYYY-MM-DD. Belirtilmezse bugün.' };
export const TOOLS = [
  {
    name: 'log_food',
    description: 'Kullanıcının yediği/içtiği besinler için Beslenme günlüğüne kayıt kartı hazırlar.',
    input_schema: {
      type: 'object',
      properties: {
        meal: { type: 'string', enum: MEALS.map((m) => m[0]), description: 'kahvalti, ogle, aksam veya ara' },
        date: dateProp,
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              food_id: { type: 'string', description: 'Besin listesindeki id; listede yoksa verme.' },
              name: { type: 'string', description: 'Kullanıcının söylediği besin adı (Türkçe)' },
              grams: { type: 'number', description: 'Toplam miktar, gram' },
              est_per_100g: {
                type: 'object',
                description: 'Sadece food_id yoksa: 100 g başına tahmini değerler',
                properties: { kcal: { type: 'number' }, protein_g: { type: 'number' }, carb_g: { type: 'number' }, fat_g: { type: 'number' } },
                required: ['kcal', 'protein_g', 'carb_g', 'fat_g'],
              },
            },
            required: ['name', 'grams'],
          },
        },
      },
      required: ['meal', 'items'],
    },
  },
  {
    name: 'log_workout_sets',
    description: 'Yapılan antrenman setleri için Antrenman kaydı kartı hazırlar. Her egzersiz için ayrı çağır.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateProp,
        exercise: { type: 'string', description: 'Egzersiz adı; kullanıcının programındaki adla eşleşiyorsa o adı kullan.' },
        sets: {
          type: 'array',
          items: { type: 'object', properties: { weight_kg: { type: 'number' }, reps: { type: 'number' } }, required: ['weight_kg', 'reps'] },
        },
      },
      required: ['exercise', 'sets'],
    },
  },
  {
    name: 'mark_doses',
    description: 'Kullanıcının kürdeki hap/enjeksiyonlarını aldığını işaretlemek için kart hazırlar. Sadece kullanıcının kür listesinde olan maddeler için.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateProp,
        slot: { type: 'string', enum: ['sabah', 'ogle', 'aksam', 'enjeksiyon', 'hepsi'], description: 'Hangi zaman dilimi' },
        compound_names: { type: 'array', items: { type: 'string' }, description: 'Belirli maddeler söylendiyse adları' },
      },
    },
  },
  {
    name: 'add_lab_results',
    description: 'Kan tahlili sonuçlarını (metinden veya fotoğraftan okunan) Kan testleri sayfasına kaydetmek için kart hazırlar.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateProp,
        lab_name: { type: 'string' },
        values: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Test adı, rapordaki gibi' },
              value: { type: 'number' },
              unit: { type: 'string' },
              ref_low: { type: 'number', description: 'Rapordaki referans alt sınır' },
              ref_high: { type: 'number', description: 'Rapordaki referans üst sınır' },
            },
            required: ['name', 'value'],
          },
        },
      },
      required: ['values'],
    },
  },
  {
    name: 'log_body_weight',
    description: 'Vücut ağırlığını kaydetmek için kart hazırlar.',
    input_schema: { type: 'object', properties: { date: dateProp, weight_kg: { type: 'number' } }, required: ['weight_kg'] },
  },
  {
    name: 'update_profile',
    description: 'Kullanıcı dönemini, hedefini, sakatlığını veya kalıcı bir bilgisini değiştirdiğini söylediğinde profili güncellemek için kart hazırlar.',
    input_schema: {
      type: 'object',
      properties: {
        phase: { type: 'string', enum: ['bulk', 'cut', 'koruma'] },
        goal: { type: 'string', description: 'Hedefin yeni tam metni' },
        injuries: { type: 'string', description: 'Sakatlıklar alanının yeni tam metni' },
        notes: { type: 'string', description: 'Notlar alanının yeni tam metni' },
      },
    },
  },
];

// Araç girdisini onay kartına çevirir (henüz kaydetmez)
async function buildCard(name, input) {
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today();
  if (name === 'log_food') {
    const custom = await db.list('custom_foods');
    const items = (input.items || []).map((it) => {
      let food = it.food_id ? findFood(it.food_id, custom) : null;
      if (!food && !it.est_per_100g) food = bestMatch(it.name, custom);
      const grams = Math.max(1, Math.round(Number(it.grams) || 100));
      if (food) {
        return { food_id: food.id, name: food.name, grams, per100: { k: food.k, p: food.p, c: food.c, f: food.f, fb: food.fb, na: food.na, ka: food.ka }, estimated: false };
      }
      const e = it.est_per_100g || {};
      return { food_id: null, name: it.name, grams, per100: { k: e.kcal || 0, p: e.protein_g || 0, c: e.carb_g || 0, f: e.fat_g || 0, fb: 0, na: 0, ka: 0 }, estimated: true };
    });
    return { type: 'food', date, meal: input.meal || 'ara', items };
  }
  if (name === 'log_workout_sets') {
    return { type: 'sets', date, exercise: String(input.exercise || '').trim(), sets: (input.sets || []).map((s) => ({ weight_kg: Number(s.weight_kg) || 0, reps: Math.round(Number(s.reps) || 0) })) };
  }
  if (name === 'mark_doses') {
    const due = await dueOn(date);
    const names = (input.compound_names || []).map((n) => n.toLocaleLowerCase('tr-TR'));
    const nameOk = (c) => !names.length || names.some((n) => c.name.toLocaleLowerCase('tr-TR').includes(n) || n.includes(c.name.toLocaleLowerCase('tr-TR')));
    const slot = input.slot || 'hepsi';
    const items = [];
    for (const p of due.pills) {
      if (p.done || !nameOk(p.compound)) continue;
      if (slot === 'hepsi' || slot === p.slot) items.push({ kind: 'pill', compound_id: p.compound.id, name: p.compound.name, slot: p.slot });
    }
    for (const i of due.injections) {
      if (i.done || !nameOk(i.compound)) continue;
      if (slot === 'hepsi' || slot === 'enjeksiyon' || names.length) items.push({ kind: 'inj', compound_id: i.compound.id, name: i.compound.name, slot: 'enjeksiyon' });
    }
    return { type: 'doses', date, items };
  }
  if (name === 'add_lab_results') {
    const values = (input.values || []).map((v) => {
      const m = matchLab(v.name);
      return {
        marker_key: m ? m.key : null,
        name: m ? m.name : v.name,
        value: Number(v.value),
        unit: v.unit || (m ? m.unit : ''),
        ref_low: v.ref_low ?? (m ? m.lo : null),
        ref_high: v.ref_high ?? (m ? m.hi : null),
      };
    });
    return { type: 'labs', date, lab_name: input.lab_name || '', values };
  }
  if (name === 'log_body_weight') return { type: 'weight', date, weight_kg: Number(input.weight_kg) };
  if (name === 'update_profile') {
    const changes = {};
    for (const k of ['phase', 'goal', 'injuries', 'notes']) if (input[k] != null && input[k] !== '') changes[k] = input[k];
    return { type: 'profile', changes };
  }
  return null;
}

function cardSummary(card) {
  if (!card) return 'Bilinmeyen araç.';
  if (card.type === 'food')
    return `Onay kartı gösterildi (${card.meal}, ${card.date}): ` + card.items.map((i) => `${i.name} ${i.grams} g${i.estimated ? ' (tahmini değer)' : ''}`).join(', ');
  if (card.type === 'sets') return `Onay kartı gösterildi: ${card.exercise} — ${card.sets.map((s) => `${s.weight_kg}×${s.reps}`).join(', ')}`;
  if (card.type === 'doses')
    return card.items.length ? `Onay kartı gösterildi: ${card.items.map((i) => `${i.name} (${i.slot})`).join(', ')}` : 'Bu tarih için işaretlenecek, henüz alınmamış bir doz bulunamadı (kür listesi boş olabilir ya da hepsi zaten işaretli).';
  if (card.type === 'labs') return `Onay kartı gösterildi: ${card.values.length} değer (${card.date})`;
  if (card.type === 'weight') return `Onay kartı gösterildi: ${card.weight_kg} kg`;
  if (card.type === 'profile') return `Onay kartı gösterildi: ${Object.keys(card.changes).join(', ')}`;
  return 'Kart gösterildi.';
}

export function cardNutrition(item) {
  const f = { k: item.per100.k, p: item.per100.p, c: item.per100.c, f: item.per100.f, fb: item.per100.fb, na: item.per100.na, ka: item.per100.ka };
  return nutrientsFor(f, item.grams);
}

// Kartı onaylayınca kaydet
export async function commitCard(card) {
  if (card.type === 'food') {
    for (const it of card.items) {
      const n = cardNutrition(it);
      await db.put('food_logs', { date: card.date, meal: card.meal, food_id: it.food_id, name: it.name, grams: it.grams, estimated: !!it.estimated, source: 'danisman', ...n });
    }
    return `${card.items.length} besin ${card.meal === 'ara' ? 'ara öğüne' : 'öğüne'} eklendi`;
  }
  if (card.type === 'sets') {
    const ex = await findOrCreateExercise(card.exercise);
    const existing = await db.list('workout_sets', (s) => s.exercise_id === ex.id && s.date === card.date);
    let n = existing.reduce((m, s) => Math.max(m, s.set_no || 0), 0);
    for (const s of card.sets) await db.put('workout_sets', { date: card.date, exercise_id: ex.id, set_no: ++n, weight_kg: s.weight_kg, reps: s.reps, done: true });
    return `${card.sets.length} set kaydedildi`;
  }
  if (card.type === 'doses') {
    const now = new Date().toISOString();
    for (const it of card.items) {
      if (it.kind === 'inj') await db.put('injection_logs', { date: card.date, compound_id: it.compound_id, site: it.site || null, done_at: now });
      else await db.put('dose_logs', { date: card.date, compound_id: it.compound_id, slot: it.slot, taken_at: now });
    }
    return 'İşaretlendi';
  }
  if (card.type === 'labs') {
    const test = await db.put('lab_tests', { date: card.date, lab_name: card.lab_name || '', source: 'danisman' });
    for (const v of card.values) {
      if (isNaN(v.value)) continue;
      await db.put('lab_values', { test_id: test.id, marker_key: v.marker_key, name: v.name, value: v.value, unit: v.unit, ref_low: v.ref_low, ref_high: v.ref_high });
    }
    return `${card.values.length} değer kaydedildi`;
  }
  if (card.type === 'weight') {
    const existing = (await db.list('body_logs', (r) => r.date === card.date))[0];
    await db.put('body_logs', { ...(existing || {}), date: card.date, weight_kg: card.weight_kg });
    if (card.date === today()) {
      const p = await db.getProfile();
      p.weight_kg = card.weight_kg;
      await db.saveProfile(p);
    }
    return 'Kilo kaydedildi';
  }
  if (card.type === 'profile') {
    const p = await db.getProfile();
    Object.assign(p, card.changes);
    await db.saveProfile(p);
    return 'Profil güncellendi';
  }
  return 'Kaydedildi';
}

// ---------- API çağrısı ----------
export class AIError extends Error {}

async function callAPI(apiKey, body) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AIError('Bağlantı kurulamadı. İnternet bağlantını kontrol et.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const msg = data?.error?.message || '';
    if (res.status === 401) throw new AIError('API anahtarı geçersiz. Profil ve ayarlar sayfasından kontrol et.');
    if (res.status === 403) throw new AIError('Bu API anahtarının bu işleme izni yok.');
    if (res.status === 429) throw new AIError('Çok sık istek gönderildi ya da harcama limitine ulaşıldı. Biraz bekleyip yeniden dene.');
    if (res.status === 529 || res.status >= 500) throw new AIError('Claude şu anda yoğun. Biraz sonra yeniden dene.');
    if (/credit|balance/i.test(msg)) throw new AIError('API hesabında kredi kalmamış. Claude Console\'dan kredi yükleyebilirsin.');
    throw new AIError('İstek başarısız oldu' + (msg ? `: ${msg}` : '.'));
  }
  return data;
}

// Konuşma geçmişini API formatına çevir
async function historyMessages() {
  const msgs = (await db.list('chat_messages')).filter((m) => m.role === 'user' || m.role === 'assistant');
  const recent = msgs.slice(-HISTORY_LIMIT);
  const out = [];
  for (const m of recent) {
    const text = (m.text || '').trim() || (m.role === 'user' && m.image ? '[fotoğraf gönderdi]' : '');
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + text;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// Bir kullanıcı mesajını işle. image: { media_type, data(base64) }
// onStatus(model) — UI'da hangi modelin çalıştığını göstermek için
export async function runTurn({ text, image, onModel }) {
  const apiKey = await db.getSetting('api_key');
  if (!apiKey) throw new AIError('Danışmanı kullanmak için önce Profil ve ayarlar sayfasından API anahtarını ekle.');
  const model = chooseModel(text, !!image);
  onModel && onModel(model);
  const ctx = await buildContext();
  const system = systemPrompt(ctx);
  const history = await historyMessages(); // son kullanıcı mesajı zaten kaydedildiği için geçmişte var
  // son kullanıcı mesajını fotoğrafla birlikte yeniden kur
  if (history.length && history[history.length - 1].role === 'user') history.pop();
  const userContent = [];
  if (image) userContent.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  userContent.push({ type: 'text', text: text || 'Bu fotoğrafı incele ve gerekiyorsa kaydet.' });
  const messages = [...history, { role: 'user', content: userContent }];
  if (messages[0].role !== 'user') messages.shift();

  const cards = [];
  let finalText = '';
  for (let i = 0; i < 4; i++) {
    const data = await callAPI(apiKey, { model: model.id, max_tokens: model.maxTokens, system, messages, tools: TOOLS });
    await recordUsage(model, data.usage);
    const blocks = data.content || [];
    const texts = blocks.filter((b) => b.type === 'text').map((b) => b.text);
    if (texts.length) finalText = (finalText ? finalText + '\n\n' : '') + texts.join('\n\n');
    const uses = blocks.filter((b) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !uses.length) break;
    messages.push({ role: 'assistant', content: blocks });
    const results = [];
    for (const u of uses) {
      let card = null;
      try {
        card = await buildCard(u.name, u.input || {});
      } catch (e) {
        console.error(e);
      }
      if (card && !(card.type === 'doses' && !card.items.length) && !(card.type === 'profile' && !Object.keys(card.changes).length)) cards.push(card);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: cardSummary(card) });
    }
    messages.push({ role: 'user', content: results });
    finalText = ''; // aracı çağırdıktan sonraki son metni gösterelim
  }
  return { text: finalText.trim(), cards, model };
}

export { slotLabel, round1, labByKey };
