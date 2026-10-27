// PIN kilidi: PIN düz metin saklanmaz; rastgele tuz + PBKDF2-SHA256 özeti saklanır.
import * as db from './db.js';
import { esc } from './util.js';

const PIN_LEN = 4;
const ITER = 150000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin, saltBytes) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: ITER }, key, 256);
  return b64(bits);
}

export async function hasPin() {
  return !!(await db.getSetting('pin_hash'));
}

export async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt);
  await db.setSetting('pin_salt', b64(salt));
  await db.setSetting('pin_hash', hash);
}

export async function clearPin() {
  await db.remove('settings', 'pin_hash');
  await db.remove('settings', 'pin_salt');
}

export async function verifyPin(pin) {
  const hash = await db.getSetting('pin_hash');
  const salt = await db.getSetting('pin_salt');
  if (!hash || !salt) return true;
  return (await derive(pin, unb64(salt))) === hash;
}

// Tuş takımlı tam ekran; mode: 'unlock' | 'set' | 'confirm'
function keypadScreen({ title, text, onComplete, extraLabel, onExtra, cancelLabel, onCancel }) {
  const el = document.createElement('div');
  el.className = 'lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  let pin = '';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  el.innerHTML = `
    <img class="logo" src="icons/icon-180.png" alt="">
    <h1>${esc(title)}</h1>
    ${text ? `<p>${esc(text)}</p>` : ''}
    <div class="pin-dots" aria-live="polite" aria-label="Girilen hane sayısı">${'<i></i>'.repeat(PIN_LEN)}</div>
    <div class="keypad">
      ${keys.map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}
      ${extraLabel ? `<button type="button" class="txt" data-extra>${esc(extraLabel)}</button>` : '<span></span>'}
      <button type="button" data-k="0">0</button>
      <button type="button" class="txt" data-del aria-label="Sil">Sil</button>
    </div>
    ${cancelLabel ? `<button type="button" class="btn ghost" data-cancel>${esc(cancelLabel)}</button>` : ''}
  `;
  const dots = el.querySelector('.pin-dots');
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
  };
  const press = async (k) => {
    if (pin.length >= PIN_LEN) return;
    pin += k;
    paint();
    if (pin.length === PIN_LEN) {
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

// Kilidi aç — PIN doğru girilene kadar bekler
export function showLock({ onForgot } = {}) {
  return new Promise((resolve) => {
    document.body.classList.add('locked');
    keypadScreen({
      title: 'PIN kodunu gir',
      extraLabel: 'Unuttum',
      onExtra: (api) => onForgot && onForgot(api),
      onComplete: async (pin, api) => {
        if (await verifyPin(pin)) {
          api.close();
          document.body.classList.remove('locked');
          resolve(true);
        } else api.reset(true);
      },
    });
  });
}

// Yeni PIN belirleme (iki kez sorar). resolve(true) belirlendi, resolve(false) vazgeçildi
export function setupPinFlow({ title = 'PIN belirle', text = '', allowCancel = true } = {}) {
  return new Promise((resolve) => {
    document.body.classList.add('locked');
    const finish = (val, api) => {
      api.close();
      document.body.classList.remove('locked');
      resolve(val);
    };
    const first = keypadScreen({
      title,
      text: text || `${PIN_LEN} haneli bir PIN seç. Uygulama her açıldığında ve 5 dakikadan uzun arka planda kaldığında sorulur.`,
      cancelLabel: allowCancel ? 'Vazgeç' : '',
      onCancel: (api) => finish(false, api),
      onComplete: (pin1, api1) => {
        api1.close();
        const second = keypadScreen({
          title: 'PIN\'i tekrar gir',
          cancelLabel: 'Vazgeç',
          onCancel: (api) => finish(false, api),
          onComplete: async (pin2, api2) => {
            if (pin1 === pin2) {
              await setPin(pin1);
              finish(true, api2);
            } else {
              api2.close();
              document.body.classList.remove('locked');
              setupPinFlow({ title: 'Eşleşmedi, yeniden dene', text: 'İki giriş aynı olmalı.', allowCancel }).then(resolve);
            }
          },
        });
        void second;
      },
    });
    void first;
  });
}
