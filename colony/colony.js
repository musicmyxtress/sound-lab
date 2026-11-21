// Colony lab: first playable sketch of Blake's space colonization game.
// Blast off -> read a planet report -> colonize -> chase that planet's
// procedurally generated material sounds in the field -> build in the colony.
// Every number marked PLACEHOLDER is a guess for Blake to tune.
'use strict';

const $ = id => document.getElementById(id);
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

// ---------- tuning (PLACEHOLDER numbers) ----------
const CENTER_RATE = 1 / 60;        // credits per second, per person, per shopping center
const PEOPLE = { cabin: 2, house: 4 };
const MINE_SECONDS = 120;          // one unit per staffed mine per two minutes (hand is faster)
const colonizeCost = n => n === 0 ? 0 : Math.round(100 * 2.5 ** (n - 1));
const CAP_STEPS = [{ hours: 8, cost: 300 }, { hours: 12, cost: 800 }, { hours: 24, cost: 2000 }];
const ABUNDANCE_WEIGHT = { plentiful: 5, common: 3, scarce: 1 };

// ---------- save ----------
const SAVE_KEY = 'colony:save:v3'; // v3: four types, one workplace each
const fresh = () => ({ money: 0, cap: 4, capLevel: 0, colonies: [], current: -1, founded: 0, last: Date.now() });
let G;
try { G = JSON.parse(localStorage.getItem(SAVE_KEY)) || fresh(); } catch { G = fresh(); }
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch {} };
window.__colony = () => G; // for automated checks
const cur = () => G.colonies[G.current];
const count = (n, w) => `${n} ${n === 1 ? w : w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's'}`;

// ---------- speech ----------
// Polite and delayed, never cutting VoiceOver off mid-sentence.
const say = text => setTimeout(() => {
  const s = $('say'); s.textContent = ''; setTimeout(() => { s.textContent = text; }, 50);
}, 700);

