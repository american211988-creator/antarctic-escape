'use strict';
/* 남극 대탈출 — an endless chase runner.
   Four zones loop as you run: 빙원 → 빙하 동굴 → 눈보라 고원 → 에레버스 화산. */
(() => {
// ============================================================ constants
const W = 960, H = 540, GROUND = 440, PX = 360;
const GRAV = 2300, JUMP_V = 860, JUMP2_V = 740, VENT_V = 1350;
const CATCH = 30, GAP_MAX = 340, ZONE_LEN = 400, CEIL_Y = 82;
const FONT = '-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let dpr = 1;
function fit() { dpr = Math.min(window.devicePixelRatio || 1, 2); cv.width = W * dpr; cv.height = H * dpr; }
fit(); addEventListener('resize', fit);

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(c1, c2, t) { if (t <= 0) return c1; const a = hex2rgb(c1), b = hex2rgb(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ============================================================ save data
const SAVE_KEY = 'antarctic-escape-v2';
const UPG_DEFAULT = { cocoa: 0, shield: 0, sled: 0, magnet: 0, boots: 0 };
const save = { best: 0, bestScore: 0, fish: 0, muted: false, runs: 0, upg: { ...UPG_DEFAULT } };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s) { Object.assign(save, s); save.upg = { ...UPG_DEFAULT, ...(s.upg || {}) }; }
  else { const old = +localStorage.getItem('antarctic-escape-best'); if (old) save.best = old; }
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

const UPGRADES = [
  { id: 'cocoa',  name: '보온병 코코아', desc: '시작할 때 공룡과 더 멀리 떨어져요', max: 3, cost: [40, 90, 180] },
  { id: 'shield', name: '얼음 방패',     desc: '한 번 막아주는 방패를 들고 시작해요', max: 1, cost: [120] },
  { id: 'sled',   name: '썰매 정비',     desc: '썰매를 더 오래 탈 수 있어요',       max: 3, cost: [60, 130, 250] },
  { id: 'magnet', name: '자석 장갑',     desc: '자석 효과가 더 오래 가요',          max: 3, cost: [50, 110, 220] },
  { id: 'boots',  name: '펭귄 부츠',     desc: '공중에서 한 번 더! 3단 점프',        max: 1, cost: [300] },
];

const ZONES = [
  { name: '빙원',         hint: '얼음과 크레바스를 뛰어넘어라!',        sky: ['#0b1a3a', '#2c5a8f', '#9cc8ea'], g1: '#ffffff', g2: '#8fb8db', snow: 1 },
  { name: '빙하 동굴',     hint: '떨어지는 고드름과 낮은 천장을 조심!',   sky: ['#040917', '#0d2242', '#1f4a74'], g1: '#cfeaff', g2: '#4f84b5', snow: 0.25 },
  { name: '눈보라 고원',   hint: '돌풍이 불면 ↓ 슬라이드로 버텨라!',     sky: ['#3a4a60', '#7d93ab', '#c9d6e2'], g1: '#f6f9fc', g2: '#a5b8c9', snow: 3.2 },
  { name: '에레버스 화산', hint: '넓은 용암은 증기 분출구를 밟고 넘어라!', sky: ['#12060a', '#4a1410', '#b4482a'], g1: '#e8dcd6', g2: '#6e5a55', snow: 0 },
];
const zoneAt = d => Math.floor(Math.max(0, d) / ZONE_LEN) % ZONES.length;

// ============================================================ audio
let ac = null, master = null, noiseBuf = null;
function audio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = save.muted ? 0 : 0.9; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function setMuted(m) { save.muted = m; persist(); if (master) master.gain.value = m ? 0 : 0.9; }
function tone(f, dur, type = 'square', vol = 0.06, f2 = null, when = 0) {
  if (!ac) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.1, freq = 1000, type = 'lowpass', when = 0, f2 = null) {
  if (!ac) return;
  const t = ac.currentTime + when, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}
const SFX = {
  jump: () => tone(480, 0.12, 'square', 0.05, 900),
  jump2: () => tone(700, 0.14, 'square', 0.045, 1400),
  land: () => noise(0.08, 0.06, 600),
  slide: () => noise(0.25, 0.05, 2500, 'bandpass', 0, 800),
  hit: () => { tone(150, 0.3, 'sawtooth', 0.1, 50); noise(0.25, 0.15, 1500); },
  shard: () => noise(0.3, 0.1, 4000, 'highpass'),
  fish: () => tone(1200 + Math.random() * 250, 0.07, 'square', 0.03),
  cocoa: () => { tone(660, 0.08, 'square', 0.05); tone(990, 0.12, 'square', 0.05, null, 0.07); },
  power: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.045, null, i * 0.06)),
  shieldBreak: () => { noise(0.4, 0.15, 5000, 'highpass'); tone(900, 0.3, 'triangle', 0.06, 200); },
  near: () => tone(1500, 0.06, 'sine', 0.05, 2200),
  vent: () => noise(0.6, 0.12, 800, 'bandpass', 0, 3000),
  penguin: () => { tone(900, 0.08, 'square', 0.04, 600); tone(700, 0.1, 'square', 0.04, 400, 0.08); },
  boom: () => { noise(0.6, 0.2, 400, 'lowpass', 0, 60); tone(80, 0.5, 'sine', 0.15, 30); },
  fall: () => tone(700, 0.8, 'sine', 0.07, 90),
  roar: () => { noise(1.1, 0.35, 600, 'lowpass', 0, 120); tone(95, 1.0, 'sawtooth', 0.09, 45); tone(140, 0.9, 'sawtooth', 0.05, 60); },
  click: () => tone(800, 0.05, 'square', 0.04),
  buy: () => { tone(784, 0.1, 'square', 0.05); tone(1175, 0.18, 'square', 0.05, null, 0.08); },
  deny: () => tone(200, 0.15, 'square', 0.05, 150),
  gust: () => noise(2.2, 0.09, 400, 'bandpass', 0, 1400),
  crack: () => noise(0.15, 0.08, 3000, 'highpass'),
};
// procedural chase music: kick, hats, bass and an arpeggio that speeds up with the run
const MUSIC = { next: 0, step: 0 };
const ZROOT = [110, 98, 123.47, 87.31];
const ZSCALE = [[0, 3, 7, 10], [0, 2, 3, 7], [0, 5, 7, 10], [0, 1, 5, 7]];
const PROG = [0, -2, -4, -5];
function musicUpdate() {
  if (!ac || state !== 'play' || paused) { MUSIC.next = 0; return; }
  const bpm = 120 + clamp((speed - 380) / 620, 0, 1) * 40, sd = 60 / bpm / 4;
  if (MUSIC.next < ac.currentTime) MUSIC.next = ac.currentTime + 0.05;
  while (MUSIC.next < ac.currentTime + 0.12) { playStep(MUSIC.step, MUSIC.next - ac.currentTime); MUSIC.next += sd; MUSIC.step++; }
}
function playStep(s, when) {
  const z = zoneAt(dist), root = ZROOT[z], sc = ZSCALE[z], st = s % 16, bar = Math.floor(s / 16) % 4;
  const base = root * Math.pow(2, PROG[bar] / 12);
  if (st % 4 === 0) tone(120, 0.12, 'sine', 0.1, 40, when);
  if (st % 4 === 2) noise(0.04, 0.02, 7000, 'highpass', when);
  if ([0, 3, 6, 10, 12].includes(st)) tone(base / 2, 0.16, 'triangle', 0.08, null, when);
  if (st % 2 === 0) tone(base * 2 * Math.pow(2, sc[(st / 2) % 4] / 12), 0.09, 'square', 0.014, null, when);
  if (gapRatio() < 0.3 && (st === 0 || st === 3)) tone(62, 0.16, 'sine', 0.22, 36, when);
}

// ============================================================ state
let state = 'title', stateT = 0, paused = false, menuSel = 0, buttons = [];
let time = 0, dist = 0, speed = 0, gap = 250, dinoX = 0, score = 0, fishRun = 0, combo = 0, bestCombo = 0;
let obstacles = [], items = [], hazards = [], projs = [], parts = [], texts = [];
let shake = 0, flash = 0, hitStop = 0, invuln = 0, spawnCursor = 0, attackT = 0, roarShow = 0, mouthBoost = 0, bgOff = 0, breathT = 0;
let shield = 0, sledT = 0, sledMax = 1, magnetT = 0, magnetMax = 1, gustT = 0, gustCD = 6, bannerT = 0, bannerZone = 0, lastZone = 0;
let overReason = '', newBest = false, earned = 0, wasSliding = false, introBurst = false;
const P = { y: GROUND, vy: 0, onGround: true, jumps: 0, anim: 0, falling: false, coyote: 0, buffer: 0, squash: 0, hurtT: 0 };
const input = { down: false, jumpHeld: false };
const flakes = Array.from({ length: 420 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.2 + 0.6, s: rand(30, 80), w: Math.random() * 6.28 }));
const embers = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: rand(1, 3), s: rand(20, 60), w: Math.random() * 6.28, hot: Math.random() < 0.35 }));

const debugStart = +(new URLSearchParams(location.search).get('start') || 0);

const diff = () => clamp(dist / 1500, 0, 1);
const gapRatio = () => clamp((gap - CATCH) / (GAP_MAX - CATCH), 0, 1);
const isSliding = () => input.down && P.onGround && !P.falling && sledT <= 0 && state === 'play';

function setState(s) { state = s; stateT = 0; menuSel = 0; }

function newRun() {
  time = 0; dist = debugStart; speed = 0; gap = 250 + save.upg.cocoa * 30; dinoX = 320;
  score = 0; fishRun = 0; combo = 0; bestCombo = 0; earned = 0;
  obstacles = []; items = []; hazards = []; projs = []; parts = []; texts = [];
  shake = 0; flash = 0; hitStop = 0; invuln = 0; spawnCursor = 900; attackT = 8; roarShow = 0; mouthBoost = 0;
  shield = save.upg.shield ? 1 : 0; sledT = 0; magnetT = 0; gustT = 0; gustCD = 5;
  sledMax = 5 + save.upg.sled * 1.5; magnetMax = 7 + save.upg.magnet * 3;
  lastZone = zoneAt(dist); bannerT = 0; newBest = false; introBurst = false; wasSliding = false;
  Object.assign(P, { y: GROUND, vy: 0, onGround: true, jumps: 0, anim: 0, falling: false, coyote: 0, buffer: 0, squash: 0, hurtT: 0 });
  input.down = false;
  setState('intro');
}

// ============================================================ input
function pressJump() {
  if (state !== 'play' || paused) return;
  input.jumpHeld = true; P.buffer = 0.13;
  if (tryJump()) P.buffer = 0;
}
function releaseJump() {
  input.jumpHeld = false;
  if (state === 'play' && P.vy < -380 && !P.falling) P.vy = -380; // short hop when tapped
}
function tryJump() {
  if (P.falling || state !== 'play') return false;
  if (P.onGround || P.coyote > 0) {
    P.vy = sledT > 0 ? -JUMP_V * 0.92 : -JUMP_V; P.onGround = false; P.coyote = 0; P.jumps = 1; P.squash = -0.25;
    SFX.jump(); puff(PX + 17, GROUND, 8); return true;
  }
  const maxJ = 2 + (save.upg.boots ? 1 : 0);
  if (P.jumps < maxJ && sledT <= 0) {
    P.vy = -JUMP2_V; P.jumps++; SFX.jump2();
    addP({ kind: 'ring', x: PX + 17, y: P.y - 10, r: 6, life: 0.35, max: 0.35, c: '#bfefff' });
    return true;
  }
  return false;
}
function startSlide() {
  if (state !== 'play' || paused) return;
  if (!input.down && P.onGround && sledT <= 0) SFX.slide();
  input.down = true;
}
function menuMove(d) { if (buttons.length) { menuSel = (menuSel + d + buttons.length) % buttons.length; SFX.click(); } }
function menuActivate() { const b = buttons[menuSel]; if (!b) return; if (b.enabled) { b.act(); } else SFX.deny(); }
const inMenu = () => state === 'title' || state === 'shop' || (state === 'over' && stateT > 0.9) || (state === 'play' && paused);
function togglePause() {
  if (state !== 'play') return;
  paused = !paused; menuSel = 0; input.down = false; SFX.click();
}

