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
const MINE_SECONDS = 120;          // one unit per staffed gatherer per two minutes (hand is faster)
const PROC_SECONDS = 60;           // a staffed forge, masonry or tailor turns 2 raw into 1 good per minute
const FACTORY_SECONDS = 90;        // a staffed factory makes one batch per minute and a half
const colonizeCost = n => n === 0 ? 0 : Math.round(100 * 2.5 ** (n - 1));
const CAP_STEPS = [{ hours: 8, cost: 300 }, { hours: 12, cost: 800 }, { hours: 24, cost: 2000 }];
const ABUNDANCE_WEIGHT = { plentiful: 5, common: 3, scarce: 1 };
// Mech upgrades (v12, Blake and Daniel's idea): what the factory parts are
// for. One mech, so levels are shared by every colony; parts come from the
// colony you're in. Each level costs its base again: level 1 costs the base,
// level 2 twice the base, and so on. Names and costs are PLACEHOLDERs.
const UPGRADES = {
  wood:  { name: "Woodsman's axe", cost: { 'g:beams': 2, 'g:servos': 1 } },
  stone: { name: 'Stone pick',     cost: { 'g:beams': 2, 'g:servos': 1 } },
  metal: { name: 'Ore drill',      cost: { 'g:motors': 1, 'g:wires': 2 } },
  fiber: { name: 'Fiber shears',   cost: { 'g:servos': 1, 'g:wires': 2 } },
  reach: { name: 'Reach arm',      cost: { 'g:motors': 1, 'g:servos': 2, 'g:wires': 4 } },
};

// ---------- save ----------
const SAVE_KEY = 'colony:save:v3'; // v3: four types, one workplace each
const fresh = () => ({ money: 0, cap: 4, capLevel: 0, colonies: [], current: -1, founded: 0, last: Date.now() });
let G;
try { G = JSON.parse(localStorage.getItem(SAVE_KEY)) || fresh(); } catch { G = fresh(); }
G.upgrades ??= {}; // v12: upgrade key -> level
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
// Soft low tock when your finger or tilt lands in the go-straight zone (v15).
const straightCue = () => { const t = ctx.currentTime; osc('sine', 520, t, 0.07, env(t, 0.002, 0.06, 0.09, master)); };
// Soft chime when a sound comes dead centre: stop turning here.
let lastAheadCue = 0;
function aheadCue() {
  const t = ctx.currentTime; if (t - lastAheadCue < 0.3) return; lastAheadCue = t;
  osc('triangle', 988, t, 0.12, env(t, 0.005, 0.1, 0.06, master));
  osc('triangle', 1319, t + 0.06, 0.14, env(t + 0.06, 0.005, 0.12, 0.05, master));
}
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

// ---------- the production chain ----------
// Gatherers (1 worker) collect raw materials. Processors (2 workers) turn
// raw into goods. Factories (3 workers) turn goods into parts, one chosen
// product each. A building stops when it lacks inputs. Workers fill jobs in
// chain order: gatherers, then processors, then factories.
const PROCESSORS = {
  forge:   { label: 'forge',   plural: 'forges',     input: 'metal', output: 'g:bars' },
  masonry: { label: 'masonry', plural: 'masonries',  input: 'stone', output: 'g:bricks' },
  tailor:  { label: 'tailor',  plural: 'tailors',    input: 'fiber', output: 'g:cloth' },
};
const GOODS = { 'g:bars': 'metal bars', 'g:bricks': 'bricks', 'g:cloth': 'cloth', 'g:wires': 'wires', 'g:beams': 'beams', 'g:servos': 'servos', 'g:motors': 'motors' };
const ONE = { 'g:bars': 'metal bar', 'g:bricks': 'brick', 'g:cloth': 'cloth', 'g:wires': 'wire', 'g:beams': 'beam', 'g:servos': 'servo', 'g:motors': 'motor' };
const goodName = (g, n) => n === 1 ? ONE[g] : GOODS[g];
const PRODUCTS = { // PLACEHOLDER recipes
  wires:  { input: { 'g:bars': 1 }, output: 'g:wires', makes: 2 },
  beams:  { input: { 'g:bars': 2 }, output: 'g:beams', makes: 1 },
  servos: { input: { 'g:bars': 1, 'g:wires': 2 }, output: 'g:servos', makes: 1 },
  motors: { input: { 'g:bars': 2, 'g:wires': 3, 'g:cloth': 1 }, output: 'g:motors', makes: 1 },
};
const PRODUCT_ORDER = Object.keys(PRODUCTS);

