// Raidbreaker slot engine. Pure and deterministic: the same seeds and player
// choices always produce the same round, which is what makes the verifier work.
//
// Randomness comes from `rngFor(channel)`, one independent stream per channel:
//   ''        base spin, loot and ascension rolls (or the buy roll)
//   'gamble'  one float per gamble attempt
//   'raid'    the bonus raid
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Game = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REELS = 5;
  const ROWS = 4;
  const MAX_FREE_SPINS = 300;
  const BUY_RTP = 0.9875;

  const SYMBOLS = {
    R: { name: 'Ruby Rune', kind: 'low', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="stR" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3a1c28"/><stop offset="50%" stop-color="#1f0d16"/><stop offset="100%" stop-color="#0d0509"/></linearGradient><radialGradient id="gemR" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="#ff9ebb"/><stop offset="35%" stop-color="#ef233c"/><stop offset="75%" stop-color="#8d0801"/><stop offset="100%" stop-color="#3b0208"/></radialGradient><linearGradient id="gldR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff3b0"/><stop offset="50%" stop-color="#e09f3e"/><stop offset="100%" stop-color="#6b3e08"/></linearGradient></defs><polygon points="40,4 70,18 74,40 66,66 40,76 14,66 6,40 10,18" fill="url(#stR)" stroke="#070306" stroke-width="3"/><polygon points="40,8 66,20 69,40 62,62 40,71 18,62 11,40 14,20" fill="none" stroke="#5c2838" stroke-width="1.5"/><path d="M34,6 L40,3 L46,6 L43,13 L37,13 Z M34,74 L40,77 L46,74 L43,67 L37,67 Z M7,34 L3,40 L7,46 L13,43 L13,37 Z M73,34 L77,40 L73,46 L67,43 L67,37 Z" fill="url(#gldR)" stroke="#1c0d06" stroke-width="1.2"/><polygon points="40,12 62,24 62,56 40,68 18,56 18,24" fill="url(#gemR)" stroke="#ffccd5" stroke-width="1.2"/><polygon points="40,12 62,24 40,34 18,24" fill="#ffffff" opacity="0.22"/><polygon points="18,24 40,34 40,68 18,56" fill="#000000" opacity="0.28"/><path d="M31,21 L31,59 M31,22 L49,30 L31,40 L50,57" fill="none" stroke="#ff2a55" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/><path d="M31,21 L31,59 M31,22 L49,30 L31,40 L50,57" fill="none" stroke="#fff8d6" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="22" r="2.2" fill="#ffffff" opacity="0.85"/></svg>', pays: [0.1, 0.25, 0.65] },
    S: { name: 'Sapphire Rune', kind: 'low', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="stS" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1c2d42"/><stop offset="55%" stop-color="#0f1826"/><stop offset="100%" stop-color="#060a12"/></linearGradient><radialGradient id="gemS" cx="38%" cy="32%" r="65%"><stop offset="0%" stop-color="#caf0f8"/><stop offset="35%" stop-color="#0096c7"/><stop offset="75%" stop-color="#023e8a"/><stop offset="100%" stop-color="#03045e"/></radialGradient><linearGradient id="slvS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="50%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#334155"/></linearGradient></defs><polygon points="40,4 68,16 75,40 68,64 40,76 12,64 5,40 12,16" fill="url(#stS)" stroke="#05080f" stroke-width="3"/><path d="M40,3 L47,11 L40,15 L33,11 Z M40,77 L47,69 L40,65 L33,69 Z M4,40 L12,33 L15,40 L12,47 Z M76,40 L68,33 L65,40 L68,47 Z" fill="url(#slvS)" stroke="#090d16" stroke-width="1.2"/><polygon points="40,12 63,26 57,58 40,68 23,58 17,26" fill="url(#gemS)" stroke="#ade8f4" stroke-width="1.2"/><polygon points="40,12 63,26 40,36 17,26" fill="#ffffff" opacity="0.25"/><path d="M48,20 L29,36 L51,44 L31,60" fill="none" stroke="#00f5d4" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/><path d="M48,20 L29,36 L51,44 L31,60" fill="none" stroke="#f0fdfa" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="31" cy="22" r="2.2" fill="#ffffff" opacity="0.9"/></svg>', pays: [0.1, 0.25, 0.65] },
    T: { name: 'Topaz Rune', kind: 'low', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="stT" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#3d2914"/><stop offset="55%" stop-color="#211509"/><stop offset="100%" stop-color="#0d0803"/></linearGradient><radialGradient id="gemT" cx="40%" cy="30%" r="68%"><stop offset="0%" stop-color="#fffbeb"/><stop offset="35%" stop-color="#f59e0b"/><stop offset="75%" stop-color="#b45309"/><stop offset="100%" stop-color="#451a03"/></radialGradient></defs><polygon points="26,5 54,5 75,26 75,54 54,75 26,75 5,54 5,26" fill="url(#stT)" stroke="#090502" stroke-width="3"/><polygon points="29,11 51,11 69,29 69,51 51,69 29,69 11,51 11,29" fill="url(#gemT)" stroke="#fde68a" stroke-width="1.3"/><polygon points="29,11 51,11 69,29 11,29" fill="#ffffff" opacity="0.26"/><path d="M23,5 L29,5 L29,13 L21,13 Z M51,5 L57,5 L59,13 L51,13 Z M23,75 L29,75 L29,67 L21,67 Z M51,75 L57,75 L59,67 L51,67 Z" fill="#fbbf24" stroke="#291504" stroke-width="1.2"/><path d="M40,19 L40,61 M26,33 L40,19 L54,33" fill="none" stroke="#ff9500" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M40,19 L40,61 M26,33 L40,19 L54,33" fill="none" stroke="#fffbeb" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', pays: [0.1, 0.25, 0.65] },
    O: { name: 'Onyx Rune', kind: 'low', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gemO" cx="38%" cy="32%" r="68%"><stop offset="0%" stop-color="#a78bfa"/><stop offset="40%" stop-color="#4c1d95"/><stop offset="80%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090714"/></radialGradient></defs><polygon points="22,5 58,5 75,40 58,75 22,75 5,40" fill="#161324" stroke="#06040a" stroke-width="3"/><polygon points="25,11 55,11 69,40 55,69 25,69 11,40" fill="url(#gemO)" stroke="#c4b5fd" stroke-width="1.2"/><polygon points="25,11 55,11 40,38 11,40" fill="#ffffff" opacity="0.16"/><circle cx="23" cy="11" r="3" fill="#94a3b8" stroke="#0f172a"/><circle cx="57" cy="11" r="3" fill="#94a3b8" stroke="#0f172a"/><circle cx="23" cy="69" r="3" fill="#94a3b8" stroke="#0f172a"/><circle cx="57" cy="69" r="3" fill="#94a3b8" stroke="#0f172a"/><path d="M28,58 L50,35 L40,20 L30,35 L52,58" fill="none" stroke="#8b5cf6" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/><path d="M28,58 L50,35 L40,20 L30,35 L52,58" fill="none" stroke="#f5f3ff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>', pays: [0.1, 0.25, 0.65] },
    E: { name: 'Emerald Rune', kind: 'low', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gemE" cx="38%" cy="32%" r="68%"><stop offset="0%" stop-color="#bbf7d0"/><stop offset="38%" stop-color="#10b981"/><stop offset="78%" stop-color="#065f46"/><stop offset="100%" stop-color="#022c22"/></radialGradient></defs><polygon points="40,4 72,18 65,64 40,76 15,64 8,18" fill="#0d261c" stroke="#030d09" stroke-width="3"/><polygon points="40,10 66,22 60,60 40,70 20,60 14,22" fill="url(#gemE)" stroke="#6ee7b7" stroke-width="1.3"/><polygon points="40,10 66,22 40,35 14,22" fill="#ffffff" opacity="0.24"/><path d="M36,4 L40,12 L44,4 Z M10,18 L18,23 L12,27 Z M70,18 L62,23 L68,27 Z M36,76 L40,68 L44,76 Z" fill="#eab308" stroke="#1c1917" stroke-width="1"/><path d="M27,23 L27,57 M53,23 L53,57 M27,25 L40,39 L53,25" fill="none" stroke="#10b981" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M27,23 L27,57 M53,23 L53,57 M27,25 L40,39 L53,25" fill="none" stroke="#ecfdf5" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>', pays: [0.2, 0.4, 0.8] },
    A: { name: 'Amethyst Rune', kind: 'low', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="gemA" cx="38%" cy="30%" r="68%"><stop offset="0%" stop-color="#fae8ff"/><stop offset="38%" stop-color="#d946ef"/><stop offset="75%" stop-color="#701a75"/><stop offset="100%" stop-color="#2e0636"/></radialGradient></defs><polygon points="40,4 73,22 73,58 40,76 7,58 7,22" fill="#23092b" stroke="#09020d" stroke-width="3"/><polygon points="40,10 67,25 67,55 40,70 13,55 13,25" fill="url(#gemA)" stroke="#f5d0fe" stroke-width="1.3"/><polygon points="40,10 67,25 40,38 13,25" fill="#ffffff" opacity="0.25"/><path d="M35,5 L45,5 L42,12 L38,12 Z M35,75 L45,75 L42,68 L38,68 Z" fill="#facc15" stroke="#291504" stroke-width="1"/><path d="M31,20 L31,60 M31,24 L51,35 M31,39 L49,50" fill="none" stroke="#e879f9" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/><path d="M31,20 L31,60 M31,24 L51,35 M31,39 L49,50" fill="none" stroke="#fdf4ff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', pays: [0.2, 0.4, 0.8] },
    WAR: { name: 'Warrior', kind: 'high', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgWar" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#991b1b"/><stop offset="65%" stop-color="#3b0710"/><stop offset="100%" stop-color="#140408"/></radialGradient><linearGradient id="stWar" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="45%" stop-color="#94a3b8"/><stop offset="80%" stop-color="#475569"/><stop offset="100%" stop-color="#1e293b"/></linearGradient><linearGradient id="gdWar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#78350f"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgWar)" stroke="url(#gdWar)" stroke-width="3"/><path d="M17,14 L40,10 L63,14 L61,45 C59,58 40,69 40,69 C40,69 21,58 19,45 Z" fill="none" stroke="#f87171" stroke-width="1" opacity="0.45"/><path d="M8,66 L70,12 M12,8 L72,66" stroke="#e2e8f0" stroke-width="4.5" stroke-linecap="round"/><path d="M8,66 L70,12 M12,8 L72,66" stroke="#ef4444" stroke-width="1.4" stroke-linecap="round"/><path d="M22,28 C6,24 4,8 17,6 C12,15 16,22 25,23 Z" fill="url(#gdWar)" stroke="#1c0a04" stroke-width="1.8"/><path d="M58,28 C74,24 76,8 63,6 C68,15 64,22 55,23 Z" fill="url(#gdWar)" stroke="#1c0a04" stroke-width="1.8"/><path d="M40,5 C28,11 30,22 40,24 C50,22 52,11 40,5 Z" fill="#dc2626" stroke="#450a0a" stroke-width="1.5"/><path d="M22,25 L40,17 L58,25 L56,54 L40,67 L24,54 Z" fill="url(#stWar)" stroke="#090d16" stroke-width="2.4" stroke-linejoin="round"/><path d="M22,25 L40,32 L58,25 M40,17 L40,67" fill="none" stroke="url(#gdWar)" stroke-width="2.8"/><path d="M28,48 L35,51 M28,53 L35,56 M52,48 L45,51 M52,53 L45,56" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><polygon points="25,35 37,39 26,42" fill="#ffedd5"/><polygon points="24,34 38,39 25,43" fill="#f97316" opacity="0.7"/><polygon points="55,35 43,39 54,42" fill="#ffedd5"/><polygon points="56,34 42,39 55,43" fill="#f97316" opacity="0.7"/></svg>', pays: [0.3, 0.6, 2] },
    MAG: { name: 'Mage', kind: 'high', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgMag" cx="50%" cy="38%" r="62%"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="60%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090716"/></radialGradient><radialGradient id="orbMag" cx="38%" cy="35%" r="60%"><stop offset="0%" stop-color="#ffffff"/><stop offset="30%" stop-color="#7dd3fc"/><stop offset="65%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d1b4b"/></radialGradient><linearGradient id="gdMag" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#eab308"/><stop offset="100%" stop-color="#854d0e"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgMag)" stroke="#38bdf8" stroke-width="2.8"/><ellipse cx="40" cy="40" rx="29" ry="11" transform="rotate(-30 40 40)" fill="none" stroke="url(#gdMag)" stroke-width="2.2" stroke-dasharray="7 3"/><ellipse cx="40" cy="40" rx="29" ry="11" transform="rotate(30 40 40)" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-dasharray="5 4"/><path d="M22,60 L25,28 L40,12 L55,28 L58,60 Z" fill="#1e1b4b" stroke="url(#gdMag)" stroke-width="2"/><polygon points="31,30 37,32 32,34" fill="#bae6fd"/><polygon points="49,30 43,32 48,34" fill="#bae6fd"/><path d="M26,56 C20,44 26,34 32,36 M54,56 C60,44 54,34 48,36 M40,68 L40,52" fill="none" stroke="url(#gdMag)" stroke-width="3.6" stroke-linecap="round"/><circle cx="40" cy="44" r="14" fill="url(#orbMag)" stroke="#e0f2fe" stroke-width="1.8"/><polygon points="40,32 43,40 51,44 43,48 40,56 37,48 29,44 37,40" fill="#ffffff" opacity="0.9"/></svg>', pays: [0.4, 0.8, 2.5] },
    ROG: { name: 'Rogue', kind: 'high', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgRog" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="#065f46"/><stop offset="60%" stop-color="#111827"/><stop offset="100%" stop-color="#05070b"/></radialGradient><linearGradient id="blRog" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ecfdf5"/><stop offset="45%" stop-color="#34d399"/><stop offset="100%" stop-color="#047857"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgRog)" stroke="#10b981" stroke-width="2.8"/><path d="M20,30 L40,9 L60,30 L55,56 L40,64 L25,56 Z" fill="#181326" stroke="#6d28d9" stroke-width="2"/><path d="M25,38 L40,44 L55,38 L52,55 L40,62 L28,55 Z" fill="#334155" stroke="#0f172a" stroke-width="1.8"/><polygon points="28,31 37,35 29,37" fill="#4ade80"/><polygon points="52,31 43,35 51,37" fill="#4ade80"/><path d="M12,64 C24,48 44,28 66,12 L69,16 C50,34 30,52 16,68 Z" fill="url(#blRog)" stroke="#022c22" stroke-width="1.6"/><path d="M68,64 C56,48 36,28 14,12 L11,16 C30,34 50,52 64,68 Z" fill="url(#blRog)" stroke="#022c22" stroke-width="1.6"/><circle cx="14" cy="66" r="4" fill="#fbbf24" stroke="#451a03" stroke-width="1.4"/><circle cx="66" cy="66" r="4" fill="#fbbf24" stroke="#451a03" stroke-width="1.4"/><path d="M40,58 C36,65 40,71 40,72 C40,71 44,65 40,58 Z" fill="#4ade80" stroke="#064e3b" stroke-width="1.2"/></svg>', pays: [0.5, 1.25, 4] },
    PRI: { name: 'Priest', kind: 'high', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgPri" cx="50%" cy="38%" r="62%"><stop offset="0%" stop-color="#fef08a"/><stop offset="48%" stop-color="#b45309"/><stop offset="100%" stop-color="#2e1065"/></radialGradient><linearGradient id="gdPri" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#fde047"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgPri)" stroke="#fef08a" stroke-width="3"/><circle cx="40" cy="34" r="21" fill="none" stroke="#fef9c3" stroke-width="2.2" stroke-dasharray="5 3"/><path d="M9,38 C12,20 24,18 32,30 C24,34 18,42 15,50 Z" fill="url(#gdPri)" stroke="#78350f" stroke-width="1.6"/><path d="M71,38 C68,20 56,18 48,30 C56,34 62,42 65,50 Z" fill="url(#gdPri)" stroke="#78350f" stroke-width="1.6"/><rect x="37" y="14" width="6" height="52" rx="3" fill="url(#gdPri)" stroke="#713f12" stroke-width="1.6"/><polygon points="40,6 45,22 61,28 45,34 40,50 35,34 19,28 35,22" fill="#ffffff" stroke="#d97706" stroke-width="1.8"/><circle cx="40" cy="28" r="6.5" fill="#f59e0b"/><circle cx="40" cy="28" r="3.5" fill="#fffbeb"/></svg>', pays: [0.6, 2, 6] },
    W: { name: 'Raid Banner', kind: 'wild', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bnW" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef4444"/><stop offset="55%" stop-color="#991b1b"/><stop offset="100%" stop-color="#450a0a"/></linearGradient><linearGradient id="gdW" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fffbeb"/><stop offset="45%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#92400e"/></linearGradient></defs><path d="M10,68 L70,8 M70,68 L10,8" stroke="#cbd5e1" stroke-width="3.6" stroke-linecap="round"/><path d="M6,14 L22,10 L40,14 L58,10 L74,14 L68,19 L12,19 Z" fill="url(#gdW)" stroke="#451a03" stroke-width="1.8"/><path d="M16,18 L64,18 L62,56 L50,48 L40,62 L30,48 L18,56 Z" fill="url(#bnW)" stroke="url(#gdW)" stroke-width="2.8" stroke-linejoin="round"/><polygon points="40,22 44,32 55,33 47,40 49,50 40,44 31,50 33,40 25,33 36,32" fill="url(#gdW)" stroke="#451a03" stroke-width="1.2"/><rect x="12" y="57" width="56" height="17" rx="5" fill="url(#gdW)" stroke="#291002" stroke-width="2"/><text x="40" y="70" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="14" fill="#291002" letter-spacing="1.5">WILD</text></svg>', pays: null },
    B: { name: 'Boss Gate', kind: 'scatter', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="vxB" cx="50%" cy="48%" r="48%"><stop offset="0%" stop-color="#fde047"/><stop offset="30%" stop-color="#f43f5e"/><stop offset="70%" stop-color="#6b21a8"/><stop offset="100%" stop-color="#090412"/></radialGradient><linearGradient id="stB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#94a3b8"/><stop offset="55%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><path d="M10,66 L10,26 C10,6 70,6 70,26 L70,66 Z" fill="url(#stB)" stroke="#f43f5e" stroke-width="2.6"/><path d="M18,64 L18,28 C18,13 62,13 62,28 L62,64 Z" fill="url(#vxB)"/><path d="M22,16 C6,8 8,2 20,6 M58,16 C74,8 72,2 60,6" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/><path d="M26,30 C26,18 54,18 54,30 C54,37 50,41 48,47 L32,47 C30,41 26,37 26,30 Z" fill="#fef2f2" stroke="#881337" stroke-width="2.2"/><circle cx="34" cy="32" r="4" fill="#e11d48"/><circle cx="46" cy="32" r="4" fill="#e11d48"/><circle cx="34" cy="32" r="1.5" fill="#fef08a"/><circle cx="46" cy="32" r="1.5" fill="#fef08a"/><path d="M34,47 L34,53 M40,47 L40,53 M46,47 L46,53" stroke="#881337" stroke-width="2.4"/><rect x="12" y="57" width="56" height="17" rx="5" fill="#881337" stroke="#fbbf24" stroke-width="2"/><text x="40" y="70" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="13" fill="#fde047" letter-spacing="1.5">GATE</text></svg>', pays: null },
  };
  const PAYING = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].pays);

  const TIERS = [
    { id: 'normal', name: 'Normal Bonus', title: 'The Raid' },
    { id: 'super', name: 'Super Bonus', title: 'Heroic Raid' },
    { id: 'hidden', name: 'Hidden Bonus', title: 'Hidden Sanctum' },
    { id: 'superHidden', name: 'Super Hidden Bonus', title: 'Throne of the Unseen' },
  ];
  const TOP_TIER = TIERS.length - 1;
  const ASCEND_CHANCE = [0.03, 0.03, 0.005];
  const MYSTERY_WEIGHTS = [0.6, 0.3, 0.1];
  const GLORY_WEIGHTS = [0.5, 0.3, 0.17, 0.03];
  const BUYS = [
    { id: 'normal', name: 'Buy Normal Bonus', tier: 0 },
    { id: 'super', name: 'Buy Super Bonus', tier: 1 },
    { id: 'hidden', name: 'Buy Hidden Bonus', tier: 2 },
    { id: 'mystery', name: 'Mystery Buy', tier: null, weights: MYSTERY_WEIGHTS },
    { id: 'glory', name: 'Glory or Wipe', tier: null, weights: GLORY_WEIGHTS, glory: true },
  ];

  const GEAR = [
    { id: 'helm', name: 'Helm', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M18,20 C4,12 4,4 16,8 C12,14 14,18 22,19 M46,20 C60,12 60,4 48,8 C52,14 50,18 42,19" fill="#fbbf24" stroke="#451a03" stroke-width="1.5"/><path d="M32,4 C23,9 25,18 32,20 C39,18 41,9 32,4 Z" fill="#ef4444"/><path d="M16,22 L32,14 L48,22 L46,50 L32,58 L18,50 Z" fill="#94a3b8" stroke="#0f172a" stroke-width="2.2"/><path d="M16,22 L32,28 L48,22 M32,14 L32,58" fill="none" stroke="#fbbf24" stroke-width="2.5"/><polygon points="20,31 30,35 21,38" fill="#f97316"/><polygon points="44,31 34,35 43,38" fill="#f97316"/></svg>' },
    { id: 'cloak', name: 'Cloak', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M16,14 L48,14 L56,56 L42,50 L32,58 L22,50 L8,56 Z" fill="#6b21a8" stroke="#fbbf24" stroke-width="2.2" stroke-linejoin="round"/><path d="M22,16 L18,52 M42,16 L46,52" stroke="#4c1d95" stroke-width="2"/><path d="M12,14 C18,24 46,24 52,14 L46,8 L18,8 Z" fill="#d97706" stroke="#451a03" stroke-width="1.8"/><circle cx="32" cy="17" r="5" fill="#e11d48" stroke="#fef08a" stroke-width="1.8"/></svg>' },
    { id: 'gauntlets', name: 'Gauntlets', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M16,28 L21,10 L27,10 L29,18 L34,8 L40,10 L41,18 L47,12 L50,28 L44,54 L18,54 Z" fill="#94a3b8" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round"/><path d="M17,36 L47,36 M18,45 L45,45" stroke="#fbbf24" stroke-width="3"/><polygon points="32,22 38,29 32,36 26,29" fill="#ef4444" stroke="#fef08a" stroke-width="1.5"/></svg>' },
    { id: 'boots', name: 'Boots', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M20,10 L38,10 L36,36 L52,43 C56,45 56,54 49,54 L16,54 L16,36 Z" fill="#94a3b8" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round"/><path d="M20,24 L6,14 L12,26 L4,28 L18,34 Z" fill="#fde047" stroke="#92400e" stroke-width="1.5"/><path d="M16,49 L52,49" stroke="#fbbf24" stroke-width="3.5"/></svg>' },
    { id: 'amulet', name: 'Amulet', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M16,10 C16,30 48,30 48,10" fill="none" stroke="#fbbf24" stroke-width="3.2" stroke-dasharray="4 2"/><polygon points="32,18 49,36 32,57 15,36" fill="#f59e0b" stroke="#451a03" stroke-width="2.2"/><polygon points="32,24 43,36 32,50 21,36" fill="#e11d48" stroke="#fecdd3" stroke-width="1.2"/><circle cx="29" cy="33" r="2.5" fill="#ffffff"/></svg>' },
    { id: 'ring', name: 'Ring', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="37" r="17" fill="none" stroke="#d97706" stroke-width="7"/><circle cx="32" cy="37" r="17" fill="none" stroke="#fef08a" stroke-width="2.2"/><polygon points="32,7 45,19 32,28 19,19" fill="#9333ea" stroke="#fde047" stroke-width="2.2"/><ellipse cx="32" cy="18" rx="6" ry="3" fill="#f5d0fe"/><circle cx="32" cy="18" r="2" fill="#3b0764"/></svg>' },
  ];
  const GEAR_FULL = (1 << GEAR.length) - 1;
  const CACHES = [
    { name: 'Legendary Cache', pieces: 3, chance: 0.04 },
    { name: 'Treasure Chest', pieces: 2, chance: 0.12 },
  ];
  const gearCount = (gear) => GEAR.reduce((n, _, i) => n + ((gear >> i) & 1), 0);

  const EDGE = { R: 6, S: 6, T: 6, O: 6, E: 6, A: 6, WAR: 4, MAG: 4, ROG: 3, PRI: 2, B: 1 };
  const MID = { R: 6, S: 6, T: 5, O: 5, E: 5, A: 5, WAR: 4, MAG: 4, ROG: 4, PRI: 3, W: 2, B: 1 };
  const FREE_MID = { R: 5, S: 5, T: 5, O: 5, E: 4, A: 4, WAR: 4, MAG: 4, ROG: 3, PRI: 3, W: 7, B: 1 };
  const add = (counts, extra) => {
    const out = { ...counts };
    for (const [k, v] of Object.entries(extra)) out[k] = (out[k] || 0) + v;
    return out;
  };

  const HEROES = [
    {
      id: 'warrior', name: 'Warrior', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgWar" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#991b1b"/><stop offset="65%" stop-color="#3b0710"/><stop offset="100%" stop-color="#140408"/></radialGradient><linearGradient id="stWar" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="45%" stop-color="#94a3b8"/><stop offset="80%" stop-color="#475569"/><stop offset="100%" stop-color="#1e293b"/></linearGradient><linearGradient id="gdWar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#78350f"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgWar)" stroke="url(#gdWar)" stroke-width="3"/><path d="M17,14 L40,10 L63,14 L61,45 C59,58 40,69 40,69 C40,69 21,58 19,45 Z" fill="none" stroke="#f87171" stroke-width="1" opacity="0.45"/><path d="M8,66 L70,12 M12,8 L72,66" stroke="#e2e8f0" stroke-width="4.5" stroke-linecap="round"/><path d="M8,66 L70,12 M12,8 L72,66" stroke="#ef4444" stroke-width="1.4" stroke-linecap="round"/><path d="M22,28 C6,24 4,8 17,6 C12,15 16,22 25,23 Z" fill="url(#gdWar)" stroke="#1c0a04" stroke-width="1.8"/><path d="M58,28 C74,24 76,8 63,6 C68,15 64,22 55,23 Z" fill="url(#gdWar)" stroke="#1c0a04" stroke-width="1.8"/><path d="M40,5 C28,11 30,22 40,24 C50,22 52,11 40,5 Z" fill="#dc2626" stroke="#450a0a" stroke-width="1.5"/><path d="M22,25 L40,17 L58,25 L56,54 L40,67 L24,54 Z" fill="url(#stWar)" stroke="#090d16" stroke-width="2.4" stroke-linejoin="round"/><path d="M22,25 L40,32 L58,25 M40,17 L40,67" fill="none" stroke="url(#gdWar)" stroke-width="2.8"/><path d="M28,48 L35,51 M28,53 L35,56 M52,48 L45,51 M52,53 L45,56" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><polygon points="25,35 37,39 26,42" fill="#ffedd5"/><polygon points="24,34 38,39 25,43" fill="#f97316" opacity="0.7"/><polygon points="55,35 43,39 54,42" fill="#ffedd5"/><polygon points="56,34 42,39 55,43" fill="#f97316" opacity="0.7"/></svg>', style: 'Steady',
      ability: 'Shield Wall: starts every raid with 4 extra spins.',
      spins: 4,
    },
    {
      id: 'rogue', name: 'Rogue', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgRog" cx="50%" cy="42%" r="62%"><stop offset="0%" stop-color="#065f46"/><stop offset="60%" stop-color="#111827"/><stop offset="100%" stop-color="#05070b"/></radialGradient><linearGradient id="blRog" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ecfdf5"/><stop offset="45%" stop-color="#34d399"/><stop offset="100%" stop-color="#047857"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgRog)" stroke="#10b981" stroke-width="2.8"/><path d="M20,30 L40,9 L60,30 L55,56 L40,64 L25,56 Z" fill="#181326" stroke="#6d28d9" stroke-width="2"/><path d="M25,38 L40,44 L55,38 L52,55 L40,62 L28,55 Z" fill="#334155" stroke="#0f172a" stroke-width="1.8"/><polygon points="28,31 37,35 29,37" fill="#4ade80"/><polygon points="52,31 43,35 51,37" fill="#4ade80"/><path d="M12,64 C24,48 44,28 66,12 L69,16 C50,34 30,52 16,68 Z" fill="url(#blRog)" stroke="#022c22" stroke-width="1.6"/><path d="M68,64 C56,48 36,28 14,12 L11,16 C30,34 50,52 64,68 Z" fill="url(#blRog)" stroke="#022c22" stroke-width="1.6"/><circle cx="14" cy="66" r="4" fill="#fbbf24" stroke="#451a03" stroke-width="1.4"/><circle cx="66" cy="66" r="4" fill="#fbbf24" stroke="#451a03" stroke-width="1.4"/><path d="M40,58 C36,65 40,71 40,72 C40,71 44,65 40,58 Z" fill="#4ade80" stroke="#064e3b" stroke-width="1.2"/></svg>', style: 'Swingy',
      ability: 'Backstab: every wild hit has a 15% chance to crit for 3 damage. 1 fewer raid spin.',
      spins: -1, crit: { chance: 0.15, dmg: 3 },
    },
    {
      id: 'mage', name: 'Mage', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgMag" cx="50%" cy="38%" r="62%"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="60%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090716"/></radialGradient><radialGradient id="orbMag" cx="38%" cy="35%" r="60%"><stop offset="0%" stop-color="#ffffff"/><stop offset="30%" stop-color="#7dd3fc"/><stop offset="65%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d1b4b"/></radialGradient><linearGradient id="gdMag" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="55%" stop-color="#eab308"/><stop offset="100%" stop-color="#854d0e"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgMag)" stroke="#38bdf8" stroke-width="2.8"/><ellipse cx="40" cy="40" rx="29" ry="11" transform="rotate(-30 40 40)" fill="none" stroke="url(#gdMag)" stroke-width="2.2" stroke-dasharray="7 3"/><ellipse cx="40" cy="40" rx="29" ry="11" transform="rotate(30 40 40)" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-dasharray="5 4"/><path d="M22,60 L25,28 L40,12 L55,28 L58,60 Z" fill="#1e1b4b" stroke="url(#gdMag)" stroke-width="2"/><polygon points="31,30 37,32 32,34" fill="#bae6fd"/><polygon points="49,30 43,32 48,34" fill="#bae6fd"/><path d="M26,56 C20,44 26,34 32,36 M54,56 C60,44 54,34 48,36 M40,68 L40,52" fill="none" stroke="url(#gdMag)" stroke-width="3.6" stroke-linecap="round"/><circle cx="40" cy="44" r="14" fill="url(#orbMag)" stroke="#e0f2fe" stroke-width="1.8"/><polygon points="40,32 43,40 51,44 43,48 40,56 37,48 29,44 37,40" fill="#ffffff" opacity="0.9"/></svg>', style: 'Big multipliers',
      ability: 'Arcane Surge: boss kills give 1.5x the multiplier. Arcane Charge: every 4th spin, wild hits deal double damage.',
      spins: 0, multBoost: 1.5, charge: { every: 4, factor: 2 },
    },
    {
      id: 'hunter', name: 'Hunter', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgHun" cx="50%" cy="40%" r="62%"><stop offset="0%" stop-color="#14532d"/><stop offset="60%" stop-color="#062e16"/><stop offset="100%" stop-color="#031209"/></radialGradient><linearGradient id="gdHun" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#713f12"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgHun)" stroke="#4ade80" stroke-width="2.8"/><line x1="24" y1="14" x2="24" y2="66" stroke="#e2e8f0" stroke-width="1.8"/><path d="M24,14 C56,18 62,32 54,40 C62,48 56,62 24,66" fill="none" stroke="url(#gdHun)" stroke-width="5" stroke-linecap="round"/><line x1="14" y1="40" x2="66" y2="40" stroke="#fef3c7" stroke-width="3.2" stroke-linecap="round"/><polygon points="72,40 56,32 60,40 56,48" fill="#4ade80" stroke="#064e3b" stroke-width="1.5"/><polygon points="12,35 22,40 12,45 16,40" fill="#ef4444"/></svg>', style: 'Marksman',
      ability: "Hunter's Mark: wilds on the middle reel hit for 2 damage. 1 fewer raid spin.",
      spins: -1, markReel: 2, markDmg: 2,
    },
    {
      id: 'priest', name: 'Priest', icon: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bgPri" cx="50%" cy="38%" r="62%"><stop offset="0%" stop-color="#fef08a"/><stop offset="48%" stop-color="#b45309"/><stop offset="100%" stop-color="#2e1065"/></radialGradient><linearGradient id="gdPri" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#fde047"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient></defs><path d="M12,10 L40,5 L68,10 L66,46 C64,62 40,75 40,75 C40,75 16,62 14,46 Z" fill="url(#bgPri)" stroke="#fef08a" stroke-width="3"/><circle cx="40" cy="34" r="21" fill="none" stroke="#fef9c3" stroke-width="2.2" stroke-dasharray="5 3"/><path d="M9,38 C12,20 24,18 32,30 C24,34 18,42 15,50 Z" fill="url(#gdPri)" stroke="#78350f" stroke-width="1.6"/><path d="M71,38 C68,20 56,18 48,30 C56,34 62,42 65,50 Z" fill="url(#gdPri)" stroke="#78350f" stroke-width="1.6"/><rect x="37" y="14" width="6" height="52" rx="3" fill="url(#gdPri)" stroke="#713f12" stroke-width="1.6"/><polygon points="40,6 45,22 61,28 45,34 40,50 35,34 19,28 35,22" fill="#ffffff" stroke="#d97706" stroke-width="1.8"/><circle cx="40" cy="28" r="6.5" fill="#f59e0b"/><circle cx="40" cy="28" r="3.5" fill="#fffbeb"/></svg>', style: 'Second chances',
      ability: 'Resurrection: once per raid, if spins run out with the boss at 40% HP or less, +3 spins. Blessing: +1 spin per boss kill.',
      spins: 0, killSpins: 1, rez: { threshold: 0.4, spins: 3 },
    },
  ];
  const DEFAULT_HERO = 'warrior';
  function getHero(id) {
    const hero = HEROES.find((h) => h.id === id);
    if (!hero) throw new Error(`Unknown class: ${id}`);
    return hero;
  }

  const BOSS_NAMES = ['Gravelord Okk', 'Sister Venn', 'The Ashen Wyrm', 'The Hollow King'];
  const bosses = (list) => list.map(([hp, reward], i) => ({ name: BOSS_NAMES[i], hp, reward }));

  const MODES = {
    steady: {
      label: 'Steady',
      blurb: 'Constant small wins, gentle multipliers. Rarely anywhere near max.',
      scale: 0.925,
      maxWinX: 1000,
      lowMin: 3,
      base: [EDGE, add(MID, { R: -1, W: 1, B: 1 }), add(MID, { R: -1, W: 1 }), add(MID, { R: -1, W: 1, B: 1 }), EDGE],
      freeMid: add(FREE_MID, { W: -2, R: 1, S: 1 }),
      scatterPay: { 3: 1, 4: 4, 5: 15 },
      retrigger: 1,
      bossKillSpins: 1,
      bosses: bosses([[4, 2], [6, 2], [8, 3], [10, 4]]),
      secretBoss: { name: 'The Unseen', hp: 12, reward: 8 },
      tiers: [
        { spins: 6, startBoss: 0, wildBoost: 0, sticky: 0, hpMult: 0.87 },
        { spins: 8, startBoss: 1, wildBoost: 0, sticky: 1, hpMult: 1.69 },
        { spins: 10, startBoss: 2, wildBoost: 1, sticky: 2, hpMult: 3.44 },
        { spins: 12, startBoss: 3, wildBoost: 2, sticky: 3, hpMult: 3.95 },
      ],
      loot: { base: 0.015, perDrySpin: 0.00008, max: 0.06 },
      calibration: [16.15, 27.07, 53.09, 114.71],
      heroScale: {
        warrior: [0.467, 0.2478, 0.1702, 0.1209],
        rogue: [0.9411, 0.4387, 0.2816, 0.1837],
        mage: [0.5652, 0.2487, 0.1584, 0.1047],
        hunter: [0.9299, 0.4319, 0.2782, 0.1816],
        priest: [0.464, 0.2639, 0.1991, 0.1373],
      },
      clearRate: {
        warrior: [0.03599, 0.08537, 0.1501, 0.197],
        rogue: [0.01849, 0.03227, 0.05866, 0.09506],
        mage: [0.01171, 0.02881, 0.0661, 0.121],
        hunter: [0.01784, 0.04083, 0.062, 0.1172],
        priest: [0.08094, 0.09766, 0.1216, 0.1796],
      },
    },
    standard: {
      label: 'Standard',
      blurb: 'Balanced base game and raids.',
      scale: 0.818,
      maxWinX: 5000,
      lowMin: 3,
      base: [EDGE, MID, MID, MID, EDGE],
      freeMid: FREE_MID,
      scatterPay: { 3: 2, 4: 10, 5: 50 },
      retrigger: 2,
      bossKillSpins: 2,
      bosses: bosses([[5, 2], [8, 3], [12, 5], [16, 10]]),
      secretBoss: { name: 'The Unseen', hp: 18, reward: 25 },
      tiers: [
        { spins: 8, startBoss: 0, wildBoost: 0, sticky: 0, hpMult: 1.19 },
        { spins: 10, startBoss: 1, wildBoost: 0, sticky: 1, hpMult: 2.06 },
        { spins: 12, startBoss: 2, wildBoost: 2, sticky: 2, hpMult: 3.66 },
        { spins: 14, startBoss: 3, wildBoost: 3, sticky: 3, hpMult: 4.03 },
      ],
      loot: { base: 0.01, perDrySpin: 0.00005, max: 0.05 },
      calibration: [65.23, 94.25, 258.19, 746.39],
      heroScale: {
        warrior: [0.6902, 0.2741, 0.2341, 0.1906],
        rogue: [1.097, 0.4163, 0.3389, 0.2592],
        mage: [0.6502, 0.2337, 0.191, 0.1537],
        hunter: [1.063, 0.4052, 0.333, 0.2531],
        priest: [0.644, 0.2765, 0.272, 0.216],
      },
      clearRate: {
        warrior: [0.01486, 0.05847, 0.115, 0.1351],
        rogue: [0.02344, 0.05419, 0.08345, 0.1275],
        mage: [0.01872, 0.05483, 0.09442, 0.1536],
        hunter: [0.02477, 0.06439, 0.09838, 0.1488],
        priest: [0.04412, 0.09195, 0.1061, 0.129],
      },
    },
    mega: {
      label: 'Mega',
      blurb: 'Few small hits; runes need 4+ to pay. x100 final boss, x500 secret boss, 100,000x max win.',
      scale: 0.619,
      maxWinX: 100000,
      lowMin: 4,
      base: [
        add(EDGE, { R: 2, S: 2, T: 2, O: 2, E: 2 }),
        add(MID, { R: 2, S: 2, T: 2, O: 2, E: 2, A: 1, W: -1 }),
        add(MID, { R: 2, S: 2, T: 2, O: 2, E: 2, A: 1, W: -1 }),
        add(MID, { R: 2, S: 2, T: 2, O: 2, E: 2, A: 1, W: -1 }),
        add(EDGE, { R: 2, S: 2, T: 2, O: 2, E: 2 }),
      ],
      freeMid: FREE_MID,
      scatterPay: { 3: 3, 4: 20, 5: 100 },
      retrigger: 2,
      bossKillSpins: 2,
      bosses: bosses([[6, 3], [10, 10], [14, 25], [15, 100]]),
      secretBoss: { name: 'The Unseen', hp: 20, reward: 500 },
      tiers: [
        { spins: 10, startBoss: 0, wildBoost: 0, sticky: 0, hpMult: 1.18 },
        { spins: 12, startBoss: 1, wildBoost: 0, sticky: 1, hpMult: 2.15 },
        { spins: 14, startBoss: 2, wildBoost: 2, sticky: 2, hpMult: 3.97 },
        { spins: 16, startBoss: 3, wildBoost: 3, sticky: 3, hpMult: 4.37 },
      ],
      loot: { base: 0.006, perDrySpin: 0.00004, max: 0.04 },
      calibration: [146.57, 286.99, 1642.97, 10192.74],
      heroScale: {
        warrior: [0.7033, 0.3189, 0.4173, 0.3482],
        rogue: [0.9858, 0.4432, 0.5625, 0.4268],
        mage: [0.6173, 0.2712, 0.346, 0.2604],
        hunter: [0.9328, 0.4185, 0.5442, 0.4079],
        priest: [0.6121, 0.3116, 0.4832, 0.3925],
      },
      clearRate: {
        warrior: [0.01317, 0.03751, 0.091, 0.1078],
        rogue: [0.02898, 0.05332, 0.0958, 0.1423],
        mage: [0.02285, 0.04896, 0.1006, 0.1641],
        hunter: [0.03183, 0.06491, 0.1136, 0.1693],
        priest: [0.03784, 0.05737, 0.08476, 0.1049],
      },
    },
  };
  const DEFAULT_MODE = 'standard';

  function buildStrip(counts, salt) {
    const others = [];
    for (const [sym, n] of Object.entries(counts)) {
      if (sym !== 'B') for (let i = 0; i < n; i++) others.push(sym);
    }
    let s = (salt * 2654435761) >>> 0 || 1;
    const rand = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const scatters = counts.B || 0;
    const total = others.length + scatters;
    const scatterAt = new Set();
    for (let i = 0; i < scatters; i++) scatterAt.add(Math.floor((i + 0.5) * (total / scatters)));
    const strip = [];
    for (let i = 0; i < total; i++) strip.push(scatterAt.has(i) ? 'B' : others.shift());
    return strip;
  }

  for (const mode of Object.values(MODES)) {
    mode.strips = { base: mode.base.map((c, i) => buildStrip(c, i + 1)), free: {} };
    for (const tier of mode.tiers) {
      const b = tier.wildBoost;
      if (mode.strips.free[b]) continue;
      const mid = add(mode.freeMid, { W: b });
      mode.strips.free[b] = [EDGE, mid, mid, mid, EDGE].map((c, i) => buildStrip(c, i + 101 + b * 10));
    }
  }

  function getMode(id) {
    const mode = MODES[id];
    if (!mode) throw new Error(`Unknown mode: ${id}`);
    return mode;
  }

  const lootChance = (mode, dry) => Math.min(mode.loot.base + dry * mode.loot.perDrySpin, mode.loot.max);
  const payFor = (mode, sym, length) => SYMBOLS[sym].pays[length - 3] * mode.scale;
  const minLength = (mode, sym) => (SYMBOLS[sym].kind === 'low' ? mode.lowMin : 3);
  const scatterTier = (count) => (count >= 3 ? Math.min(count - 3, 2) : null);

  function gambleChance(modeId, tier) {
    if (tier >= TOP_TIER) return 0;
    const cal = getMode(modeId).calibration;
    return Math.min(cal[tier] / cal[tier + 1], 1);
  }

  function startValue(tier, perTier) {
    let p = 1;
    let value = 0;
    for (let t = tier; t <= TOP_TIER; t++) {
      const climb = t < TOP_TIER ? ASCEND_CHANCE[t] : 0;
      value += p * (1 - climb) * perTier[t];
      p *= climb;
    }
    return value;
  }

  function buyPrice(modeId, buyId, heroId = DEFAULT_HERO) {
    const mode = getMode(modeId);
    const buy = BUYS.find((b) => b.id === buyId);
    if (!buy) throw new Error(`Unknown buy: ${buyId}`);
    getHero(heroId);
    const perTier = buy.glory ? mode.clearRate[heroId].map((p) => p * mode.maxWinX) : mode.calibration;
    const value = buy.tier === null
      ? buy.weights.reduce((v, w, t) => v + w * startValue(t, perTier), 0)
      : startValue(buy.tier, perTier);
    return Math.max(1, Math.round((value / BUY_RTP) * 10) / 10);
  }

  function spinGrid(rng, strips) {
    return strips.map((strip) => {
      const stop = Math.floor(rng.next() * strip.length);
      const col = [];
      for (let row = 0; row < ROWS; row++) col.push(strip[(stop + row) % strip.length]);
      return col;
    });
  }

  function evaluate(grid, mode) {
    const wins = [];
    let waysX = 0;
    for (const sym of PAYING) {
      let ways = 1;
      let length = 0;
      const cells = [];
      for (let r = 0; r < REELS; r++) {
        const rows = [];
        grid[r].forEach((s, row) => { if (s === sym || s === 'W') rows.push(row); });
        if (!rows.length) break;
        length++;
        ways *= rows.length;
        rows.forEach((row) => cells.push([r, row]));
      }
      if (length >= minLength(mode, sym)) {
        const x = payFor(mode, sym, length) * ways;
        wins.push({ symbol: sym, length, ways, x, cells });
        waysX += x;
      }
    }
    const scatterCells = [];
    const wildCells = [];
    grid.forEach((col, r) => col.forEach((s, row) => {
      if (s === 'B') scatterCells.push([r, row]);
      if (s === 'W') wildCells.push([r, row]);
    }));
    return { wins, waysX, scatterCells, wildCells };
  }

  function raidBosses(mode, tier, heroId = DEFAULT_HERO) {
    const hero = getHero(heroId);
    const hpMult = mode.tiers[tier].hpMult || 1;
    const base = tier === TOP_TIER ? mode.bosses.concat([mode.secretBoss]) : mode.bosses;
    return base.map((b) => ({
      name: b.name,
      hp: Math.max(1, Math.round(b.hp * hpMult)),
      reward: hero.multBoost ? Math.ceil(b.reward * hero.multBoost) : b.reward,
    }));
  }

  const heroScaleFor = (mode, tier, heroId) => (mode.heroScale ? mode.heroScale[heroId][tier] : 1);

  function runRaid(rng, mode, tier, startX, glory = false, heroId = DEFAULT_HERO) {
    const hero = getHero(heroId);
    const cfg = mode.tiers[tier];
    const list = raidBosses(mode, tier, heroId);
    const strips = mode.strips.free[cfg.wildBoost];
    const stickyFor = cfg.sticky || 0;
    const winScale = heroScaleFor(mode, tier, heroId);
    const killSpins = mode.bossKillSpins + (hero.killSpins || 0);
    const steps = [];
    const startSpins = Math.max(3, cfg.spins + (hero.spins || 0));
    let spinsLeft = startSpins;
    let bossIndex = cfg.startBoss;
    let hp = list[bossIndex].hp;
    let mult = bossIndex > 0 ? list[bossIndex - 1].reward : 1;
    const startMult = mult;
    let totalX = 0;
    let played = 0;
    let rezUsed = false;
    const sticky = new Map();
    while (spinsLeft > 0 && played < MAX_FREE_SPINS) {
      spinsLeft--;
      played++;
      const grid = spinGrid(rng, strips);
      const stickyCells = [];
      for (const k of sticky.keys()) {
        const cell = [Math.floor(k / ROWS), k % ROWS];
        grid[cell[0]][cell[1]] = 'W';
        stickyCells.push(cell);
      }
      const ev = evaluate(grid, mode);
      const newWilds = ev.wildCells.filter(([r, row]) => !sticky.has(r * ROWS + row));
      const multUsed = mult;
      let winX = ev.waysX * multUsed * winScale;
      const events = [];

      if (ev.scatterCells.length >= 2) {
        spinsLeft += mode.retrigger;
        events.push({ type: 'retrigger', spins: mode.retrigger });
      }

      const hits = stickyCells.map((cell) => ({ cell, sticky: true })).concat(newWilds.map((cell) => ({ cell, sticky: false })));
      const charged = !!hero.charge && played % hero.charge.every === 0;
      if (charged && hits.length) events.push({ type: 'charge', factor: hero.charge.factor });
      for (const h of hits) {
        h.dmg = 1;
        if (hero.markReel !== undefined && h.cell[0] === hero.markReel) { h.dmg = hero.markDmg; h.marked = true; }
        if (hero.crit && rng.next() < hero.crit.chance) { h.dmg = hero.crit.dmg; h.crit = true; }
        if (charged) h.dmg *= hero.charge.factor;
      }
      const damage = hits.reduce((n, h) => n + h.dmg, 0);

      for (const [k, left] of sticky) {
        if (left <= 1) sticky.delete(k);
        else sticky.set(k, left - 1);
      }
      if (stickyFor) newWilds.forEach(([r, row]) => sticky.set(r * ROWS + row, stickyFor));

      if (bossIndex < list.length && damage > 0) {
        hp -= damage;
        while (bossIndex < list.length && hp <= 0) {
          mult = list[bossIndex].reward;
          spinsLeft += killSpins;
          events.push({ type: 'bossKilled', boss: bossIndex, mult, spins: killSpins });
          bossIndex++;
          if (bossIndex < list.length) hp += list[bossIndex].hp;
          else hp = 0;
        }
      }

      if (hero.rez && !rezUsed && spinsLeft === 0 && bossIndex < list.length && hp <= list[bossIndex].hp * hero.rez.threshold) {
        rezUsed = true;
        spinsLeft += hero.rez.spins;
        events.push({ type: 'resurrect', spins: hero.rez.spins });
      }

      if (glory) {
        winX = 0;
        if (bossIndex >= list.length) {
          winX = mode.maxWinX;
          events.push({ type: 'maxWin' });
        }
      } else if (startX + totalX + winX >= mode.maxWinX) {
        winX = mode.maxWinX - startX - totalX;
        events.push({ type: 'maxWin' });
      }
      totalX += winX;
      steps.push({
        grid, wins: ev.wins, scatterCells: ev.scatterCells, wildCells: newWilds, stickyCells, hits,
        winX, multUsed, damage, charged, bossIndex, hp, mult, spinsLeft, events,
      });
      if (startX + totalX >= mode.maxWinX) break;
    }
    const cleared = bossIndex >= list.length;
    return { tier, hero: heroId, glory, cleared, spins: startSpins, startMult, bosses: list, steps, totalX };
  }

  function rollLoot(rng, mode, gear, dry) {
    const dropRoll = rng.next();
    const cacheRoll = rng.next();
    const picks = [];
    for (let i = 0; i < 3; i++) picks.push([rng.next(), rng.next()]);
    if (gear === GEAR_FULL || dropRoll >= lootChance(mode, dry)) return null;

    let pieces = 1;
    let cache = null;
    let acc = 0;
    for (const c of CACHES) {
      acc += c.chance;
      if (cacheRoll < acc) { pieces = c.pieces; cache = c.name; break; }
    }
    const items = [];
    const usedCells = new Set();
    let owned = gear;
    for (let i = 0; i < pieces && owned !== GEAR_FULL; i++) {
      const missing = GEAR.map((_, idx) => idx).filter((idx) => !((owned >> idx) & 1));
      const slot = missing[Math.floor(picks[i][0] * missing.length)];
      let cell = Math.floor(picks[i][1] * REELS * ROWS);
      while (usedCells.has(cell)) cell = (cell + 1) % (REELS * ROWS);
      usedCells.add(cell);
      owned |= 1 << slot;
      items.push({ slot, cell: [Math.floor(cell / ROWS), cell % ROWS] });
    }
    return { cache, items, gear: owned };
  }

  function rollAscension(rng, tier) {
    const rolls = ASCEND_CHANCE.map(() => rng.next());
    let t = tier;
    while (t < TOP_TIER && rolls[t] < ASCEND_CHANCE[t]) t++;
    return t;
  }

  function startSpin(rngFor, bet, progress, modeId) {
    const mode = getMode(modeId);
    const rng = rngFor('');
    const grid = spinGrid(rng, mode.strips.base);
    const loot = rollLoot(rng, mode, progress.gear, progress.dry);
    const ascendRoll = (t) => rollAscension(rng, t);
    const ev = evaluate(grid, mode);
    const scatterCount = ev.scatterCells.length;
    const scatterX = (mode.scatterPay[scatterCount] || 0) * mode.scale;
    const baseX = Math.min(ev.waysX + scatterX, mode.maxWinX);

    let gear = loot ? loot.gear : progress.gear;
    const geared = gear === GEAR_FULL;
    let triggered = scatterTier(scatterCount);
    let source = triggered === null ? null : 'scatter';
    if (geared) {
      triggered = triggered === null ? 0 : Math.min(triggered + 1, 2);
      source = source ? 'scatter+gear' : 'gear';
      gear = 0;
    }
    let bonus = null;
    if (triggered !== null && baseX < mode.maxWinX) {
      const tier = ascendRoll(triggered);
      bonus = { source, triggeredTier: triggered, tier };
    } else {
      ascendRoll(0);
    }
    return {
      kind: 'spin',
      mode: modeId,
      bet,
      costX: 1,
      progressBefore: { gear: progress.gear, dry: progress.dry },
      progressAfter: { gear, dry: bonus ? 0 : progress.dry + 1 },
      loot,
      base: { grid, wins: ev.wins, scatterCells: ev.scatterCells, scatterX, winX: baseX },
      bonus,
    };
  }

  function startBuy(rngFor, bet, progress, modeId, buyId, heroId = DEFAULT_HERO) {
    const buy = BUYS.find((b) => b.id === buyId);
    if (!buy) throw new Error(`Unknown buy: ${buyId}`);
    const rng = rngFor('');
    const mysteryRoll = rng.next();
    let rolled = buy.tier;
    if (rolled === null) {
      let acc = 0;
      rolled = buy.weights.length - 1;
      for (let t = 0; t < buy.weights.length; t++) {
        acc += buy.weights[t];
        if (mysteryRoll < acc) { rolled = t; break; }
      }
    }
    const tier = rollAscension(rng, rolled);
    return {
      kind: 'buy',
      buy: buyId,
      mode: modeId,
      bet,
      costX: buyPrice(modeId, buyId, heroId),
      progressBefore: { gear: progress.gear, dry: progress.dry },
      progressAfter: { gear: progress.gear, dry: progress.dry },
      loot: null,
      base: null,
      bonus: {
        source: buy.glory ? 'glory' : buy.tier === null ? 'mystery' : 'buy', triggeredTier: rolled, tier, glory: !!buy.glory,
        ...(buy.glory ? { hero: heroId } : {}),
      },
    };
  }

  const canGamble = (round) => !!round.bonus && round.bonus.tier !== null && round.bonus.tier < TOP_TIER && !round.bonus.glory;

  function gamble(rngFor, modeId, tier) {
    const chance = gambleChance(modeId, tier);
    const roll = rngFor('gamble').next();
    const won = roll < chance;
    return { from: tier, to: won ? tier + 1 : null, chance, won };
  }

  function finishRound(rngFor, round, heroId = DEFAULT_HERO) {
    const mode = getMode(round.mode);
    const baseX = round.base ? round.base.winX : 0;
    let raid = null;
    if (round.bonus && round.bonus.tier !== null) {
      const hero = round.bonus.hero || heroId;
      getHero(hero);
      raid = runRaid(rngFor('raid'), mode, round.bonus.tier, baseX, !!round.bonus.glory, hero);
    }
    const totalX = baseX + (raid ? raid.totalX : 0);
    return { ...round, raid, totalX, totalWin: Math.round(totalX * round.bet * 100) / 100 };
  }

  function playRound(rngFor, opts) {
    const mode = opts.mode || DEFAULT_MODE;
    const progress = opts.progress || { gear: 0, dry: 0 };
    const round = opts.buy
      ? startBuy(rngFor, opts.bet, progress, mode, opts.buy, opts.hero || DEFAULT_HERO)
      : startSpin(rngFor, opts.bet, progress, mode);
    round.gambles = [];
    for (let i = 0; i < (opts.gambles || 0); i++) {
      if (!canGamble(round)) break;
      const g = gamble(rngFor, mode, round.bonus.tier);
      round.gambles.push(g);
      round.bonus = { ...round.bonus, tier: g.to };
      if (!g.won) break;
    }
    return finishRound(rngFor, round, opts.hero || DEFAULT_HERO);
  }

  return {
    REELS, ROWS, BUY_RTP, SYMBOLS, TIERS, TOP_TIER, ASCEND_CHANCE, MYSTERY_WEIGHTS, GLORY_WEIGHTS, BUYS,
    GEAR, GEAR_FULL, CACHES, MODES, DEFAULT_MODE, HEROES, DEFAULT_HERO,
    getMode, getHero, heroScaleFor, lootChance, payFor, minLength, gearCount, gambleChance, canGamble, buyPrice, raidBosses,
    startSpin, startBuy, gamble, finishRound, playRound, runRaid, evaluate,
  };
});