// ---------- planets ----------
function rng(seed) { // mulberry32: same seed, same planet
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SYL = ['ka', 've', 'lo', 'tri', 'sen', 'or', 'mu', 'xa', 'del', 'qui', 'ran', 'bo', 'thi', 'zu', 'pel', 'nor', 'esh', 'ty', 'mar', 'vok'];
const cap1 = s => s[0].toUpperCase() + s.slice(1);
function word(r, n) { let w = ''; for (let i = 0; i < n; i++) w += SYL[Math.floor(r() * SYL.length)]; return cap1(w); }
const pick = (r, a) => a[Math.floor(r() * a.length)];

function makePlanet(seed) {
  const r = rng(seed);
  const name = word(r, 2 + Math.floor(r() * 2));
  const climate = pick(r, ['frozen', 'dusty', 'stormy', 'rocky', 'humid', 'volcanic']);
  // Blake's four types, all on every planet, sometimes a second of one.
  // How plentiful each is differs per planet.
  const types = ['wood', 'stone', 'metal', 'fiber'];
  if (r() < 0.5) types.push(pick(r, types));
  const levels = types.map(() => pick(r, ['plentiful', 'common', 'common', 'scarce']));
  const used = new Set();
  const materials = types.map((type, i) => {
    let nm; do { nm = word(r, 1 + Math.floor(r() * 2)) + pick(r, ['ite', 'ium', 'on', 'ar', 'ex', 'ine']); } while (used.has(nm));
    used.add(nm);
    return { id: 'm' + i, name: nm, type, abundance: levels[i], sound: makeSound(r, TYPE_SOUND[type]) };
  });
  return { seed, name, climate, materials };
}

// A material's sound, generated once from the planet's seed. Each type has
// its own kind of sound, so types can be learned by ear; the settings make
// each material unique.
const TYPE_SOUND = { wood: 'pluck', stone: 'thud', metal: 'fm', fiber: 'noise' };
// Each type has its own workplace, which needs 1 worker.
const WORKPLACE = { metal: 'mine', wood: 'lumber camp', stone: 'quarry', fiber: 'fiber farm' };
function makeSound(r, kind) {
  const semis = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
  return {
    kind,
    f: 110 * 2 ** (pick(r, semis) / 12) * (kind === 'bell' || kind === 'noise' ? 2 : 1),
    ratio: kind === 'bell' ? pick(r, [2.4, 2.76, 3.1, 3.5]) : pick(r, [1.41, 2, 2.5, 3.5]),
    decay: 0.15 + r() * 0.55,
    hits: 1 + Math.floor(r() * 3),
    gap: 0.08 + r() * 0.1,
    step: pick(r, [1, 1.122, 1.5, 0.89]),
    bright: 0.2 + r() * 0.8,
    rough: r(),
  };
}

// ---------- audio ----------
let ctx, master, noise;
function unmuteIOS() {
  if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return; }
  const rate = 8000, len = rate / 10;
  const buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * 2, true);
  const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  a.loop = true; a.setAttribute('playsinline', '');
  a.play().catch(() => {});
}
async function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    unmuteIOS();
  }
  if (ctx.state !== 'running') await ctx.resume();
}
function env(t, a, d, peak, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(out); return g;
}
function osc(type, f, t, dur, out) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  o.connect(out); o.start(t); o.stop(t + dur + 0.05); return o;
}
function noiseSrc(t, dur, out) {
  const n = ctx.createBufferSource(); n.buffer = noise;
  n.connect(out); n.start(t, Math.random() * 0.5, dur + 0.05); return n;
}
function filt(type, f, q, out) {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  b.connect(out); return b;
}
const KINDS = {
  bell(out, t, f, s) {
    [[1, 1], [s.ratio, 0.5 * s.bright], [s.ratio * 1.9, 0.25 * s.bright]].forEach(([r, a], i) =>
      osc('sine', f * r, t, s.decay + 0.2, env(t, 0.005, s.decay / (i + 1) + 0.05, 0.35 * a, out)));
  },
  fm(out, t, f, s) {
    const g = env(t, 0.002, s.decay, 0.4, out);
    const car = osc('sine', f, t, s.decay + 0.1, g);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * (1 + 3 * s.bright), t); mg.gain.exponentialRampToValueAtTime(1, t + s.decay * 0.7);
    mg.connect(car.frequency);
    osc('sine', f * s.ratio, t, s.decay + 0.1, mg);
  },
  noise(out, t, f, s) {
    noiseSrc(t, s.decay + 0.2, filt('bandpass', f, 2 + 10 * (1 - s.rough), env(t, 0.02 + 0.1 * s.rough, s.decay, 2.5, out)));
  },
  pluck(out, t, f, s) {
    const lp = filt('lowpass', f * (2 + 8 * s.bright), 2, env(t, 0.005, s.decay * 0.8, 0.3, out));
    lp.frequency.setValueAtTime(f * (2 + 8 * s.bright), t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + s.decay);
    osc(s.rough > 0.5 ? 'square' : 'sawtooth', f, t, s.decay, lp);
  },
  thud(out, t, f, s) { // low knock with a falling pitch: stone
    const o = osc('sine', f, t, s.decay + 0.1, env(t, 0.005, s.decay, 0.6, out));
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + s.decay);
  },
};
function playMat(s, out, t, mul = 1) {
  for (let k = 0; k < s.hits; k++) KINDS[s.kind](out, t + k * s.gap, s.f * mul * s.step ** k, s);
}
// A giant robot's footstep: a servo whine as the leg moves, then a deep
// thud, a metal clank and a ground crunch. Left and right feet alternate
// slightly in the stereo field. Walking backward has a higher whine.
let stepSide = 1;
function footstep(back) {
  const t = ctx.currentTime; stepSide = -stepSide;
  const pan = new StereoPannerNode(ctx, { pan: stepSide * 0.25 }); pan.connect(master);
  const wf = back ? 340 : 260;
  const w = osc('sawtooth', wf, t, 0.18, filt('lowpass', 900, 1, env(t, 0.03, 0.12, 0.03, pan)));
  w.frequency.setValueAtTime(wf, t); w.frequency.linearRampToValueAtTime(wf * 0.78, t + 0.15);
  const ti = t + 0.16;
  KINDS.thud(pan, ti, 45, { decay: 0.35 });
  playMat({ kind: 'fm', f: 95 * (stepSide > 0 ? 1 : 1.06), ratio: 1.41, decay: 0.18, hits: 1, gap: 0, step: 1, bright: 0.7, rough: 0 }, pan, ti);
  noiseSrc(ti, 0.12, filt('lowpass', 500, 0.7, env(ti, 0.002, 0.1, 0.6, pan)));
}
const turnTick = () => { const t = ctx.currentTime; osc('sine', 1400, t, 0.04, env(t, 0.001, 0.02, 0.05, master)); };
function dirCue(dir) {
  const t = ctx.currentTime, [a, b] = dir > 0 ? [440, 660] : [660, 440];
  osc('triangle', a, t, 0.08, env(t, 0.005, 0.07, 0.15, master));
  osc('triangle', b, t + 0.09, 0.08, env(t + 0.09, 0.005, 0.07, 0.15, master));
}
const stopCue = () => { const t = ctx.currentTime; osc('triangle', 330, t, 0.06, env(t, 0.005, 0.05, 0.1, master)); };

