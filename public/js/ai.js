// Coach: Claude API bağlantısı (canlı akış + önbellek), model seçimi, araçlar (onay kartları) ve harcama takibi
import * as db from './db.js';
import { today, round1 } from './util.js';
import { buildContext, findOrCreateExercise, dueOn, MEALS, slotLabel, MEASURES } from './context.js';
import { FOODS, findFood, bestMatch, nutrientsFor } from './data/foods.js';
import { matchLab, labByKey } from './data/labs.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
export const MODELS = {
  fast: { id: 'claude-haiku-5-5', label: 'Haiku', inPrice: 0.1, outPrice: 0.5, maxTokens: 1500 },
  smart: { id: 'claude-sonnet-5-5', label: 'Sonnet', inPrice: 2, outPrice: 10, maxTokens: 3000 },
};
const HISTORY_LIMIT = 16;
const CACHE_WRITE = 1.25; // önbelleğe yazma, normal girişin 1,25 katı
const CACHE_READ = 0.1; // önbellekten okuma, normal girişin 0,1 katı

// ---------- Harcama ----------
const monthKey = () => today().slice(0, 7);
export async function monthUsage() {
  const r = await db.get('usage', monthKey());
  return { cost: r?.cost || 0, calls: r?.calls || 0, saved: r?.saved || 0 };
}
async function recordUsage(model, usage) {
  if (!usage) return;
  const id = monthKey();
  const r = (await db.get('usage', id)) || { id, calls: 0, input_tokens: 0, output_tokens: 0, cost: 0, saved: 0 };
  const inTok = usage.input_tokens || 0;
  const wTok = usage.cache_creation_input_tokens || 0;
  const rTok = usage.cache_read_input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  r.calls += 1;
  r.input_tokens += inTok + wTok + rTok;
  r.output_tokens += outTok;
  r.cost += ((inTok + wTok * CACHE_WRITE + rTok * CACHE_READ) * model.inPrice + outTok * model.outPrice) / 1e6;
  r.saved = (r.saved || 0) + (rTok * (1 - CACHE_READ) * model.inPrice) / 1e6;
  await db.put('usage', r);
}

// ---------- Model seçimi ----------
const LOG_RE = /(yedim|içtim|ictim|yaptım|yaptim|aldım|aldim|bastım|kaldırdım|tarttım|tartıldım|koştum|yürüdüm|sabah\s+hap|akşam\s+hap|\bset\b|\btekrar\b|\d+\s*[x×]\s*\d+|\d+\s*(kg|gr|g|gram|ml|lt|litre|dk|dakika|km)\b)/i;
export function chooseModel(text, hasImage) {
  if (hasImage) return MODELS.smart;
  const t = (text || '').trim();
  if (LOG_RE.test(t) && !t.includes('?') && t.length < 400) return MODELS.fast;
  return MODELS.smart;
}

