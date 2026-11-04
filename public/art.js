// Presentation art for Raidbreaker. The slot engine keeps its own fallback
// icons. Register a replacement here and the client uses it everywhere.
//
// Markup (SVG string), used for reels, gear, classes, and boss portraits:
//   RaidArt.register('sym:R', '<svg ...>...</svg>');
//
// Images, used by the raid stage once they finish loading:
//   RaidArt.registerImage('stage:backdrop', 'art/hall.webp');
//   RaidArt.registerImage('stage:hero', 'art/hero.webp');
//   RaidArt.registerImage('stage:boss:Gravelord Okk', 'art/okk.webp');
//
// Unknown ids fall back to procedural drawing or the engine icon.
(function (root) {
  'use strict';

  const markup = Object.create(null);
  const images = Object.create(null);

  function register(id, svg) {
    if (typeof svg === 'string' && svg) markup[id] = svg;
  }

  function registerImage(id, src) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { img.dataset.ready = '1'; };
    img.src = src;
    images[id] = img;
  }

  function svg(id, fallback) {
    return markup[id] || fallback || '';
  }

  function image(id) {
    const img = images[id];
    return img && img.dataset.ready === '1' ? img : null;
  }

  function seal(uid, accent, glyph) {
    return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="${uid}bg" cx="50%" cy="36%" r="64%"><stop offset="0%" stop-color="${accent}"/><stop offset="58%" stop-color="#14090c"/><stop offset="100%" stop-color="#050304"/></radialGradient><linearGradient id="${uid}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff6d8"/><stop offset="42%" stop-color="#c4923a"/><stop offset="100%" stop-color="#3d2a10"/></linearGradient></defs><circle cx="40" cy="40" r="38" fill="#070506"/><circle cx="40" cy="40" r="35" fill="none" stroke="url(#${uid}rim)" stroke-width="3.4"/><circle cx="40" cy="40" r="30.5" fill="url(#${uid}bg)" stroke="#2a1a12" stroke-width="1"/>${glyph}</svg>`;
  }

  const rune = (d, glow) => `<path d="${d}" fill="none" stroke="${glow}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/><path d="${d}" fill="none" stroke="#fff8e8" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>`;

  register('sym:R', seal('sr', '#ef233c', rune('M28 22 H40 L52 34 V52 H28 Z M34 28 V46', '#ff4d6d')));
  register('sym:S', seal('ss', '#0284c7', rune('M50 22 L30 34 L52 42 L32 56', '#7dd3fc')));
  register('sym:T', seal('st', '#d97706', rune('M40 20 V56 M26 34 L40 20 L54 34', '#fbbf24')));
  register('sym:O', seal('so', '#6d28d9', rune('M28 54 L48 36 L38 22 L30 36 L52 54', '#c4b5fd')));
  register('sym:E', seal('se', '#059669', rune('M28 24 V56 M52 24 V56 M28 26 L40 40 L52 26', '#6ee7b7')));
  register('sym:A', seal('sa', '#c026d3', rune('M32 22 V58 M32 26 L52 36 M32 40 L50 50', '#f0abfc')));
  register('sym:WAR', seal('sw', '#b91c1c', '<path d="M22 58 L58 22 M24 22 L60 58" stroke="#f8fafc" stroke-width="4" stroke-linecap="round"/><path d="M22 58 L58 22 M24 22 L60 58" stroke="#ef4444" stroke-width="1.4" stroke-linecap="round"/><path d="M18 30 C10 18 22 12 26 22" fill="#eab308" stroke="#451a03" stroke-width="1"/>'));
  register('sym:MAG', seal('sm', '#2563eb', '<circle cx="40" cy="40" r="12" fill="#0c1a3a" stroke="#e0f2fe" stroke-width="2"/><circle cx="40" cy="40" r="5" fill="#7dd3fc"/><ellipse cx="40" cy="40" rx="22" ry="8" fill="none" stroke="#fde68a" stroke-width="1.6" transform="rotate(-28 40 40)"/>'));
  register('sym:ROG', seal('sro', '#047857', '<path d="M24 56 L52 24" stroke="#d1fae5" stroke-width="4" stroke-linecap="round"/><path d="M56 56 L28 24" stroke="#6ee7b7" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="56" r="3" fill="#fbbf24"/><circle cx="56" cy="56" r="3" fill="#fbbf24"/>'));
  register('sym:PRI', seal('sp', '#ca8a04', '<path d="M40 18 V58 M26 32 H54" stroke="#fff7d6" stroke-width="4" stroke-linecap="round"/><circle cx="40" cy="32" r="7" fill="none" stroke="#fde68a" stroke-width="2"/>'));
  register('sym:W', seal('swi', '#9f1239', '<path d="M28 22 H52 L48 48 L40 58 L32 48 Z" fill="#7f1d1d" stroke="#fde68a" stroke-width="2"/><path d="M40 28 L43 36 H52 L45 41 L48 50 L40 45 L32 50 L35 41 L28 36 H37 Z" fill="#fbbf24"/>'));
  register('sym:B', seal('sb', '#9f1239', '<path d="M26 58 V34 C26 22 54 22 54 34 V58 Z" fill="#1c1917" stroke="#fda4af" stroke-width="2"/><path d="M32 40 H36 M44 40 H48 M34 48 H46" stroke="#fde047" stroke-width="2.4" stroke-linecap="round"/><circle cx="34" cy="40" r="2" fill="#ef4444"/><circle cx="46" cy="40" r="2" fill="#ef4444"/>'));

  const item = (uid, accent, glyph) => seal(uid, accent, glyph);
  register('gear:helm', item('gh', '#64748b', '<path d="M26 36 L40 24 L54 36 L52 54 L40 60 L28 54 Z" fill="#94a3b8" stroke="#0f172a" stroke-width="2"/><path d="M26 36 L40 42 L54 36" fill="none" stroke="#fbbf24" stroke-width="2"/>'));
  register('gear:cloak', item('gc', '#6b21a8', '<path d="M28 24 H52 L58 58 L46 52 L40 60 L34 52 L22 58 Z" fill="#581c87" stroke="#fbbf24" stroke-width="2"/>'));
  register('gear:gauntlets', item('gg', '#475569', '<path d="M30 28 L34 18 H40 L42 28 L48 20 L52 32 L48 56 H32 Z" fill="#94a3b8" stroke="#0f172a" stroke-width="2"/><path d="M32 40 H50" stroke="#fbbf24" stroke-width="2.4"/>'));
  register('gear:boots', item('gbo', '#334155', '<path d="M30 20 H44 V40 L56 46 V56 H26 V40 Z" fill="#64748b" stroke="#0f172a" stroke-width="2"/><path d="M26 50 H56" stroke="#fbbf24" stroke-width="2.4"/>'));
  register('gear:amulet', item('ga', '#b45309', '<path d="M26 26 C26 40 54 40 54 26" fill="none" stroke="#fbbf24" stroke-width="2.4"/><polygon points="40,30 52,42 40,58 28,42" fill="#dc2626" stroke="#fde68a" stroke-width="1.6"/>'));
  register('gear:ring', item('gr', '#7e22ce', '<circle cx="40" cy="44" r="12" fill="none" stroke="#d97706" stroke-width="5"/><polygon points="40,18 48,30 40,36 32,30" fill="#a855f7" stroke="#fde68a" stroke-width="1.5"/>'));

  register('hero:warrior', seal('hw', '#991b1b', '<path d="M24 56 L56 24 M26 24 L58 56" stroke="#fee2e2" stroke-width="4" stroke-linecap="round"/><path d="M40 18 L46 28 H36 Z" fill="#fbbf24"/>'));
  register('hero:rogue', seal('hr', '#065f46', '<path d="M26 54 L50 26 M54 54 L30 26" stroke="#a7f3d0" stroke-width="3.4" stroke-linecap="round"/>'));
  register('hero:mage', seal('hm', '#1d4ed8', '<circle cx="40" cy="40" r="10" fill="#0ea5e9" stroke="#e0f2fe" stroke-width="2"/><path d="M40 22 V30 M40 50 V58 M22 40 H30 M50 40 H58" stroke="#fde68a" stroke-width="2"/>'));
  register('hero:hunter', seal('hh', '#166534', '<path d="M24 48 C40 28 52 30 58 24" fill="none" stroke="#fde68a" stroke-width="3"/><path d="M52 22 L60 24 L54 30 Z" fill="#4ade80"/>'));
  register('hero:priest', seal('hp', '#a16207', '<path d="M40 20 V58 M24 34 H56" stroke="#fff7d6" stroke-width="4" stroke-linecap="round"/>'));

  function face(uid, fill, stroke, inner) {
    return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${uid}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a2a14"/><stop offset="100%" stop-color="#120c08"/></linearGradient></defs><path d="M10 18 L40 6 L70 18 L66 58 L40 76 L14 58 Z" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/><path d="M14 20 L40 10 L66 20 L63 56 L40 70 L17 56 Z" fill="none" stroke="url(#${uid}p)" stroke-width="2"/>${inner}</svg>`;
  }

  register('boss:Gravelord Okk', face('bk', '#07140f', '#34d399', '<path d="M22 28 C14 16 22 10 28 18 M58 28 C66 16 58 10 52 18" fill="#d6d3d1"/><path d="M24 30 H56 L52 58 H28 Z" fill="#1c1917"/><path d="M30 40 H36 M44 40 H50" stroke="#34d399" stroke-width="3" stroke-linecap="round"/><path d="M32 50 H48" stroke="#14532d" stroke-width="3"/>'));
  register('boss:Sister Venn', face('bv', '#2a0612', '#fb7185', '<path d="M22 62 L30 22 H50 L58 62 Z" fill="#4c0519"/><circle cx="34" cy="36" r="3" fill="#fecdd3"/><circle cx="46" cy="36" r="3" fill="#fecdd3"/><circle cx="40" cy="28" r="2" fill="#fecdd3"/><path d="M33 46 C36 52 44 52 47 46" fill="none" stroke="#fb7185" stroke-width="2"/>'));
  register('boss:The Ashen Wyrm', face('bw', '#2a0c04', '#fb923c', '<path d="M16 30 L28 18 L40 28 L52 16 L64 30 L56 58 L24 58 Z" fill="#1c1917" stroke="#f97316" stroke-width="1.6"/><path d="M30 40 H36 M44 40 H50" stroke="#fde047" stroke-width="3"/><path d="M34 50 Q40 58 46 50" fill="#f97316"/>'));
  register('boss:The Hollow King', face('bh', '#14081f', '#c084fc', '<path d="M22 26 L28 12 L36 24 L40 10 L44 24 L52 12 L58 26 L54 62 H26 Z" fill="#090514" stroke="#e9d5ff" stroke-width="1.4"/><path d="M32 40 H36 M44 40 H48" stroke="#e9d5ff" stroke-width="2.4"/>'));
  register('boss:The Unseen', face('bu', '#070412', '#fde047', '<ellipse cx="40" cy="40" rx="18" ry="10" fill="#fef08a"/><circle cx="40" cy="40" r="5" fill="#3b0764"/><circle cx="22" cy="24" r="2" fill="#fde047"/><circle cx="58" cy="24" r="2" fill="#fde047"/><circle cx="22" cy="56" r="2" fill="#e879f9"/><circle cx="58" cy="56" r="2" fill="#e879f9"/>'));

  root.RaidArt = { register, registerImage, svg, image, ids: () => Object.keys(markup) };
})(typeof window !== 'undefined' ? window : globalThis);
