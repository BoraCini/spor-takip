// Tahlil PDF'ini yapay zekâ kullanmadan, telefonda okur: PDF'teki metni satırlara ayırır,
// her satırdan test adı, sonuç, birim ve referans aralığını çıkarır. Taranmış (resim) PDF'lerde metin olmadığı için çalışmaz.
import { matchLab } from './data/labs.js';

const NUM = '-?\\d+(?:[.,]\\d+)?';
const RE_NUM_TOKEN = new RegExp(`^[<>≤≥]?${NUM}$`);
const RE_RANGE = new RegExp(`(${NUM})\\s*[-–—]\\s*(${NUM})`);
const RE_LT = new RegExp(`(?:^|\\s)(?:<=?|≤|<\\s*=)\\s*(${NUM})`);
const RE_GT = new RegExp(`(?:^|\\s)(?:>=?|≥|>\\s*=)\\s*(${NUM})`);
const RE_DATE = /(\d{1,2})[./](\d{1,2})[./](\d{4})/;
const FLAG = /^(H|L|HH|LL|Y|D|↑|↓|\*|\(H\)|\(L\)|\(\+\)|\(-\))$/i;
const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;
// Test olmayan satırlar (hasta bilgisi, başlıklar vb.)
const JUNK = /(tarih|\btel\b|telefon|faks|\bfax\b|protokol|barkod|sayfa|\bya[sş]\b|do[gğ]um|kimlik|adres|hasta\b|hasta ad|doktor|\bdr\.|uzman|onay|kabul|numune|rapor|\bistem|birim ad|referans|tetkik ad|test ad|cinsiyet|e-?posta|www\.|http|kurum|poliklinik|servis|dosya|sicil|imza)/i;

// Hemogramdaki kısaltmaların Türkçe karşılıkları
const ABBR = {
  'BA#': 'Bazofil (sayı)', 'BA%': 'Bazofil %', 'EO#': 'Eozinofil (sayı)', 'EO%': 'Eozinofil %', 'LY#': 'Lenfosit (sayı)', 'LY%': 'Lenfosit %',
  'MO#': 'Monosit (sayı)', 'MO%': 'Monosit %', 'NE#': 'Nötrofil (sayı)', 'NE%': 'Nötrofil %', 'IG': 'İmmatür granülosit (sayı)', 'IG%': 'İmmatür granülosit %',
  'NRBC #': 'Çekirdekli eritrosit (sayı)', 'NRBC %': 'Çekirdekli eritrosit %', 'NRBC#': 'Çekirdekli eritrosit (sayı)', 'NRBC%': 'Çekirdekli eritrosit %',
  'PCT': 'Trombositokrit (PCT)',
};

const toNum = (s) => {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(/[<>≤≥=\s]/g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
};

function isUnit(t) {
  if (!t || t.length > 14) return false;
  if (RE_NUM_TOKEN.test(t) || FLAG.test(t)) return false;
  if (t === '%') return true;
  return /^[A-Za-zµμ%\/^·.*³⁶0-9\-]+$/.test(t) && /[A-Za-zµμ%]/.test(t) && (/[\/%^³⁶]/.test(t) || /^(fl|fL|pg|sn|IU|U|g|mg|ng|mL|ml|mmol|mEq|ratio|oran|index|indeks)$/i.test(t));
}

function parseRef(rest) {
  const r = rest.match(RE_RANGE);
  if (r) {
    const lo = toNum(r[1]);
    const hi = toNum(r[2]);
    if (lo != null && hi != null && hi >= lo) return { lo, hi };
  }
  const lt = rest.match(RE_LT);
  if (lt) return { lo: null, hi: toNum(lt[1]) };
  const gt = rest.match(RE_GT);
  if (gt) return { lo: toNum(gt[1]), hi: null };
  return { lo: null, hi: null };
}

// Tek satırı çözümle. cells: sütunlara ayrılmış metin (PDF'teki boşluklara göre), line: tüm satır
export function parseLine(line) {
  const text = line.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || !LETTER.test(text)) return null;
  // sütun ayırıcıları (tab) boşluğa çevirip kelimelere böl
  const tokens = [];
  for (const t of text.replace(/\t/g, ' ').split(' ').filter(Boolean)) {
    // "52,1H" gibi bitişik bayrakları ayır
    const m = t.match(/^([<>≤≥]?-?\d+(?:[.,]\d+)?)(H|L|↑|↓|\*)$/);
    if (m) tokens.push(m[1], m[2]);
    else tokens.push(t);
  }
  // ilk sayısal kelime = sonuç (öncesinde harf içeren bir ad olmalı)
  let vi = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (RE_NUM_TOKEN.test(tokens[i]) && tokens.slice(0, i).some((t) => LETTER.test(t))) {
      vi = i;
      break;
    }
  }
  if (vi < 0) return null;
  let nameTokens = tokens.slice(0, vi).filter((t) => !FLAG.test(t));
  let name = nameTokens.join(' ').replace(/^[*•\-\s]+/, '').replace(/[:\s]+$/, '').trim();
  if (name.length < 2 || name.length > 70 || JUNK.test(name)) return null;
  const value = toNum(tokens[vi]);
  if (value == null) return null;
  let rest = tokens.slice(vi + 1).filter((t) => !FLAG.test(t));
  let unit = '';
  if (rest.length && isUnit(rest[0])) unit = rest.shift();
  const restTxt = rest.join(' ');
  const { lo, hi } = parseRef(restTxt);
  if (!unit) {
    const u = rest.find((t) => isUnit(t));
    if (u) unit = u;
  }
  return { name, value, unit, ref_low: lo, ref_high: hi, raw: text };
}