// The mech at work: a hydraulic hiss, heavy clanks (more for bigger
// buildings), then a settling thump. Jobs queue up, one building at a time.
// Returns seconds from now until this job is finished.
const HEAVY = { sound: { kind: 'fm', f: 70, ratio: 1.41, decay: 0.25, hits: 1, gap: 0, step: 1, bright: 0.9, rough: 0 } };
let mechBusyUntil = 0;
function mechBuild(clanks) {
  const t = Math.max(ctx.currentTime + 0.05, mechBusyUntil);
  const hiss = filt('bandpass', 400, 3, env(t, 0.15, 0.45, 1.2, master));
  hiss.frequency.setValueAtTime(400, t); hiss.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
  noiseSrc(t, 0.6, hiss);
  for (let i = 0; i < clanks; i++) playMat(HEAVY.sound, master, t + 0.5 + i * 0.32, 1 + (i % 2) * 0.12);
  const end = t + 0.5 + clanks * 0.32;
  KINDS.thud(master, end, 55, { decay: 0.4 });
  mechBusyUntil = end + 0.5;
  return end + 0.4 - ctx.currentTime;
}

// ---------- economy: every colony earns in real time ----------
// While the page is open this runs every second; after time away the gap is
// capped at the offline limit, so the same code handles both.
function tick() {
  const now = Date.now();
  const dt = Math.min(Math.max(0, (now - G.last) / 1000), G.cap * 3600);
  G.last = now;
  for (const c of G.colonies) {
    G.money += c.centers * people(c) * CENTER_RATE * dt;
    const staff = mineStaff(c);
    for (const id in c.mines) {
      c.mineProg[id] = (c.mineProg[id] || 0) + staff[id] * dt / MINE_SECONDS;
      const whole = Math.floor(c.mineProg[id]);
      if (whole) { c.stock[id] += whole; c.mineProg[id] -= whole; }
    }
  }
}
const people = c => c.cabins * PEOPLE.cabin + c.houses * PEOPLE.house;
// Each workplace needs 1 worker; workers fill them in material order.
function mineStaff(c) {
  let free = people(c); const staff = {};
  for (const m of c.planet.materials) { staff[m.id] = Math.min(c.mines[m.id] || 0, free); free -= staff[m.id]; }
  return staff;
}
const totalMines = c => Object.values(c.mines).reduce((a, b) => a + b, 0);
const staffedMines = c => Object.values(mineStaff(c)).reduce((a, b) => a + b, 0);
const money = () => Math.floor(G.money);
const matName = (c, id) => c.planet.materials.find(m => m.id === id).name;

// Building costs use the planet's own materials, most plentiful first.
function costs(c) {
  // Costs name a type; the planet's most plentiful material of that type pays.
  const of = type => c.planet.materials.filter(m => m.type === type)
    .sort((a, b) => ABUNDANCE_WEIGHT[b.abundance] - ABUNDANCE_WEIGHT[a.abundance])[0].id;
  const wood = of('wood'), stone = of('stone'), ore = of('metal');
  const list = [
    { key: 'cabin', label: 'cabin', cost: { [wood]: 4, [stone]: 2 } },
    { key: 'house', label: 'house', cost: { [wood]: 6, [stone]: 6 } },
    { key: 'center', label: 'shopping center', cost: { [wood]: 6, [stone]: 8, [ore]: 2 } },
  ];
  for (const m of c.planet.materials)
    list.push({ key: 'mine:' + m.id, label: `${m.name} ${WORKPLACE[m.type]}`, cost: { [wood]: 4, [stone]: 4 } });
  return list;
}
const costText = (c, cost) => Object.entries(cost).map(([id, n]) => `${n} ${matName(c, id)}`).join(', ');
const affordable = (c, cost) => Object.entries(cost).every(([id, n]) => c.stock[id] >= n);