addEventListener('keydown', e => {
  audio();
  // fall back to e.key for keyboards/browsers that report an unexpected e.code
  const keyMap = { Enter: 'Enter', ' ': 'Space', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Escape: 'Escape' };
  const c = keyMap[e.key] || e.code;
  if (c === 'KeyM') { setMuted(!save.muted); return; }
  if (c === 'Escape' && state === 'shop') { setState('title'); SFX.click(); return; }
  if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (inMenu()) {
    if (['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(c)) { e.preventDefault(); menuMove(-1); }
    else if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD', 'Tab'].includes(c)) { e.preventDefault(); menuMove(1); }
    else if (c === 'Enter' || c === 'Space') { e.preventDefault(); if (!e.repeat) menuActivate(); }
    return;
  }
  if (state === 'play') {
    if (['Space', 'ArrowUp', 'KeyW'].includes(c)) { e.preventDefault(); if (!e.repeat) pressJump(); }
    else if (['ArrowDown', 'KeyS'].includes(c)) { e.preventDefault(); startSlide(); }
  }
});
addEventListener('keyup', e => {
  const c = e.key === ' ' ? 'Space' : e.key === 'ArrowUp' || e.key === 'ArrowDown' ? e.key : e.code;
  if (['Space', 'ArrowUp', 'KeyW'].includes(c)) releaseJump();
  if (['ArrowDown', 'KeyS'].includes(c)) input.down = false;
});

function toCanvas(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const PAUSE_BTN = { x: W - 54, y: 12, w: 42, h: 42 }, MUTE_BTN = { x: W - 104, y: 12, w: 42, h: 42 };
const pointers = new Map();
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); audio(); cv.focus();
  const p = toCanvas(e);
  if (inMenu()) {
    const i = buttons.findIndex(b => inRect(p, b));
    if (i >= 0) { menuSel = i; menuActivate(); }
    return;
  }
  if (state !== 'play') return;
  if (inRect(p, PAUSE_BTN)) { togglePause(); return; }
  if (inRect(p, MUTE_BTN)) { setMuted(!save.muted); return; }
  if (p.x < W * 0.4) { pointers.set(e.pointerId, 'slide'); startSlide(); }
  else { pointers.set(e.pointerId, 'jump'); pressJump(); }
});
function endPointer(e) {
  const k = pointers.get(e.pointerId); if (!k) return;
  pointers.delete(e.pointerId);
  if (k === 'slide' && ![...pointers.values()].includes('slide')) input.down = false;
  if (k === 'jump') releaseJump();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointermove', e => {
  if (!inMenu() || e.pointerType !== 'mouse') return;
  const p = toCanvas(e), i = buttons.findIndex(b => inRect(p, b));
  if (i >= 0 && i !== menuSel) menuSel = i;
  cv.style.cursor = i >= 0 ? 'pointer' : 'default';
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !paused) togglePause(); });

// ============================================================ particles & text
function addP(o) {
  parts.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 0.5, max: 0.5, r: 3, c: '#fff', kind: 'dot', rot: 0, vr: 0, world: true }, o));
  if (parts.length > 700) parts.splice(0, parts.length - 700);
}
function puff(x, y, n, c = '#ffffff') { for (let i = 0; i < n; i++) addP({ x, y, vx: rand(-140, 60), vy: rand(-170, -30), g: 300, life: rand(0.3, 0.6), max: 0.6, r: rand(2, 5), c }); }
function shards(x, y, n = 18, cols = ['#bfefff', '#ffffff', '#8fd3ff']) {
  for (let i = 0; i < n; i++) addP({ kind: 'shard', x, y, vx: rand(-280, 280), vy: rand(-420, -60), g: 1100, life: rand(0.5, 0.95), max: 0.95, r: rand(3, 7), c: cols[i % cols.length], rot: rand(0, 6), vr: rand(-12, 12) });
}
function sparkle(x, y, c = '#ffd76a', n = 14) { for (let i = 0; i < n; i++) { const a = i / n * 6.28; addP({ x, y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 0.45, max: 0.45, r: 3, c }); } }
function smoke(x, y, c = 'rgba(255,255,255,0.6)', r = 8, vy = -60) { addP({ kind: 'smoke', x, y, vx: rand(-20, 20), vy, life: rand(0.6, 1.1), max: 1.1, r, c }); }
function floatText(x, y, s, c = '#fff', size = 18) { texts.push({ x, y, s, c, size, life: 1.1 }); }

// ============================================================ spawning
const add = o => { obstacles.push(o); return o; };
const block = (x, w = 52, h = 48) => add({ type: 'block', x, w, h });
function fishLine(x, n, y) { for (let i = 0; i < n; i++) items.push({ kind: 'fish', x: x + i * 44, y, bob: i * 0.6 }); }
function fishArc(x1, x2, peak, n) {
  for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); items.push({ kind: 'fish', x: lerp(x1, x2, k), y: GROUND - 40 - (GROUND - 40 - peak) * 4 * k * (1 - k), bob: i * 0.5 }); }
}
const holeW = (u, d) => clamp(u * rand(0.42, 0.6 + 0.3 * d), 80, u * 0.95);
function addPower(x) {
  const pool = ['cocoa', 'cocoa', 'sled', 'magnet'];
  if (!shield) pool.push('shield', 'shield');
  items.push({ kind: pool[Math.floor(Math.random() * pool.length)], x, y: GROUND - rand(60, 150), bob: rand(0, 6), power: true });
}

const PATTERNS = [
  // 빙원 / 공용
  { z: [0, 2], w: 3, f: x => { block(x); fishArc(x - 50, x + 100, GROUND - 160, 5); return 52; } },
  { z: [0, 1, 2, 3], w: 1.5, min: 0.1, f: (x, u) => { block(x); block(x + u * 1.45); return u * 1.45 + 52; } },
  { z: [0, 2], w: 2, min: 0.12, f: x => { add({ type: 'tall', x, w: 44, h: 94 }); return 44; } },
  { z: [0, 2], w: 2.2, min: 0.02, f: (x, u, d) => { const w = holeW(u, d); add({ type: 'hole', sub: 'crevasse', x, w }); fishArc(x - 20, x + w + 20, GROUND - 140, 4); return w; } },
  { z: [0, 1, 2, 3], w: 1.6, min: 0.18, f: x => { add({ type: 'ptero', x, w: 74, h: 46, y: GROUND - 100, flap: rand(0, 6) }); return 74; } },
  { z: [0, 2, 3], w: 1, min: 0.35, f: x => { add({ type: 'ptero', x, w: 74, h: 46, y: GROUND - 180, flap: rand(0, 6) }); fishLine(x + 60, 3, GROUND - 40); return 74; } },
  { z: [0, 2], w: 1.4, min: 0.06, f: x => { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) add({ type: 'penguin', x: x + i * 34, w: 28, h: 36, ph: rand(0, 6) }); return n * 34; } },
  { z: [0, 2], w: 1.1, min: 0.25, f: (x, u) => { const w = u * rand(1.0, 1.35); add({ type: 'thin', x, w, stress: 0 }); fishLine(x + 20, Math.floor(w / 50), GROUND - 110); return w; } },
  // 빙하 동굴
  { z: [1], w: 3, f: (x, u) => { const n = 2 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) hazards.push({ kind: 'icicle', x: x + i * u * 0.85, y: CEIL_Y, vy: 0, hang: true, g: 2600 }); return n * u * 0.85; } },
  { z: [1], w: 2.4, f: (x, u) => { const w = u * rand(0.6, 1.3); add({ type: 'ceil', x, w, seed: Math.random() * 100 }); fishLine(x + 20, Math.max(2, Math.floor(w / 46)), GROUND - 20); return w; } },
  { z: [1], w: 1.8, f: x => { add({ type: 'tall', sub: 'stalag', x, w: 40, h: 88 }); return 40; } },
  { z: [1], w: 1.5, f: (x, u, d) => { const w = holeW(u, d); add({ type: 'hole', sub: 'crevasse', x, w }); return w; } },
  { z: [1], w: 1, f: x => { block(x); fishArc(x - 50, x + 100, GROUND - 160, 5); return 52; } },
  // 눈보라 고원
  { z: [2], w: 2.4, f: x => { add({ type: 'snowball', x: x + 220, r: rand(22, 30), rot: 0, bounce: 0, vb: 0, w: 52 }); return 60; } },
  // 에레버스 화산
  { z: [3], w: 2.6, f: (x, u, d) => { const w = holeW(u, d); add({ type: 'hole', sub: 'lava', x, w }); fishArc(x - 20, x + w + 20, GROUND - 140, 4); return w; } },
  { z: [3], w: 2.2, f: (x, u) => { add({ type: 'vent', x, w: 56, ph: Math.random() * 3 }); const lx = x + 56 + u * 0.15, w = u * 1.2; add({ type: 'hole', sub: 'lava', x: lx, w }); fishArc(x + 30, lx + w, GROUND - 330, 7); return lx + w - x; } },
  { z: [3], w: 2, f: x => { add({ type: 'rock', x, w: 46, h: rand(60, 96) }); return 46; } },
  { z: [3], w: 1.4, min: 0.15, f: (x, u) => { add({ type: 'rock', x, w: 46, h: 58 }); add({ type: 'rock', x: x + u * 1.4, w: 46, h: 70 }); return u * 1.4 + 46; } },
];

function spawnPattern() {
  const z = zoneAt(dist + (W - PX) / 40), d = diff(), u = Math.max(260, speed * 0.72);
  const cands = PATTERNS.filter(p => p.z.includes(z) && (p.min || 0) <= d);
  let r = Math.random() * cands.reduce((a, p) => a + p.w, 0), pat = cands[0];
  for (const p of cands) { if ((r -= p.w) <= 0) { pat = p; break; } }
  const x0 = W + 60, len = pat.f(x0, u, d);
  const rest = u * rand(1.25, 2.1) * (1 - 0.15 * d) + 90;
  const gx = x0 + len + rest * 0.5, roll = Math.random();
  if (roll < 0.1) addPower(gx);
  else if (roll < 0.33) items.push({ kind: 'cocoa', x: gx, y: Math.random() < 0.5 ? GROUND - 150 : GROUND - 40, bob: rand(0, 6), power: true });
  else if (roll < 0.6) fishLine(gx - 66, 4, GROUND - 40);
  spawnCursor = len + rest;
}

// ============================================================ dinosaur attacks
function dinoAttack() {
  const z = zoneAt(dist), d = diff();
  const moves = ['roar'];
  if (dist > 150) moves.push('throw', 'throw');
  const m = moves[Math.floor(Math.random() * moves.length)];
  if (m === 'roar') {
    roarShow = 1.3; shake = 12; mouthBoost = 1; SFX.roar();
    const kind = z === 3 ? 'rock' : 'chunk';
    const n = 1 + Math.floor(Math.random() * (2 + d * 2));
    for (let i = 0; i < n; i++) dropHazard(kind, PX + rand(170, 560));
  } else {
    mouthBoost = 1; roarShow = 0.5;
    projs.push({ sx: dinoX - 10, sy: GROUND - 205, tx: PX + rand(200, 280) + speed * 1.1, t: 0, T: 1.1, h: 230, rot: 0 });
    tone(300, 0.3, 'sawtooth', 0.06, 120);
  }
  attackT = rand(6.5, 10.5) - d * 2.5;
}
function dropHazard(kind, landX) {
  const T = 0.85;
  hazards.push({ kind, x: landX + speed * T, y: -60, vy: 0, hang: false, g: 2 * (GROUND + 60) / (T * T) });
}

// ============================================================ collisions
function pbox() {
  if (sledT > 0) return { x: PX - 18, y: P.y - 44, w: 72, h: 44 };
  if (isSliding()) return { x: PX - 12, y: P.y - 28, w: 58, h: 28 };
  return { x: PX, y: P.y - 66, w: 34, h: 66 };
}
function obox(o) {
  switch (o.type) {
    case 'ptero': return { x: o.x + 8, y: o.y + 8, w: o.w - 16, h: o.h - 16 };
    case 'ceil': return { x: o.x, y: 0, w: o.w, h: GROUND - 58 };
    case 'snowball': return { x: o.x - o.r, y: GROUND - o.r * 2 - o.bounce, w: o.r * 2, h: o.r * 2 };
    case 'penguin': return { x: o.x, y: GROUND - o.h, w: o.w, h: o.h };
    default: return { x: o.x, y: GROUND - o.h, w: o.w, h: o.h };
  }
}
const SOLID = new Set(['block', 'tall', 'boulder', 'spike', 'rock', 'ptero', 'ceil', 'snowball']);
const overlap = (a, b, i = 5) => a.x + i < b.x + b.w - i && a.x + a.w - i > b.x + i && a.y + i < b.y + b.h - i && a.y + a.h > b.y + i;
const holeAt = x => obstacles.some(o => o.type === 'hole' && x > o.x + 8 && x < o.x + o.w - 8);
const groundTypeAt = (type, x) => obstacles.find(o => o.type === type && x > o.x && x < o.x + o.w);

