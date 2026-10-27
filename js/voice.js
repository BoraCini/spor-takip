// Sesli konuşma: konuşmayı yazıya çevirme (Web Speech API) ve cevabı sesli okuma (speechSynthesis)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const sttSupported = () => !!SR;
export const ttsSupported = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

let rec = null;

// Dinlemeyi başlat. Döndürdüğü fonksiyon dinlemeyi bitirir.
export function listen({ onInterim, onFinal, onEnd, onError }) {
  if (!SR) {
    onError && onError('unsupported');
    return () => {};
  }
  stopSpeaking();
  if (rec) {
    try {
      rec.abort();
    } catch {}
  }
  rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onInterim && onInterim((finalText + ' ' + interim).trim());
  };
  rec.onerror = (e) => {
    onError && onError(e.error || 'error');
  };
  rec.onend = () => {
    rec = null;
    const t = finalText.trim();
    if (t) onFinal && onFinal(t);
    onEnd && onEnd();
  };
  try {
    rec.start();
  } catch (err) {
    onError && onError('start');
  }
  return () => {
    try {
      rec && rec.stop();
    } catch {}
  };
}

// ---- Sesli okuma ----
let voice = null;
function pickVoice() {
  if (voice) return voice;
  const vs = window.speechSynthesis.getVoices();
  const tr = vs.filter((v) => /^tr/i.test(v.lang));
  voice = tr.find((v) => /enhanced|premium|geliştirilmiş/i.test(v.name)) || tr.find((v) => v.localService) || tr[0] || null;
  return voice;
}
if (ttsSupported()) window.speechSynthesis.onvoiceschanged = () => (voice = null);

// iOS sesli okumayı ancak bir dokunuştan sonra izin verir; dokunuş anında çağır
export function unlockSpeech() {
  if (!ttsSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}

export function plainText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[→]/g, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}

export function speak(text, { onEnd } = {}) {
  if (!ttsSupported()) return false;
  stopSpeaking();
  const clean = plainText(text);
  if (!clean) return false;
  // Uzun metinleri cümle gruplarına böl (iOS uzun metinlerde takılabiliyor)
  const parts = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) {
      chunks.push(cur);
      cur = p;
    } else cur += p;
  }
  if (cur.trim()) chunks.push(cur);
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c.trim());
    u.lang = 'tr-TR';
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    if (i === chunks.length - 1 && onEnd) u.onend = onEnd;
    window.speechSynthesis.speak(u);
  });
  return true;
}

export function stopSpeaking() {
  if (ttsSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

export const isSpeaking = () => ttsSupported() && window.speechSynthesis.speaking;
