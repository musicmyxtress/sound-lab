// Chase lab: a sound-only field where a mystery sound plays somewhere around
// you and you steer to it. Tests four phone control schemes before any game
// is designed. Unlike the synth labs this is a game sketch, so it uses
// browser audio nodes (HRTF panner) rather than a portable engine.
'use strict';

const WALK = 3, BACK = 2;          // metres per second
const MAX_TURN = 120;              // degrees per second at full tilt or drag
const STEP = 2, STEP_TURN = 30;    // steps mode: metres and degrees per action
const REACH = 2.5;                 // metres: close enough to pick it up
const FAMILIES = ['glass', 'metal', 'mist', 'ember']; // placeholder names
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];

const $ = id => document.getElementById(id);
const S = { x: 0, y: 0, h: 0, found: 0, targets: [], count: 4, running: false, mode: 'tilt' };
window.__chase = S; // for automated checks
let hold = null; // hold pad state, declared early because setMode clears it

// ---------- settings ----------
try { S.mode = localStorage.getItem('chase:mode') || 'tilt'; } catch {}
for (const r of document.querySelectorAll('input[name=mode]')) {
  r.checked = r.value === S.mode;
  r.addEventListener('change', () => { if (r.checked) setMode(r.value, true); });
}
function setMode(m, fromUser) {
  S.mode = m; hold = null;
  try { localStorage.setItem('chase:mode', m); } catch {}
  for (const el of document.querySelectorAll('[data-modes]'))
    el.hidden = !el.dataset.modes.split(' ').includes(m);
  if (fromUser && (m === 'tilt' || m === 'compass')) askMotion().then(recenter);
}
setMode(S.mode, false);

// ---------- speech ----------
// Polite, delayed and never cleared mid-sentence, so the game does not cut
// VoiceOver off (the E.X.O. complaint).
const say = text => setTimeout(() => {
  const el = $('say'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 50);
}, 700);

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

function initAudio() {
  ctx = new AudioContext({ latencyHint: 'interactive' });
  master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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

// One sound per family, so over time you learn what a sound is by ear.
const VOICES = {
  glass(out, t, f) {
    [[1, 1], [2.76, 0.5], [5.4, 0.25]].forEach(([r, a], i) =>
      osc('sine', f * 2 * r, t, 0.8, env(t, 0.005, 0.7 / (i + 1), 0.35 * a, out)));
  },
  metal(out, t, f) {
    const g = env(t, 0.002, 0.45, 0.4, out);
    const car = osc('sine', f, t, 0.5, g);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 3, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.35);
    mg.connect(car.frequency);
    osc('sine', f * 1.41, t, 0.5, mg);
  },
  mist(out, t, f) {
    noiseSrc(t, 0.6, filt('bandpass', f * 2, 6, env(t, 0.08, 0.5, 2.5, out)));
  },
  ember(out, t, f) {
    osc('sawtooth', f / 2, t, 0.45, filt('lowpass', 700, 1, env(t, 0.02, 0.35, 0.35, out)));
    for (let k = 0; k < 3; k++) {
      const tk = t + 0.04 + k * 0.07 + Math.random() * 0.03;
      noiseSrc(tk, 0.03, filt('highpass', 2500, 1, env(tk, 0.001, 0.02, 0.5, out)));
    }
  },
};

function footstep(back) {
  const t = ctx.currentTime;
  noiseSrc(t, 0.1, filt('bandpass', back ? 180 : 320, 1, env(t, 0.003, 0.08, 0.5, master)));
}
function turnTick() {
  const t = ctx.currentTime;
  osc('sine', 1400, t, 0.04, env(t, 0.001, 0.02, 0.05, master));
}
function dirCue(dir) { // rising = forward, falling = back
  const t = ctx.currentTime, [a, b] = dir > 0 ? [440, 660] : [660, 440];
  osc('triangle', a, t, 0.08, env(t, 0.005, 0.07, 0.15, master));
  osc('triangle', b, t + 0.09, 0.08, env(t + 0.09, 0.005, 0.07, 0.15, master));
}
function stopCue() {
  const t = ctx.currentTime;
  osc('triangle', 330, t, 0.06, env(t, 0.005, 0.05, 0.1, master));
}