function hurt(amount = 80, msg = '쿵! 공룡이 가까워졌다!') {
  if (invuln > 0 || sledT > 0) return;
  if (shield > 0) {
    shield = 0; invuln = 1.0; SFX.shieldBreak(); shake = 8;
    shards(PX + 17, P.y - 34, 22, ['#9fe8ff', '#ffffff', '#5fd0ff']);
    floatText(PX + 17, P.y - 100, '방패가 막아줬다!', '#9fe8ff'); return;
  }
  gap -= amount; invuln = 1.25; hitStop = 0.07; shake = 16; flash = 0.25; P.hurtT = 0.45;
  if (combo >= 5) floatText(PX + 17, P.y - 120, `콤보 ${combo} 끊김`, '#ffb3b3', 15);
  combo = 0;
  SFX.hit(); shards(PX + 17, P.y - 30);
  floatText(PX + 17, P.y - 96, msg, '#ff6b6b');
}
function nearMiss() {
  combo++; bestCombo = Math.max(bestCombo, combo);
  gap = Math.min(GAP_MAX, gap + 6); score += 15 * combo;
  SFX.near(); floatText(PX + 17, P.y - 96, `아슬아슬! x${combo}`, '#9fffc8', 16);
}
const mult = () => 1 + Math.min(combo, 20) * 0.05;

function gameOver(reason) {
  if (state !== 'play') return;
  overReason = reason; input.down = false; shake = 22; flash = reason === 'caught' ? 0.6 : 0.2;
  const m = Math.floor(dist - debugStart);
  earned = fishRun;
  save.fish += fishRun; save.runs++;
  newBest = !debugStart && m > save.best;
  if (!debugStart) { save.best = Math.max(save.best, m); save.bestScore = Math.max(save.bestScore, Math.floor(score)); }
  persist();
  if (reason === 'caught') SFX.roar(); else if (reason === 'lava') { SFX.boom(); } else SFX.fall();
  setState('over');
}

// ============================================================ update
function update(dt) {
  time += dt; stateT += dt;
  const wind = state === 'play' || state === 'over' ? speed * 0.22 + (gustT > 0 ? 420 : 0) : 40;
  for (const f of flakes) {
    f.y += f.s * dt * (gustT > 0 ? 0.6 : 1); f.x -= (wind * (f.r / 2.6) + Math.sin(time + f.w) * 15) * dt;
    if (f.y > H) { f.y = -5; f.x = Math.random() * W; } if (f.x < -5) { f.x = W + 5; f.y = Math.random() * H; }
  }
  for (const e of embers) {
    e.y -= e.s * dt; e.x -= (wind * 0.5 + Math.sin(time * 2 + e.w) * 20) * dt;
    if (e.y < -5) { e.y = H + 5; e.x = Math.random() * W; } if (e.x < -5) e.x = W + 5;
  }
  const scroll = state === 'play' && !paused ? speed * dt : state === 'title' ? 30 * dt : 0;
  for (const p of parts) {
    p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.world) p.x -= scroll;
    if (p.kind === 'smoke') p.r += dt * 26; if (p.kind === 'ring') p.r += dt * 160;
  }
  parts = parts.filter(p => p.life > 0);
  for (const t of texts) { t.life -= dt * 0.8; t.y -= 32 * dt; }
  texts = texts.filter(t => t.life > 0);
  shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 1.6);
  roarShow = Math.max(0, roarShow - dt); mouthBoost = Math.max(0, mouthBoost - dt * 1.2);
  bannerT = Math.max(0, bannerT - dt);

  if (state === 'title' || state === 'shop') { bgOff += 30 * dt; return; }
  if (state === 'intro') return updateIntro(dt);
  if (state === 'over') return updateOver(dt);
  if (paused) return;
  if (hitStop > 0) { hitStop -= dt; return; }
  updatePlay(dt);
}

function updateIntro(dt) {
  // the ice block shakes, then bursts open and the chase begins
  if (stateT > 1.4 && !introBurst) {
    introBurst = true; shake = 22; flash = 0.5; roarShow = 1.6; mouthBoost = 1.5; SFX.roar(); SFX.shard();
    shards(190, GROUND - 130, 50, ['#cfefff', '#ffffff', '#9fd8ff', '#e6f7ff']);
    for (let i = 0; i < 10; i++) smoke(rand(60, 320), GROUND - rand(0, 240), 'rgba(230,245,255,0.7)', 14, -20);
  }
  if (introBurst && stateT > 1.65 && P.onGround && stateT < 1.8) { P.vy = -520; P.onGround = false; floatText(PX + 17, GROUND - 100, '!!', '#ffd76a', 30); }
  if (!P.onGround) { P.vy += GRAV * dt; P.y += P.vy * dt; if (P.y >= GROUND) { P.y = GROUND; P.vy = 0; P.onGround = true; } }
  if (stateT > 2.3) { setState('play'); paused = false; bannerT = 3; bannerZone = zoneAt(dist); }
}

function updateOver(dt) {
  if (overReason === 'caught') dinoX += (PX + 60 - dinoX) * Math.min(1, dt * 9);
  else { P.vy += GRAV * dt; P.y += P.vy * dt; dinoX += (PX - 70 - dinoX) * dt * 2; }
  if (overReason === 'lava' && Math.random() < 0.5) addP({ kind: 'ember', x: PX + rand(0, 34), y: GROUND, vx: rand(-60, 60), vy: rand(-260, -80), g: 300, life: 0.8, max: 0.8, r: rand(2, 4), c: '#ffb347', world: false });
}

function updatePlay(dt) {
  const d = diff();
  const target = Math.min(1000, 380 + dist * 0.32);
  speed = Math.min(target, speed + 420 * dt);
  const dx = speed * dt;
  dist += dx / 40; bgOff += dx;
  score += dx / 40 * mult();
  invuln = Math.max(0, invuln - dt); P.hurtT = Math.max(0, P.hurtT - dt);
  if (sledT > 0) { sledT -= dt; gap = Math.min(GAP_MAX, gap + 22 * dt); if (sledT <= 0) { invuln = 0.8; floatText(PX + 17, P.y - 90, '썰매 끝!', '#ffd76a', 15); } }
  magnetT = Math.max(0, magnetT - dt);

  // zone change banner
  const z = zoneAt(dist);
  if (z !== lastZone) { lastZone = z; bannerZone = z; bannerT = 3.2; tone(523, 0.15, 'triangle', 0.05); tone(784, 0.25, 'triangle', 0.05, null, 0.12); }

  // the dinosaur closes in
  gap -= (5 + 7 * d + Math.max(0, gap - 200) * 0.06) * dt;
  const tx = PX - gap;
  dinoX += (tx - dinoX) * Math.min(1, dt * (dinoX > tx + 40 ? 1.2 : 5));
  breathT -= dt;
  if (breathT <= 0) { breathT = 0.45; smoke(dinoX - 6, GROUND - 236, 'rgba(235,248,255,0.55)', 6, -30); }
  if (Math.random() < 0.4) puff(dinoX - 130 + rand(-40, 40), GROUND, 1);

  attackT -= dt;
  if (attackT <= 0 && dinoX > -60) dinoAttack();

  // blizzard gusts
  if (z === 2 && (dist % ZONE_LEN) > 30) {
    gustCD -= dt;
    if (gustCD <= 0 && gustT <= 0) { gustT = 2.6; gustCD = rand(6, 9); SFX.gust(); floatText(W / 2, 150, '돌풍이다! ↓ 슬라이드로 버텨!', '#ffffff', 22); }
  }
  if (gustT > 0) {
    gustT -= dt;
    if (!isSliding() && sledT <= 0 && !P.falling) gap -= 26 * dt;
    if (Math.random() < 0.6) addP({ kind: 'line', x: W + 10, y: rand(40, GROUND), vx: -1400, life: 0.7, max: 0.7, r: rand(40, 110), c: 'rgba(255,255,255,0.5)', world: false });
  }

  // spawn
  spawnCursor -= dx;
  if (spawnCursor <= 0) spawnPattern();

  // move world objects
  for (const o of obstacles) {
    o.x -= dx;
    if (o.type === 'ptero') { o.x -= 80 * dt; o.flap += dt * 10; }
    else if (o.type === 'snowball') {
      o.x -= 170 * dt; o.rot -= (dx + 170 * dt) / o.r; o.vb -= 1600 * dt; o.bounce += o.vb * dt;
      if (o.bounce <= 0) { o.bounce = 0; o.vb = rand(180, 320); puff(o.x, GROUND, 4); }
    } else if (o.type === 'penguin' && o.fly) { o.x += o.vx * dt + dx * 0.4; o.fy += o.vy * dt; o.vy += 1400 * dt; o.spin += dt * 14; }
    else if (o.type === 'penguin') { o.x += 30 * dt; o.ph += dt * 10; }
    else if (o.type === 'vent') { o.ph += dt; if (Math.random() < 0.3) smoke(o.x + 28 + rand(-8, 8), GROUND - 6, 'rgba(255,240,230,0.45)', 6, -90); }
    else if (o.type === 'hole' && o.sub === 'lava' && Math.random() < 0.08) addP({ kind: 'ember', x: o.x + rand(10, o.w - 10), y: GROUND + 10, vx: rand(-30, 30), vy: rand(-240, -100), g: 400, life: 0.7, max: 0.7, r: rand(2, 3.5), c: '#ffb347' });
  }
  obstacles = obstacles.filter(o => o.x + o.w > -160 && !(o.fly && o.fy > H + 50));
  for (const it of items) it.x -= dx;

  // falling hazards
  for (const h of hazards) {
    h.x -= dx;
    if (h.hang && h.x < PX + speed * 0.9 + 30) { h.hang = false; SFX.crack(); for (let i = 0; i < 3; i++) addP({ x: h.x, y: h.y, vx: rand(-40, 40), vy: rand(0, 60), g: 600, life: 0.5, max: 0.5, r: 2, c: '#cfefff' }); }
    if (!h.hang) { h.vy += h.g * dt; h.y += h.vy * dt; }
    if (h.kind === 'rock' && !h.hang && Math.random() < 0.7) addP({ kind: 'smoke', x: h.x, y: h.y - 10, vx: 0, vy: -10, life: 0.5, max: 0.5, r: 6, c: 'rgba(80,60,60,0.5)' });
    if (h.y >= GROUND - 4 && !h.landed) {
      h.landed = true;
      if (holeAt(h.x)) { /* falls into the crevasse */ }
      else if (h.kind === 'icicle') { add({ type: 'spike', sub: 'ice', x: h.x - 12, w: 24, h: 30 }); shards(h.x, GROUND - 6, 8); SFX.shard(); }
      else if (h.kind === 'rock') { add({ type: 'spike', sub: 'lava', x: h.x - 18, w: 36, h: 30 }); shake = Math.max(shake, 7); SFX.boom(); for (let i = 0; i < 10; i++) addP({ kind: 'ember', x: h.x, y: GROUND - 10, vx: rand(-200, 200), vy: rand(-300, -80), g: 700, life: 0.7, max: 0.7, r: rand(2, 4), c: '#ff9a3c' }); }
      else { add({ type: 'block', x: h.x - 21, w: 42, h: 38 }); shards(h.x, GROUND - 10, 12); shake = Math.max(shake, 6); SFX.shard(); }
    }
  }
  hazards = hazards.filter(h => !h.landed && h.x > -60);

  // thrown boulders
  for (const p of projs) {
    p.t += dt; p.tx -= dx; p.rot += dt * 8;
    const k = Math.min(1, p.t / p.T);
    p.x = lerp(p.sx, p.tx, k); p.y = lerp(p.sy, GROUND - 24, k) - p.h * 4 * k * (1 - k);
    if (k >= 1) {
      p.done = true;
      if (!holeAt(p.tx)) {
        const o = add({ type: 'boulder', x: p.tx - 27, w: 54, h: 48 });
        if (overlap(pbox(), obox(o), 2)) { o.hit = true; hurt(80, '바위에 맞았다!'); }
      }
      shards(p.tx, GROUND - 20, 16, ['#9fb8c8', '#cfe6f2', '#ffffff']); shake = Math.max(shake, 10); SFX.boom();
    }
  }
  projs = projs.filter(p => !p.done);

  updatePlayer(dt);
  if (state !== 'play') return;
  collide();
  if (gap <= CATCH) gameOver('caught');
}

