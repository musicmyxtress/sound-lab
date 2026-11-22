// Jack-in-the-box lab: the finale of the Tricky Toy Maker escape room.
// A music box loops "Pop Goes the Weasel". Each solved answer speeds it up;
// after the third, the tune plays on to the next "POP!" and Fidget springs out.
// The sound is built from browser audio nodes (no recording, no MIDI file), so
// the page knows exactly where every note falls and can change speed mid-tune.

const VERSION = 4;
const KEY = 'sound-lab:fidget:v2'; // v2 raised the speed defaults, so older saved sliders are dropped

// "Pop Goes the Weasel" (traditional, free to use), C major, 6/8 time.
// Each entry is [MIDI note, length in eighth notes].
const C = 84, D = 86, E = 88, F = 89, G = 91, A = 93;
const MELODY = [
  [C, 2], [C, 1], [D, 2], [D, 1],   // All a-round the
  [E, 1], [G, 1], [E, 1], [C, 3],   // mul-ber-ry bush,
  [C, 2], [C, 1], [D, 2], [D, 1],   // the mon-key chased the
  [E, 3], [C, 3],                   // wea-sel.
  [C, 2], [C, 1], [D, 2], [D, 1],   // The mon-key thought 'twas
  [E, 1], [G, 1], [E, 1], [C, 3],   // all in fun,
  [A, 3], [D, 2], [F, 1],           // POP! goes the
  [E, 3], [C, 3],                   // wea-sel.
];
const POP_INDEX = 22; // the "POP!" note: the lid bursts open here instead
// One bass note every half bar (every 3 eighths): root, then fifth.
const BASS = [60, 67, 60, 67, 55, 62, 60, 55, 60, 67, 60, 67, 65, 67, 60, 60];

// Tuning sliders. Every value speaks as words, never a bare number.
const SETTINGS = [
  { id: 'speed', label: 'Starting speed', min: 40, max: 120, step: 2, def: 76, say: v => `${v} beats a minute` },
  { id: 'speedup', label: 'Speed-up per answer', min: 5, max: 60, step: 5, def: 30, say: v => `${v} percent faster` },
  { id: 'ring', label: 'Ring length', min: 2, max: 30, step: 1, def: 12, say: v => `${(v / 10).toFixed(1)} seconds` },
  { id: 'bright', label: 'Brightness', min: 0, max: 10, step: 1, def: 5, say: v => `${v} of 10` },
  { id: 'catchup', label: 'Catch-up after mistakes', min: 30, max: 100, step: 10, def: 70, say: v => `closes ${v} percent of the gap` },
  { id: 'bass', label: 'Bass notes', min: 0, max: 10, step: 1, def: 4, say: v => (v ? `${v} of 10` : 'off') },
];
const values = {};
const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
for (const s of SETTINGS) {
  const v = saved[s.id];
  values[s.id] = typeof v === 'number' && v >= s.min && v <= s.max ? v : s.def;
}

const $ = id => document.getElementById(id);
$('title').textContent = `Jack-in-the-box lab, version ${VERSION}`;

// Speech: polite and 700 ms late, so it never cuts VoiceOver off mid-word.
let sayTimer = 0;
function say(text, delay = 700) {
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => {
    $('say').textContent = '';
    setTimeout(() => { $('say').textContent = text; }, 50);
  }, delay);
}

// ---- Audio ----
let ctx = null, master = null, noise = null;

function setupAudio() {
  ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// iPhone: the ring/silent switch mutes web audio unless the page says it is
// media playback. Newer Safari has navigator.audioSession for that; older
// Safari is unmuted by playing a looping silent <audio> element.
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

async function startAudio() {
  if (!ctx) { setupAudio(); unmuteIOS(); }
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
}

// iOS suspends web audio when Safari is left; ask for it back on return
// and on the next tap.
function wakeAudio() {
  if (!ctx) return;
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });
addEventListener('pageshow', wakeAudio);
addEventListener('focus', wakeAudio);
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, wakeAudio, true);

const hz = midi => 440 * 2 ** ((midi - 69) / 12);