// ---------- Sistem talimatı ----------
// Sabit kısım (önbelleğe alınır): talimatlar + besin listesi. Her istekte birebir aynı olmalı.
let STATIC_PROMPT = null;
function staticPrompt() {
  if (STATIC_PROMPT) return STATIC_PROMPT;
  const foodList = FOODS.map((f) => `${f.id}: ${f.name}${f.portions?.length ? ' [' + f.portions.map((p) => `1 ${p[0]}=${p[1]}g`).join(', ') + ']' : ''}`).join('\n');
  STATIC_PROMPT = `Sen Pro Coach uygulamasının içindeki kişisel spor koçusun; uygulamada adın "Coach". Kullanıcıyla Türkçe, samimi ama net konuş. Cevapların kısa ve öz olsun; gereksiz uyarı, tekrar ve uzun girişlerden kaçın. Liste ve kalın yazıyı sadece gerçekten okumayı kolaylaştırdığında kullan. Cevapların bazen sesli okunur; bu yüzden tablo ve emoji kullanma.

GÖREVLERİN
- Kullanıcı yediklerini, içtiği suyu, yaptığı setleri veya kardiyoyu, aldığı hap/enjeksiyonu, kilosunu, vücut ölçülerini ya da tahlil sonuçlarını yazdığında veya fotoğrafını gönderdiğinde uygun aracı çağırarak kaydı hazırla. Araç ekranda bir onay kartı gösterir; kullanıcı onaylayınca kaydedilir. Aracı çağırdıktan sonra 1–2 cümleyle kısa bir not yaz; karttaki değerleri tekrar listeleme. Bir mesajda birden fazla kayıt türü varsa her biri için ayrı araç çağır.
- Yemek kaydı: Besin listesinde veya kullanıcının kendi besinlerinde karşılığı olan her şey için food_id ver ve miktarı grama çevir (örn. 3 yumurta → 150 g, 2 dilim tam buğday ekmeği → 56 g). Listede olmayanlar için food_id verme; est_per_100g ile 100 g başına gerçekçi tahmini değer ver. Öğün belirtilmemişse saate ve bağlama göre makul olanı seç.
- Kardiyo (koşu, yürüyüş, bisiklet vb.) için log_workout_sets aracında sets yerine cardio alanını kullan.
- Drop set: Kullanıcı bir seti dinlenmeden daha düşük ağırlıkla devam ettirdiyse (örn. "30 kg 20 tekrar, hemen 20 kg 15") bunu ayrı set yapma; ilk ağırlığı set, devamlarını o setin drops alanına yaz. Antrenman geçmişinde "→ ... (drop set)" olarak görünür.
- Kalıcı notlar: Kullanıcı kalıcı bir tercih ya da bilgi paylaştığında (örn. sevmediği/yemediği yiyecekler, antrenman saati, salondaki ekipman kısıtı, uzun vadeli hedefi) remember_note ile kısa bir not olarak kaydet. Geçici şeyleri (bugün yorgunum gibi) not etme. Kullanıcı bir notun yanlış olduğunu ya da artık geçerli olmadığını söylerse forget_note ile sil. Notlar "danisman_notlari" alanında görünür; cevaplarında bunlara uy.
- Haftalık rapor istendiğinde "bu_hafta_ozet" ve "gecen_hafta_ozet" verilerini kullan: beslenme (kayıtlı gün, ortalama kalori ve protein, hedefe uyum), antrenman (seans, set, hacim, kas grubu başına set; 10–20 set aralığı çoğu kişi için etkilidir), kilo değişimi ve dönem hedefiyle uyumu, kür takibine uyum, su. Önce iyi gidenleri, sonra en fazla üç somut iyileştirme önerisini yaz. Kısa tut.
- Antrenman, beslenme ve diyet konusunda kullanıcının hedefine, dönemine (bulk/cut/koruma), sakatlıklarına, notlarına ve isteklerine göre somut öneriler ver. Güncel bilimsel yaklaşımları ve sahada uzun süredir denenmiş klasik yöntemleri birlikte değerlendir; çelişiyorlarsa bunu açıkça söyle. Kullanıcı bir öneriyi kendi tercihine göre değiştirmek isterse ona uyarla.
- Kan tahlillerini, kullanıcının kullandığı maddeleri, kür haftasını ve antrenmanını bilerek yorumla. Referans dışı her değeri kötü sayma: kürün ya da antrenmanın beklenen etkisi olanları (örn. dışarıdan hormon alımında baskılanmış LH/FSH, kas kütlesine bağlı hafif yüksek kreatinin, antrenman sonrası yüksek CK) ayrı belirt. Gerçekten takip veya müdahale gerektirenleri (örn. yükselen hematokrit, bozulan lipid profili, belirgin karaciğer enzimi yükselmesi, yüksek prolaktin veya estradiol, böbrek fonksiyonunda düşüş) açıkça söyle; neden önemli olduğunu ve önceki testlere göre gidişatı anlat.
- Kullanıcının kullandığı koruyucu ilaç, vitamin ve takviyeler (marka, içerik/miktar ve kullanım sıklığıyla) "koruyucu_ilac_ve_vitaminler" alanındadır. Tahlil yorumlarında ve önerilerinde bunları hesaba kat (örn. D vitamini takviyesi alırken düşük D, B12 takviyesiyle yüksek B12, biotinin bazı hormon testlerini etkileyebilmesi, kreatin takviyesinin kreatinin değerini yükseltebilmesi). Takviye eklemeyi veya çıkarmayı önerebilirsin; reçeteli ilaçlar için doz söylemez, doktora yönlendirirsin.

SINIRLARIN (her zaman geçerli)
- İlaç, steroid, hormon, peptit ya da yardımcı ilaçlar (örn. kabergolin, aromataz inhibitörü, SERM, hCG) için doz, süre veya kullanım protokolü önermezsin; kullanıcının kürüne madde eklemez, çıkarmaz, dozunu değiştirmezsin. Bu istendiğinde nedenini bir cümleyle söyle; müdahale gereken durumda genelde hangi tür tedavinin değerlendirildiğini ve doktora neyi sorması gerektiğini anlat. Ders verir gibi değil, saygılı ve kısa ol.
- Acil durum belirtilerinde (göğüs ağrısı, nefes darlığı, tek bacakta şişlik ve ağrı, ani şiddetli baş ağrısı, bayılma, enjeksiyon bölgesinde yayılan kızarıklık/sıcaklık ile ateş) beklemeden 112'yi aramasını ya da acile gitmesini söyle.
- Enjeksiyon sonrası şişlik veya ağrı sorularında normal enjeksiyon ağrısını enfeksiyon ve apse belirtilerinden ayırt etmesine yardım et; enfeksiyon şüphesinde doktora yönlendir.
- Kesin teşhis koymazsın; gerektiğinde doktora yönlendirirsin.
- Kullanıcının verilerinde olmayan bir şeyi biliyormuş gibi yapma; bir bilgi eksikse kısa bir soruyla iste.

BESİN LİSTESİ (food_id: ad [porsiyonlar]):
${foodList}`;
  return STATIC_PROMPT;
}