// ---------- screens ----------
let screen = 'menu';
function show(id) {
  if (screen === 'field' && id !== 'field') stopField();
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  screen = id;
  RENDER[id]?.();
  const h = $(id).querySelector('h1, h2');
  setTimeout(() => h.focus(), 100); // VoiceOver lands on the new screen's heading
}
for (const b of document.querySelectorAll('.toMenu')) b.addEventListener('click', () => show('menu'));

const RENDER = {
  menu() {
    $('menuMoney').textContent = `Credits: ${money()}`;
    const c = cur();
    $('menuColony').textContent = c ? `Current colony: ${c.planet.name}` : 'No colony yet';
    $('goExplore').hidden = $('goColony').hidden = !c;
    $('goColonies').hidden = !G.colonies.length;
    $('intro').hidden = !!G.colonies.length;
  },
  space() {
    const p = scout;
    $('planetName').textContent = `Planet ${p.name}`;
    const rep = $('report'); rep.replaceChildren();
    rep.append(el('li', { textContent: `Climate: ${p.climate}` }));
    for (const m of p.materials) rep.append(el('li', { textContent: `${m.name}: ${m.type}, ${m.abundance}` }));
    const smp = $('samples'); smp.replaceChildren();
    for (const m of p.materials) {
      const b = el('button', { textContent: `Hear ${m.name}`, className: 'small' });
      b.addEventListener('click', async () => { await ensureAudio(); playMat(m.sound, master, ctx.currentTime + 0.05); });
      smp.append(b);
    }
    const cost = colonizeCost(G.founded);
    const btn = $('colonize');
    btn.textContent = cost ? `Colonize: costs ${cost} credits. You have ${money()}.` : 'Colonize: your first colony is free';
    btn.setAttribute('aria-disabled', money() < cost);
  },
  colony() {
    const c = cur();
    $('colonyName').textContent = `${c.planet.name} colony`;
    const st = $('stock'); st.replaceChildren();
    for (const m of c.planet.materials) st.append(el('li', { id: 'stock-' + m.id }));
    const bd = $('build'); bd.replaceChildren();
    for (const item of costs(c)) {
      const b = el('button', { id: 'build-' + item.key });
      b.addEventListener('click', () => build(c, item));
      bd.append(b);
    }
    refreshColony();
  },
  colonies() {
    const list = $('colonyList'); list.replaceChildren();
    G.colonies.forEach((c, i) => {
      const b = el('button', { textContent: `${c.planet.name}${i === G.current ? ', current' : ''}: ${count(people(c), 'colonist')}, ${count(c.centers, 'shopping center')}, ${count(totalMines(c), 'workplace')}` });
      b.addEventListener('click', () => { G.current = i; save(); show('colony'); });
      list.append(b);
    });
    const next = CAP_STEPS[G.capLevel];
    $('buyCap').textContent = next
      ? `Offline storage: ${G.cap} hours. Upgrade to ${next.hours} hours for ${next.cost} credits.`
      : `Offline storage: ${G.cap} hours, the maximum.`;
    $('buyCap').setAttribute('aria-disabled', !next || money() < next.cost);
  },
};

// Live numbers update text in place, never rebuilding the buttons, so
// VoiceOver focus is never thrown off a button while money ticks in.
function refreshColony() {
  const c = cur();
  const mineNote = totalMines(c) ? ` ${staffedMines(c)} of ${count(totalMines(c), 'workplace')} staffed.` : '';
  $('colonyPeople').textContent = `${count(people(c), 'colonist')}: ${count(c.cabins, 'cabin')}, ${count(c.houses, 'house')}. ${count(c.centers, 'shopping center')}.${mineNote} Credits: ${money()}.`;
  for (const m of c.planet.materials) {
    const mines = c.mines[m.id] || 0;
    $('stock-' + m.id).textContent = `${m.name}, ${m.type}: ${c.stock[m.id]}${mines ? `, ${count(mines, WORKPLACE[m.type])}` : ''}`;
  }
  for (const item of costs(c)) {
    const b = $('build-' + item.key);
    const label = `Build ${item.label}: ${costText(c, item.cost)}`;
    if (b.textContent !== label) b.textContent = label;
    b.setAttribute('aria-disabled', !affordable(c, item.cost));
  }
}