// ---------- the targets ----------
// Several sounds at once: choosing which to chase is the strategy.
let pending = 0; // pickups waiting to be replaced
function spawn(first) {
  let x, y;
  for (let tries = 0; tries < 10; tries++) { // keep sounds at least 12 m apart
    const ang = (first ? S.h : Math.random() * 360) * Math.PI / 180;
    const dist = first ? 20 : 25 + Math.random() * 35;
    x = S.x + Math.sin(ang) * dist; y = S.y + Math.cos(ang) * dist;
    if (first || S.targets.every(o => Math.hypot(o.x - x, o.y - y) > 12)) break;
  }
  const fam = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
  const f = 220 * 2 ** (SCALE[Math.floor(Math.random() * SCALE.length)] / 12);
  const panner = new PannerNode(ctx, {
    panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 5, rolloffFactor: 1, maxDistance: 200,
  });
  panner.connect(master);
  const lp = filt('lowpass', 20000, 0.7, panner);
  // Random start and a slightly different rhythm each, so they never ping in unison.
  S.targets.push({ x, y, fam, f, panner, lp, rate: 0.9 + Math.random() * 0.2,
                   nextPing: ctx.currentTime + 0.3 + Math.random() * 1.2 });
}

function refill() {
  while (S.targets.length + pending < S.count) spawn(false);
  while (S.targets.length > S.count) { // drop the farthest
    let far = 0, fd = -1;
    S.targets.forEach((T, i) => { const d = Math.hypot(T.x - S.x, T.y - S.y); if (d > fd) { fd = d; far = i; } });
    S.targets.splice(far, 1)[0].panner.disconnect();
  }
}

function updateTarget() {
  const h = S.h * Math.PI / 180, now = ctx.currentTime;
  for (const T of [...S.targets]) {
    const rx = T.x - S.x, ry = T.y - S.y, dist = Math.hypot(rx, ry);
    if (dist < REACH) { collect(T); continue; }
    const fwd = rx * Math.sin(h) + ry * Math.cos(h);
    const right = rx * Math.cos(h) - ry * Math.sin(h);
    T.panner.positionX.setTargetAtTime(right, now, 0.03);
    T.panner.positionY.setTargetAtTime(0, now, 0.03);
    T.panner.positionZ.setTargetAtTime(-fwd, now, 0.03);
    // Behind you sounds muffled: phone HRTF alone confuses front and back.
    const facing = (fwd / dist + 1) / 2; // 0 behind .. 1 ahead
    T.lp.frequency.setTargetAtTime(700 * 28 ** facing, now, 0.05);
    // Pings come faster as you close in.
    const gap = Math.min(1.4, 0.5 + dist / 60) * T.rate;
    while (T.nextPing < now + 0.15) { VOICES[T.fam](T.lp, Math.max(T.nextPing, now), T.f); T.nextPing += gap; }
  }
}

function collect(T) {
  S.targets.splice(S.targets.indexOf(T), 1);
  T.panner.disconnect();
  S.found++;
  const t = ctx.currentTime;
  [1, 1.25, 1.5].forEach((m, i) => VOICES[T.fam](master, t + i * 0.12, T.f * m));
  const name = T.fam[0].toUpperCase() + T.fam.slice(1);
  $('status').textContent = `Found ${S.found}`;
  say(`${name}. ${S.found} found.`);
  pending++;
  setTimeout(() => { pending--; if (S.running) refill(); }, 1500);
}

// How many sounds: a slider so the right number is found by ear.
const countEl = $('count');
try { S.count = +(localStorage.getItem('chase:count') || 4); } catch { S.count = 4; }
countEl.value = S.count;
const countText = () => countEl.setAttribute('aria-valuetext', `${S.count} sound${S.count === 1 ? '' : 's'}`);
countText();
countEl.addEventListener('input', () => {
  S.count = +countEl.value; countText();
  try { localStorage.setItem('chase:count', S.count); } catch {}
  if (S.running) refill();
});

// ---------- movement ----------
let tickAcc = 0, stepAcc = 0;
function turnBy(deg) {
  S.h = (S.h + deg + 360) % 360;
  tickAcc += Math.abs(deg);
  while (tickAcc >= 15) { tickAcc -= 15; turnTick(); }
}
function moveBy(m) {
  const h = S.h * Math.PI / 180;
  S.x += Math.sin(h) * m; S.y += Math.cos(h) * m;
  stepAcc += Math.abs(m);
  if (stepAcc >= 1.4) { stepAcc = 0; footstep(m < 0); }
}