function dynamicPrompt(ctx, custom) {
  const mine = custom.length ? `\n\nKULLANICININ KENDİ BESİNLERİ (food_id: ad — 100 g kcal):\n${custom.map((c) => `${c.id}: ${c.name} — ${c.k} kcal${c.overrides ? ` (kullanıcı ${c.overrides} değerlerini düzeltti; onun yerine bunu kullan)` : ''}`).join('\n')}` : '';
  return `KULLANICININ GÜNCEL VERİLERİ (uygulamadan otomatik eklenir, kullanıcı her seferinde anlatmak zorunda kalmasın diye kullan):\n${JSON.stringify(ctx)}${mine}`;
}

// ---------- Araçlar ----------
const dateProp = { type: 'string', description: 'YYYY-MM-DD. Belirtilmezse bugün.' };
export const TOOLS = [
  {
    name: 'log_food',
    description: 'Kullanıcının yediği/içtiği besinler için Beslenme günlüğüne kayıt kartı hazırlar. Sade su için log_water kullan.',
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
              food_id: { type: 'string', description: 'Besin listesindeki veya kullanıcının kendi besinlerindeki id; yoksa verme.' },
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
    name: 'log_water',
    description: 'İçilen su miktarı için kayıt kartı hazırlar.',
    input_schema: { type: 'object', properties: { date: dateProp, ml: { type: 'number', description: 'Mililitre (1 bardak ≈ 200 ml, 1 şişe ≈ 500 ml)' } }, required: ['ml'] },
  },
  {
    name: 'log_workout_sets',
    description: 'Yapılan antrenman için kayıt kartı hazırlar. Her egzersiz için ayrı çağır. Ağırlık egzersizlerinde sets, kardiyoda cardio kullan.',
    input_schema: {
      type: 'object',
      properties: {
        date: dateProp,
        exercise: { type: 'string', description: 'Egzersiz adı; kullanıcının programındaki adla eşleşiyorsa o adı kullan (örn. "Koşu bandı").' },
        sets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weight_kg: { type: 'number' },
              reps: { type: 'number' },
              rpe: { type: 'number', description: 'Kullanıcı söylediyse 6-10' },
              drops: {
                type: 'array',
                description: 'Drop set yaptıysa: ana setten hemen sonra dinlenmeden yapılan düşük ağırlıklı devamlar, sırasıyla. Örn. 30kg×20 sonra 20kg×15 → weight_kg 30, reps 20, drops [{weight_kg:20, reps:15}]',
                items: { type: 'object', properties: { weight_kg: { type: 'number' }, reps: { type: 'number' } }, required: ['weight_kg', 'reps'] },
              },
            },
            required: ['weight_kg', 'reps'],
          },
        },
        cardio: {
          type: 'object',
          description: 'Kardiyo için',
          properties: { duration_min: { type: 'number' }, distance_km: { type: 'number' } },
          required: ['duration_min'],
        },
      },
      required: ['exercise'],
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
    name: 'log_measurements',
    description: 'Vücut ölçülerini (cm) ve yağ oranını kaydetmek için kart hazırlar. Sadece söylenen alanları ver.',
    input_schema: {
      type: 'object',
      properties: Object.assign({ date: dateProp }, ...MEASURES.map(([k, l, u]) => ({ [k]: { type: 'number', description: `${l} (${u})` } }))),
    },
  },
  {
    name: 'update_profile',
    description: 'Kullanıcı dönemini, hedefini, sakatlığını değiştirdiğini söylediğinde profili güncellemek için kart hazırlar.',
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
  {
    name: 'remember_note',
    description: 'Kullanıcı hakkında kalıcı ve işe yarar bir bilgiyi kısa bir not olarak kaydeder (onay gerekmez, kullanıcı geri alabilir).',
    input_schema: { type: 'object', properties: { text: { type: 'string', description: 'Kısa, tek cümlelik not. Örn: "Balık sevmiyor."' } }, required: ['text'] },
  },
  {
    name: 'forget_note',
    description: 'Artık geçerli olmayan bir notu siler.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'danisman_notlari içindeki not id' } }, required: ['id'] },
  },
];