// Older saves predate the chain; give them the new fields.
function migrate(c) {
  c.proc ??= { forge: 0, masonry: 0, tailor: 0 };
  c.factories ??= [];
  c.prog ??= {};
  if (c.mineProg) { for (const id in c.mineProg) c.prog['mine:' + id] = c.mineProg[id]; delete c.mineProg; }
  for (const g in GOODS) c.stock[g] ??= 0;
  c.status ??= {};
  c.paused ??= {}; // v11: 'forge', 'masonry', 'tailor' or 'fac:N' set to true
}
G.colonies.forEach(migrate);

const people = c => c.cabins * PEOPLE.cabin + c.houses * PEOPLE.house;
function staffing(c) {
  let free = people(c);
  const mine = {}, proc = {}, fac = [];
  for (const m of c.planet.materials) { mine[m.id] = Math.min(c.mines[m.id] || 0, free); free -= mine[m.id]; }
  // Paused buildings send their workers home, so they can fill other jobs.
  for (const k in PROCESSORS) { proc[k] = c.paused[k] ? 0 : Math.min(c.proc[k], Math.floor(free / 2)); free -= proc[k] * 2; }
  for (let i = 0; i < c.factories.length; i++) { fac[i] = !c.paused['fac:' + i] && free >= 3; if (fac[i]) free -= 3; }
  return { mine, proc, fac, idle: free };
}
const gatherers = c => Object.values(c.mines).reduce((a, b) => a + b, 0);
const workplaces = c => gatherers(c) + Object.values(c.proc).reduce((a, b) => a + b, 0) + c.factories.length;

// Raw materials of one type can come from any material of that type.
const typeStock = (c, type) => c.planet.materials.filter(m => m.type === type).reduce((a, m) => a + c.stock[m.id], 0);
function takeType(c, type, n) {
  const mats = c.planet.materials.filter(m => m.type === type).sort((x, y) => c.stock[y.id] - c.stock[x.id]);
  for (const m of mats) { const t = Math.min(n, c.stock[m.id]); c.stock[m.id] -= t; n -= t; }
}

function simulate(c, dt) {
  const st = staffing(c);
  for (let left = dt; left > 0; left -= 10) { // small steps so goods flow down the chain
    const step = Math.min(10, left);
    for (const id in st.mine) {
      const k = 'mine:' + id;
      c.prog[k] = (c.prog[k] || 0) + st.mine[id] * step / MINE_SECONDS;
      const whole = Math.floor(c.prog[k]);
      if (whole) { c.stock[id] += whole; c.prog[k] -= whole; }
    }
    for (const k in PROCESSORS) {
      const P = PROCESSORS[k];
      c.prog[k] = (c.prog[k] || 0) + st.proc[k] * step / PROC_SECONDS;
      c.status[k] = c.paused[k] ? 'paused' : st.proc[k] ? 'running' : 'idle';
      while (c.prog[k] >= 1) {
        if (typeStock(c, P.input) < 2) { c.prog[k] = 1; c.status[k] = 'waiting for ' + P.input; break; }
        takeType(c, P.input, 2); c.stock[P.output]++; c.prog[k]--;
      }
    }
    c.factories.forEach((prod, i) => {
      const R = PRODUCTS[prod], k = 'fac:' + i;
      if (c.paused[k]) { c.status[k] = 'paused'; return; }
      if (!st.fac[i]) { c.status[k] = 'needs 3 workers'; return; }
      c.prog[k] = (c.prog[k] || 0) + step / FACTORY_SECONDS;
      c.status[k] = 'running';
      while (c.prog[k] >= 1) {
        const short = Object.entries(R.input).find(([g, n]) => c.stock[g] < n);
        if (short) { c.prog[k] = 1; c.status[k] = 'waiting for ' + GOODS[short[0]]; break; }
        for (const [g, n] of Object.entries(R.input)) c.stock[g] -= n;
        c.stock[R.output] += R.makes; c.prog[k]--;
      }
    });
  }
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
    if (dt > 0) simulate(c, dt);
  }
}
const money = () => Math.floor(G.money);
const nameOf = (c, id, n) => GOODS[id] ? goodName(id, n) : c.planet.materials.find(m => m.id === id).name;

