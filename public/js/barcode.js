// Barkod okutma (kamera) ve Open Food Facts'ten ürün bilgisi
import * as db from './db.js';
import { esc, openSheet, parseNum, round1, toast } from './util.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
let zxingLoading = null;

function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingLoading) return zxingLoading;
  zxingLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/zxing.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => {
      zxingLoading = null;
      reject(new Error('Barkod okuyucu yüklenemedi'));
    };
    document.head.appendChild(s);
  });
  return zxingLoading;
}

async function makeDecoder(qr = false) {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const fmts = (qr ? ['qr_code'] : FORMATS).filter((f) => supported.includes(f));
      if (fmts.length) {
        const det = new window.BarcodeDetector({ formats: fmts });
        return async (video) => {
          const r = await det.detect(video);
          return r.length ? r[0].rawValue : null;
        };
      }
    } catch {}
  }
  const Z = await loadZXing();
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, qr ? [Z.BarcodeFormat.QR_CODE] : [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    // barkodda ortadaki şeridi oku (daha hızlı ve isabetli); QR'da tüm kare
    const cw = Math.min(vw, 960);
    const scale = cw / vw;
    const bandH = qr ? vh : Math.round(vh * 0.4);
    canvas.width = cw;
    canvas.height = Math.round(bandH * scale);
    ctx.drawImage(video, 0, Math.round((vh - bandH) / 2), vw, bandH, 0, 0, canvas.width, canvas.height);
    try {
      const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(src));
      return reader.decode(bmp).getText();
    } catch {
      return null;
    }
  };
}

// Barkodu okut: kodu (string) ya da null döndürür. qr: true → QR kod okur (ör. yedek kurtarma kodu)
export function scanBarcode({ qr = false, accept = null } = {}) {
  const valid = accept || ((c) => /^\d{6,14}$/.test(c));
  return new Promise((resolve) => {
    let result = null;
    let stream = null;
    let stopped = false;
    let timer = null;
    const s = openSheet({
      title: qr ? 'QR kodu okut' : 'Barkod okut',
      leftLabel: 'Vazgeç',
      body: `
        <div style="position:relative;border-radius:16px;overflow:hidden;background:#000;aspect-ratio:3/4;max-height:56dvh;margin:0 auto 12px">
          <video playsinline muted autoplay style="width:100%;height:100%;object-fit:cover;display:block"></video>
          <div aria-hidden="true" style="position:absolute;left:8%;right:8%;${qr ? 'top:20%;height:60%' : 'top:38%;height:24%'};border:2px solid rgba(255,255,255,.85);border-radius:12px;box-shadow:0 0 0 2000px rgba(0,0,0,.25)"></div>
          <p data-msg style="position:absolute;left:0;right:0;bottom:10px;margin:0;text-align:center;color:#fff;font-size:14px;text-shadow:0 1px 3px rgba(0,0,0,.6)">Kamera açılıyor…</p>
        </div>
        ${qr ? '' : `<form data-manual style="display:flex;gap:8px">
          <label class="sr-only" for="bc-manual">Barkod numarası</label>
          <input id="bc-manual" class="input" inputmode="numeric" placeholder="ya da barkod numarasını yaz" autocomplete="off" style="flex:1">
          <button type="submit" class="btn primary">Ara</button>
        </form>`}`,
      onClose: () => {
        stopped = true;
        clearTimeout(timer);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        resolve(result);
      },
    });
    const video = s.el.querySelector('video');
    const msg = s.el.querySelector('[data-msg]');
    s.el.querySelector('[data-manual]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = s.el.querySelector('#bc-manual').value.replace(/\D/g, '');
      if (v.length < 6) return toast('Barkod numarası eksik');
      result = v;
      s.close();
    });
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        msg.textContent = qr ? 'Kamera kullanılamıyor; kodu elle yazabilirsin.' : 'Kamera kullanılamıyor; numarayı elle yazabilirsin.';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (err) {
        msg.textContent = err && err.name === 'NotAllowedError' ? 'Kamera izni verilmedi. Ayarlar > Safari > Kamera\'dan izin verebilirsin.' : qr ? 'Kamera açılamadı; kodu elle yazabilirsin.' : 'Kamera açılamadı; numarayı elle yazabilirsin.';
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      try {
        await video.play();
      } catch {}
      let decode;
      try {
        decode = await makeDecoder(qr);
      } catch (e) {
        msg.textContent = e.message;
        return;
      }
      msg.textContent = qr ? 'QR kodu çerçevenin içine getir' : 'Barkodu çerçevenin içine getir';
      const tick = async () => {
        if (stopped) return;
        let code = null;
        try {
          code = await decode(video);
        } catch {}
        if (code && valid(code)) {
          result = code;
          s.close();
          return;
        }
        timer = setTimeout(tick, 180);
      };
      tick();
    })();
  });
}