// Araç girdisini onay kartına çevirir (henüz kaydetmez). Notlar doğrudan kaydedilir.
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
  if (name === 'log_water') return { type: 'water', date, ml: Math.max(0, Math.round(Number(input.ml) || 0)) };
  if (name === 'log_workout_sets') {
    const exercise = String(input.exercise || '').trim();
    if (input.cardio && input.cardio.duration_min) {
      return { type: 'cardio', date, exercise, duration_min: round1(Number(input.cardio.duration_min)), distance_km: input.cardio.distance_km ? round1(Number(input.cardio.distance_km)) : null };
    }
    return { type: 'sets', date, exercise, sets: (input.sets || []).map((s) => ({ weight_kg: Number(s.weight_kg) || 0, reps: Math.round(Number(s.reps) || 0), rpe: s.rpe ? Math.round(Number(s.rpe)) : null, drops: Array.isArray(s.drops) && s.drops.length ? s.drops.map((d) => ({ weight_kg: Number(d.weight_kg) || 0, reps: Math.round(Number(d.reps) || 0) })) : null })) };
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
  if (name === 'log_measurements') {
    const values = {};
    for (const [k] of MEASURES) if (input[k] != null && !isNaN(Number(input[k]))) values[k] = round1(Number(input[k]));
    return { type: 'measures', date, values };
  }
  if (name === 'update_profile') {
    const changes = {};
    for (const k of ['phase', 'goal', 'injuries', 'notes']) if (input[k] != null && input[k] !== '') changes[k] = input[k];
    return { type: 'profile', changes };
  }
  if (name === 'remember_note') {
    const text = String(input.text || '').trim().slice(0, 300);
    if (!text) return null;
    const note = await db.put('coach_notes', { text });
    return { type: 'note', action: 'add', note_id: note.id, text, autoSaved: true };
  }
  if (name === 'forget_note') {
    const n = await db.get('coach_notes', input.id);
    if (!n) return null;
    await db.remove('coach_notes', n.id);
    return { type: 'note', action: 'remove', note_id: n.id, text: n.text, autoSaved: true };
  }
  return null;
}