function findDate(lines) {
  const toIso = (m) => `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const valid = (m) => m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31 && Number(m[3]) >= 2000;
  for (const key of [/numune|kabul|al[ıi]m/i, /sonu[cç]|onay|rapor/i, /tarih/i]) {
    for (const l of lines) {
      if (/do[gğ]um/i.test(l) || !key.test(l)) continue;
      const m = l.match(RE_DATE);
      if (valid(m)) return toIso(m);
    }
  }
  for (const l of lines) {
    if (/do[gğ]um/i.test(l)) continue;
    const m = l.match(RE_DATE);
    if (valid(m)) return toIso(m);
  }
  return null;
}

function findLabName(lines) {
  const t = lines.find((x) => /sa[gğ]l[ıi]k tesisi|kurum ad[ıi]|laboratuvar ad[ıi]/i.test(x));
  if (t) {
    const v = t.split(/:\s*/).slice(1).join(':').split('\t')[0].replace(/^T\.?C\.?\s*SA[GĞ]LIK BAKANLI[GĞ]I\s*/i, '').trim();
    if (v) return v.length > 60 ? v.slice(0, 60) : v.toLocaleLowerCase('tr-TR').replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase('tr-TR'));
  }
  const head = lines.slice(0, 15).filter((x) => x.length < 70 && !RE_DATE.test(x) && !/bakanl|e-?nab[ıi]z/i.test(x));
  const l = head.find((x) => /laboratuvar|hastane|t[ıi]p merkezi|\blab\b|klinik/i.test(x)) || head.find((x) => /sa[gğ]l[ıi]k/i.test(x));
  return l ? l.replace(/\t/g, ' ').trim() : '';
}

// Metin satırlarından değerleri çıkar
// Satıra sığmayıp alt satıra taşan test adlarını birleştir (örn. "DHEA-" + "SO4)", "(CKD-" + "EPI)")
function mergeWrapped(lines) {
  const out = [];
  const unclosed = (x) => (x.match(/\(/g) || []).length > (x.match(/\)/g) || []).length;
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    const cells = cur.split('\t');
    let openIdx = -1;
    for (let k = cells.length - 1; k >= 0; k--) if (unclosed(cells[k])) { openIdx = k; break; }
    if (openIdx >= 0 && next && /^[^\t]{1,25}\)/.test(next) && !RE_NUM_TOKEN.test((next.split('\t')[1] || '').trim())) {
      const nCells = next.split('\t');
      cells[openIdx] = (cells[openIdx] + nCells[0]).replace(/-\s*\)$/, ')');
      // taşan diğer parçalar (birim devamı gibi) sonraki hücrelere eklenir
      for (let k = 1; k < nCells.length; k++) {
        const idx = openIdx + k;
        if (idx < cells.length) cells[idx] = cells[idx] + nCells[k];
        else cells.push(nCells[k]);
      }
      out.push(cells.join('\t'));
      i++;
    } else out.push(cur);
  }
  return out;
}

export function parseLabLines(rawLines) {
  const lines = mergeWrapped(rawLines);
  const values = [];
  const seen = new Map();
  for (const l of lines) {
    const r = parseLine(l);
    if (!r) continue;
    let m = null;
    if (ABBR[r.name]) r.name = ABBR[r.name];
    else m = matchLab(r.name);
    // Tanınan bir test ya da birimi olan bir satır olmalı (çöp satırları elemek için)
    if (!m && !r.unit) continue;
    // Aynı teste ikinci kez denk gelinirse (örn. RDW-CV ve RDW-SD) ikincisini kendi adıyla tut
    if (m && seen.has(m.key)) m = null;
    const key = m ? m.key : r.name.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.set(key, true);
    values.push({
      marker_key: m ? m.key : null,
      name: m ? m.name : r.name,
      value: r.value,
      unit: r.unit || (m ? m.unit : ''),
      ref_low: r.ref_low ?? (r.ref_high == null && m ? m.lo : null),
      ref_high: r.ref_high ?? (r.ref_low == null && m ? m.hi : null),
    });
  }
  return { date: findDate(lines), lab_name: findLabName(lines), values };
}

// PDF → satırlar (konumlara göre birleştirir; sütun aralarına tab koyar)
export async function pdfLines(data) {
  await import('../vendor/pdfjs/rs-polyfill.mjs');
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.shim.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false });
  const doc = await task.promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    // getTextContent yerine akışı elle oku (Safari'de "for await" desteklenmiyor)
    const tc = { items: [] };
    const reader = page.streamTextContent({}).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.items) tc.items.push(...value.items);
    }
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const h = Math.abs(it.transform[3]) || it.height || 8;
      let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, h * 0.35));
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, w: it.width || 0, s: it.str, h });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let line = '';
      let end = null;
      for (const it of r.items) {
        if (end != null) {
          const gap = it.x - end;
          line += gap > it.h * 1.2 ? '\t' : gap > it.h * 0.15 ? ' ' : '';
        }
        line += it.s;
        end = it.x + it.w;
      }
      out.push(line.trim());
    }
    page.cleanup();
  }
  await task.destroy();
  return out;
}

export async function readLabPdf(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const lines = await pdfLines(buf);
  const textLen = lines.join('').replace(/\s/g, '').length;
  if (textLen < 20) {
    const e = new Error('Bu PDF metin içermiyor (taranmış/görüntü PDF). Değerleri elle girebilir ya da fotoğraftan okumayı deneyebilirsin.');
    e.code = 'NO_TEXT';
    throw e;
  }
  return parseLabLines(lines);
}