// Costs name a type; the planet's most plentiful material of that type pays.
// PLACEHOLDER amounts. Bigger buildings use goods instead of piles of raw.
function costs(c) {
  const of = type => c.planet.materials.filter(m => m.type === type)
    .sort((a, b) => ABUNDANCE_WEIGHT[b.abundance] - ABUNDANCE_WEIGHT[a.abundance])[0].id;
  const wood = of('wood'), stone = of('stone');
  const list = [
    { key: 'cabin', label: 'cabin', group: 'Homes', cost: { [wood]: 4, [stone]: 2 } },
    { key: 'house', label: 'house', group: 'Homes', cost: { [wood]: 4, 'g:bricks': 4 } },
    { key: 'center', label: 'shopping center', group: 'Homes', cost: { [wood]: 4, 'g:bricks': 6 } },
  ];
  for (const m of c.planet.materials)
    list.push({ key: 'mine:' + m.id, label: `${m.name} ${WORKPLACE[m.type]}`, group: 'Gathering', cost: { [wood]: 4, [stone]: 4 } });
  list.push({ key: 'proc:forge', label: 'forge', group: 'Processing', cost: { [wood]: 4, [stone]: 8 } });
  list.push({ key: 'proc:masonry', label: 'masonry', group: 'Processing', cost: { [wood]: 6, [stone]: 4 } });
  list.push({ key: 'proc:tailor', label: 'tailor', group: 'Processing', cost: { [wood]: 6, [stone]: 4 } });
  list.push({ key: 'factory', label: 'factory', group: 'Processing', cost: { 'g:bricks': 6, 'g:bars': 4 } });
  return list;
}
const costText = (c, cost) => Object.entries(cost).map(([id, n]) => `${n} ${nameOf(c, id, n)}`).join(', ');
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
    const gd = $('goods'); gd.replaceChildren();
    gd.append(el('li', { id: 'goods-none', textContent: 'None yet' }));
    for (const g in GOODS) gd.append(el('li', { id: 'goods-' + g.slice(2) }));
    const pr = $('production'); pr.replaceChildren();
    pr.append(el('p', { id: 'prod-none', textContent: 'Nothing built yet' }));
    for (const k in PROCESSORS) {
      // One switch per kind: double tap pauses or restarts every forge (or masonry, or tailor).
      const b = el('button', { id: 'prod-' + k });
      b.addEventListener('click', () => togglePause(c, k));
      pr.append(b);
    }
    renderFactories(c);
    const up = $('upgrades'); up.replaceChildren();
    for (const k in UPGRADES) {
      const b = el('button', { id: 'upg-' + k });
      b.addEventListener('click', () => buyUpgrade(c, k));
      up.append(b);
    }
    const bd = $('build'); bd.replaceChildren();
    let group = '';
    for (const item of costs(c)) {
      if (item.group !== group) { group = item.group; bd.append(el('h4', { textContent: group })); }
      const b = el('button', { id: 'build-' + item.key.replace(':', '-') });
      b.addEventListener('click', () => build(c, item));
      bd.append(b);
    }
    refreshColony();
  },
  colonies() {
    const list = $('colonyList'); list.replaceChildren();
    G.colonies.forEach((c, i) => {
      const b = el('button', { textContent: `${c.planet.name}${i === G.current ? ', current' : ''}: ${count(people(c), 'colonist')}, ${count(c.centers, 'shopping center')}, ${count(workplaces(c), 'workplace')}` });
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

// Factories: one button each, which switches what it makes. Rebuilt only
// when a factory is added, never while ticking.
function renderFactories(c) {
  const box = $('factories'); box.replaceChildren();
  $('factoriesHeading').hidden = !c.factories.length;
  c.factories.forEach((prod, i) => {
    const b = el('button', { id: 'fac-' + i });
    b.addEventListener('click', () => {
      c.factories[i] = PRODUCT_ORDER[(PRODUCT_ORDER.indexOf(c.factories[i]) + 1) % PRODUCT_ORDER.length];
      c.prog['fac:' + i] = 0; save(); refreshColony();
      say(`Factory ${i + 1} now makes ${c.factories[i]}.`);
    });
    const p = el('button', { id: 'facpause-' + i, className: 'small' });
    p.addEventListener('click', () => togglePause(c, 'fac:' + i));
    box.append(b, p);
  });
}

// Pausing keeps a building's inputs in stock (for example stone for cabins
// instead of bricks) and frees its workers for other jobs.
function togglePause(c, k) {
  c.paused[k] = !c.paused[k];
  if (!c.paused[k]) delete c.paused[k];
  c.status[k] = c.paused[k] ? 'paused' : 'running'; save(); refreshColony();
  const P = PROCESSORS[k];
  const name = P ? cap1(c.proc[k] === 1 ? P.label : P.plural) : `Factory ${+k.slice(4) + 1}`;
  const keeps = P ? P.input : PRODUCTS[c.factories[+k.slice(4)]] && Object.keys(PRODUCTS[c.factories[+k.slice(4)]].input).map(g => GOODS[g]).join(' and ');
  say(c.paused[k] ? `${name} paused. Your ${keeps} will stay in stock, and the workers are free for other jobs.` : `${name} running again.`);
}
const recipeText = prod => {
  const R = PRODUCTS[prod];
  return `${Object.entries(R.input).map(([g, n]) => `${n} ${goodName(g, n)}`).join(', ')} into ${R.makes} ${goodName(R.output, R.makes)}`;
};

// Live numbers update text in place, never rebuilding the buttons, so
// VoiceOver focus is never thrown off a button while credits tick in.
function setText(id, text) { const e = $(id); if (e && e.textContent !== text) e.textContent = text; }
function refreshColony() {
  const c = cur(), st = staffing(c), working = people(c) - st.idle;
  setText('colonyPeople', `${count(people(c), 'colonist')}, ${working} working: ${count(c.cabins, 'cabin')}, ${count(c.houses, 'house')}. ${count(c.centers, 'shopping center')}. Credits: ${money()}.`);
  for (const m of c.planet.materials) {
    const n = c.mines[m.id] || 0, s = st.mine[m.id];
    setText('stock-' + m.id, `${m.name}, ${m.type}: ${c.stock[m.id]}${n ? `, ${count(n, WORKPLACE[m.type])}${s < n ? `, ${n - s} without workers` : ''}` : ''}`);
  }
  let anyGoods = false;
  for (const g in GOODS) {
    const li = $('goods-' + g.slice(2)); li.hidden = !c.stock[g]; anyGoods ||= !!c.stock[g];
    setText('goods-' + g.slice(2), `${cap1(GOODS[g])}: ${c.stock[g]}`);
  }
  $('goods-none').hidden = anyGoods;
  let anyProc = false;
  for (const k in PROCESSORS) {
    const n = c.proc[k], li = $('prod-' + k); li.hidden = !n; anyProc ||= !!n;
    if (!n) continue;
    const s = st.proc[k], what = cap1(count(n, PROCESSORS[k].label).replace('masonrys', 'masonries'));
    if (c.paused[k]) { setText('prod-' + k, `${what}: paused, keeping your ${PROCESSORS[k].input}. Double tap to start again.`); continue; }
    const state = !s ? 'needs workers, 2 each' : c.status[k] === 'running' || !c.status[k] ? 'running' : c.status[k];
    setText('prod-' + k, `${what}, ${s} staffed: ${state}. Double tap to pause.`);
  }
  $('prod-none').hidden = anyProc;
  c.factories.forEach((prod, i) => {
    const paused = c.paused['fac:' + i];
    const state = paused ? 'paused' : st.fac[i] ? (c.status['fac:' + i] || 'running') : 'needs 3 workers';
    setText('fac-' + i, `Factory ${i + 1}: makes ${prod}, ${recipeText(prod)}. ${cap1(state)}. Double tap to switch.`);
    setText('facpause-' + i, paused ? `Start factory ${i + 1} again` : `Pause factory ${i + 1}`);
  });
  for (const k in UPGRADES) {
    const lv = G.upgrades[k] || 0, cost = upgradeCost(k);
    const does = k === 'reach'
      ? (lv ? `picks things up from ${count(lv, 'footstep')} away` : 'you pick up only what you walk onto')
      : `each ${k} you find gives ${1 + lv}`;
    setText('upg-' + k, `${UPGRADES[k].name}, level ${lv}: ${does}. Next level: ${costText(c, cost)}`);
    $('upg-' + k).setAttribute('aria-disabled', !affordable(c, cost));
  }
  for (const item of costs(c)) {
    const b = $('build-' + item.key.replace(':', '-'));
    setText(b.id, `Build ${item.label}: ${costText(c, item.cost)}`);
    b.setAttribute('aria-disabled', !affordable(c, item.cost));
  }
}

function build(c, item) {
  if (!affordable(c, item.cost)) {
    const short = Object.entries(item.cost).filter(([id, n]) => c.stock[id] < n)
      .map(([id, n]) => `${n - c.stock[id]} more ${nameOf(c, id, n - c.stock[id])}`).join(', ');
    return say(`Need ${short}.`);
  }
  for (const [id, n] of Object.entries(item.cost)) c.stock[id] -= n;
  let msg;
  if (item.key === 'cabin') { c.cabins++; msg = `Cabin built. ${count(people(c), 'colonist')}.`; }
  else if (item.key === 'house') { c.houses++; msg = `House built. ${count(people(c), 'colonist')}.`; }
  else if (item.key === 'center') {
    c.centers++;
    msg = people(c) ? 'Shopping center built.' : 'Shopping center built. It earns once people live here.';
  } else if (item.key.startsWith('mine:')) {
    const id = item.key.slice(5); c.mines[id] = (c.mines[id] || 0) + 1;
    msg = staffing(c).mine[id] < c.mines[id] ? `${cap1(item.label)} built, but it needs a worker. Build a cabin or house.` : `${cap1(item.label)} built.`;
  } else if (item.key.startsWith('proc:')) {
    const k = item.key.slice(5); c.proc[k]++;
    msg = staffing(c).proc[k] < c.proc[k] ? `${cap1(item.label)} built, but it needs 2 workers.` : `${cap1(item.label)} built.`;
  } else {
    c.factories.push('wires');
    renderFactories(c);
    msg = `Factory ${c.factories.length} built, making wires.${staffing(c).fac.at(-1) ? '' : ' It needs 3 workers.'}`;
  }
  save(); refreshColony();
  // The mech builds it: bigger buildings take more clanks. The announcement
  // waits until the work sound ends.
  const clanks = Math.min(6, 2 + Math.floor(Object.values(item.cost).reduce((a, b) => a + b, 0) / 6));
  ensureAudio().then(() => setTimeout(() => say(msg), Math.max(0, mechBuild(clanks) * 1000 - 700)), () => say(msg));
}

const upgradeCost = k => {
  const lv = G.upgrades[k] || 0, out = {};
  for (const [g, n] of Object.entries(UPGRADES[k].cost)) out[g] = n * (lv + 1);
  return out;
};
function buyUpgrade(c, k) {
  const cost = upgradeCost(k);
  if (!affordable(c, cost)) {
    const short = Object.entries(cost).filter(([id, n]) => c.stock[id] < n)
      .map(([id, n]) => `${n - c.stock[id]} more ${nameOf(c, id, n - c.stock[id])}`).join(', ');
    return say(`Need ${short}.`);
  }
  for (const [g, n] of Object.entries(cost)) c.stock[g] -= n;
  const lv = G.upgrades[k] = (G.upgrades[k] || 0) + 1;
  save(); refreshColony();
  const msg = `${UPGRADES[k].name} upgraded to level ${lv}. ` + (k === 'reach'
    ? `You now pick things up from ${count(lv, 'footstep')} away.`
    : `Each ${k} you find now gives ${1 + lv}.`);
  ensureAudio().then(() => setTimeout(() => say(msg), Math.max(0, mechBuild(3) * 1000 - 700)), () => say(msg));
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
  const c = { planet: scout, stock, cabins: 0, houses: 0, centers: 0, mines: {} };
  migrate(c); G.colonies.push(c);
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

// The field's own Controls button: switch schemes without leaving the field.
// It stays in place while the other controls change, so focus stays on it.
const MODE_NAMES = { tilt: 'Tilt', hold: 'Hold and drag', compass: 'Compass', steps: 'Steps and buttons' };
const MODE_ORDER = Object.keys(MODE_NAMES);
const modeLabel = () => { $('fieldMode').textContent = `Controls: ${MODE_NAMES[S.mode]}. Double tap to change.`; };
modeLabel();
$('fieldMode').addEventListener('click', async () => {
  const m = MODE_ORDER[(MODE_ORDER.indexOf(S.mode) + 1) % MODE_ORDER.length];
  setMode(m);
  for (const r of document.querySelectorAll('input[name=mode]')) r.checked = r.value === m;
  modeLabel();
  if (m === 'tilt' || m === 'compass') { await askMotion(); recenter(); }
  say(`${MODE_NAMES[m]}.`);
});
for (const r of document.querySelectorAll('input[name=mode]')) r.addEventListener('change', modeLabel);

// ---------- the field: an endless world in chunks ----------
// Like E.X.O.: the planet's surface is cut into squares (chunks). Each
// chunk's materials come from the planet seed plus the chunk's position, so
// the world is fixed and endless. Only materials within hearing range make
// sound; they fade to silence at the edge. Collected ones stay collected, so
// you can clear one area, then move on and find more.
const WALK = 3, BACK = 2, MAX_TURN = 70, STEP = 2, STEP_TURN = 30;
// Picking up (v14, Blake's rule): without a Reach arm you pick up only what
// you walk onto (TOUCH). With one, anything within one footstep per level,
// on any side. (v13 grabbed only in front; Blake said no.)
const TOUCH = 1; // metres: standing on it (PLACEHOLDER)
const reachNow = () => Math.max(TOUCH, (G.upgrades.reach || 0) * STRIDE);
// Turning eases in: a small tilt or drag turns very slowly, so you can stop
// on a sound instead of swinging past it (v10, Blake's pendulum problem).
const ease = v => Math.sign(v) * Math.abs(v) ** 1.5;
const AHEAD = 5; // degrees either side that count as straight ahead
const CHUNK = 50;        // metres per chunk side (PLACEHOLDER)
const HEAR = 90;         // metres: hearing range, silent beyond (PLACEHOLDER)
// Richness: average materials per 50 m square. A temporary Settings slider
// so Blake can find the right density by ear, then it becomes the default.
const RICHNESS = [0.8, 1.5, 2.5, 4, 6];
let richLevel = 3;
try { richLevel = +(localStorage.getItem('colony:richness') || 3); } catch {}
const richAvg = () => RICHNESS[richLevel - 1];
// Typical gap to the nearest material, in metres, for the slider's words.
const richSpacing = lv => Math.round(0.5 * Math.sqrt(CHUNK * CHUNK / RICHNESS[lv - 1]));

// Richness slider (Settings), described in plain words.
const richEl = $('richness');
const richText = () => richEl.setAttribute('aria-valuetext', `Level ${richLevel} of 5: about one every ${richSpacing(richLevel)} metres`);
richEl.value = richLevel; richText();
richEl.addEventListener('input', () => {
  richLevel = +richEl.value; richText();
  try { localStorage.setItem('colony:richness', richLevel); } catch {}
});
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
  // Between half and one and a half times the richness average, so empty
  // squares only happen at the sparsest level.
  let n = Math.min(10, Math.round(richAvg() * (0.5 + r())));
  if (cx === 0 && cy === 0) n = Math.max(n, 2); // something to hear on landing
  const mats = c.planet.materials;
  let total = 0; for (const m of mats) total += ABUNDANCE_WEIGHT[m.abundance];
  const items = [];
  for (let i = 0; i < n; i++) {
    // Each item's place and material depend only on its own number, so
    // changing richness adds or removes items without moving the others.
    const ri = rng(mix(c.planet.seed, cx, cy, i + 1));
    const x = (cx + ri()) * CHUNK, y = (cy + ri()) * CHUNK;
    let roll = ri() * total, mat = mats[0];
    for (const m of mats) { roll -= ABUNDANCE_WEIGHT[m.abundance]; if (roll < 0) { mat = m; break; } }
    items.push({ key: `${k}:${i}`, chunk: k, i, x, y, mat });
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
          const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 10, rolloffFactor: 1 });
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
    const fwd = rx * Math.sin(h) + ry * Math.cos(h), right = rx * Math.cos(h) - ry * Math.sin(h);
    const offAhead = Math.abs(Math.atan2(right, fwd)) * 180 / Math.PI;
    if (dist < reachNow()) { collect(A); continue; }
    A.panner.positionX.setTargetAtTime(right, now, 0.03);
    A.panner.positionY.setTargetAtTime(0, now, 0.03);
    A.panner.positionZ.setTargetAtTime(-fwd, now, 0.03);
    A.lp.frequency.setTargetAtTime(700 * 28 ** ((fwd / dist + 1) / 2), now, 0.05); // behind = muffled
    const ahead = fwd > 0 && offAhead < AHEAD;
    if (ahead && !A.ahead) aheadCue();
    A.ahead = ahead;
    A.out.gain.setTargetAtTime(Math.max(0, 1 - dist / HEAR), now, 0.1);     // fades to silence at the edge
    const gap = Math.min(1.4, 0.5 + dist / 60) * A.rate; // faster as you close in
    while (A.nextPing < now + 0.15) { playMat(T.mat.sound, A.lp, Math.max(A.nextPing, now)); A.nextPing += gap; }
  }
}
function collect(A) {
  const T = A.it, c = cur();
  A.out.disconnect(); active.delete(T.key);
  (c.field.collected[T.chunk] ??= []).push(T.i);
  const n = 1 + (G.upgrades[T.mat.type] || 0); // tool upgrades: more per find
  c.stock[T.mat.id] += n; save();
  const t = ctx.currentTime;
  [1, 1.25, 1.5].forEach((m, i) => playMat(T.mat.sound, master, t + i * 0.15, m));
  say(`${T.mat.name}: ${n > 1 ? `${n} at once, ` : ''}${c.stock[T.mat.id]} found. Type: ${T.mat.type}.`);
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
// Go-straight zones (v15, Blake kept circling while trying to straighten
// out): hold pad 40 px either side of where the finger landed (was 15),
// tilt 15 degrees either side of level (was 6). PLACEHOLDER.
const HOLD_STRAIGHT = 40, HOLD_FULL = 150, TILT_STRAIGHT = 15, TILT_FULL = 38;
let wasTurning = false;
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
    turn = ease(curve(orient.gamma - neutral.gamma, TILT_STRAIGHT, TILT_FULL)) * MAX_TURN;
    const fb = curve(neutral.beta - orient.beta, 6, 25);
    speed = fb > 0 ? fb * WALK : fb * BACK;
  } else if (hold && (S.mode === 'hold' || S.mode === 'compass')) {
    speed = hold.dir > 0 ? WALK : -BACK;
    if (S.mode === 'hold') turn = ease(curve(hold.dx, HOLD_STRAIGHT, HOLD_FULL)) * MAX_TURN;
  }
  // Tock when turning stops because you came back to straight (not on release).
  const steering = S.mode === 'tilt' || (S.mode === 'hold' && hold);
  if (steering && wasTurning && !turn) straightCue();
  wasTurning = steering && !!turn;
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
      if (got > 0) parts.push(`${got} ${nameOf(c, id, got)} on ${c.planet.name}`);
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
// iPhone pauses web audio when you leave Safari and does not restart it.
// Ask for it back when the page returns, and again on the next tap, since
// iOS sometimes only allows the restart from a touch.
function wakeAudio() {
  if (!ctx) return;
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); return; }
  wakeAudio();
  if (S.running && !wake) navigator.wakeLock?.request('screen').then(w => { wake = w; }, () => {}); // the screen lock is dropped on leaving
});
addEventListener('pageshow', wakeAudio);
addEventListener('focus', wakeAudio);
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, wakeAudio, true);
