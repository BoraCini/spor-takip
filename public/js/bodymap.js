// Ön ve arka vücut haritası (SVG). Bölgeler data/muscles.js'teki REGIONS anahtarlarıyla eşleşir.
import { REGIONS } from './data/muscles.js';

// Silüet: baş, gövde, kollar, bacaklar (bölgelerin altında nötr zemin)
const SIL = `
  <circle cx="100" cy="27" r="17"/>
  <rect x="91" y="40" width="18" height="16" rx="5"/>
  <path d="M64 58 Q100 50 136 58 L142 80 Q140 104 128 118 L126 164 Q100 172 74 164 L72 118 Q60 104 58 80 Z"/>
  <path d="M60 62 Q46 70 44 96 L40 150 Q38 166 44 176 L52 176 Q56 160 56 148 L62 108 Z"/>
  <path d="M140 62 Q154 70 156 96 L160 150 Q162 166 156 176 L148 176 Q144 160 144 148 L138 108 Z"/>
  <path d="M74 160 Q100 170 126 160 L130 196 Q128 236 120 262 L118 330 Q116 348 108 350 L104 350 Q102 300 101 262 L99 262 Q98 300 96 350 L92 350 Q84 348 82 330 L80 262 Q72 236 70 196 Z"/>`;

// [bölge, görünüm, svg şekli]
const SHAPES = [
  // ---- Ön ----
  ['delt_front', 'f', '<ellipse cx="66" cy="70" rx="11" ry="12"/><ellipse cx="134" cy="70" rx="11" ry="12"/>'],
  ['delt_side', 'f', '<ellipse cx="55" cy="76" rx="6" ry="11"/><ellipse cx="145" cy="76" rx="6" ry="11"/>'],
  ['chest_upper', 'f', '<path d="M76 62 Q88 58 99 60 L99 73 L74 73 Z"/><path d="M124 62 Q112 58 101 60 L101 73 L126 73 Z"/>'],
  ['chest_mid', 'f', '<path d="M74 75 L99 75 L99 88 L76 88 Q73 82 74 75 Z"/><path d="M126 75 L101 75 L101 88 L124 88 Q127 82 126 75 Z"/>'],
  ['chest_lower', 'f', '<path d="M77 90 L99 90 L99 100 Q86 102 79 97 Z"/><path d="M123 90 L101 90 L101 100 Q114 102 121 97 Z"/>'],
  ['biceps', 'f', '<ellipse cx="53" cy="104" rx="7.5" ry="15"/><ellipse cx="147" cy="104" rx="7.5" ry="15"/>'],
  ['forearm', 'f', '<path d="M45 124 Q52 122 56 128 L52 166 Q47 168 43 164 Z"/><path d="M155 124 Q148 122 144 128 L148 166 Q153 168 157 164 Z"/>'],
  ['abs', 'f', '<rect x="88" y="106" width="24" height="54" rx="7"/>'],
  ['obliques', 'f', '<path d="M76 110 L86 108 L86 156 L78 154 Q74 132 76 110 Z"/><path d="M124 110 L114 108 L114 156 L122 154 Q126 132 124 110 Z"/>'],
  ['quads', 'f', '<path d="M75 182 Q86 176 97 184 L97 248 Q90 258 82 250 Q72 220 75 182 Z"/><path d="M125 182 Q114 176 103 184 L103 248 Q110 258 118 250 Q128 220 125 182 Z"/>'],
  ['calves', 'f', '<ellipse cx="86" cy="290" rx="6.5" ry="22"/><ellipse cx="114" cy="290" rx="6.5" ry="22"/>'],
  ['adductors', 'f', '<path d="M92 176 L99 180 L98 220 Q93 212 92 196 Z"/><path d="M108 176 L101 180 L102 220 Q107 212 108 196 Z"/>'],
  // ---- Arka ----
  ['traps', 'b', '<path d="M100 46 L124 62 Q112 68 106 84 L100 98 L94 84 Q88 68 76 62 Z"/>'],
  ['delt_rear', 'b', '<ellipse cx="65" cy="71" rx="11" ry="12"/><ellipse cx="135" cy="71" rx="11" ry="12"/>'],
  ['midback', 'b', '<path d="M84 72 L94 84 L98 112 L86 108 Z"/><path d="M116 72 L106 84 L102 112 L114 108 Z"/>'],
  ['lats', 'b', '<path d="M74 84 L84 90 L88 112 L98 116 L96 138 Q84 132 77 122 Q71 104 74 84 Z"/><path d="M126 84 L116 90 L112 112 L102 116 L104 138 Q116 132 123 122 Q129 104 126 84 Z"/>'],
  ['lowback', 'b', '<rect x="89" y="138" width="22" height="22" rx="6"/>'],
  ['triceps', 'b', '<ellipse cx="53" cy="102" rx="7.5" ry="16"/><ellipse cx="147" cy="102" rx="7.5" ry="16"/>'],
  ['forearm', 'b', '<path d="M45 124 Q52 122 56 128 L52 166 Q47 168 43 164 Z"/><path d="M155 124 Q148 122 144 128 L148 166 Q153 168 157 164 Z"/>'],
  ['glutes', 'b', '<ellipse cx="88" cy="180" rx="13" ry="14"/><ellipse cx="112" cy="180" rx="13" ry="14"/>'],
  ['abductors', 'b', '<ellipse cx="73" cy="176" rx="4.5" ry="10"/><ellipse cx="127" cy="176" rx="4.5" ry="10"/>'],
  ['hamstrings', 'b', '<path d="M76 196 Q87 192 97 198 L96 250 Q88 258 81 250 Q74 222 76 196 Z"/><path d="M124 196 Q113 192 103 198 L104 250 Q112 258 119 250 Q126 222 124 196 Z"/>'],
  ['calves', 'b', '<ellipse cx="88" cy="292" rx="8" ry="24"/><ellipse cx="112" cy="292" rx="8" ry="24"/>'],
];