function build(c, item) {
  if (!affordable(c, item.cost)) {
    const short = Object.entries(item.cost).filter(([id, n]) => c.stock[id] < n)
      .map(([id, n]) => `${n - c.stock[id]} more ${matName(c, id)}`).join(', ');
    return say(`Need ${short}.`);
  }
  for (const [id, n] of Object.entries(item.cost)) c.stock[id] -= n;
  let msg;
  if (item.key === 'cabin') { c.cabins++; msg = `Cabin built. ${count(people(c), 'colonist')}.`; }
  else if (item.key === 'house') { c.houses++; msg = `House built. ${count(people(c), 'colonist')}.`; }
  else if (item.key === 'center') {
    c.centers++;
    msg = people(c) ? 'Shopping center built.' : 'Shopping center built. It earns once people live here.';
  } else {
    const id = item.key.slice(5); c.mines[id] = (c.mines[id] || 0) + 1;
    msg = staffedMines(c) < totalMines(c) ? `${cap1(item.label)} built, but it needs a worker. Build a cabin or house.` : `${cap1(item.label)} built.`;
  }
  save(); refreshColony();
  // The mech builds it: bigger buildings take more clanks. The announcement
  // waits until the work sound ends.
  const clanks = Math.min(6, 2 + Math.floor(Object.values(item.cost).reduce((a, b) => a + b, 0) / 6));
  ensureAudio().then(() => setTimeout(() => say(msg), Math.max(0, mechBuild(clanks) * 1000 - 700)), () => say(msg));
}

// ---------- menu actions ----------
let scout = null;
const blastOff = () => { scout = makePlanet(Math.floor(Math.random() * 2 ** 31)); show('space'); };
$('goSpace').addEventListener('click', blastOff);
$('keepLooking').addEventListener('click', blastOff);
$('goColony').addEventListener('click', () => show('colony'));
$('goColonies').addEventListener('click', () => show('colonies'));
$('goSettings').addEventListener('click', () => show('settings'));
$('goExplore').addEventListener('click', enterField);
$('colonyToField').addEventListener('click', enterField);
$('fieldToColony').addEventListener('click', () => show('colony'));

$('colonize').addEventListener('click', () => {
  const cost = colonizeCost(G.founded);
  if (money() < cost) return say(`You need ${cost - money()} more credits.`);
  G.money -= cost; G.founded++;
  const stock = {}; for (const m of scout.materials) stock[m.id] = 0;
  G.colonies.push({ planet: scout, stock, cabins: 0, houses: 0, centers: 0, mines: {}, mineProg: {} });
  G.current = G.colonies.length - 1;
  save(); show('colony');
});
$('buyCap').addEventListener('click', () => {
  const next = CAP_STEPS[G.capLevel];
  if (!next) return;
  if (money() < next.cost) return say(`You need ${next.cost - money()} more credits.`);
  G.money -= next.cost; G.cap = next.hours; G.capLevel++;
  save(); RENDER.colonies(); say(`Offline storage is now ${G.cap} hours.`);
});
$('startOver').addEventListener('click', () => {
  if (!confirm('Start over? This deletes all colonies and credits.')) return;
  G = fresh(); save(); show('menu');
});

// ---------- settings ----------
const S = { x: 0, y: 0, h: 0, running: false, mode: 'hold' };
window.__field = S;
try { S.mode = localStorage.getItem('chase:mode') || 'hold'; } catch {}
let hold = null;
function setMode(m) {
  S.mode = m; hold = null;
  try { localStorage.setItem('chase:mode', m); } catch {}
  for (const e of document.querySelectorAll('[data-modes]')) e.hidden = !e.dataset.modes.split(' ').includes(m);
}
for (const r of document.querySelectorAll('input[name=mode]')) {
  r.checked = r.value === S.mode;
  r.addEventListener('change', () => r.checked && setMode(r.value));
}
setMode(S.mode);