// Motion sensors (tilt and compass)
const orient = { beta: 0, gamma: 0, compass: null };
const neutral = { beta: 0, gamma: 0, compass: 0 };
let gotOrient = false, recenterPending = false;
addEventListener('deviceorientation', e => {
  orient.beta = e.beta ?? 0; orient.gamma = e.gamma ?? 0;
  orient.compass = e.webkitCompassHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : null);
  gotOrient = true;
  // Permission is often granted just before the first reading arrives.
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
  neutral.beta = orient.beta; neutral.gamma = orient.gamma;
  neutral.compass = (orient.compass ?? 0) - S.h;
}
$('recenter').addEventListener('click', () => { recenter(); say('Recentered.'); });

const curve = (v, dz, full) => {
  const a = Math.abs(v); if (a < dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (full - dz));
};

// Hold pad: press starts walking forward. Distances are measured from where
// the press began, because VoiceOver starts the touch wherever its cursor is.
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
  const dy = e.clientY - hold.anchorY; // positive = toward you
  if (hold.dir > 0) {
    if (dy > 50) { hold.dir = -1; hold.anchorY = e.clientY; dirCue(-1); }
    else if (dy < 0) hold.anchorY = e.clientY;
  } else {
    if (dy < -50) { hold.dir = 1; hold.anchorY = e.clientY; dirCue(1); }
    else if (dy > 0) hold.anchorY = e.clientY;
  }
});
const release = e => { if (hold && e.pointerId === hold.id) { hold = null; stopCue(); } };
pad.addEventListener('pointerup', release);
pad.addEventListener('pointercancel', release);
pad.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// Steps mode: three-position sliders that snap back to the middle, so every
// VoiceOver swipe up or down is one action.
function stepper(el, act) {
  el.addEventListener('input', () => {
    const v = +el.value; if (v === 1 || !S.running) { el.value = 1; return; }
    // Version 2 tried a lone period here to silence VoiceOver; it made focus
    // jump on Blake's iPhone, so the slider speaks a real word. The pad is
    // the silent way to step.
    el.setAttribute('aria-valuetext', act(v === 2 ? 1 : -1));
    el.value = 1;
  });
}
const doStep = d => { stepAcc = 0; moveBy(d * STEP); updateTarget(); return d > 0 ? 'Forward' : 'Back'; }; // moveBy plays the footstep
const doTurn = d => { turnBy(d * STEP_TURN); updateTarget(); return d > 0 ? 'Right' : 'Left'; };
stepper($('walkSlider'), doStep);
stepper($('turnSlider'), doTurn);
$('stepFwd').addEventListener('click', () => S.running && doStep(1));
$('stepBack').addEventListener('click', () => S.running && doStep(-1));
$('turnL').addEventListener('click', () => S.running && doTurn(-1));
$('turnR').addEventListener('click', () => S.running && doTurn(1));

// ---------- game loop ----------
let last = 0;
function frame(now) {
  if (!S.running) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  let turn = 0, speed = 0;
  if (S.mode === 'tilt') {
    turn = curve(orient.gamma - neutral.gamma, 6, 30) * MAX_TURN;
    const fb = curve(neutral.beta - orient.beta, 6, 25);
    speed = fb > 0 ? fb * WALK : fb * BACK;
  } else if (S.mode === 'hold' || S.mode === 'compass') {
    if (hold) {
      speed = hold.dir > 0 ? WALK : -BACK;
      if (S.mode === 'hold') turn = curve(hold.dx, 15, 120) * MAX_TURN;
    }
  }
  if (S.mode === 'compass' && orient.compass != null) {
    const want = orient.compass - neutral.compass;
    const diff = ((want - S.h) % 360 + 540) % 360 - 180;
    turnBy(diff * Math.min(1, dt * 8));
  } else if (turn) turnBy(turn * dt);
  if (speed) moveBy(speed * dt);
  updateTarget();
  requestAnimationFrame(frame);
}

// ---------- start / pause ----------
let wake = null;
async function keepAwake() {
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.running) keepAwake();
});

$('start').addEventListener('click', async () => {
  if (S.running) {
    S.running = false; hold = null;
    await ctx.suspend();
    wake?.release(); wake = null;
    $('start').textContent = 'Start';
    return;
  }
  if (!ctx) initAudio();
  unmuteIOS();
  if (S.mode === 'tilt' || S.mode === 'compass') await askMotion();
  await ctx.resume();
  S.running = true;
  $('start').textContent = 'Pause';
  recenter();
  keepAwake();
  if (!S.targets.length) { if (S.found === 0) spawn(true); refill(); }
  last = performance.now();
  requestAnimationFrame(frame);
});