function updatePlayer(dt) {
  const footX = PX + 17;
  const sledOn = sledT > 0;
  const overHole = !sledOn && holeAt(footX);
  P.coyote = Math.max(0, P.coyote - dt);
  if (P.buffer > 0) { P.buffer -= dt; if (tryJump()) P.buffer = 0; }
  P.squash *= Math.exp(-dt * 12);
  P.anim += dt * (speed / 40);

  if (P.falling) {
    P.vy += GRAV * dt; P.y += P.vy * dt;
    if (P.y > GROUND + 110) { const h = obstacles.find(o => o.type === 'hole' && footX > o.x && footX < o.x + o.w); gameOver(h && h.sub === 'lava' ? 'lava' : 'fall'); }
    return;
  }
  const g = GRAV * (P.vy > 0 ? 1.15 : 1) * (!P.onGround && input.down ? 2.4 : 1);
  P.vy += g * dt; P.y += P.vy * dt;
  if (P.y >= GROUND) {
    if (overHole) {
      if (P.onGround) { P.onGround = false; P.coyote = 0.09; }
      if (P.y > GROUND + 6 && P.coyote <= 0) {
        P.falling = true; SFX.fall();
        const h = obstacles.find(o => o.type === 'hole' && footX > o.x && footX < o.x + o.w);
        floatText(PX + 17, GROUND - 90, h && h.sub === 'lava' ? '앗 뜨거!!' : '으아아악!', '#9fd8ff');
      }
    } else {
      if (!P.onGround) { puff(footX, GROUND, 6); P.squash = 0.3 * clamp(P.vy / 900, 0.2, 1); SFX.land(); }
      P.y = GROUND; P.vy = 0; P.onGround = true; P.jumps = 0;
    }
  } else if (P.onGround) P.onGround = false;

  if (P.onGround) {
    const vent = groundTypeAt('vent', footX);
    if (vent) {
      P.vy = -VENT_V; P.onGround = false; P.jumps = 1; SFX.vent(); shake = 6;
      for (let i = 0; i < 12; i++) smoke(vent.x + 28 + rand(-14, 14), GROUND - rand(0, 30), 'rgba(255,245,235,0.7)', 10, -260);
      floatText(PX + 17, GROUND - 100, '슈우욱!', '#ffe0c2');
    }
    const thin = groundTypeAt('thin', footX);
    if (thin) {
      const before = thin.stress; thin.stress += dt;
      if (before < 0.12 && thin.stress >= 0.12) SFX.crack();
      if (thin.stress > 0.3) { thin.type = 'hole'; thin.sub = 'crevasse'; thin.broke = true; shards(footX, GROUND, 20); SFX.shard(); }
    }
  }
  if (P.onGround && Math.random() < 0.35) puff(footX - 10, GROUND, 1);
  const sl = isSliding();
  if (sl && Math.random() < 0.8) puff(PX + 40, GROUND, 1, '#e6f6ff');
  if (sledOn && Math.random() < 0.9) { puff(PX - 10, GROUND, 1); addP({ kind: 'line', x: PX - 30, y: P.y - rand(10, 40), vx: -900, life: 0.25, max: 0.25, r: rand(20, 50), c: 'rgba(255,215,106,0.6)', world: false }); }
  wasSliding = sl;
}

function collide() {
  const b = pbox();
  for (const o of obstacles) {
    if (o.dead || o.fly) continue;
    if (o.type === 'penguin') {
      if (!overlap(b, obox(o), 3)) continue;
      const bowl = isSliding() || sledT > 0;
      o.fly = true; o.fy = 0; o.vx = rand(80, 260); o.vy = rand(-700, -450); o.spin = 0; SFX.penguin();
      if (bowl) { fishRun += 3; score += 30 * mult(); floatText(o.x, GROUND - 80, '펭귄 볼링! +3🐟', '#ffd76a', 16); }
      else if (invuln <= 0) { gap -= 35; invuln = 0.5; combo = 0; floatText(o.x, GROUND - 80, '펭귄에 걸려 비틀!', '#ffb3b3', 15); }
      continue;
    }
    if (!SOLID.has(o.type)) continue;
    const ob = obox(o);
    if (!o.hit && overlap(b, ob)) {
      if (sledT > 0 && o.type !== 'ceil') {
        o.dead = true; score += 20; shards(o.x + o.w / 2, ob.y + ob.h / 2, 14, o.type === 'rock' || o.type === 'spike' && o.sub === 'lava' ? ['#3b2a2a', '#ff9a3c', '#6e5a55'] : undefined); SFX.shard(); shake = Math.max(shake, 5);
        continue;
      }
      if (invuln <= 0) { o.hit = true; hurt(); }
    }
    // near-miss tracking: how close did we get while passing?
    if (!o.hit) {
      if (b.x < ob.x + ob.w && b.x + b.w > ob.x) {
        const v = Math.max(ob.y - (b.y + b.h), b.y - (ob.y + ob.h));
        o.minClear = Math.min(o.minClear ?? 999, v);
      }
      if (!o.passed && ob.x + ob.w < b.x) { o.passed = true; if (o.minClear !== undefined && o.minClear < 20 && invuln <= 0 && sledT <= 0) nearMiss(); }
    }
  }
  for (const h of hazards) {
    if (h.hang || h.hit) continue;
    const hb = { x: h.x - 12, y: h.y - 34, w: 24, h: 34 };
    if (overlap(b, hb, 3)) {
      h.hit = true; h.landed = true;
      if (sledT > 0) { shards(h.x, h.y, 12); continue; }
      hurt(80, h.kind === 'icicle' ? '고드름에 맞았다!' : '쿵! 머리 위를 조심!');
    }
  }
  // collectables (with magnet pull)
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (const it of items) {
    const iy = it.y + Math.sin(time * 4 + it.bob) * 5;
    if (magnetT > 0 && (it.kind === 'fish' || it.kind === 'cocoa')) {
      const ddx = cx - it.x, ddy = cy - iy, dd = Math.hypot(ddx, ddy);
      if (dd < 300) { const s = Math.min(dd, 900 * (1 / 60) * 1.5); it.x += ddx / dd * s; it.y += ddy / dd * s; }
    }
    if (Math.abs(it.x - cx) < (it.power ? 40 : 30) && Math.abs(iy - cy) < (it.power ? 48 : 40)) collect(it, iy);
  }
  items = items.filter(it => !it.got && it.x > -60);
}

function collect(it, iy) {
  it.got = true;
  switch (it.kind) {
    case 'fish': fishRun++; score += 10 * mult(); SFX.fish(); sparkle(it.x, iy, '#ffb36b', 6); break;
    case 'cocoa': gap = Math.min(GAP_MAX, gap + 50); score += 25; SFX.cocoa(); sparkle(it.x, iy); floatText(it.x, iy - 30, '코코아! 힘이 난다', '#ffd76a'); break;
    case 'shield': shield = 1; SFX.power(); sparkle(it.x, iy, '#9fe8ff', 20); floatText(it.x, iy - 30, '얼음 방패!', '#9fe8ff'); break;
    case 'sled': sledT = sledMax; SFX.power(); sparkle(it.x, iy, '#ff8a80', 20); floatText(it.x, iy - 30, '썰매 질주!', '#ffd76a', 20); if (!P.onGround) P.vy = Math.min(P.vy, 0); break;
    case 'magnet': magnetT = magnetMax; SFX.power(); sparkle(it.x, iy, '#ff9aa2', 20); floatText(it.x, iy - 30, '물고기 자석!', '#ff9aa2'); break;
  }
}