// level: 0 boş, 1-4 artan yoğunluk
function figure(view, levelOf, titleOf) {
  const shapes = SHAPES.filter((s) => s[1] === view)
    .map(([k, , d]) => {
      const lv = levelOf(k);
      return `<g class="bm-r bm-l${lv}" data-region="${k}"><title>${titleOf(k)}</title>${d}</g>`;
    })
    .join('');
  return `<svg class="bm-fig" viewBox="30 4 140 352" role="img" aria-label="${view === 'f' ? 'Ön' : 'Arka'} görünüm">
    <g class="bm-sil">${SIL}</g>${shapes}</svg>`;
}

// values: { bölge: sayı }. mode 'heat' → set sayısına göre; 'exercise' → birincil (2) / ikincil (1)
export function bodyMapSVG(values, { mode = 'heat', unit = 'set' } = {}) {
  const lvl = (k) => {
    const v = values[k] || 0;
    if (mode === 'exercise') return v >= 2 ? 4 : v >= 1 ? 2 : 0;
    if (v <= 0) return 0;
    if (v < 4) return 1;
    if (v < 10) return 2;
    if (v < 20) return 3;
    return 4;
  };
  const title = (k) => {
    const v = values[k] || 0;
    const l = REGIONS[k] ? REGIONS[k].label : k;
    if (mode === 'exercise') return `${l}${v >= 2 ? ' (birincil)' : v >= 1 ? ' (ikincil)' : ''}`;
    return `${l}: ${String(Math.round(v * 10) / 10).replace('.', ',')} ${unit}`;
  };
  return `<div class="bm">${figure('f', lvl, title)}${figure('b', lvl, title)}</div>
    <div class="bm-cap"><span>Ön</span><span>Arka</span></div>`;
}

export function heatLegend() {
  return `<div class="bm-legend" aria-hidden="true"><span>Az</span><i class="bm-l1"></i><i class="bm-l2"></i><i class="bm-l3"></i><i class="bm-l4"></i><span>Çok</span></div>
    <p class="small muted" style="margin:6px 0 0;line-height:17px">Haftalık set sayısı: birincil kas 1 set, yardımcı kas yarım set sayılır. Isınma setleri sayılmaz. Çoğu kas için haftada 10–20 set etkili bir aralıktır.</p>`;
}