function cardSummary(card) {
  if (!card) return 'Araç çalıştırılamadı ya da ilgili kayıt bulunamadı.';
  if (card.type === 'food')
    return `Onay kartı gösterildi (${card.meal}, ${card.date}): ` + card.items.map((i) => `${i.name} ${i.grams} g${i.estimated ? ' (tahmini değer)' : ''}`).join(', ');
  if (card.type === 'water') return `Onay kartı gösterildi: ${card.ml} ml su`;
  if (card.type === 'sets') return `Onay kartı gösterildi: ${card.exercise} — ${card.sets.map((s) => `${s.weight_kg}×${s.reps}${s.drops ? s.drops.map((d) => ` → ${d.weight_kg}×${d.reps}`).join('') + ' (drop)' : ''}`).join(', ')}`;
  if (card.type === 'cardio') return `Onay kartı gösterildi: ${card.exercise} — ${card.duration_min} dk${card.distance_km ? ', ' + card.distance_km + ' km' : ''}`;
  if (card.type === 'doses')
    return card.items.length ? `Onay kartı gösterildi: ${card.items.map((i) => `${i.name} (${i.slot})`).join(', ')}` : 'Bu tarih için işaretlenecek, henüz alınmamış bir doz bulunamadı (kür listesi boş olabilir ya da hepsi zaten işaretli).';
  if (card.type === 'labs') return `Onay kartı gösterildi: ${card.values.length} değer (${card.date})`;
  if (card.type === 'weight') return `Onay kartı gösterildi: ${card.weight_kg} kg`;
  if (card.type === 'measures') return Object.keys(card.values).length ? `Onay kartı gösterildi: ${Object.keys(card.values).join(', ')}` : 'Ölçü değeri yoktu.';
  if (card.type === 'profile') return `Onay kartı gösterildi: ${Object.keys(card.changes).join(', ')}`;
  if (card.type === 'note') return card.action === 'add' ? `Not kaydedildi (id ${card.note_id}).` : 'Not silindi.';
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
  if (card.type === 'water') {
    await db.put('water_logs', { date: card.date, ml: card.ml });
    return `${card.ml} ml su eklendi`;
  }
  if (card.type === 'sets' || card.type === 'cardio') {
    const ex = await findOrCreateExercise(card.exercise, { cardio: card.type === 'cardio' });
    const existing = await db.list('workout_sets', (s) => s.exercise_id === ex.id && s.date === card.date);
    let n = existing.reduce((m, s) => Math.max(m, s.set_no || 0), 0);
    if (card.type === 'cardio') {
      await db.put('workout_sets', { date: card.date, exercise_id: ex.id, set_no: ++n, duration_min: card.duration_min, distance_km: card.distance_km, weight_kg: 0, reps: 0, done: true });
      return 'Kardiyo kaydedildi';
    }
    for (const s of card.sets) await db.put('workout_sets', { date: card.date, exercise_id: ex.id, set_no: ++n, weight_kg: s.weight_kg, reps: s.reps, rpe: s.rpe || null, drops: s.drops || null, done: true });
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
  if (card.type === 'measures') {
    const existing = (await db.list('body_measurements', (m) => m.date === card.date))[0];
    await db.put('body_measurements', { ...(existing || {}), date: card.date, ...card.values });
    return 'Ölçüler kaydedildi';
  }
  if (card.type === 'profile') {
    const p = await db.getProfile();
    Object.assign(p, card.changes);
    await db.saveProfile(p);
    return 'Profil güncellendi';
  }
  return 'Kaydedildi';
}

// Not kartını geri al
export async function undoNote(card) {
  if (card.action === 'add') await db.remove('coach_notes', card.note_id);
  else await db.put('coach_notes', { id: card.note_id, text: card.text });
}

// ---------- API çağrısı (canlı akış) ----------
export class AIError extends Error {}

function httpError(status, msg) {
  if (status === 401) return new AIError('API anahtarı geçersiz. Ayarlar sayfasından kontrol et.');
  if (status === 403) return new AIError('Bu API anahtarının bu işleme izni yok.');
  if (status === 429) return new AIError('Çok sık istek gönderildi ya da harcama limitine ulaşıldı. Biraz bekleyip yeniden dene.');
  if (status === 529 || status >= 500) return new AIError('Claude şu anda yoğun. Biraz sonra yeniden dene.');
  if (/credit|balance/i.test(msg || '')) return new AIError("API hesabında kredi kalmamış. Claude Console'dan kredi yükleyebilirsin.");
  return new AIError('İstek başarısız oldu' + (msg ? `: ${msg}` : '.'));
}

// SSE akışını okuyup mesajı yeniden kurar. onText(delta) her metin parçasında çağrılır.
async function callAPIStream(apiKey, body, onText) {
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
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    throw new AIError('Bağlantı kurulamadı. İnternet bağlantını kontrol et.');
  }
  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message || '';
    } catch {}
    throw httpError(res.status, msg);
  }
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream') || !res.body) {
    // akış desteklenmiyorsa normal JSON
    const data = await res.json();
    for (const b of data.content || []) if (b.type === 'text' && onText) onText(b.text);
    return data;
  }
  const msg = { content: [], stop_reason: null, usage: {} };
  const partialJson = {};
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const handle = (ev) => {
    switch (ev.type) {
      case 'message_start':
        Object.assign(msg.usage, ev.message?.usage || {});
        break;
      case 'content_block_start':
        msg.content[ev.index] = { ...ev.content_block };
        if (ev.content_block.type === 'tool_use') partialJson[ev.index] = '';
        if (ev.content_block.type === 'text') msg.content[ev.index].text = ev.content_block.text || '';
        break;
      case 'content_block_delta': {
        const b = msg.content[ev.index];
        if (!b) break;
        if (ev.delta.type === 'text_delta') {
          b.text += ev.delta.text;
          if (onText) onText(ev.delta.text);
        } else if (ev.delta.type === 'input_json_delta') partialJson[ev.index] += ev.delta.partial_json;
        break;
      }
      case 'content_block_stop': {
        const b = msg.content[ev.index];
        if (b && b.type === 'tool_use') {
          try {
            b.input = partialJson[ev.index] ? JSON.parse(partialJson[ev.index]) : {};
          } catch {
            b.input = {};
          }
        }
        break;
      }
      case 'message_delta':
        if (ev.delta?.stop_reason) msg.stop_reason = ev.delta.stop_reason;
        if (ev.usage) Object.assign(msg.usage, ev.usage);
        break;
      case 'error':
        throw httpError(ev.error?.type === 'overloaded_error' ? 529 : 500, ev.error?.message);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      handle(ev);
    }
  }
  msg.content = msg.content.filter(Boolean);
  return msg;
}