// ============================================================ drawing: backgrounds
function skyGrad(s) { const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, s[0]); g.addColorStop(0.55, s[1]); g.addColorStop(1, s[2]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND + 2); }
function ridge(x, seed, amp, base) { return base - (Math.sin(x * 0.0031 + seed) * 0.5 + Math.sin(x * 0.0083 + seed * 2.1) * 0.32 + Math.sin(x * 0.021 + seed * 3.7) * 0.18 + 1) * amp; }
function drawRidge(color, par, seed, amp, base) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, GROUND + 2);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, ridge(x + bgOff * par, seed, amp, base));
  ctx.lineTo(W, GROUND + 2); ctx.closePath(); ctx.fill();
}
function stars(n, a = 1, c = '255,255,255') {
  for (let i = 0; i < n; i++) { const tw = 0.5 + 0.5 * Math.sin(time * 2 + i); ctx.fillStyle = `rgba(${c},${(0.25 + tw * 0.6) * a})`; ctx.fillRect((i * 157.3) % W, (i * 71.7) % 220, 2, 2); }
}
function bgField() {
  skyGrad(ZONES[0].sky); stars(60);
  // aurora curtains
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const bands = [[80, 255, 170, 95, 0], [140, 110, 255, 135, 2], [60, 220, 255, 70, 4]];
  for (const [r, g, b, yb, ph] of bands) {
    const grad = ctx.createLinearGradient(0, yb - 90, 0, yb + 30);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`); grad.addColorStop(0.75, `rgba(${r},${g},${b},0.2)`); grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad; ctx.beginPath();
    for (let x = 0; x <= W; x += 12) { const y = yb + Math.sin(x * 0.006 + time * 0.4 + ph) * 30 + Math.sin(x * 0.017 - time * 0.7) * 12 - 80 - Math.sin(x * 0.01 + time + ph) * 25; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let x = W; x >= 0; x -= 12) ctx.lineTo(x, yb + Math.sin(x * 0.006 + time * 0.4 + ph) * 30 + Math.sin(x * 0.017 - time * 0.7) * 12 + 25);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  drawRidge('#9dbfe0', 0.05, 7.1, 110, GROUND - 70);
  drawRidge('#b5d1ec', 0.1, 1.3, 80, GROUND - 35);
  // distant icebergs
  const off = bgOff * 0.18;
  for (let k = Math.floor(off / 520) - 1; k < Math.floor(off / 520) + 3; k++) {
    const x = k * 520 - off + hash(k) * 200, w = 120 + hash(k + 9) * 120, h = 30 + hash(k + 3) * 40;
    ctx.fillStyle = '#e4f2fc'; ctx.beginPath(); ctx.moveTo(x, GROUND - 10); ctx.lineTo(x + w * 0.2, GROUND - 10 - h); ctx.lineTo(x + w * 0.55, GROUND - 10 - h * 0.85); ctx.lineTo(x + w * 0.7, GROUND - 10 - h * 1.1); ctx.lineTo(x + w, GROUND - 10); ctx.fill();
    ctx.fillStyle = 'rgba(120,170,215,0.35)'; ctx.beginPath(); ctx.moveTo(x + w * 0.55, GROUND - 10 - h * 0.85); ctx.lineTo(x + w * 0.7, GROUND - 10 - h * 1.1); ctx.lineTo(x + w, GROUND - 10); ctx.lineTo(x + w * 0.6, GROUND - 10); ctx.fill();
  }
  drawRidge('#d9ebf8', 0.28, 4.2, 34, GROUND - 4);
  // a little penguin colony watching the chase
  const px = ((800 - bgOff * 0.28) % 2400 + 2400) % 2400 - 200;
  for (let i = 0; i < 5; i++) {
    const x = px + i * 9, y = GROUND - 46 + (i % 2) * 2;
    ctx.fillStyle = '#1b2433'; ctx.beginPath(); ctx.ellipse(x, y, 3.5, 6.5, Math.sin(time * 3 + i) * 0.1, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + 1, y + 1.5, 2, 4.2, 0, 0, 6.28); ctx.fill();
  }
}
function bgCave() {
  skyGrad(ZONES[1].sky);
  // back wall pillars
  const off = bgOff * 0.15;
  for (let k = Math.floor(off / 110) - 1; k < Math.floor(off / 110) + 11; k++) {
    const x = k * 110 - off, h1 = 80 + hash(k) * 140, h2 = 50 + hash(k + 5) * 110, w = 40 + hash(k + 2) * 40;
    ctx.fillStyle = '#12355c';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 0.5, h1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 20, GROUND); ctx.lineTo(x + 20 + w, GROUND); ctx.lineTo(x + 20 + w * 0.5, GROUND - h2); ctx.fill();
  }
  // glowing crystals
  const off2 = bgOff * 0.3;
  for (let k = Math.floor(off2 / 230) - 1; k < Math.floor(off2 / 230) + 6; k++) {
    const x = k * 230 - off2 + hash(k + 1) * 100, y = 200 + hash(k + 7) * 170, s = 10 + hash(k + 4) * 14;
    const pulse = 0.6 + 0.4 * Math.sin(time * 2 + k);
    const gl = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
    gl.addColorStop(0, `rgba(110,240,255,${0.35 * pulse})`); gl.addColorStop(1, 'rgba(110,240,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
    ctx.fillStyle = `rgba(170,250,255,${0.7 + 0.3 * pulse})`;
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 0.4); ctx.lineTo(x - s * 0.5, y); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + s * 0.8, y - s * 0.8); ctx.lineTo(x + s * 1.1, y + 2); ctx.lineTo(x + s * 0.6, y + 2); ctx.fill();
  }
  drawRidge('#1d4a77', 0.2, 2.2, 50, GROUND - 10);
  drawRidge('#2f6596', 0.35, 5.5, 22, GROUND);
}
function bgBlizzard() {
  skyGrad(ZONES[2].sky);
  // heavy cloud banks
  for (let i = 0; i < 7; i++) {
    const x = ((i * 220 - bgOff * 0.04 - time * 25) % (W + 400) + W + 400) % (W + 400) - 200, y = 50 + (i % 3) * 45;
    ctx.fillStyle = `rgba(${200 - i * 6},${210 - i * 6},${222 - i * 5},0.55)`;
    ctx.beginPath(); ctx.ellipse(x, y, 190, 42, 0, 0, 6.28); ctx.ellipse(x + 120, y + 18, 150, 36, 0, 0, 6.28); ctx.fill();
  }
  drawRidge('#b2c2d2', 0.06, 3.3, 100, GROUND - 60);
  drawRidge('#c8d5e1', 0.14, 8.8, 60, GROUND - 25);
  drawRidge('#e2eaf1', 0.3, 0.7, 30, GROUND);
}
function bgVolcano() {
  skyGrad(ZONES[3].sky); stars(25, 0.5, '255,200,180');
  // volcano cone with eruption plume
  const period = 2600, off = bgOff * 0.06;
  for (let k = Math.floor(off / period) - 1; k < Math.floor(off / period) + 2; k++) {
    const cx = k * period - off + 620, top = GROUND - 290;
    ctx.fillStyle = '#2a1616';
    ctx.beginPath(); ctx.moveTo(cx - 420, GROUND); ctx.lineTo(cx - 60, top); ctx.lineTo(cx + 60, top); ctx.lineTo(cx + 420, GROUND); ctx.fill();
    // lava rivers down the slope
    ctx.strokeStyle = 'rgba(255,120,40,0.7)'; ctx.lineWidth = 3;
    for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.moveTo(cx + j * 30, top + 4); ctx.quadraticCurveTo(cx + j * 80 + 20, top + 120, cx + j * 150, GROUND - 40); ctx.stroke(); }
    const glow = ctx.createRadialGradient(cx, top, 0, cx, top, 160);
    glow.addColorStop(0, 'rgba(255,140,50,0.75)'); glow.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - 160, top - 160, 320, 320);
    for (let i = 0; i < 8; i++) {
      const t = (time * 0.15 + i / 8) % 1;
      ctx.fillStyle = `rgba(${60 + i * 4},${45 + i * 3},${45 + i * 3},${0.55 * (1 - t)})`;
      ctx.beginPath(); ctx.arc(cx + Math.sin(i * 2 + time * 0.3) * 30 + t * 120, top - 20 - t * 260, 30 + t * 70, 0, 6.28); ctx.fill();
    }
  }
  drawRidge('#3b2626', 0.12, 6.1, 70, GROUND - 25);
  drawRidge('#4f3a3a', 0.3, 2.9, 30, GROUND);
}
const BG = [bgField, bgCave, bgBlizzard, bgVolcano];

function zoneBlend() {
  if (state === 'title' || state === 'shop') return { zi: 0, ni: 1, t: 0, w: [1, 0, 0, 0] };
  const zf = Math.max(0, dist) / ZONE_LEN, zi = Math.floor(zf) % 4, ni = (zi + 1) % 4;
  const t = smooth(clamp(((zf % 1) - 0.9) / 0.1, 0, 1));
  const w = [0, 0, 0, 0]; w[zi] += 1 - t; w[ni] += t;
  return { zi, ni, t, w };
}

function drawGround(zb) {
  const g1 = mix(ZONES[zb.zi].g1, ZONES[zb.ni].g1, zb.t), g2 = mix(ZONES[zb.zi].g2, ZONES[zb.ni].g2, zb.t);
  const holes = obstacles.filter(o => o.type === 'hole').sort((a, b) => a.x - b.x);
  const gg = ctx.createLinearGradient(0, GROUND, 0, H);
  gg.addColorStop(0, g1); gg.addColorStop(0.1, g1); gg.addColorStop(1, g2);
  let x0 = 0;
  const seg = (a, b) => { if (b > a) { ctx.fillStyle = gg; ctx.fillRect(a, GROUND, b - a, H - GROUND); } };
  for (const h of holes) {
    seg(x0, h.x);
    if (h.sub === 'lava') {
      const pg = ctx.createLinearGradient(0, GROUND, 0, H);
      pg.addColorStop(0, '#2a0d08'); pg.addColorStop(0.45, '#7a1c08'); pg.addColorStop(1, '#ff7a1a');
      ctx.fillStyle = pg; ctx.fillRect(h.x, GROUND, h.w, H - GROUND);
      ctx.fillStyle = '#ffb347';
      for (let i = 0; i < h.w; i += 14) { const y = H - 40 + Math.sin(time * 4 + (h.x + i) * 0.05) * 6; ctx.fillRect(h.x + i, y, 14, H - y); }
      const gl = ctx.createLinearGradient(0, GROUND - 60, 0, GROUND);
      gl.addColorStop(0, 'rgba(255,120,40,0)'); gl.addColorStop(1, 'rgba(255,120,40,0.35)');
      ctx.fillStyle = gl; ctx.fillRect(h.x - 10, GROUND - 60, h.w + 20, 60);
    } else {
      const pg = ctx.createLinearGradient(0, GROUND, 0, H);
      pg.addColorStop(0, '#2a5d8f'); pg.addColorStop(1, '#020814');
      ctx.fillStyle = pg; ctx.fillRect(h.x, GROUND, h.w, H - GROUND);
    }
    ctx.fillStyle = h.sub === 'lava' ? '#5a3a34' : '#cdeaff';
    for (const side of [h.x, h.x + h.w]) {
      const dir = side === h.x ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(side, GROUND); ctx.lineTo(side + dir * 10, GROUND + 18); ctx.lineTo(side, GROUND + 40); ctx.lineTo(side + dir * 6, GROUND + 70); ctx.lineTo(side, H); ctx.fill();
    }
    x0 = h.x + h.w;
  }
  seg(x0, W);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; // bright lip
  x0 = 0; for (const h of holes) { if (h.x > x0) ctx.fillRect(x0, GROUND, h.x - x0, 3); x0 = h.x + h.w; } ctx.fillRect(x0, GROUND, W - x0, 3);
  ctx.fillStyle = 'rgba(90,130,180,0.25)';
  for (let i = 0; i < 34; i++) {
    const x = ((i * 97 - bgOff) % W + W) % W, y = GROUND + 16 + (i * 37) % 80;
    if (!holes.some(h => x > h.x - 20 && x < h.x + h.w)) ctx.fillRect(x, y, 18 + (i % 3) * 6, 2);
  }
}

// ============================================================ drawing: icons
function drawIcon(kind, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (kind) {
    case 'fish': {
      ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-18, -7); ctx.lineTo(-18, 7); ctx.fill();
      ctx.fillStyle = '#ffd29a'; ctx.beginPath(); ctx.ellipse(2, 2, 7, 3, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#1b2433'; ctx.beginPath(); ctx.arc(6, -2, 1.8, 0, 6.28); ctx.fill();
      break;
    }
    case 'cocoa': {
      ctx.fillStyle = '#c0392b'; rr(-11, -10, 22, 22, 4); ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(12, 1, 6, -1.4, 1.4); ctx.stroke();
      ctx.fillStyle = '#6b3b1f'; ctx.fillRect(-9, -9, 18, 4); ctx.fillStyle = '#fff'; ctx.fillRect(-11, -1, 22, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -14); ctx.quadraticCurveTo(i * 6 + 5 * Math.sin(time * 5 + i), -21, i * 6, -28); ctx.stroke(); }
      break;
    }
    case 'shield': {
      ctx.fillStyle = '#5fd0ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(13, -9); ctx.lineTo(11, 5); ctx.lineTo(0, 15); ctx.lineTo(-11, 5); ctx.lineTo(-13, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(0, -11); ctx.lineTo(-2, 4); ctx.fill();
      break;
    }
    case 'sled': {
      ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-15, 9); ctx.lineTo(12, 9); ctx.quadraticCurveTo(18, 9, 17, 2); ctx.stroke();
      ctx.fillStyle = '#e63946'; rr(-14, -6, 26, 10, 3); ctx.fill();
      ctx.strokeStyle = '#8b1e28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-8, 9); ctx.moveTo(6, 4); ctx.lineTo(6, 9); ctx.stroke();
      break;
    }
    case 'magnet': {
      ctx.strokeStyle = '#e63946'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 9, Math.PI, 0, true); ctx.stroke();
      ctx.strokeStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-9, -8); ctx.moveTo(9, 0); ctx.lineTo(9, -8); ctx.stroke();
      ctx.strokeStyle = '#e8eef3'; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(-9, -13); ctx.moveTo(9, -8); ctx.lineTo(9, -13); ctx.stroke();
      break;
    }
    case 'boots': {
      ctx.fillStyle = '#1b2433'; ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(4, -14); ctx.lineTo(4, 2); ctx.lineTo(14, 6); ctx.lineTo(14, 12); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9f43'; ctx.fillRect(-8, 8, 22, 4);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(-20, -16); ctx.lineTo(-16, -6); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ============================================================ drawing: obstacles & items
function drawIce(x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#effcff'); g.addColorStop(0.5, '#b4e6fa'); g.addColorStop(1, '#6cbde6');
  ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2;
  rr(x, y, w, h, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(60,140,200,0.25)'; ctx.fillRect(x + w * 0.62, y + 4, w * 0.3, h - 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 18, y + 6); ctx.moveTo(x + 8, y + 18); ctx.lineTo(x + 12, y + 16); ctx.stroke();
}
function groundShadow(x, w) { ctx.fillStyle = 'rgba(30,60,100,0.22)'; ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 3, w * 0.6, 5, 0, 0, 6.28); ctx.fill(); }

function drawObstacle(o) {
  if (o.dead) return;
  switch (o.type) {
    case 'block': groundShadow(o.x, o.w); drawIce(o.x, GROUND - o.h, o.w, o.h); break;
    case 'tall': {
      groundShadow(o.x, o.w);
      if (o.sub === 'stalag') {
        const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0); g.addColorStop(0, '#d8f3ff'); g.addColorStop(1, '#6aaed8');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + o.w * 0.35, GROUND - o.h); ctx.lineTo(o.x + o.w * 0.6, GROUND - o.h * 0.8); ctx.lineTo(o.x + o.w, GROUND); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        drawIce(o.x, GROUND - o.h, o.w, o.h);
        const cx = o.x + o.w / 2, cy = GROUND - o.h / 2;
        ctx.globalAlpha = 0.75; drawIcon('fish', cx, cy, 0.9); ctx.globalAlpha = 1;
      }
      break;
    }
    case 'boulder': {
      groundShadow(o.x, o.w);
      const cx = o.x + o.w / 2, cy = GROUND - o.h / 2;
      ctx.fillStyle = '#7d97aa'; ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, r = (o.w / 2) * (0.85 + hash(i + o.w) * 0.2); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95); }
      ctx.fill(); ctx.fillStyle = '#cfe6f2'; ctx.beginPath(); ctx.ellipse(cx - 6, cy - 10, 14, 8, -0.4, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(40,60,80,0.35)'; ctx.beginPath(); ctx.ellipse(cx + 8, cy + 8, 12, 9, 0, 0, 6.28); ctx.fill();
      break;
    }
    case 'spike': {
      if (o.sub === 'lava') {
        const cx = o.x + o.w / 2;
        ctx.fillStyle = '#2b1d1d'; ctx.beginPath(); ctx.ellipse(cx, GROUND - 13, o.w / 2, 15, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = `rgba(255,140,40,${0.6 + 0.4 * Math.sin(time * 8)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 10, GROUND - 20); ctx.lineTo(cx, GROUND - 12); ctx.lineTo(cx + 8, GROUND - 22); ctx.moveTo(cx, GROUND - 12); ctx.lineTo(cx + 2, GROUND - 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#bfe9ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + o.w * 0.4, GROUND - o.h); ctx.lineTo(o.x + o.w * 0.55, GROUND - o.h * 0.6); ctx.lineTo(o.x + o.w * 0.75, GROUND - o.h * 0.85); ctx.lineTo(o.x + o.w, GROUND); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case 'rock': {
      groundShadow(o.x, o.w);
      const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0); g.addColorStop(0, '#5a4545'); g.addColorStop(1, '#2a1c1c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 4, GROUND - o.h + 8); ctx.lineTo(o.x + o.w * 0.4, GROUND - o.h); ctx.lineTo(o.x + o.w - 4, GROUND - o.h + 6); ctx.lineTo(o.x + o.w, GROUND); ctx.fill();
      ctx.strokeStyle = `rgba(255,130,40,${0.55 + 0.35 * Math.sin(time * 5 + o.x * 0.01)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.x + o.w * 0.3, GROUND - o.h + 14); ctx.lineTo(o.x + o.w * 0.5, GROUND - o.h * 0.5); ctx.lineTo(o.x + o.w * 0.35, GROUND - 10); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(o.x + 4, GROUND - o.h + 8); ctx.lineTo(o.x + o.w * 0.4, GROUND - o.h); ctx.lineTo(o.x + o.w - 4, GROUND - o.h + 6); ctx.lineTo(o.x + o.w * 0.5, GROUND - o.h + 10); ctx.fill();
      break;
    }
    case 'ptero': drawPtero(o); break;
    case 'penguin': drawPenguin(o); break;
    case 'snowball': {
      const r = o.r, cx = o.x, cy = GROUND - r - o.bounce;
      ctx.fillStyle = 'rgba(30,60,100,0.22)'; ctx.beginPath(); ctx.ellipse(cx, GROUND + 3, r * (1 - o.bounce / 200), 5, 0, 0, 6.28); ctx.fill();
      const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 2, cx, cy, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9cfe2');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(140,170,200,0.6)';
      for (let i = 0; i < 4; i++) { const a = o.rot + i * 1.57; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, 3, 0, 6.28); ctx.fill(); }
      break;
    }
    case 'ceil': {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND - 58); g.addColorStop(0, '#16426e'); g.addColorStop(1, '#7cc4ec');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, GROUND - 70);
      const n = Math.max(3, Math.floor(o.w / 18));
      for (let i = 0; i <= n; i++) { const x = o.x + o.w * i / n; ctx.lineTo(x, GROUND - 58 - (i % 2 ? 0 : 14) - hash(i + o.seed) * 6); }
      ctx.lineTo(o.x + o.w, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220,245,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(o.x + 6, CEIL_Y, 8, GROUND - 58 - CEIL_Y - 20);
      break;
    }
    case 'thin': {
      const s = clamp(o.stress / 0.3, 0, 1);
      ctx.fillStyle = `rgba(150,215,245,${0.65 - s * 0.2})`; ctx.fillRect(o.x, GROUND, o.w, 12);
      ctx.fillStyle = 'rgba(40,110,170,0.35)'; ctx.fillRect(o.x, GROUND + 12, o.w, 40);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const n = 3 + Math.floor(s * 8);
      for (let i = 0; i < n; i++) { const x = o.x + hash(i + o.w) * o.w; ctx.moveTo(x, GROUND); ctx.lineTo(x + (hash(i + 3) - 0.5) * 30, GROUND + 10); ctx.lineTo(x + (hash(i + 5) - 0.5) * 40, GROUND + 22); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
      if (o.x + o.w > 0 && s < 0.05) ctx.fillText('얇은 얼음', o.x + o.w / 2, GROUND + 30);
      break;
    }
    case 'vent': {
      const cx = o.x + o.w / 2;
      ctx.fillStyle = '#3a2a2a'; ctx.beginPath(); ctx.ellipse(cx, GROUND, o.w / 2, 10, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = `rgba(255,150,60,${0.5 + 0.3 * Math.sin(time * 6)})`; ctx.beginPath(); ctx.ellipse(cx, GROUND - 2, o.w / 4, 4, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,200,0.85)'; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('▲ 분출구', cx, GROUND + 22);
      break;
    }
  }
}
function drawPtero(o) {
  const f = Math.sin(o.flap);
  ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  ctx.fillStyle = 'rgba(30,40,70,0.15)'; ctx.beginPath(); ctx.ellipse(0, GROUND - (o.y + o.h / 2) + 3, 26, 4, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#6a4d99';
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-30, -26 * f - 10, -44, -22 * f - 2); ctx.lineTo(-20, 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(26, -26 * f - 10, 38, -22 * f - 2); ctx.lineTo(14, 8); ctx.fill();
  ctx.fillStyle = '#9677c7'; ctx.beginPath(); ctx.ellipse(0, 4, 20, 10, 0, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-20, -2, 9, 8, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(-26, -4); ctx.lineTo(-46, 2); ctx.lineTo(-26, 3); ctx.fill();
  ctx.fillStyle = '#9677c7'; ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(-4, -20); ctx.lineTo(-12, -4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-22, -4, 2.8, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-23, -4, 1.4, 0, 6.28); ctx.fill();
  ctx.restore();
}
function drawPenguin(o) {
  const cx = o.x + o.w / 2, cy = GROUND - o.h / 2 + (o.fly ? o.fy : 0);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.fly ? o.spin : Math.sin(o.ph) * 0.15);
  ctx.fillStyle = '#1b2433'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 18, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-3, 3, 8, 13, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-10, -9); ctx.lineTo(-18, -7); ctx.lineTo(-10, -5); ctx.fill();
  ctx.fillRect(-8, 16, 7, 3); ctx.fillRect(2, 16, 7, 3);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6, -10, 2.6, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-6.5, -10, 1.3, 0, 6.28); ctx.fill();
  ctx.restore();
}
function drawHazards() {
  for (const h of hazards) {
    if (!h.hang) { // landing shadow warning
      const k = clamp(1 - (GROUND - h.y) / 520, 0.1, 1);
      ctx.fillStyle = `rgba(200,30,30,${0.18 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(h.x, GROUND + 2, 8 + 20 * k, 4 + 3 * k, 0, 0, 6.28); ctx.fill();
    }
    ctx.save(); ctx.translate(h.x, h.y);
    if (h.kind === 'icicle') {
      ctx.fillStyle = '#d6f3ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-12, -38); ctx.lineTo(12, -38); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (h.hang) { ctx.translate(Math.sin(time * 40) * (h.x < PX + speed * 1.3 ? 1.5 : 0), 0); }
    } else if (h.kind === 'rock') {
      ctx.fillStyle = '#2b1d1d'; ctx.beginPath(); ctx.arc(0, -14, 15, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(0, -12); ctx.lineTo(7, -22); ctx.stroke();
      const gl = ctx.createRadialGradient(0, -14, 4, 0, -14, 30); gl.addColorStop(0, 'rgba(255,140,40,0.5)'); gl.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = gl; ctx.fillRect(-30, -44, 60, 60);
    } else {
      ctx.rotate(time * 6); drawIce(-16, -16, 32, 32);
    }
    ctx.restore();
  }
}
function drawProjs() {
  for (const p of projs) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 14);
    ctx.strokeStyle = `rgba(255,70,70,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.tx, GROUND + 2, 30, 7, 0, 0, 6.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.tx - 10, GROUND + 2); ctx.lineTo(p.tx + 10, GROUND + 2); ctx.stroke();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = '#7d97aa'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, r = 24 * (0.85 + hash(i) * 0.25); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill(); ctx.fillStyle = '#cfe6f2'; ctx.beginPath(); ctx.ellipse(-5, -8, 10, 6, 0, 0, 6.28); ctx.fill();
    ctx.restore();
  }
}
function drawItems() {
  for (const it of items) {
    const y = it.y + Math.sin(time * 4 + it.bob) * 5;
    if (it.kind === 'fish') { drawIcon('fish', it.x, y, 0.85); continue; }
    const glowC = { cocoa: '255,215,106', shield: '95,208,255', sled: '255,138,128', magnet: '255,154,162' }[it.kind];
    const gl = ctx.createRadialGradient(it.x, y, 4, it.x, y, 32);
    gl.addColorStop(0, `rgba(${glowC},0.55)`); gl.addColorStop(1, `rgba(${glowC},0)`);
    ctx.fillStyle = gl; ctx.fillRect(it.x - 32, y - 32, 64, 64);
    ctx.strokeStyle = `rgba(${glowC},0.9)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(it.x, y, 22 + Math.sin(time * 6) * 1.5, 0, 6.28); ctx.stroke();
    drawIcon(it.kind, it.x, y + (it.kind === 'cocoa' ? 3 : 0), 1);
  }
}

// ============================================================ drawing: characters
function drawPlayer() {
  if (state === 'over' && overReason === 'caught' && stateT > 0.25) return;
  const sliding = isSliding(), sled = sledT > 0 && state === 'play';
  // shadow
  if (!P.falling && !holeAt(PX + 17)) {
    const hgt = clamp((GROUND - P.y) / 250, 0, 1);
    ctx.fillStyle = `rgba(20,40,70,${0.25 * (1 - hgt * 0.7)})`; ctx.beginPath(); ctx.ellipse(PX + 17, GROUND + 3, 22 * (1 - hgt * 0.5), 5, 0, 0, 6.28); ctx.fill();
  }
  ctx.save(); ctx.translate(PX + 17, P.y);
  if (invuln > 0 && sledT <= 0 && Math.floor(invuln * 14) % 2 === 0) ctx.globalAlpha = 0.45;
  if (state === 'over' && overReason !== 'caught') ctx.rotate(stateT * 6);
  const sq = P.squash; ctx.scale(1 + sq * 0.6, 1 - sq);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (sled) {
    // sled with runners and speed glow
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-34, -2); ctx.lineTo(28, -2); ctx.quadraticCurveTo(42, -2, 40, -14); ctx.stroke();
    ctx.fillStyle = '#e63946'; rr(-32, -18, 62, 12, 4); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-32, -14, 62, 3);
    ctx.translate(0, -12);
  }
  if (sliding) {
    ctx.strokeStyle = '#1f2d4d'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-26, -6); ctx.moveTo(-6, -14); ctx.lineTo(-24, -14); ctx.stroke();
    ctx.fillStyle = '#e63946'; rr(-10, -26, 34, 20, 8); ctx.fill();
    ctx.fillStyle = '#f4a261'; ctx.fillRect(-4, -32, 18, 8);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(32, -16, 12, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#f3c9a0'; ctx.beginPath(); ctx.arc(34, -16, 8, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(36, -19, 3, 3);
    ctx.strokeStyle = '#2a9d8f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(22, -12); ctx.quadraticCurveTo(8, -6 + Math.sin(time * 20) * 3, -6, -2 + Math.sin(time * 20 + 1) * 4); ctx.stroke();
  } else {
    const air = !P.onGround || sled, hurtPose = P.hurtT > 0;
    const a = air ? 0 : Math.sin(P.anim);
    ctx.rotate(hurtPose ? -0.25 : air ? -0.05 : 0.08);
    ctx.strokeStyle = '#1f2d4d'; ctx.lineWidth = 8;
    if (sled) { ctx.beginPath(); ctx.moveTo(-3, -22); ctx.lineTo(14, -8); ctx.moveTo(4, -22); ctx.lineTo(20, -10); ctx.stroke(); }
    else if (air) { ctx.beginPath(); ctx.moveTo(-3, -22); ctx.lineTo(-10, -8); ctx.moveTo(4, -22); ctx.lineTo(12, -10); ctx.stroke(); }
    else {
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(Math.sin(P.anim) * 14, -2 - Math.max(0, Math.cos(P.anim)) * 6);
      ctx.moveTo(0, -22); ctx.lineTo(-Math.sin(P.anim) * 14, -2 - Math.max(0, -Math.cos(P.anim)) * 6); ctx.stroke();
    }
    ctx.strokeStyle = '#b52a36'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(-a * 14 - (air ? 10 : 0), -34 - (air ? 14 : 0)); ctx.stroke();
    ctx.fillStyle = '#f4a261'; rr(-22, -56, 10, 26, 3); ctx.fill();
    ctx.fillStyle = '#e63946'; rr(-14, -58, 28, 38, 9); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; rr(4, -58, 10, 38, 6); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-14, -36, 28, 4);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(3, -66, 13, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#f3c9a0'; ctx.beginPath(); ctx.arc(5, -66, 8.5, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#222';
    if (hurtPose) { ctx.font = 'bold 8px sans-serif'; ctx.fillText('x', 2, -66); ctx.fillText('x', 7, -66); }
    else { ctx.fillRect(7, -70, 3, 4); ctx.fillRect(1, -70, 3, 4); }
    if (sled) { ctx.beginPath(); ctx.arc(6, -62, 3, 0, Math.PI); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(6, -61, 2.5, 3, 0, 0, 6.28); ctx.fill(); }
    ctx.strokeStyle = '#2a9d8f'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-6, -55); ctx.lineTo(10, -55); ctx.moveTo(-8, -55); ctx.quadraticCurveTo(-20, -56 + Math.sin(time * 18) * 4, -32, -52 + Math.sin(time * 18 + 1) * 6); ctx.stroke();
    ctx.strokeStyle = '#e63946'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(2, -50); ctx.lineTo(a * 14 + 4 + (air ? 8 : 0), -34 - (air ? 18 : 0)); ctx.stroke();
    if (gap < 120 && state === 'play') { ctx.fillStyle = '#8fd3ff'; ctx.beginPath(); ctx.ellipse(-10, -76 + (time * 30 % 10), 2.5, 4, 0, 0, 6.28); ctx.fill(); }
  }
  ctx.restore();

  // shield bubble & magnet aura
  if (state === 'play' && (shield > 0 || magnetT > 0)) {
    const b = pbox(), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (shield > 0) {
      ctx.strokeStyle = `rgba(150,230,255,${0.55 + 0.25 * Math.sin(time * 5)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, b.w / 2 + 16, b.h / 2 + 14, 0, 0, 6.28); ctx.stroke();
      ctx.fillStyle = 'rgba(150,230,255,0.12)'; ctx.fill();
    }
    if (magnetT > 0) {
      for (let i = 0; i < 2; i++) { const r = ((time * 120 + i * 60) % 120) + 30; ctx.strokeStyle = `rgba(255,154,162,${0.5 * (1 - (r - 30) / 120)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.stroke(); }
    }
  }
}

