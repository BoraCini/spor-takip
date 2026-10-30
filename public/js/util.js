// Ortak yardımcılar: kaçış, tarih, sayı biçimi, ikonlar, alt sayfa (sheet), bildirim

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '–';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

export function parseNum(v) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return NaN;
  return Number(s);
}

export const round1 = (n) => Math.round(n * 10) / 10;

// ---- Tarihler (yerel saat, YYYY-MM-DD) ----
export function dateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const today = () => dateStr(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
// Pazartesi = 0 ... Pazar = 6
export function weekday(s) {
  return (parseDate(s).getDay() + 6) % 7;
}
export function weekStart(s) {
  return addDays(s, -weekday(s));
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export const WD_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const WD_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function trDate(s, withWeekday = false) {
  const d = parseDate(s);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withWeekday ? `${WD_LONG[weekday(s)]}, ${base}` : base;
}
export function trDateYear(s) {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function relDay(s) {
  const t = today();
  if (s === t) return 'Bugün';
  if (s === addDays(t, -1)) return 'Dün';
  if (s === addDays(t, 1)) return 'Yarın';
  return trDate(s, true);
}
export function timeStr(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function debounce(fn, ms = 400) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// ---- İkonlar ----
const S = (inner, w = 22) =>
  `<svg class="ico" width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
export const icon = {
  person: S('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  camera: S('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  send: S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  calendar: S('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  syringe: S('<path d="M14.5 4.5l5 5M17 7l-9 9-3-3 9-9M6.5 17.5L3.5 20.5M10.5 9.5l1.5 1.5M8.5 11.5L10 13"/>'),
  pill: S('<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M9.2 9.2l5.6 5.6"/>'),
  dots: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  left: S('<path d="M15 6l-6 6 6 6"/>'),
  right: S('<path d="M9 6l6 6-6 6"/>'),
  edit: S('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  chart: S('<path d="M4 19h16M7 16V10M12 16V6M17 16v-4"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  bolt: S('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>'),
  book: S('<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>'),
  barcode: S('<path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" stroke-width="1.6"/>'),
  drop: S('<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>'),
  copy: S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  speaker: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  speakerOff: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  up: S('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: S('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  photo: S('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l4.5-4.5 3 3L15 12l5 5"/>'),
  file: S('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5M9 13h6M9 16.5h4"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.6 2.4 2.8-.6.6 2.8 2.4 1.6-1.3 2.6 1.3 2.6-2.4 1.6-.6 2.8-2.8-.6L12 21.2l-1.6-2.4-2.8.6-.6-2.8-2.4-1.6L5.9 12 4.6 9.4 7 7.8l.6-2.8 2.8.6z"/>'),
  sparkle: S('<path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
};

// ---- Profil resmi (ayarlarda data URL olarak saklanır; açılışta önbelleğe alınır) ----
let avatarCache = null;
export function setAvatarCache(v) {
  avatarCache = v || null;
}
export function avatarHTML(name = '') {
  if (avatarCache) return `<img class="avatar-img" src="${avatarCache}" alt="">`;
  const ch = (name || '').trim().charAt(0).toLocaleUpperCase('tr-TR');
  return ch ? `<span class="avatar-ch" aria-hidden="true">${esc(ch)}</span>` : icon.person;
}

// ---- Bildirim (toast) ----
let toastTimer;
export function toast(msg, ms = 2200, action = null) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('has-act', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-act';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      el.hidden = true;
      clearTimeout(toastTimer);
      action.onClick();
    });
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), action ? Math.max(ms, 4500) : ms);
}

// ---- Sola kaydırınca sil (iOS listeleri gibi) ----
// swipeDelete(container, selector, onDelete(row)) — satır sola çekilince arkasındaki kırmızı "Sil" görünür;
// düğmeye dokununca ya da satır sonuna kadar çekilince onDelete çağrılır.
const SW_BTN = 84;
let swOpen = null; // { row, btn }
function swClose(anim = true) {
  if (!swOpen) return;
  const { row, btn } = swOpen;
  swOpen = null;
  row.style.transition = anim ? 'transform .22s ease' : '';
  row.style.transform = '';
  btn.style.transition = anim ? 'width .22s ease' : '';
  btn.style.width = '0px';
  setTimeout(() => {
    btn.remove();
    row.classList.remove('sw-active');
    if (row.parentElement) row.parentElement.classList.remove('sw-host');
  }, anim ? 230 : 0);
}
document.addEventListener(
  'pointerdown',
  (e) => {
    if (swOpen && !swOpen.row.contains(e.target) && !swOpen.btn.contains(e.target)) swClose();
  },
  true
);
export function swipeDelete(container, selector, onDelete, label = 'Sil') {
  if (!container || container.dataset.swipe === selector) return;
  container.dataset.swipe = selector;
  container.style.touchAction = 'pan-y';
  let st = null;
  const makeBtn = (row) => {
    const host = row.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sw-del';
    btn.innerHTML = `<span>${icon.trash}<span>${esc(label)}</span></span>`;
    btn.setAttribute('aria-label', label);
    btn.style.top = row.offsetTop + 'px';
    btn.style.height = row.offsetHeight + 'px';
    btn.style.right = Math.max(0, host.clientWidth - row.offsetLeft - row.offsetWidth) + 'px';
    btn.style.width = '0px';
    if (row.offsetHeight > 120) btn.classList.add('tall');
    host.classList.add('sw-host');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await doDelete(row, btn);
    });
    host.appendChild(btn);
    row.classList.add('sw-active');
    return btn;
  };
  const doDelete = async (row, btn) => {
    swOpen = null;
    row.style.transition = 'transform .2s ease, opacity .2s ease';
    row.style.transform = 'translateX(-100%)';
    row.style.opacity = '0';
    btn.style.transition = 'width .2s ease';
    btn.style.width = row.offsetWidth + 'px';
    await new Promise((r) => setTimeout(r, 180));
    try {
      await onDelete(row);
    } finally {
      btn.remove();
      if (row.parentElement) row.parentElement.classList.remove('sw-host');
      if (row.isConnected) {
        row.style.transition = '';
        row.style.transform = '';
        row.style.opacity = '';
        row.classList.remove('sw-active');
      }
    }
  };
  container.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.swipeClaimed) return;
    const row = e.target.closest(selector);
    if (!row || !container.contains(row) || e.target.closest('input,textarea,select,.no-swipe')) return;
    e.swipeClaimed = true;
    if (swOpen && swOpen.row !== row) swClose();
    st = { row, x: e.clientX, y: e.clientY, base: swOpen && swOpen.row === row ? -SW_BTN : 0, drag: false, id: e.pointerId };
  });
  container.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.drag) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return (st = null);
      if (Math.abs(dx) < 10) return;
      if (dx > 0 && st.base === 0) return (st = null);
      st.drag = true;
      st.w = st.row.offsetWidth;
      if (!swOpen || swOpen.row !== st.row) swOpen = { row: st.row, btn: makeBtn(st.row) };
      st.row.style.transition = '';
      try {
        st.row.setPointerCapture(e.pointerId);
      } catch {}
    }
    const x = Math.min(0, st.base + dx);
    st.x2 = x;
    st.row.style.transform = `translateX(${x}px)`;
    if (swOpen) swOpen.btn.style.width = -x + 'px';
  });
  const end = async (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    if (!s.drag) return;
    // sürüklemeden sonra gelen tıklamayı yut
    const eat = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    s.row.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => s.row.removeEventListener('click', eat, { capture: true }), 350);
    const x = s.x2 || 0;
    if (!swOpen) return;
    if (-x > s.w * 0.6) return doDelete(s.row, swOpen.btn);
    if (-x > SW_BTN * 0.5) {
      s.row.style.transition = 'transform .22s ease';
      s.row.style.transform = `translateX(${-SW_BTN}px)`;
      swOpen.btn.style.transition = 'width .22s ease';
      swOpen.btn.style.width = SW_BTN + 'px';
    } else swClose();
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', (e) => {
    if (st && st.drag) end(e);
    else st = null;
  });
}

// ---- Alt sayfa (sheet) ----
// openSheet({ title, body, left, right, onMount, onClose }) -> { el, close, setBody }
// iOS: klavye açılınca görünür alanı takip et; pencereler bu alana sabitlenir, kaymaz
(function trackViewport() {
  const vv = window.visualViewport;
  const r = document.documentElement;
  const typing = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button'].includes(a.type)));
  };
  const sync = () => {
    r.style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
    r.style.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px');
  };
  sync();
  if (vv) {
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
  }
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', () => setTimeout(sync, 300));
  // iOS: klavye kapanınca sayfa kaymış kalabiliyor, altta boşluk oluşuyor; yerine oturt
  document.addEventListener('focusout', () =>
    setTimeout(() => {
      if (typing()) return;
      window.scrollTo(window.scrollX, window.scrollY);
      sync();
    }, 120)
  );
  // Sayı alanına dokununca içeriği seç: yazınca eskisi silinsin
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.tagName === 'INPUT' && /decimal|numeric/.test(t.getAttribute('inputmode') || '') && t.value) {
      setTimeout(() => {
        try {
          t.setSelectionRange(0, t.value.length);
        } catch {}
      }, 0);
    }
  });
})();

const syncSheetLock = () => document.body.classList.toggle('sheet-open', !!document.querySelector('.sheet-backdrop'));

export function openSheet({ title = '', body = '', leftLabel = 'Kapat', rightLabel = '', onRight, onMount, onClose, size = 'full' } = {}) {
  const root = document.getElementById('overlay-root');
  const back = document.createElement('div');
  back.className = `sheet-backdrop ${size === 'auto' ? 'sheet-auto' : 'sheet-full'}`;
  back.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-hd">
        <button type="button" class="btn ghost" data-sheet-close>${esc(leftLabel)}</button>
        <h2>${esc(title)}</h2>
        ${rightLabel ? `<button type="button" class="btn ghost" data-sheet-right style="font-weight:700">${esc(rightLabel)}</button>` : '<span style="width:64px"></span>'}
      </div>
      <div class="sheet-bd"></div>
    </div>`;
  const bd = back.querySelector('.sheet-bd');
  bd.innerHTML = body;
  let closed = false;
  const api = {
    el: bd,
    sheet: back.querySelector('.sheet'),
    close() {
      if (closed) return;
      closed = true;
      back.remove();
      syncSheetLock();
      document.removeEventListener('keydown', onKey);
      onClose && onClose();
    },
    setBody(html) {
      bd.innerHTML = html;
    },
  };
  const onKey = (e) => {
    if (e.key === 'Escape') api.close();
  };
  back.addEventListener('click', (e) => {
    if (e.target === back) api.close();
  });
  back.querySelector('[data-sheet-close]').addEventListener('click', () => api.close());
  const rb = back.querySelector('[data-sheet-right]');
  if (rb) rb.addEventListener('click', () => onRight && onRight(api));
  document.addEventListener('keydown', onKey);
  root.appendChild(back);
  syncSheetLock();
  onMount && onMount(api);
  return api;
}

export function confirmSheet({ title, text, okLabel = 'Tamam', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const s = openSheet({
      title,
      size: 'auto',
      leftLabel: 'Vazgeç',
      body: `
        <p style="font-size:16px;line-height:22px;margin:4px 4px 16px">${esc(text)}</p>
        <button type="button" class="btn block ${danger ? 'danger' : 'primary'}" data-ok
          style="${danger ? 'background:var(--card)' : ''}">${esc(okLabel)}</button>`,
      onClose: () => resolve(result),
    });
    s.el.querySelector('[data-ok]').addEventListener('click', () => {
      result = true;
      s.close();
    });
  });
}

// Basit markdown → HTML (AI cevapları için; önce kaçış yapılır)
export function miniMarkdown(src) {
  const lines = esc(src).split('\n');
  let html = '';
  let list = null;
  const inline = (t) =>
    t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };
  let para = [];
  const flush = () => {
    if (para.length) {
      html += `<p>${inline(para.join('<br>'))}</p>`;
      para = [];
    }
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if (/^#{1,4}\s+/.test(l)) {
      flush();
      closeList();
      html += `<h3>${inline(l.replace(/^#{1,4}\s+/, ''))}</h3>`;
    } else if ((m = l.match(/^\s*[-•*]\s+(.*)/))) {
      flush();
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      flush();
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${inline(m[1])}</li>`;
    } else if (l.trim() === '') {
      flush();
      closeList();
    } else {
      closeList();
      para.push(l);
    }
  }
  flush();
  closeList();
  return html;
}

// Basit çizgi grafik (SVG) — points: [{label, value}], band: [low, high]
export function lineChartSVG(points, { band, w = 326, h = 110, color = 'var(--accent)', unit = '' } = {}) {
  if (!points.length) return '';
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (band) {
    if (band[0] != null) lo = Math.min(lo, band[0]);
    if (band[1] != null) hi = Math.max(hi, band[1]);
  }
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  lo -= pad;
  hi += pad;
  const top = 10;
  const bottom = h - 24;
  const x = (i) => (points.length === 1 ? w / 2 : 20 + (i * (w - 40)) / (points.length - 1));
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  let out = `<svg class="trend" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(
    points.map((p) => `${p.label}: ${fmt(p.value, 2)} ${unit}`).join(', ')
  )}">`;
  if (band) {
    const b0 = band[0] != null ? y(band[0]) : top;
    const b1 = band[1] != null ? y(band[1]) : bottom;
    out += `<rect x="0" y="${Math.min(b0, b1)}" width="${w}" height="${Math.abs(b0 - b1)}" fill="var(--fill2)"/>`;
  }
  out += `<polyline points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  points.forEach((p, i) => {
    out += `<circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" fill="var(--card)" stroke="${color}" stroke-width="2"/>`;
  });
  // Etiketler üst üste binmesin: ilk ve son her zaman, aradakiler yeterli boşluk varsa
  const GAP = 96;
  const last = points.length - 1;
  const show = new Set([last]);
  let prevX = -Infinity;
  for (let i = 0; i < last; i++) {
    if (x(i) - prevX >= GAP && x(last) - x(i) >= GAP) {
      show.add(i);
      prevX = x(i);
    }
  }
  points.forEach((p, i) => {
    if (show.has(i)) {
      const anchor = i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle';
      out += `<text x="${x(i)}" y="${h - 6}" text-anchor="${anchor}">${esc(p.label)} · ${esc(fmt(p.value, 1))}</text>`;
    }
  });
  out += '</svg>';
  return out;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function downloadOrShare(filename, content, mime) {
  const file = new File([content], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file], title: filename }).catch(() => {});
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