// ---------- the field: an endless world in chunks ----------
// Like E.X.O.: the planet's surface is cut into squares (chunks). Each
// chunk's materials come from the planet seed plus the chunk's position, so
// the world is fixed and endless. Only materials within hearing range make
// sound; they fade to silence at the edge. Collected ones stay collected, so
// you can clear one area, then move on and find more.
const WALK = 3, BACK = 2, MAX_TURN = 120, STEP = 2, STEP_TURN = 30, REACH = 2.5;
const CHUNK = 50;        // metres per chunk side (PLACEHOLDER)
const HEAR = 70;         // metres: hearing range, silent beyond (PLACEHOLDER)
const MAX_PER_CHUNK = 3; // most chunks have 0 or 1; a few have 2 or 3
const STRIDE = 2.4;      // metres per mech footstep
let wake = null, last = 0, tickAcc = 0, stepAcc = 0;
const chunkCache = new Map(); // "cx,cy" -> generated items for this planet
const active = new Map();     // item key -> playing sound
window.__active = active;     // for automated checks

const mix = (...n) => n.reduce((h, v) => Math.imul(h ^ (v | 0), 0x9E3779B1) ^ (h >>> 15), 0x2545F491) >>> 0;
function chunkItems(c, cx, cy) {
  const k = `${cx},${cy}`;
  if (chunkCache.has(k)) return chunkCache.get(k);
  const r = rng(mix(c.planet.seed, cx, cy));
  let n = Math.round(MAX_PER_CHUNK * r() ** 2.5);
  if (cx === 0 && cy === 0) n = Math.max(n, 2); // something to hear on landing
  // Clustered: items sit around one point in the chunk.
  const ccx = (cx + 0.25 + r() * 0.5) * CHUNK, ccy = (cy + 0.25 + r() * 0.5) * CHUNK;
  const mats = c.planet.materials;
  let total = 0; for (const m of mats) total += ABUNDANCE_WEIGHT[m.abundance];
  const items = [];
  for (let i = 0; i < n; i++) {
    const ri = rng(mix(c.planet.seed, cx, cy, i + 1));
    const ang = ri() * Math.PI * 2, d = 4 + ri() * 14;
    let roll = ri() * total, mat = mats[0];
    for (const m of mats) { roll -= ABUNDANCE_WEIGHT[m.abundance]; if (roll < 0) { mat = m; break; } }
    items.push({ key: `${k}:${i}`, chunk: k, i, x: ccx + Math.cos(ang) * d, y: ccy + Math.sin(ang) * d, mat });
  }
  chunkCache.set(k, items);
  return items;
}

async function enterField() {
  await ensureAudio();
  if (S.mode === 'tilt' || S.mode === 'compass') await askMotion();
  const c = cur();
  c.field ??= { x: CHUNK / 2, y: CHUNK / 2, h: 0, collected: {} }; // first landing: middle of the first chunk
  show('field');
  $('fieldTitle').textContent = `${c.planet.name} surface`;
  S.x = c.field.x; S.y = c.field.y; S.h = c.field.h; S.running = true;
  chunkCache.clear();
  recenter();
  stream();
  // Not awaited: the sounds must not wait on the screen-awake request.
  navigator.wakeLock?.request('screen').then(w => { wake = w; }, () => {});
  last = performance.now();
  requestAnimationFrame(frame);
}
function stopField() {
  S.running = false; hold = null;
  const c = cur();
  if (c?.field) { c.field.x = S.x; c.field.y = S.y; c.field.h = S.h; save(); } // come back where you left
  for (const A of active.values()) A.out.disconnect();
  active.clear();
  wake?.release(); wake = null;
}