// Konuşma geçmişini API formatına çevir
async function historyMessages() {
  const msgs = (await db.list('chat_messages')).filter((m) => m.role === 'user' || m.role === 'assistant');
  const recent = msgs.slice(-HISTORY_LIMIT);
  const out = [];
  for (const m of recent) {
    let text = (m.text || '').trim();
    if (m.role === 'user') {
      const extra = [];
      const n = (m.images && m.images.length) || (m.image ? 1 : 0);
      if (n) extra.push(n > 1 ? `[${n} fotoğraf gönderdi]` : '[fotoğraf gönderdi]');
      for (const f of m.files || []) extra.push(`[dosya gönderdi: ${f.name}]`);
      if (extra.length) text = (extra.join(' ') + ' ' + text).trim();
    }
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + text;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// Bir kullanıcı mesajını işle. attachments: [{ kind:'image', media_type, data } | { kind:'pdf', name, data } | { kind:'text', name, text }]
// onModel(model): hangi model çalışıyor; onText(fullText): cevap yazıldıkça
export async function runTurn({ text, image, attachments = [], onModel, onText }) {
  const apiKey = await db.getSetting('api_key');
  if (!apiKey) throw new AIError("Coach'u kullanmak için önce Ayarlar sayfasından API anahtarını ekle.");
  if (image) attachments = [{ kind: 'image', ...image }, ...attachments];
  const model = chooseModel(text, attachments.length > 0);
  onModel && onModel(model);
  const ctx = await buildContext();
  const custom = await db.list('custom_foods');
  const system = [
    { type: 'text', text: staticPrompt(), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicPrompt(ctx, custom) },
  ];
  const history = await historyMessages(); // son kullanıcı mesajı zaten kaydedildiği için geçmişte var
  if (history.length && history[history.length - 1].role === 'user') history.pop();
  const userContent = [];
  for (const a of attachments) {
    if (a.kind === 'image') userContent.push({ type: 'image', source: { type: 'base64', media_type: a.media_type, data: a.data } });
    else if (a.kind === 'pdf') userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data }, title: a.name });
    else if (a.kind === 'text') userContent.push({ type: 'text', text: `Ekli dosya: ${a.name}\n\n${a.text}` });
  }
  const what = attachments.some((a) => a.kind !== 'image') ? 'Eklediğim dosyayı' : 'Bu fotoğrafı';
  userContent.push({ type: 'text', text: text || `${what} incele ve gerekiyorsa kaydet.` });
  const messages = [...history, { role: 'user', content: userContent }];
  if (messages[0].role !== 'user') messages.shift();

  const cards = [];
  let finalText = '';
  let live = '';
  for (let i = 0; i < 4; i++) {
    live = '';
    const data = await callAPIStream(apiKey, { model: model.id, max_tokens: model.maxTokens, system, messages, tools: TOOLS }, (delta) => {
      live += delta;
      onText && onText(live);
    });
    await recordUsage(model, data.usage);
    const blocks = data.content || [];
    const texts = blocks.filter((b) => b.type === 'text').map((b) => b.text);
    if (texts.length) finalText = texts.join('\n\n');
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
      const empty = card && ((card.type === 'doses' && !card.items.length) || (card.type === 'profile' && !Object.keys(card.changes).length) || (card.type === 'measures' && !Object.keys(card.values).length) || (card.type === 'water' && !card.ml));
      if (card && !empty) cards.push(card);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: cardSummary(card) });
    }
    messages.push({ role: 'user', content: results });
    finalText = ''; // aracı çağırdıktan sonraki son metni gösterelim
    onText && onText('');
  }
  return { text: finalText.trim(), cards, model };
}