function drawDino(mx, o = {}) {
  const run = o.still ? 0 : time * 11;
  const bob = o.still ? 0 : Math.sin(run * 2) * 4;
  const open = o.open ?? (0.25 + Math.abs(Math.sin(time * 3)) * 0.3 + mouthBoost * 0.5);
  const rage = o.rage || 0;
  ctx.save(); ctx.translate(mx, GROUND);
  if (!o.noShadow) { ctx.fillStyle = 'rgba(20,40,70,0.25)'; ctx.beginPath(); ctx.ellipse(-170, 4, 200, 14, 0, 0, 6.28); ctx.fill(); }
  const body = '#3d8b7a', dark = '#2a6658', belly = '#a8dccb', ice = 'rgba(215,242,255,0.85)';
  const bodyG = ctx.createLinearGradient(0, -210, 0, -80); bodyG.addColorStop(0, '#53a894'); bodyG.addColorStop(1, '#2f7566');

  ctx.fillStyle = bodyG; // tail
  ctx.beginPath(); ctx.moveTo(-200, -150 + bob);
  ctx.quadraticCurveTo(-320, -152 + bob + Math.sin(run) * 10, -470, -112 + Math.sin(run) * 18);
  ctx.quadraticCurveTo(-320, -104 + bob, -200, -94 + bob); ctx.fill();

  const l1 = Math.sin(run), l2 = Math.sin(run + Math.PI);
  ctx.fillStyle = dark; // back leg
  ctx.save(); ctx.translate(-180, -110 + bob); ctx.rotate(l2 * 0.5);
  rr(-20, 0, 40, 80, 16); ctx.fill(); ctx.fillRect(-10, 70, 46, 16); ctx.restore();

  ctx.fillStyle = bodyG; ctx.beginPath(); ctx.ellipse(-160, -140 + bob, 102, 64, -0.15, 0, 6.28); ctx.fill();
  ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(-130, -110 + bob, 72, 30, -0.2, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(30,80,70,0.35)'; // scales
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(-230 + i * 18, -170 + bob + Math.sin(i * 1.7) * 10, 5, 3.5, 0, 0, 6.28); ctx.fill(); }

  ctx.fillStyle = body; // front leg
  ctx.save(); ctx.translate(-140, -110 + bob); ctx.rotate(l1 * 0.5);
  rr(-22, 0, 44, 82, 16); ctx.fill(); ctx.fillRect(-12, 72, 50, 16);
  ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(26, 72 + i * 5); ctx.lineTo(42, 76 + i * 5); ctx.lineTo(26, 80 + i * 5); ctx.fill(); }
  ctx.restore();

  ctx.fillStyle = body; // neck
  ctx.beginPath(); ctx.moveTo(-112, -192 + bob); ctx.lineTo(-60, -215 + bob); ctx.lineTo(-55, -160 + bob); ctx.lineTo(-92, -118 + bob); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 9; ctx.lineCap = 'round'; // tiny arms
  ctx.beginPath(); ctx.moveTo(-80, -140 + bob); ctx.lineTo(-58, -128 + bob + Math.sin(run * 2) * 5); ctx.lineTo(-48, -138 + bob); ctx.stroke();

  ctx.save(); ctx.translate(-80, -200 + bob);
  ctx.save(); ctx.rotate(open * 0.5); // lower jaw
  ctx.fillStyle = dark; rr(0, 0, 76, 20, 8); ctx.fill();
  ctx.fillStyle = '#8a2b2b'; ctx.fillRect(6, 0, 64, 4);
  ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(14 + i * 10, 2); ctx.lineTo(19 + i * 10, -8); ctx.lineTo(24 + i * 10, 2); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.rotate(-open * 0.35); // upper head
  ctx.fillStyle = bodyG; rr(-20, -46, 100, 48, [22, 26, 10, 6]); ctx.fill();
  ctx.fillStyle = '#fff'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 10, 0); ctx.lineTo(15 + i * 10, 11); ctx.lineTo(20 + i * 10, 0); ctx.fill(); }
  if (rage > 0) { const gl = ctx.createRadialGradient(24, -28, 2, 24, -28, 26); gl.addColorStop(0, `rgba(255,60,40,${0.7 * rage})`); gl.addColorStop(1, 'rgba(255,60,40,0)'); ctx.fillStyle = gl; ctx.fillRect(-4, -56, 56, 56); }
  ctx.fillStyle = '#fff6a8'; ctx.beginPath(); ctx.arc(22, -28, 9, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(25, -28, 4.5, 0, 6.28); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(8, -42); ctx.lineTo(36, -33); ctx.stroke();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(70, -34, 3, 0, 6.28); ctx.fill();
  ctx.fillStyle = ice; ctx.beginPath(); ctx.moveTo(-14, -40); ctx.lineTo(10, -50); ctx.lineTo(4, -38); ctx.lineTo(-4, -44); ctx.fill();
  ctx.restore(); ctx.restore();

  ctx.fillStyle = '#bfe9ff'; // icy back spikes
  for (let i = 0; i < 6; i++) { const sx = -252 + i * 30, sy = -198 + bob + Math.abs(i - 3) * 6; ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx + 12, sy - 18); ctx.lineTo(sx + 24, sy + 12); ctx.fill(); }
  ctx.fillStyle = ice; // ice still stuck to its hide
  ctx.beginPath(); ctx.moveTo(-210, -170 + bob); ctx.lineTo(-180, -186 + bob); ctx.lineTo(-170, -160 + bob); ctx.lineTo(-200, -150 + bob); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-120, -100 + bob); ctx.lineTo(-96, -108 + bob); ctx.lineTo(-100, -88 + bob); ctx.fill();
  ctx.restore();
}