// Start sounds that came into range; stop ones that went out of it.
function stream() {
  const c = cur(), got = c.field.collected, reach = Math.ceil(HEAR / CHUNK);
  const pcx = Math.floor(S.x / CHUNK), pcy = Math.floor(S.y / CHUNK);
  const near = new Set();
  for (let cx = pcx - reach; cx <= pcx + reach; cx++)
    for (let cy = pcy - reach; cy <= pcy + reach; cy++)
      for (const it of chunkItems(c, cx, cy)) {
        if (got[it.chunk]?.includes(it.i)) continue;
        if (Math.hypot(it.x - S.x, it.y - S.y) > HEAR) continue;
        near.add(it.key);
        if (!active.has(it.key)) {
          const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
          const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 5, rolloffFactor: 1 });
          panner.connect(out);
          const lp = filt('lowpass', 20000, 0.7, panner);
          active.set(it.key, { it, out, panner, lp, rate: 0.9 + Math.random() * 0.2, nextPing: ctx.currentTime + Math.random() * 1.2 });
        }
      }
  for (const [k, A] of active) if (!near.has(k)) { A.out.disconnect(); active.delete(k); }
}

function updateTargets() {
  stream();
  const h = S.h * Math.PI / 180, now = ctx.currentTime;
  for (const A of [...active.values()]) {
    const T = A.it, rx = T.x - S.x, ry = T.y - S.y, dist = Math.hypot(rx, ry);
    if (dist < REACH) { collect(A); continue; }
    const fwd = rx * Math.sin(h) + ry * Math.cos(h), right = rx * Math.cos(h) - ry * Math.sin(h);
    A.panner.positionX.setTargetAtTime(right, now, 0.03);
    A.panner.positionY.setTargetAtTime(0, now, 0.03);
    A.panner.positionZ.setTargetAtTime(-fwd, now, 0.03);
    A.lp.frequency.setTargetAtTime(700 * 28 ** ((fwd / dist + 1) / 2), now, 0.05); // behind = muffled
    A.out.gain.setTargetAtTime(Math.max(0, 1 - dist / HEAR) ** 1.5, now, 0.1);     // fades to silence at the edge
    const gap = Math.min(1.4, 0.5 + dist / 60) * A.rate; // faster as you close in
    while (A.nextPing < now + 0.15) { playMat(T.mat.sound, A.lp, Math.max(A.nextPing, now)); A.nextPing += gap; }
  }
}
function collect(A) {
  const T = A.it, c = cur();
  A.out.disconnect(); active.delete(T.key);
  (c.field.collected[T.chunk] ??= []).push(T.i);
  c.stock[T.mat.id]++; save();
  const t = ctx.currentTime;
  [1, 1.25, 1.5].forEach((m, i) => playMat(T.mat.sound, master, t + i * 0.15, m));
  say(`${T.mat.name}: ${c.stock[T.mat.id]} found. Type: ${T.mat.type}.`);
}

function turnBy(deg) {
  S.h = (S.h + deg + 360) % 360; tickAcc += Math.abs(deg);
  while (tickAcc >= 15) { tickAcc -= 15; turnTick(); }
}
function moveBy(m) {
  const h = S.h * Math.PI / 180;
  S.x += Math.sin(h) * m; S.y += Math.cos(h) * m; stepAcc += Math.abs(m);
  if (stepAcc >= STRIDE) { stepAcc = 0; footstep(m < 0); }
}

const orient = { beta: 0, gamma: 0, compass: null }, neutral = { beta: 0, gamma: 0, compass: 0 };
let gotOrient = false, recenterPending = false;
addEventListener('deviceorientation', e => {
  orient.beta = e.beta ?? 0; orient.gamma = e.gamma ?? 0;
  orient.compass = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null);
  gotOrient = true;
  if (recenterPending) { recenterPending = false; recenter(); }
});
async function askMotion() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    try { if (await D.requestPermission() !== 'granted') say('Motion access was refused. Tilt and compass will not work.'); }
    catch { say('Could not ask for motion access.'); }
  }
}
function recenter() {
  if (!gotOrient) { recenterPending = true; return; }
  neutral.beta = orient.beta; neutral.gamma = orient.gamma; neutral.compass = (orient.compass ?? 0) - S.h;
}
$('recenter').addEventListener('click', () => { recenter(); say('Recentered.'); });
const curve = (v, dz, full) => { const a = Math.abs(v); return a < dz ? 0 : Math.sign(v) * Math.min(1, (a - dz) / (full - dz)); };

