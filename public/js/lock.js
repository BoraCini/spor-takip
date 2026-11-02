// PIN kilidi: PIN düz metin saklanmaz; rastgele tuz + PBKDF2-SHA256 özeti saklanır.
// PIN ve Face ID uygulamayı açmayı kilitler; telefondaki verileri ŞİFRELEMEZ. Asıl koruma telefonun kendi kilididir.
import * as db from './db.js';
import { esc } from './util.js';

export const NEW_PIN_LEN = 6; // yeni PIN'ler 6 hane; eski 4 haneli PIN'ler değiştirilene kadar çalışır
const ITER = 150000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function derive(pin, saltBytes) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITER }, key, 256);
  return b64(bits);
}

export async function hasPin() {
  return !!(await db.getSetting('pin_hash'));
}
export async function pinLength() {
  if (!(await hasPin())) return NEW_PIN_LEN;
  return (await db.getSetting('pin_len')) || 4; // pin_len yoksa 2.0 ve öncesinde belirlenmiş 4 haneli PIN
}

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  await db.setSetting('pin_salt', b64(salt));
  await db.setSetting('pin_hash', hash);
  await db.setSetting('pin_len', pin.length);
  await db.setSetting('pin_fail', null);
}

export async function clearPin() {
  await db.remove('settings', 'pin_hash');
  await db.remove('settings', 'pin_salt');
  await db.remove('settings', 'pin_len');
  await db.setSetting('pin_fail', null);
}

// ---------- Yanlış deneme sınırı ----------
// İlk 5 yanlıştan sonra bekleme; tekrarlanan yanlışlarda kademeli artar. Sayaç telefonda kalıcıdır (yeniden açınca sıfırlanmaz),
// doğru PIN ya da doğrulanmış Face ID ile sıfırlanır. Sonsuz kilit ve otomatik veri silme yoktur.
const FREE_TRIES = 5;
const WAITS = [30, 60, 5 * 60, 15 * 60, 60 * 60]; // saniye; 10. yanlıştan sonra hep 60 dk
export function lockoutSeconds(fails) {
  if (fails < FREE_TRIES) return 0;
  return WAITS[Math.min(fails - FREE_TRIES, WAITS.length - 1)];
}
export async function pinLockState(now = Date.now()) {
  const f = (await db.getSetting('pin_fail')) || { count: 0, until: 0 };
  return { count: f.count || 0, until: f.until || 0, waitMs: Math.max(0, (f.until || 0) - now) };
}
async function recordFail(now = Date.now()) {
  const f = await pinLockState(now);
  const count = f.count + 1;
  const wait = lockoutSeconds(count);
  await db.setSetting('pin_fail', { count, until: wait ? now + wait * 1000 : 0 });
  return { count, waitMs: wait * 1000 };
}
async function resetFails() {
  await db.setSetting('pin_fail', null);
}

// Döner: { ok, waitMs } — bekleme süresindeyken PIN hiç denenmez
export async function verifyPin(pin, now = Date.now()) {
  const hash = await db.getSetting('pin_hash');
  const salt = await db.getSetting('pin_salt');
  if (!hash || !salt) return { ok: true, waitMs: 0 };
  const st = await pinLockState(now);
  if (st.waitMs > 0) return { ok: false, waitMs: st.waitMs, locked: true };
  if ((await derive(pin, unb64(salt))) === hash) {
    await resetFails();
    return { ok: true, waitMs: 0 };
  }
  const r = await recordFail(now);
  return { ok: false, waitMs: r.waitMs, fails: r.count };
}

// ---------- Face ID / Touch ID (WebAuthn, cihazın kendi doğrulayıcısı) ----------
// Biyometrik veri hiçbir zaman uygulamaya gelmez; iPhone yüzü doğrular ve bir imza üretir.
// Uygulama kayıtta saklanan açık anahtarla bu imzayı, challenge'ı, origin'i, RP ID özetini ve
// kullanıcı doğrulama (UV) bayrağını kontrol eder. Doğrulanamazsa Face ID sunulmaz; PIN çalışır.
export function faceIdSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext && window.AuthenticatorAttestationResponse && AuthenticatorAttestationResponse.prototype.getPublicKey);
}