// ---------- Besin değeri tahmini (yemek adı/tarif ya da etiket fotoğrafı) ----------
const ESTIMATE_TOOL = {
  name: 'food_values',
  description: 'Besinin 100 g (sıvılarda 100 ml) başına besin değerleri ve tipik porsiyonu.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Besinin kısa Türkçe adı' },
      kcal: { type: 'number' },
      protein_g: { type: 'number' },
      carb_g: { type: 'number' },
      fat_g: { type: 'number' },
      fiber_g: { type: 'number' },
      sodium_mg: { type: 'number' },
      portion_label: { type: 'string', description: 'Tipik porsiyon adı (porsiyon, adet, dilim, kase, paket…)' },
      portion_g: { type: 'number', description: 'O porsiyonun gram karşılığı' },
      source: { type: 'string', enum: ['etiket', 'tahmin'], description: 'Değerler etiketten mi okundu yoksa tahmin mi' },
      note: { type: 'string', description: 'Kısa not: varsayımlar (tarif, pişirme yöntemi) veya etiketin okunamayan kısımları. En fazla 1 cümle.' },
    },
    required: ['name', 'kcal', 'protein_g', 'carb_g', 'fat_g', 'source'],
  },
};

// mode: 'dish' (ad + açıklama) | 'label' (besin tablosu fotoğrafı) | 'photo' (tabak fotoğrafı)
export async function estimateFood({ name = '', details = '', image = null, mode = 'dish' }) {
  const apiKey = await db.getSetting('api_key');
  if (!apiKey) throw new AIError('Bu özellik için Ayarlar sayfasından API anahtarını eklemelisin.');
  const model = image ? MODELS.smart : MODELS.fast;
  const instr =
    mode === 'label'
      ? 'Fotoğraftaki besin değerleri tablosunu oku ve 100 g (veya 100 ml) başına değerleri ver. Tablo sadece porsiyon başına değer veriyorsa 100 g\'a çevir. Tuz verilmişse sodyum = tuz / 2,5. Ürün adı paketten okunabiliyorsa onu kullan. source = "etiket".'
      : mode === 'photo'
      ? 'Fotoğraftaki yemeği tanı; standart Türk ev/restoran tarifine göre 100 g başına gerçekçi değerleri ve fotoğraftaki porsiyonun yaklaşık gramını ver. source = "tahmin".'
      : 'Verilen yemek ya da ürün için standart Türk ev/restoran tarifine (veya piyasadaki tipik ürüne) göre 100 g başına gerçekçi besin değerlerini ver. Kullanıcının verdiği tarif/açıklama varsa ona göre hesapla. source = "tahmin".';
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  content.push({ type: 'text', text: `${instr}\n\nAd: ${name || '(belirtilmedi)'}${details ? `\nAçıklama/tarif: ${details}` : ''}` });
  const data = await callAPIStream(
    apiKey,
    {
      model: model.id,
      max_tokens: 600,
      system: 'Sen bir beslenme veritabanı uzmanısın. Değerleri USDA ve TürKomp gibi kaynaklardaki tipik değerlere dayandır; uydurma kesinlik gösterme ama her zaman bir sayı ver. Kalori ile makrolar tutarlı olsun (≈ 4×protein + 4×karbonhidrat + 9×yağ).',
      messages: [{ role: 'user', content }],
      tools: [ESTIMATE_TOOL],
      tool_choice: { type: 'tool', name: 'food_values' },
    },
    null
  );
  await recordUsage(model, data.usage);
  const use = (data.content || []).find((b) => b.type === 'tool_use');
  if (!use || !use.input) throw new AIError('Değerler hesaplanamadı, yeniden dene.');
  const v = use.input;
  const num = (x) => (x == null || isNaN(Number(x)) ? 0 : Number(x));
  return {
    name: String(v.name || name || 'Besin').slice(0, 80),
    k: Math.round(num(v.kcal)),
    p: round1(num(v.protein_g)),
    c: round1(num(v.carb_g)),
    f: round1(num(v.fat_g)),
    fb: round1(num(v.fiber_g)),
    na: Math.round(num(v.sodium_mg)),
    ka: 0,
    portions: v.portion_g > 0 ? [[String(v.portion_label || 'porsiyon').slice(0, 20), round1(num(v.portion_g))]] : [],
    source: v.source === 'etiket' ? 'Etiketten okundu' : 'Yapay zekâ tahmini',
    note: v.note ? String(v.note).slice(0, 200) : '',
  };
}