function drawRoar(mx) {
  if (roarShow <= 0) return;
  ctx.save();
  ctx.font = `900 36px ${FONT}`; ctx.textAlign = 'center';
  ctx.translate(clamp(mx - 10, 90, W - 90), GROUND - 285);
  const s = 1 + Math.sin(time * 40) * 0.05; ctx.scale(s, s); ctx.rotate(-0.06);
  ctx.lineWidth = 7; ctx.strokeStyle = '#3a0d0d'; ctx.fillStyle = '#ff5a4e';
  ctx.strokeText('크아아앙!!', 0, 0); ctx.fillText('크아아앙!!', 0, 0);
  ctx.restore();
}

function drawIceBlock(cracks) {
  const x = 30, y = GROUND - 262, w = 300, h = 262;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  drawDino(312, { still: true, open: 0.15, noShadow: true });
  ctx.restore();
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(210,240,255,0.6)'); g.addColorStop(1, 'rgba(140,200,240,0.55)');
  ctx.fillStyle = g; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; rr(x, y, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x + 20, y + 20); ctx.lineTo(x + 70, y + 20); ctx.lineTo(x + 20, y + 120); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.beginPath();
  const lines = [[180, 0, 165, 60], [165, 60, 200, 95], [200, 95, 175, 150], [165, 60, 120, 85], [175, 150, 220, 200], [120, 85, 90, 140], [220, 200, 205, 262], [200, 95, 260, 110]];
  for (let i = 0; i < Math.min(lines.length, cracks); i++) { const [a, b, c, d] = lines[i]; ctx.moveTo(x + a, y + b); ctx.lineTo(x + c, y + d); }
  ctx.stroke();
}