// A short noise tick, used for the tine's pluck and the winding ratchet.
function click(t, vol, freq = 3000, len = 0.008) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(hp).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.01);
}

// One music box tine. A plucked steel tine rings with a strong fundamental
// and a few high, out-of-tune overtones (about 6.3 and 17.5 times the
// pitch) that die away fast; Brightness sets how loud those are.
function tine(midi, t, vol, ringScale = 1) {
  const f = hz(midi);
  const ring = (values.ring / 10) * ringScale;
  const b = values.bright / 10;
  const partials = [
    [1, 1, ring],
    [2, 0.05 + 0.1 * b, ring * 0.3],
    [6.27, 0.35 * b, ring * 0.12],
    [17.55, 0.15 * b, ring * 0.04],
  ];
  for (const [ratio, gain, decay] of partials) {
    if (f * ratio > 16000 || gain <= 0) continue;
    const o = ctx.createOscillator();
    o.frequency.value = f * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
  click(t, 0.05 + 0.1 * b);
}

// The pop: a burst of air, then a wobbling spring "boing", then a quick
// rising music box flourish.
function popSound(t) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(1.5, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(bp).connect(ng).connect(master);
  src.start(t); src.stop(t + 0.15);

  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(140, t + 0.03);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.25);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 14;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(60, t);
  depth.gain.exponentialRampToValueAtTime(5, t + 0.9);
  lfo.connect(depth).connect(o.frequency);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.5, t + 0.05);
  og.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
  o.connect(og).connect(master);
  o.start(t); lfo.start(t);
  o.stop(t + 1.05); lfo.stop(t + 1.05);

  [C, E, G, C + 12].forEach((m, i) => tine(m, t + 0.7 + i * 0.09, 0.5, 1.5));
}

// ---- The tune ----
const S = { playing: false, idx: 0, unit: 0, next: 0, eighth: 0, bpm: null, solved: new Set(), popPending: false, popped: false };
let timer = 0;
const SLOWEST = 24; // beats a minute: the crawl that endless wrong guesses reach

// The tune's speed. null means "not changed yet", so the Starting speed
// slider still applies directly.
const bpm = () => S.bpm ?? values.speed;
const step = () => 1 + values.speedup / 100;
const targetEighth = () => 60 / bpm() / 3; // seconds per eighth note

// Blake's rules (version 3). A right answer speeds the tune up one level,
// or, if wrong guesses slowed it down, closes most of the gap to where it
// should be, but not all of it. The third answer doesn't speed it up: the box
// waits for the next "POP!", however slow the tune is by then. A wrong answer
// drops one level, as far as a crawl, with no lockout.
function rightAnswer() {
  const n = S.solved.size;
  if (n >= 3) return;
  const should = values.speed * step() ** n;
  S.bpm = Math.max(bpm() * step(), bpm() + (should - bpm()) * values.catchup / 100);
}
function wrongAnswer() {
  S.bpm = Math.max(SLOWEST, bpm() / step());
}

// Schedule notes a little ahead of time, so the timing stays exact even if
// the page is busy. Speed changes glide in over a few notes.
function tick() {
  while (S.playing && S.next < ctx.currentTime + 0.15) {
    if (S.popPending && S.idx === POP_INDEX) { pop(S.next); return; }
    const [note, len] = MELODY[S.idx];
    tine(note, S.next, 0.6);
    if (S.unit % 3 === 0 && values.bass) tine(BASS[S.unit / 3], S.next, 0.5 * values.bass / 10, 1.5);
    S.eighth += (targetEighth() - S.eighth) * 0.3;
    S.next += len * S.eighth;
    S.unit += len;
    if (++S.idx === MELODY.length) { S.idx = 0; S.unit = 0; }
  }
}

function startTune() {
  S.playing = true;
  S.idx = 0; S.unit = 0;
  S.eighth = targetEighth();
  // Winding first: a ratchet of clicks, then the tune starts.
  const t = ctx.currentTime + 0.05;
  for (let i = 0; i < 6; i++) click(t + i * 0.1, 0.4, 1500, 0.02);
  S.next = t + 0.75;
  timer = setInterval(tick, 25);
  tick();
  $('wind').textContent = 'Stop the music';
}