// Tahlil raporundan (PDF veya fotoğraf) değerleri oku. file: { data: base64, media_type }
const LAB_TOOL = {
  name: 'lab_report',
  description: 'Tahlil raporundaki tüm sonuçları yapılandırılmış olarak döndürür.',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Numune/rapor tarihi YYYY-AA-GG. Okunamıyorsa boş bırak.' },
      lab_name: { type: 'string', description: 'Laboratuvar veya hastane adı' },
      values: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Test adı, rapordaki gibi (Türkçe)' },
            value: { type: 'number', description: 'Sayısal sonuç' },
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
};

export async function extractLabs(file) {
  const apiKey = await db.getSetting('api_key');
  if (!apiKey) throw new AIError('Bu özellik için Ayarlar sayfasından API anahtarını eklemelisin.');
  const model = MODELS.smart;
  const isPdf = file.media_type === 'application/pdf';
  const content = [
    isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
      : { type: 'image', source: { type: 'base64', media_type: file.media_type, data: file.data } },
    {
      type: 'text',
      text:
        'Bu bir kan/idrar tahlili raporu. Sayısal sonucu olan TÜM testleri eksiksiz çıkar: test adı, sonuç, birim ve rapordaki referans aralığı. ' +
        'Ondalık virgülü noktaya çevir (5,2 → 5.2). "<0,5" gibi değerlerde sayıyı al. Referans tek sınırlıysa (örn. "<200") sadece o sınırı ver. ' +
        'Yorum, açıklama, tekrar eden başlıklar ve sayısal olmayan sonuçları (pozitif/negatif gibi) alma. Aynı test birden çok kez geçiyorsa bir kez yaz. Tarihi numune alma tarihinden al.',
    },
  ];
  const data = await callAPIStream(
    apiKey,
    {
      model: model.id,
      max_tokens: 8000,
      system: 'Sen tıbbi rapor verilerini hatasız aktaran bir veri giriş uzmanısın. Sadece raporda yazanı aktar, tahmin etme, değer uydurma.',
      messages: [{ role: 'user', content }],
      tools: [LAB_TOOL],
      tool_choice: { type: 'tool', name: 'lab_report' },
    },
    null
  );
  await recordUsage(model, data.usage);
  const use = (data.content || []).find((b) => b.type === 'tool_use');
  if (!use || !use.input || !Array.isArray(use.input.values) || !use.input.values.length) throw new AIError('Raporda okunabilir değer bulunamadı. Daha net bir dosya ya da fotoğraf dene.');
  const n = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));
  const values = use.input.values
    .filter((v) => v && v.name && n(v.value) != null)
    .map((v) => {
      const m = matchLab(v.name);
      return {
        marker_key: m ? m.key : null,
        name: m ? m.name : String(v.name).slice(0, 60),
        value: n(v.value),
        unit: v.unit || (m ? m.unit : ''),
        ref_low: n(v.ref_low) ?? (m ? m.lo : null),
        ref_high: n(v.ref_high) ?? (m ? m.hi : null),
      };
    });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(use.input.date || '') ? use.input.date : null;
  return { date, lab_name: String(use.input.lab_name || '').slice(0, 60), values };
}

export { slotLabel, round1, labByKey };