// ============================================================ drawing: overlays, HUD, menus
function drawWeather(zb) {
  const snowAmt = ZONES.reduce((a, z, i) => a + z.snow * zb.w[i], 0);
  const n = Math.floor(clamp(snowAmt, 0, 3.5) * 120);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n && i < flakes.length; i++) { const f = flakes[i]; ctx.globalAlpha = 0.45 + f.r / 5; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.28); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (zb.w[3] > 0) {
    for (const e of embers) {
      ctx.globalAlpha = zb.w[3] * (e.hot ? 0.9 : 0.5);
      ctx.fillStyle = e.hot ? '#ffad5a' : '#8a7a78';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const hg = ctx.createLinearGradient(0, H, 0, GROUND - 120);
    hg.addColorStop(0, `rgba(255,90,30,${0.28 * zb.w[3]})`); hg.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, GROUND - 120, W, H - GROUND + 120);
  }
  if (zb.w[2] > 0) {
    const fg = ctx.createLinearGradient(380, 0, W, 0);
    fg.addColorStop(0, 'rgba(232,240,248,0)'); fg.addColorStop(1, `rgba(232,240,248,${(0.5 + (gustT > 0 ? 0.15 : 0)) * zb.w[2]})`);
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(230,238,246,${0.12 * zb.w[2]})`; ctx.fillRect(0, 0, W, H);
  }
  if (zb.w[1] > 0) {
    ctx.save(); ctx.globalAlpha = zb.w[1];
    const cg = ctx.createLinearGradient(0, 0, 0, CEIL_Y + 30); cg.addColorStop(0, '#061428'); cg.addColorStop(1, '#2b6a9e');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, 0);
    const off = bgOff;
    for (let x = 0; x <= W + 24; x += 24) { const k = Math.floor((x + off) / 24); const sx = k * 24 - off; ctx.lineTo(sx, CEIL_Y - 30 + hash(k) * 14); ctx.lineTo(sx + 12, CEIL_Y - 12 + hash(k + 50) * 26); }
    ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function txt(s, x, y, size, color, o = {}) {
  ctx.font = `${o.weight || 'bold'} ${size}px ${FONT}`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'alphabetic';
  if (o.stroke) { ctx.lineWidth = o.strokeW || 4; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.textBaseline = 'alphabetic';
}

function drawHUD() {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 6;
  txt(Math.floor(score).toLocaleString(), 24, 44, 30, '#ffffff', { align: 'left', weight: '900' });
  txt(`${Math.floor(dist)} m`, 24, 68, 16, '#cfe6ff', { align: 'left' });
  ctx.shadowBlur = 0;
  drawIcon('fish', 104, 63, 0.7); txt(`${fishRun}`, 118, 68, 16, '#ffd29a', { align: 'left' });

  // chase meter
  const mx = W / 2 - 170, my = 24, mw = 340, mh = 16, ratio = gapRatio();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(mx, my, mw, mh, 8); ctx.fill();
  const mg = ctx.createLinearGradient(mx, 0, mx + mw, 0); mg.addColorStop(0, '#ff4d4d'); mg.addColorStop(0.35, '#ffb84d'); mg.addColorStop(1, '#5ce1a6');
  ctx.fillStyle = mg; rr(mx, my, Math.max(10, mw * ratio), mh, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; rr(mx, my, mw, mh, 8); ctx.stroke();
  ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText('🦖', mx - 18, my + 15); ctx.fillText('🏃', mx + mw * ratio, my + 15);
  txt('공룡과의 거리', W / 2, my + mh + 17, 12, 'rgba(232,244,255,0.85)');
  if (state === 'play' && ratio < 0.25 && Math.floor(time * 4) % 2 === 0) txt('⚠ 위험! 코코아를 먹어 힘을 내!', W / 2, 92, 20, '#ff6b6b', { stroke: 'rgba(0,0,0,0.5)' });

  // combo
  if (combo > 0) {
    txt(`x${mult().toFixed(2)}`, W - 130, 92, 22, '#9fffc8', { align: 'right', stroke: 'rgba(0,0,0,0.4)' });
    txt(`콤보 ${combo}`, W - 130, 112, 13, '#d8ffe9', { align: 'right' });
  }

  // buttons
  for (const [b, label] of [[PAUSE_BTN, 'Ⅱ'], [MUTE_BTN, save.muted ? '🔇' : '🔊']]) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(b.x, b.y, b.w, b.h, 10); ctx.fill();
    txt(label, b.x + b.w / 2, b.y + b.h / 2 + 7, 18, '#fff');
  }

  // active power-ups
  let px = 24;
  const pill = (icon, frac, col) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(px, 84, 46, 46, 12); ctx.fill();
    drawIcon(icon, px + 23, 104, 0.9);
    if (frac !== null) { ctx.fillStyle = col; rr(px + 6, 122, 34 * frac, 4, 2); ctx.fill(); }
    px += 54;
  };
  if (shield) pill('shield', null);
  if (sledT > 0) pill('sled', sledT / sledMax, '#ff8a80');
  if (magnetT > 0) pill('magnet', magnetT / magnetMax, '#ff9aa2');
  ctx.restore();

  if (ratio < 0.4) {
    const a = (0.4 - ratio) / 0.4 * (0.35 + 0.15 * Math.sin(time * 10));
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
    vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  if (bannerT > 0) {
    const a = Math.min(1, bannerT * 2, (3.2 - bannerT) * 4), z = ZONES[bannerZone], lap = Math.floor(dist / (ZONE_LEN * 4)) + 1;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    const bw = 460; ctx.fillStyle = 'rgba(6,16,40,0.6)'; rr(W / 2 - bw / 2, 140, bw, 92, 16); ctx.fill();
    txt(`구역 ${bannerZone + 1}${lap > 1 ? ` · ${lap}바퀴째` : ''}`, W / 2, 166, 14, '#9fd8ff');
    txt(z.name, W / 2, 200, 32, '#ffffff', { weight: '900' });
    txt(z.hint, W / 2, 222, 14, '#ffe6a8');
    ctx.restore();
  }
}

function panel(x, y, w, h) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(6,16,40,0.82)'; rr(x, y, w, h, 20); ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(159,216,255,0.35)'; ctx.lineWidth = 1.5; rr(x, y, w, h, 20); ctx.stroke();
}
function uiButton(x, y, w, h, label, act, o = {}) {
  const enabled = o.enabled !== false, idx = buttons.length, sel = idx === menuSel;
  buttons.push({ x, y, w, h, act, enabled });
  ctx.save();
  if (sel && enabled) { ctx.shadowColor = o.primary ? 'rgba(255,215,106,0.6)' : 'rgba(159,216,255,0.5)'; ctx.shadowBlur = 16; }
  ctx.fillStyle = !enabled ? 'rgba(255,255,255,0.07)' : o.primary ? (sel ? '#ffd76a' : '#e9ad3f') : (sel ? 'rgba(159,216,255,0.32)' : 'rgba(255,255,255,0.1)');
  rr(x, y, w, h, 12); ctx.fill(); ctx.restore();
  if (sel && enabled) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; rr(x, y, w, h, 12); ctx.stroke(); }
  txt(label, x + w / 2, y + h / 2 + (o.size || 19) * 0.36, o.size || 19, o.primary ? '#2a1a00' : enabled ? '#fff' : 'rgba(255,255,255,0.4)');
}

function drawTitle() {
  const x = 500, y = 48, w = 430, h = 360;
  panel(x, y, w, h);
  txt('남극 대탈출', x + w / 2, y + 66, 46, '#ffffff', { weight: '900' });
  txt('ANTARCTIC ESCAPE', x + w / 2, y + 90, 12, '#9fd8ff');
  txt('얼음 속에 잠들어 있던 공룡이 깨어났다!', x + w / 2, y + 128, 16, '#cfe6ff', { weight: '500' });
  txt('빙원 · 동굴 · 눈보라 · 화산을 지나 최대한 멀리!', x + w / 2, y + 150, 14, '#9fb9d6', { weight: '500' });
  uiButton(x + 60, y + 176, w - 120, 52, '▶  도망치기 시작', newRun, { primary: true, size: 21 });
  uiButton(x + 60, y + 238, w - 120, 44, `🛒  상점  (🐟 ${save.fish})`, () => { setState('shop'); SFX.click(); });
  txt(`최고 기록 ${save.best} m · 최고 점수 ${save.bestScore.toLocaleString()}`, x + w / 2, y + 312, 14, '#ffe6a8');
  txt('점프 ␣/↑ (공중 2단)  ·  슬라이드 ↓  ·  일시정지 P  ·  소리 M', x + w / 2, y + 336, 12, '#8fb0d0', { weight: '500' });
  txt('모바일: 오른쪽 탭 = 점프 · 왼쪽 누르기 = 슬라이드', x + w / 2, H - 22, 13, 'rgba(232,244,255,0.75)', { weight: '500' });
}

function drawShop() {
  const x = 150, y = 34, w = 660, h = 472;
  panel(x, y, w, h);
  txt('상점', x + 34, y + 50, 30, '#fff', { align: 'left', weight: '900' });
  drawIcon('fish', x + w - 120, y + 42, 1.1); txt(`${save.fish}`, x + w - 98, y + 50, 24, '#ffd29a', { align: 'left', weight: '900' });
  txt('물고기를 모아 장비를 업그레이드하세요', x + 34, y + 76, 13, '#9fb9d6', { align: 'left', weight: '500' });
  UPGRADES.forEach((u, i) => {
    const ry = y + 96 + i * 64, lvl = save.upg[u.id], maxed = lvl >= u.max, cost = maxed ? 0 : u.cost[lvl];
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; rr(x + 24, ry, w - 48, 56, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(x + 58, ry + 28, 20, 0, 6.28); ctx.fill();
    drawIcon(u.id, x + 58, ry + 30, 1);
    txt(u.name, x + 92, ry + 25, 17, '#fff', { align: 'left' });
    txt(u.desc, x + 92, ry + 45, 12, '#9fb9d6', { align: 'left', weight: '500' });
    for (let k = 0; k < u.max; k++) { ctx.fillStyle = k < lvl ? '#ffd76a' : 'rgba(255,255,255,0.18)'; rr(x + 380 + k * 22, ry + 22, 16, 12, 4); ctx.fill(); }
    uiButton(x + w - 160, ry + 9, 120, 38, maxed ? '최대' : `🐟 ${cost}`, () => {
      if (save.fish >= cost) { save.fish -= cost; save.upg[u.id]++; persist(); SFX.buy(); sparkle(x + 58, ry + 28, '#ffd76a', 16); }
      else SFX.deny();
    }, { enabled: !maxed && save.fish >= cost, size: 16 });
  });
  uiButton(x + w / 2 - 110, y + h - 58, 220, 42, '← 돌아가기', () => { setState('title'); SFX.click(); });
}

function drawOver() {
  const a = clamp((stateT - 0.5) * 3, 0, 1); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  const x = W / 2 - 250, y = 70, w = 500, h = 390;
  panel(x, y, w, h);
  const title = { caught: '덥석! 공룡에게 잡혔다!', fall: '크레바스에 빠졌다!', lava: '용암에 빠졌다!' }[overReason];
  txt(title, W / 2, y + 56, 30, '#ff8a80', { weight: '900' });
  txt(Math.floor(score).toLocaleString(), W / 2, y + 112, 46, '#ffffff', { weight: '900' });
  txt('점수', W / 2, y + 134, 13, '#9fb9d6');
  const stats = [['달린 거리', `${Math.floor(dist - debugStart)} m`], ['모은 물고기', `+${earned} 🐟`], ['최고 콤보', `${bestCombo}`], ['도달 구역', ZONES[zoneAt(dist)].name]];
  stats.forEach(([k, v], i) => {
    const sx = x + 60 + (i % 2) * 200, sy = y + 172 + Math.floor(i / 2) * 50;
    txt(k, sx, sy, 12, '#9fb9d6', { align: 'left', weight: '500' }); txt(v, sx, sy + 22, 19, '#fff', { align: 'left' });
  });
  txt(newBest ? '🎉 새 최고 기록!' : `최고 기록 ${save.best} m`, W / 2, y + 290, 17, newBest ? '#ffd76a' : '#cfe6ff');
  if (stateT > 0.9) {
    uiButton(x + 30, y + h - 70, 200, 46, '다시 도망치기', newRun, { primary: true });
    uiButton(x + 242, y + h - 70, 110, 46, '상점', () => { setState('shop'); SFX.click(); }, { size: 17 });
    uiButton(x + 362, y + h - 70, 108, 46, '처음으로', () => { setState('title'); SFX.click(); }, { size: 17 });
  }
  ctx.restore();
}

function drawPause() {
  ctx.fillStyle = 'rgba(3,8,20,0.55)'; ctx.fillRect(0, 0, W, H);
  const x = W / 2 - 170, y = 150, w = 340, h = 230;
  panel(x, y, w, h);
  txt('일시정지', W / 2, y + 56, 30, '#fff', { weight: '900' });
  uiButton(x + 40, y + 86, w - 80, 48, '계속하기', () => { paused = false; SFX.click(); }, { primary: true });
  uiButton(x + 40, y + 146, w - 80, 44, '처음 화면으로', () => { paused = false; setState('title'); SFX.click(); });
}

function drawParticles() {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    if (p.kind === 'shard') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.7, p.r); ctx.lineTo(-p.r * 0.7, p.r * 0.6); ctx.fill(); ctx.restore(); }
    else if (p.kind === 'ring') { ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.stroke(); }
    else if (p.kind === 'line') { ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.r, p.y); ctx.stroke(); }
    else if (p.kind === 'ember') { ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0; }
    else { ctx.globalAlpha = p.kind === 'smoke' ? a * 0.8 : a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buttons = [];
  const zb = zoneBlend();
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.6, rand(-shake, shake) * 0.6);
  if (state === 'over' && overReason === 'caught' && stateT < 1.2) { const z = 1 + Math.min(stateT, 0.6) * 0.12; ctx.translate(PX, GROUND - 100); ctx.scale(z, z); ctx.translate(-PX, -(GROUND - 100)); }

  BG[zb.zi]();
  if (zb.t > 0) { ctx.globalAlpha = zb.t; BG[zb.ni](); ctx.globalAlpha = 1; }
  drawGround(zb);

  if (state === 'title' || state === 'shop') {
    drawIceBlock(2 + Math.floor((Math.sin(time * 0.8) * 0.5 + 0.5) * 2));
    P.anim += 0.02; drawPlayer();
  } else {
    if (state === 'intro' && !introBurst) drawIceBlock(Math.floor(stateT / 1.4 * 8));
    for (const o of obstacles) if (o.type === 'thin' || o.type === 'vent') drawObstacle(o);
    drawItems();
    for (const o of obstacles) if (o.type !== 'thin' && o.type !== 'vent' && o.type !== 'ceil') drawObstacle(o);
    drawPlayer();
    for (const o of obstacles) if (o.type === 'ceil') drawObstacle(o);
    if (state !== 'intro' || introBurst) drawDino(dinoX, { rage: state === 'play' ? clamp((0.3 - gapRatio()) / 0.3, 0, 1) : 0 });
    drawHazards(); drawProjs();
    drawRoar(dinoX);
  }
  drawParticles();
  drawWeather(zb);
  ctx.textAlign = 'center';
  for (const t of texts) { ctx.globalAlpha = clamp(t.life * 2, 0, 1); txt(t.s, t.x, t.y, t.size, t.c, { stroke: 'rgba(0,0,0,0.6)', strokeW: 4 }); }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
  if (state === 'play' || state === 'over') drawHUD();
  if (state === 'title') drawTitle();
  else if (state === 'shop') drawShop();
  else if (state === 'over') drawOver();
  if (state === 'play' && paused) drawPause();
  if (menuSel >= buttons.length) menuSel = 0;
}

// ============================================================ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  update(dt); musicUpdate(); draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small hook for automated testing
window.__game = {
  get state() { return state; }, get dist() { return dist; }, get gap() { return gap; }, get score() { return score; },
  get zone() { return ZONES[zoneAt(dist)].name; }, get obstacles() { return obstacles.length; },
  start: newRun, setGap: v => { gap = v; }, give: k => collect({ kind: k, x: PX, y: GROUND - 40 }, GROUND - 40),
};
})();