function stopTune() {
  S.playing = false;
  clearInterval(timer);
  $('wind').textContent = 'Wind the handle';
}

function pop(t) {
  stopTune();
  S.popPending = false;
  S.popped = true;
  popSound(t);
  const ms = Math.max(0, (t - ctx.currentTime) * 1000);
  setTimeout(() => { $('fidget').hidden = false; }, ms);
  say('POP! Fidget springs out of the box!', ms + 1000);
}

// ---- Controls ----
$('wind').addEventListener('click', async () => {
  if (S.playing) { stopTune(); return; }
  await startAudio();
  startTune();
});

function updateCount() {
  $('count').textContent = `Answers solved: ${S.solved.size} of 3`;
}

for (const btn of document.querySelectorAll('.toy')) {
  btn.addEventListener('click', () => {
    const toy = btn.dataset.toy;
    if (S.popped) { say('Fidget already popped out. Choose Start over to play again.'); return; }
    if (S.solved.has(toy)) { say(`${toy} already solved.`); return; }
    S.solved.add(toy);
    rightAnswer();
    updateCount();
    if (S.solved.size === 3) {
      S.popPending = true;
      say(S.playing ? 'All three solved! Wait for it.' : 'All three solved! Wind the handle.');
    } else {
      say(S.playing ? `${toy} solved. Faster!` : `${toy} solved. Wind the handle to hear it.`);
    }
  });
}

// A cartoon giggle: quick "hee-hee-hee" chirps, each sliding down in pitch,
// through a vocal-ish band filter.
function giggle(t) {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2;
  bp.connect(master);
  for (let i = 0; i < 6; i++) {
    const at = t + i * 0.1, f = 760 - i * 35;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.25, at);
    o.frequency.exponentialRampToValueAtTime(f, at + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.35, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
    o.connect(g).connect(bp);
    o.start(at); o.stop(at + 0.09);
  }
}

$('wrong').addEventListener('click', async () => {
  if (S.popped) { say('Fidget already popped out. Choose Start over to play again.'); return; }
  await startAudio();
  giggle(ctx.currentTime + 0.02);
  const before = bpm();
  wrongAnswer();
  say(bpm() < before ? 'Wrong! Slower.' : "Wrong! It can't get any slower.", 1000);
});

$('reset').addEventListener('click', () => {
  stopTune();
  S.bpm = null;
  S.solved.clear();
  S.popPending = false;
  S.popped = false;
  $('fidget').hidden = true;
  updateCount();
  say('Started over. Wind the handle when ready.');
});

// Sliders, saved between visits. Changes take effect on the next note.
for (const s of SETTINGS) {
  const input = Object.assign(document.createElement('input'), {
    type: 'range', min: s.min, max: s.max, step: s.step, value: values[s.id], id: `s-${s.id}`,
  });
  const out = document.createElement('span');
  const label = document.createElement('label');
  label.className = 'slider';
  label.htmlFor = input.id;
  label.append(`${s.label}: `, out, input);
  const show = () => { out.textContent = s.say(values[s.id]); input.setAttribute('aria-valuetext', s.say(values[s.id])); };
  input.addEventListener('input', () => {
    values[s.id] = Number(input.value);
    show();
    localStorage.setItem(KEY, JSON.stringify(values));
  });
  show();
  $('sliders').append(label);
}

// Copy the slider positions as readable words, so Blake can paste them to
// Claude and they become the defaults.
$('copy').addEventListener('click', async () => {
  const text = `Jack-in-the-box lab, version ${VERSION}. ` +
    SETTINGS.map(s => `${s.label}: ${s.say(values[s.id])}`).join('; ') + '.';
  try {
    await navigator.clipboard.writeText(text);
    say('Settings copied.');
  } catch {
    const box = $('copied');
    box.value = text; box.hidden = false; box.focus(); box.select();
    say("Couldn't copy automatically. The settings are in the text box.");
  }
});

// For automated checks.
window.__fidget = { S, values, MELODY, POP_INDEX };