// Open Food Facts'ten ürün getir → besin nesnesi (100 g değerleri) ya da null
export async function fetchProduct(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_tr,generic_name,brands,nutriments,serving_quantity,serving_size,quantity`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('İnternet bağlantısı yok ya da Open Food Facts\'e ulaşılamadı.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Ürün bilgisi alınamadı (' + res.status + ').');
  const data = await res.json();
  if (!data || data.status === 0 || !data.product) return null;
  const pr = data.product;
  const n = pr.nutriments || {};
  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n.energy_100g) != null) kcal = num(n.energy_100g) / 4.184;
  let sodium = num(n.sodium_100g);
  if (sodium == null && num(n.salt_100g) != null) sodium = num(n.salt_100g) / 2.5;
  const name = [pr.product_name_tr || pr.product_name || pr.generic_name || '', pr.brands ? `(${String(pr.brands).split(',')[0].trim()})` : ''].join(' ').trim();
  const serving = num(pr.serving_quantity);
  return {
    barcode: code,
    name: name || `Ürün ${code}`,
    k: kcal == null ? null : Math.round(kcal),
    p: round1(num(n.proteins_100g) ?? 0),
    c: round1(num(n.carbohydrates_100g) ?? 0),
    f: round1(num(n.fat_100g) ?? 0),
    fb: round1(num(n.fiber_100g) ?? 0),
    na: sodium == null ? 0 : Math.round(sodium * 1000),
    ka: num(n.potassium_100g) == null ? 0 : Math.round(num(n.potassium_100g) * 1000),
    portions: serving && serving > 0 ? [['porsiyon', round1(serving)]] : [],
    source: 'Open Food Facts',
  };
}

// Barkod → kayıtlı besin (önce kendi listen, sonra Open Food Facts). Kullanıcı değerleri onaylar.
export async function foodFromBarcode(code) {
  const mine = (await db.list('custom_foods', (f) => f.barcode === code))[0];
  if (mine) return mine;
  let prod = null;
  try {
    toast('Ürün aranıyor…', 1500);
    prod = await fetchProduct(code);
  } catch (e) {
    toast(e.message, 3500);
  }
  return reviewFood(prod || { barcode: code, name: '', k: null, p: 0, c: 0, f: 0, fb: 0, na: 0, ka: 0, portions: [] }, !prod);
}

// Ürün değerlerini gösterip düzenletir, onaylanınca kendi besinlerine kaydeder
export function reviewFood(food, notFound = false) {
  return new Promise((resolve) => {
    let saved = null;
    const v = (x) => (x == null ? '' : String(x).replace('.', ','));
    const pl = food.portions && food.portions[0];
    const s = openSheet({
      title: notFound ? 'Ürün bulunamadı' : food.overrides && !food.id ? 'Değerleri düzelt' : food.id ? 'Besini düzenle' : food.source === 'Yapay zekâ tahmini' ? 'Tahmini değerler' : food.source === 'Etiketten okundu' ? 'Etiketten okunanlar' : 'Ürünü kontrol et',
      leftLabel: 'Vazgeç',
      rightLabel: 'Kaydet',
      body: `
        ${
          food.overrides && !food.id
            ? `<p class="small muted" style="margin:0 4px 12px;line-height:18px">FatSecret'ta, paketin üzerinde ya da başka bir kaynakta gördüğün 100 g değerlerini gir. Kaydedince bu besin listende senin değerlerinle görünür; istediğinde orijinaline dönebilirsin.</p>`
            : food.id && !notFound
            ? ''
            : notFound
            ? `<p class="small muted" style="margin:0 4px 12px;line-height:18px">Bu barkod Open Food Facts'te yok. Paketin arkasındaki besin tablosunun fotoğrafını çekersen değerleri senin için okuyabilirim${food.barcode ? '' : ''}.</p>
               <label class="btn primary block" style="margin-bottom:14px;cursor:pointer">Etiketin fotoğrafını çek<input type="file" accept="image/*" capture="environment" class="sr-only" data-label-photo></label>`
            : food.source === 'Yapay zekâ tahmini'
            ? `<p class="small muted" style="margin:0 4px 12px;line-height:18px">Değerler yapay zekâ tarafından standart tariflere göre tahmin edildi; ±%20 sapabilir.${food.note ? ' ' + esc(food.note) : ''} İstersen düzelt, sonra kaydet; bir dahaki sefere listende hazır olur.</p>`
            : food.source === 'Etiketten okundu'
            ? `<p class="small muted" style="margin:0 4px 12px;line-height:18px">Değerler etiketin fotoğrafından okundu.${food.note ? ' ' + esc(food.note) : ''} Paketteki tabloyla bir kez karşılaştır.</p>`
            : `<p class="small muted" style="margin:0 4px 12px;line-height:18px">Değerler Open Food Facts'ten geldi (gönüllülerin girdiği veriler). Paketin üzerindekiyle karşılaştırıp gerekirse düzelt.</p>`
        }
        <div class="field"><label for="rf-name">Ad</label><input id="rf-name" class="input" value="${esc(food.name)}"></div>
        <p class="small muted" style="margin:0 0 10px">100 g (veya 100 ml) için:</p>
        <div class="grid2">
          <div class="field"><label for="rf-k">Kalori (kcal)</label><input id="rf-k" class="input" inputmode="decimal" value="${v(food.k)}"></div>
          <div class="field"><label for="rf-p">Protein (g)</label><input id="rf-p" class="input" inputmode="decimal" value="${v(food.p)}"></div>
          <div class="field"><label for="rf-c">Karbonhidrat (g)</label><input id="rf-c" class="input" inputmode="decimal" value="${v(food.c)}"></div>
          <div class="field"><label for="rf-f">Yağ (g)</label><input id="rf-f" class="input" inputmode="decimal" value="${v(food.f)}"></div>
          <div class="field"><label for="rf-fb">Lif (g)</label><input id="rf-fb" class="input" inputmode="decimal" value="${v(food.fb)}"></div>
          <div class="field"><label for="rf-na">Sodyum (mg)</label><input id="rf-na" class="input" inputmode="decimal" value="${v(food.na)}"></div>
        </div>
        <div class="field"><label for="rf-pg">Bir porsiyon (g) – isteğe bağlı</label><input id="rf-pg" class="input" inputmode="decimal" value="${v(pl ? pl[1] : '')}"></div>
        ${food.barcode ? `<p class="small muted" style="margin:0 4px">Barkod: ${esc(food.barcode)}</p>` : ''}`,
      onRight: async (api) => {
        const g = (id) => parseNum(s.el.querySelector(id).value);
        const name = s.el.querySelector('#rf-name').value.trim();
        const k = g('#rf-k');
        if (!name || isNaN(k)) return toast('Ad ve kalori gerekli');
        const pg = g('#rf-pg');
        saved = await db.put('custom_foods', {
          ...(food.id ? { id: food.id } : {}),
          ...(food.overrides ? { overrides: food.overrides } : {}),
          barcode: food.barcode || null,
          name,
          alias: food.alias || '',
          k,
          p: g('#rf-p') || 0,
          c: g('#rf-c') || 0,
          f: g('#rf-f') || 0,
          fb: g('#rf-fb') || 0,
          na: g('#rf-na') || 0,
          ka: food.ka || 0,
          portions: [...(pg > 0 ? [[pl && pl[0] ? pl[0] : 'porsiyon', pg]] : []), ...(food.portions || []).slice(1)],
          source: food.source || 'manuel',
        });
        api.close();
      },
      onClose: () => resolve(saved),
    });
    const lp = s.el.querySelector('[data-label-photo]');
    if (lp)
      lp.addEventListener('change', async () => {
        const f = lp.files && lp.files[0];
        if (!f) return;
        try {
          toast('Etiket okunuyor…', 4000);
          const image = await fileToImage(f);
          const { estimateFood } = await import('./ai.js');
          const est = await estimateFood({ name: s.el.querySelector('#rf-name').value, image, mode: 'label' });
          const set = (id, v) => (s.el.querySelector(id).value = v == null ? '' : String(v).replace('.', ','));
          if (!s.el.querySelector('#rf-name').value) set('#rf-name', est.name);
          set('#rf-k', est.k);
          set('#rf-p', est.p);
          set('#rf-c', est.c);
          set('#rf-f', est.f);
          set('#rf-fb', est.fb);
          set('#rf-na', est.na);
          if (est.portions[0]) set('#rf-pg', est.portions[0][1]);
          food.source = 'Etiketten okundu';
          toast('Değerler etiketten okundu; kontrol edip kaydet', 3000);
        } catch (e) {
          toast(e.message, 4000);
        }
      });
  });
}

// Fotoğraf dosyasını yapay zekâya gönderilecek JPEG'e çevir
export function fileToImage(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * sc);
      c.height = Math.round(img.naturalHeight * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
    };
    img.onerror = () => reject(new Error('Fotoğraf açılamadı'));
    img.src = url;
  });
}

// Open Food Facts'te ada göre paketli ürün ara
export async function searchProducts(q) {
  const fields = 'code,product_name,product_name_tr,brands,nutriments,serving_quantity';
  const parse = (pr) => {
    const n = pr.nutriments || {};
    let kcal = n['energy-kcal_100g'];
    if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
    if (kcal == null) return null;
    const brand = Array.isArray(pr.brands) ? pr.brands[0] : String(pr.brands || '').split(',')[0];
    let sodium = n.sodium_100g;
    if (sodium == null && n.salt_100g != null) sodium = n.salt_100g / 2.5;
    return {
      barcode: pr.code || null,
      name: [pr.product_name_tr || pr.product_name || '', brand ? `(${String(brand).trim()})` : ''].join(' ').trim(),
      k: Math.round(Number(kcal)),
      p: round1(Number(n.proteins_100g) || 0),
      c: round1(Number(n.carbohydrates_100g) || 0),
      f: round1(Number(n.fat_100g) || 0),
      fb: round1(Number(n.fiber_100g) || 0),
      na: sodium == null ? 0 : Math.round(Number(sodium) * 1000),
      ka: 0,
      portions: pr.serving_quantity > 0 ? [['porsiyon', round1(Number(pr.serving_quantity))]] : [],
      source: 'Open Food Facts',
    };
  };
  const enc = encodeURIComponent(q);
  const get = async (url, ms = 12000) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  };
  // Üç kaynağı aynı anda dene; Türkiye'de satılanlar (tr) önce gelsin
  const sources = [
    () => get(`https://tr.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=30&fields=${fields}`).then((d) => d.products || []),
    () => get(`https://search.openfoodfacts.org/search?q=${enc}&page_size=30&langs=tr,en&fields=${fields}`).then((d) => d.hits || []),
    () => get(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=30&fields=${fields}`).then((d) => d.products || []),
  ];
  const runAll = () =>
    new Promise((resolve, reject) => {
      const results = sources.map(() => null);
      let settled = 0;
      let okCount = 0;
      let done = false;
      let grace = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(grace);
        const seen = new Set();
        const out = [];
        for (const list of results) {
          for (const pr of list || []) {
            const x = parse(pr);
            if (!x || !x.name) continue;
            const key = x.barcode || x.name.toLocaleLowerCase('tr-TR');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(x);
          }
        }
        resolve(out);
      };
      sources.forEach((fn, i) =>
        fn()
          .then((list) => {
            results[i] = list;
            okCount++;
            // ilk dolu cevaptan sonra diğerlerine kısa bir süre daha tanı
            if (list.length && !grace) grace = setTimeout(finish, 1500);
          })
          .catch(() => {})
          .finally(() => {
            settled++;
            if (settled === sources.length) {
              if (okCount) finish();
              else if (!done) {
                done = true;
                reject(new Error('fail'));
              }
            }
          })
      );
    });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runAll();
    } catch {}
  }
  throw new Error('Open Food Facts\'e ulaşılamadı. İnternet bağlantını kontrol edip yeniden dene.');
}