export async function faceIdAvailable() {
  try {
    return faceIdSupported() && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

// Eski (2.0) kayıtta yalnızca kimlik vardı, açık anahtar yoktu: doğrulanamaz, yeniden açılması gerekir
export async function faceIdNeedsReenroll() {
  const c = await db.getSetting('faceid_cred');
  return typeof c === 'string';
}
export async function hasFaceId() {
  const c = await db.getSetting('faceid_cred');
  return !!(c && typeof c === 'object' && c.id && c.pk);
}

export async function enableFaceId() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Pro Coach', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'sporcoach', displayName: 'Pro Coach' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('Face ID kurulamadı');
  const pk = cred.response.getPublicKey ? cred.response.getPublicKey() : null;
  const alg = cred.response.getPublicKeyAlgorithm ? cred.response.getPublicKeyAlgorithm() : null;
  if (!pk || (alg !== -7 && alg !== -257)) throw new Error('Bu cihazda Face ID doğrulanamıyor; PIN ile devam edebilirsin.');
  await db.setSetting('faceid_cred', { id: b64(cred.rawId), pk: b64(pk), alg, signCount: 0 });
  return true;
}

export async function disableFaceId() {
  await db.remove('settings', 'faceid_cred');
}

// DER kodlu ECDSA imzasını WebCrypto'nun beklediği r||s (64 bayt) biçimine çevirir
export function derToRaw(der) {
  const d = new Uint8Array(der);
  if (d[0] !== 0x30) throw new Error('imza biçimi');
  let i = 2;
  if (d[1] & 0x80) i = 2 + (d[1] & 0x7f);
  const read = () => {
    if (d[i] !== 0x02) throw new Error('imza biçimi');
    const len = d[i + 1];
    let v = d.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new Error('imza biçimi');
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read();
  const s = read();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

// Bir WebAuthn doğrulama yanıtını (assertion) denetler. Saf fonksiyon: test edilebilir.
export async function checkAssertion({ cred, assertion, challenge, origin, rpId }) {
  const resp = assertion.response;
  if (b64(assertion.rawId) !== cred.id) return { ok: false, why: 'kimlik' };
  const cdjBytes = new Uint8Array(resp.clientDataJSON);
  let cd;
  try {
    cd = JSON.parse(new TextDecoder().decode(cdjBytes));
  } catch {
    return { ok: false, why: 'clientData' };
  }
  if (cd.type !== 'webauthn.get') return { ok: false, why: 'tip' };
  if (cd.challenge !== b64url(challenge)) return { ok: false, why: 'challenge' };
  if (cd.origin !== origin) return { ok: false, why: 'origin' };
  const ad = new Uint8Array(resp.authenticatorData);
  if (ad.length < 37) return { ok: false, why: 'authData' };
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  for (let k = 0; k < 32; k++) if (ad[k] !== rpHash[k]) return { ok: false, why: 'rpId' };
  const flags = ad[32];
  if (!(flags & 0x01)) return { ok: false, why: 'UP' };
  if (!(flags & 0x04)) return { ok: false, why: 'UV' };
  const signCount = ((ad[33] << 24) | (ad[34] << 16) | (ad[35] << 8) | ad[36]) >>> 0;
  if ((cred.signCount || 0) > 0 && signCount <= cred.signCount) return { ok: false, why: 'sayac' };
  const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', cdjBytes));
  const data = new Uint8Array(ad.length + 32);
  data.set(ad, 0);
  data.set(cdHash, ad.length);
  let valid = false;
  try {
    if (cred.alg === -7) {
      const key = await crypto.subtle.importKey('spki', unb64(cred.pk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(resp.signature), data);
    } else if (cred.alg === -257) {
      const key = await crypto.subtle.importKey('spki', unb64(cred.pk), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, resp.signature, data);
    }
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, why: 'imza' };
  return { ok: true, signCount };
}

export async function verifyFaceId() {
  const cred = await db.getSetting('faceid_cred');
  if (!cred || typeof cred !== 'object' || !cred.pk) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const a = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: unb64(cred.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    if (!a) return false;
    const r = await checkAssertion({ cred, assertion: a, challenge, origin: location.origin, rpId: location.hostname });
    if (!r.ok) {
      console.warn('Face ID doğrulanamadı:', r.why);
      return false;
    }
    if (r.signCount) await db.setSetting('faceid_cred', { ...cred, signCount: r.signCount });
    await resetFails();
    return true;
  } catch {
    return false;
  }
}

// Tuş takımlı tam ekran; mode: 'unlock' | 'set' | 'confirm'
function keypadScreen({ title, text, onComplete, extraLabel, onExtra, cancelLabel, onCancel, topLabel, onTop, len = NEW_PIN_LEN }) {
  const el = document.createElement('div');
  el.className = 'lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  let pin = '';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  el.innerHTML = `
    <picture class="logo-pic"><source srcset="icons/logo-dark.png" media="(prefers-color-scheme: dark)"><img class="logo" src="icons/logo.png" alt="Pro Coach"></picture>
    <h1>${esc(title)}</h1>
    <p data-msg${text ? '' : ' hidden'}>${esc(text || '')}</p>
    <div class="pin-dots" aria-live="polite" aria-label="Girilen hane sayısı">${'<i></i>'.repeat(len)}</div>
    ${topLabel ? `<button type="button" class="btn ghost faceid-btn" data-top>${esc(topLabel)}</button>` : ''}
    <div class="keypad">
      ${keys.map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}
      ${extraLabel ? `<button type="button" class="txt" data-extra>${esc(extraLabel)}</button>` : '<span></span>'}
      <button type="button" data-k="0">0</button>
      <button type="button" class="txt" data-del aria-label="Sil">Sil</button>
    </div>
    ${cancelLabel ? `<button type="button" class="btn ghost" data-cancel>${esc(cancelLabel)}</button>` : ''}
  `;
  const dots = el.querySelector('.pin-dots');
  const msgEl = el.querySelector('[data-msg]');
  let disabled = false;
  const paint = () => {
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
  };
  const api = {
    el,
    reset(shake) {
      pin = '';
      paint();
      if (shake) {
        dots.classList.remove('shake');
        void dots.offsetWidth;
        dots.classList.add('shake');
      }
    },
    close() {
      el.remove();
      document.removeEventListener('keydown', onKey);
    },
    setMsg(t) {
      msgEl.textContent = t || '';
      msgEl.hidden = !t;
    },
    disable(on) {
      disabled = !!on;
      el.querySelectorAll('[data-k],[data-del]').forEach((b) => (b.disabled = disabled));
      el.classList.toggle('pin-wait', disabled);
    },
  };
  const press = async (k) => {
    if (disabled || pin.length >= len) return;
    pin += k;
    paint();
    if (pin.length === len) {
      const p = pin;
      setTimeout(() => onComplete(p, api), 120);
    }
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) press(b.dataset.k);
    else if (b.hasAttribute('data-del')) {
      pin = pin.slice(0, -1);
      paint();
    } else if (b.hasAttribute('data-extra')) onExtra && onExtra(api);
    else if (b.hasAttribute('data-cancel')) onCancel && onCancel(api);
    else if (b.hasAttribute('data-top')) onTop && onTop(api);
  });
  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') {
      pin = pin.slice(0, -1);
      paint();
    }
  };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  return api;
}

// Kilidi aç — PIN doğru girilene kadar bekler. Yanlış denemelerde kalıcı, kademeli bekleme.
const fmtWait = (ms) => {
  const sec = Math.ceil(ms / 1000);
  return sec >= 60 ? `${Math.ceil(sec / 60)} dk` : `${sec} sn`;
};
export function showLock({ onForgot, allowFaceId = true } = {}) {
  return new Promise(async (resolve) => {
    document.body.classList.add('locked');
    const face = allowFaceId && (await hasFaceId()) && faceIdSupported();
    const len = await pinLength();
    const baseText = face ? 'ya da Face ID ile aç' : '';
    let finished = false;
    let timer = null;
    const finish = (api) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      api.close();
      document.body.classList.remove('locked');
      resolve(true);
    };
    const tryFace = async (api) => {
      if (await verifyFaceId()) finish(api);
    };
    // bekleme süresindeyse geri sayım göster, tuş takımını kapat
    const watchWait = async (api) => {
      clearInterval(timer);
      const tick = async () => {
        const st = await pinLockState();
        if (st.waitMs > 0) {
          api.disable(true);
          api.setMsg(`Çok fazla yanlış deneme. ${fmtWait(st.waitMs)} sonra yeniden dene.${face ? ' Face ID ile açabilirsin.' : ''}`);
        } else {
          api.disable(false);
          api.setMsg(st.count >= 3 ? `Yanlış PIN. ${Math.max(0, 5 - st.count)} deneme sonra bekleme başlar.` : baseText);
          clearInterval(timer);
        }
      };
      await tick();
      timer = setInterval(tick, 1000);
    };
    const kp = keypadScreen({
      title: 'PIN kodunu gir',
      text: baseText,
      len,
      extraLabel: 'Unuttum',
      onExtra: (api) => onForgot && onForgot(api),
      topLabel: face ? 'Face ID ile aç' : '',
      onTop: tryFace,
      onComplete: async (pin, api) => {
        const r = await verifyPin(pin);
        if (r.ok) finish(api);
        else {
          api.reset(true);
          watchWait(api);
        }
      },
    });
    watchWait(kp);
    if (face) tryFace(kp); // açılışta kendiliğinden dene; olmazsa butona dokunulur
  });
}

// Yeni PIN belirleme (iki kez sorar). resolve(true) belirlendi, resolve(false) vazgeçildi
export function setupPinFlow({ title = 'PIN belirle', text = '', allowCancel = true, cancelLabel = 'Vazgeç' } = {}) {
  return new Promise((resolve) => {
    document.body.classList.add('locked');
    const finish = (val, api) => {
      api.close();
      document.body.classList.remove('locked');
      resolve(val);
    };
    const first = keypadScreen({
      title,
      text: text || `${NEW_PIN_LEN} haneli bir PIN seç. Uygulama her açıldığında ve 5 dakikadan uzun arka planda kaldığında sorulur.`,
      len: NEW_PIN_LEN,
      cancelLabel: allowCancel ? cancelLabel : '',
      onCancel: (api) => finish(false, api),
      onComplete: (pin1, api1) => {
        api1.close();
        const second = keypadScreen({
          title: 'PIN\'i tekrar gir',
          len: NEW_PIN_LEN,
          cancelLabel: 'Vazgeç',
          onCancel: (api) => finish(false, api),
          onComplete: async (pin2, api2) => {
            if (pin1 === pin2) {
              await setPin(pin1);
              finish(true, api2);
            } else {
              api2.close();
              document.body.classList.remove('locked');
              setupPinFlow({ title: 'Eşleşmedi, yeniden dene', text: 'İki giriş aynı olmalı.', allowCancel, cancelLabel }).then(resolve);
            }
          },
        });
        void second;
      },
    });
    void first;
  });
}