// Hold pad: press walks forward; drag sideways turns (further = sharper);
// drag toward you / away latches backward / forward; release stops.
const pad = $('pad');
pad.addEventListener('pointerdown', e => {
  if (!S.running) return;
  e.preventDefault();
  try { pad.setPointerCapture(e.pointerId); } catch {}
  hold = { id: e.pointerId, x0: e.clientX, anchorY: e.clientY, dir: 1, dx: 0 };
  dirCue(1);
});
pad.addEventListener('pointermove', e => {
  if (!hold || e.pointerId !== hold.id) return;
  e.preventDefault();
  hold.dx = e.clientX - hold.x0;
  const dy = e.clientY - hold.anchorY;
  if (hold.dir > 0) { if (dy > 50) { hold.dir = -1; hold.anchorY = e.clientY; dirCue(-1); } else if (dy < 0) hold.anchorY = e.clientY; }
  else { if (dy < -50) { hold.dir = 1; hold.anchorY = e.clientY; dirCue(1); } else if (dy > 0) hold.anchorY = e.clientY; }
});
const release = e => { if (hold && e.pointerId === hold.id) { hold = null; stopCue(); } };
pad.addEventListener('pointerup', release);
pad.addEventListener('pointercancel', release);
pad.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// Steps mode (braille displays): sliders snap back so each adjust is one action.
function stepper(sl, act) {
  sl.addEventListener('input', () => {
    const v = +sl.value; if (v === 1 || !S.running) { sl.value = 1; return; }
    sl.setAttribute('aria-valuetext', act(v === 2 ? 1 : -1)); sl.value = 1;
  });
}
const doStep = d => { stepAcc = STRIDE; moveBy(d * STEP); updateTargets(); return d > 0 ? 'Forward' : 'Back'; };
const doTurn = d => { turnBy(d * STEP_TURN); updateTargets(); return d > 0 ? 'Right' : 'Left'; };
stepper($('walkSlider'), doStep);
stepper($('turnSlider'), doTurn);
$('stepFwd').addEventListener('click', () => S.running && doStep(1));
$('stepBack').addEventListener('click', () => S.running && doStep(-1));
$('turnL').addEventListener('click', () => S.running && doTurn(-1));
$('turnR').addEventListener('click', () => S.running && doTurn(1));

function frame(now) {
  if (!S.running) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  let turn = 0, speed = 0;
  if (S.mode === 'tilt') {
    turn = curve(orient.gamma - neutral.gamma, 6, 30) * MAX_TURN;
    const fb = curve(neutral.beta - orient.beta, 6, 25);
    speed = fb > 0 ? fb * WALK : fb * BACK;
  } else if (hold && (S.mode === 'hold' || S.mode === 'compass')) {
    speed = hold.dir > 0 ? WALK : -BACK;
    if (S.mode === 'hold') turn = curve(hold.dx, 15, 120) * MAX_TURN;
  }
  if (S.mode === 'compass' && orient.compass != null) {
    const diff = ((orient.compass - neutral.compass - S.h) % 360 + 540) % 360 - 180;
    turnBy(diff * Math.min(1, dt * 8));
  } else if (turn) turnBy(turn * dt);
  if (speed) moveBy(speed * dt);
  updateTargets();
  requestAnimationFrame(frame);
}

// ---------- start-up: report what came in while away ----------
{
  const away = (Date.now() - G.last) / 1000;
  const before = { money: G.money, stock: G.colonies.map(c => ({ ...c.stock })) };
  tick();
  const parts = [];
  const earned = Math.floor(G.money - before.money);
  if (earned > 0) parts.push(`${earned} credits`);
  G.colonies.forEach((c, i) => {
    for (const id in c.stock) {
      const got = c.stock[id] - before.stock[i][id];
      if (got > 0) parts.push(`${got} ${matName(c, id)} on ${c.planet.name}`);
    }
  });
  if (away > 120 && parts.length) {
    const capped = away > G.cap * 3600 ? ` Storage filled after ${G.cap} hours.` : '';
    const p = el('p', { textContent: `While you were away: ${parts.join(', ')}.${capped}` });
    $('menuMoney').before(p);
  }
  save();
  show('menu');
}
setInterval(() => {
  tick();
  if (screen === 'colony') refreshColony();
  if (screen === 'menu') $('menuMoney').textContent = `Credits: ${money()}`;
}, 1000);
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
