// Tuneling Nest lab: first taste of raising one Tuneling.
// Hatch an egg, name the baby, feed it foods whose hidden tastes you find out
// one bite at a time, comfort its moods, and hear diet slowly change its voice.
// Design: Blake's (projects/tuneling-nest/IDEAS.md). Voice ported from Tunelings.

import { SAMPLE_RATE, TIMBRES, RHYTHMS, CONTOURS, MELODIES, PHRASINGS,
         renderCall, renderSpit, renderHuff, renderCrack } from './voice.js?v=2';
import { listen, trackToNotes } from './hum.js?v=1';

const VERSION = 6;
const KEY = 'sound-lab:nest:v1';

// weight: positive grows a bigger body and lower voice (meaty, rich foods);
// negative a smaller body and higher, sweeter voice (carrots, fruit).
const FOODS = [
  { id: 'cheese', name: 'cheese', weight: 0.5 },
  { id: 'carrot', name: 'carrot', weight: -1 },
  { id: 'sausage', name: 'sausage', weight: 1 },
  { id: 'fish', name: 'fish', weight: 0.8 },
  { id: 'honey', name: 'honey', weight: -0.6 },
  { id: 'plum', name: 'plum', weight: -0.5 },
  { id: 'turnip', name: 'turnip', weight: 0.2 },
  { id: 'blueberries', name: 'blueberries', weight: -0.7 },
  { id: 'mushroom', name: 'mushroom', weight: 0.3 },
  { id: 'apple', name: 'apple', weight: -0.5 },
  { id: 'peas', name: 'peas', weight: -0.3 },
  { id: 'seaweed', name: 'seaweed', weight: 0.1 },
];
const TASTES = ['love', 'like', 'dislike', 'hate'];
const TASTE_WORDS = { love: 'loves it', like: 'likes it', dislike: 'dislikes it', hate: 'hates it' };

// Very slow change (Blake's rule): a hated food fed this many times softens to
// dislike, and a disliked one eaten this many times softens to like.
const SOFTEN_HATE = 8;
const SOFTEN_DISLIKE = 12;
const DIET_STEP = 0.35;  // semitones per bite, times the food's weight
const DIET_LIMIT = 6;

const pick = a => a[Math.floor(Math.random() * a.length)];
const $ = id => document.getElementById(id);
$('title').textContent = `Tuneling Nest lab, version ${VERSION}`;

// ---- State ----
function newTuneling() {
  // Pickiness is hidden personality (Blake's idea): 0 is an easy eater who
  // likes nearly everything, 1 is as picky as Maya. It only shows once every
  // food has been tried. In the real game it will be inherited.
  const picky = Math.random();
  const pLove = 0.25 - 0.15 * picky, pLike = 0.45 - 0.25 * picky, pHate = 0.07 + 0.15 * picky;
  const tastes = {};
  for (const f of FOODS) {
    const r = Math.random();
    tastes[f.id] = r < pLove ? 'love' : r < pLove + pLike ? 'like' : r < 1 - pHate ? 'dislike' : 'hate';
  }
  const r = Math.random();
  return {
    v: 1, stage: 'egg', name: '',
    gender: Math.random() < 0.5 ? 'girl' : 'boy', // Blake: random at birth, told on hatching
    genes: {
      // Babies sing high: 14 to 24 semitones above 220 Hz.
      pitch: 14 + Math.random() * 10,
      speed: 0.3 + Math.random() * 0.5,
      rhythm: pick(RHYTHMS), timbre: pick(TIMBRES), contour: pick(CONTOURS),
      melody: pick(MELODIES), phrasing: pick(PHRASINGS),
      brightness: 0.55 + Math.random() * 0.45,
      harmony: Math.random() < 0.12,
      growl: r < 0.1, purr: r >= 0.1 && r < 0.2, trill: r >= 0.2 && r < 0.3,
      seed: 1 + Math.floor(Math.random() * 100000),
    },
    picky, revealed: false, tastes, tried: {}, bites: {}, diet: 0, mood: null, huffed: false, bond: 0,
  };
}

let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
if (!S || S.v !== 1) S = newTuneling();
// Saves from before version 5 have no gender; the only one is Blake's Maya, a girl.
if (!S.gender) S.gender = 'girl';
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const PRONOUNS = {
  girl: { they: 'she', them: 'her', their: 'her', themself: 'herself' },
  boy: { they: 'he', them: 'him', their: 'his', themself: 'himself' },
};
const pr = word => PRONOUNS[S.gender][word];
const Pr = word => pr(word)[0].toUpperCase() + pr(word).slice(1);
const nameOf = () => S.name || 'the baby';
const NameOf = () => S.name || 'The baby';

// ---- Speech: polite, after the sound has played ----
let sayTimer = 0;
function say(text, afterSeconds = 0) {
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => {
    $('say').textContent = '';
    setTimeout(() => { $('say').textContent = text; }, 50);
  }, Math.max(700, afterSeconds * 1000 + 300));
  $('last').textContent = text;
}

// ---- Audio ----
let ctx = null, master = null;
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
function startAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    unmuteIOS();
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}
function wakeAudio() {
  if (!ctx) return;
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });
addEventListener('pageshow', wakeAudio);
addEventListener('focus', wakeAudio);
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) document.addEventListener(ev, wakeAudio, true);

// Plays sounds one after another; returns how many seconds they take.
function playSequence(clips) {
  startAudio();
  let at = ctx.currentTime + 0.05, total = 0;
  for (const { samples, gain = 1, gap = 0.12 } of clips) {
    const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.start(at);
    const len = samples.length / SAMPLE_RATE + gap;
    at += len; total += len;
  }
  window.__nest.lastSeconds = total;
  return total;
}

// ---- The voice, coloured by diet and mood ----
// Each mood changes the call the way a feeling changes a voice.
const MOOD_VOICE = {
  happy: {},
  grumpy: { pitch: -1, speed: -0.2, brightness: 0.5, growl: true },
  sad: { pitch: -3, speed: -0.4, contour: 'fall', melody: 'fall' },
  scared: { pitch: 2, speed: 0.2, contour: 'wobble', rhythm: 'stutter', gain: 0.45 },
  excited: { pitch: 5, speed: 0.4, rhythm: 'triple', contour: 'rise', melody: 'leap' },
  curious: { pitch: 1, contour: 'rise', melody: 'climb' },
  loving: { purr: true, contour: 'arch', speed: -0.1 },
  // Food reactions
  love: { pitch: 4, speed: 0.35 },
  dislike: { pitch: -2, speed: -0.3, brightness: 0.6, contour: 'fall' },
  hate: { pitch: 3, speed: 0.6, rhythm: 'single', brightness: 0.7 },
  cuddle: { pitch: 3, speed: 0.3, rhythm: 'pair', contour: 'arch' },
};

function call(kind = S.mood || 'happy', settingsOnly = false) {
  const g = S.genes, m = MOOD_VOICE[kind] || {};
  const semis = g.pitch - S.diet + (m.pitch || 0);
  const settings = {
    base: 220 * Math.pow(2, semis / 12),
    speed: g.speed + (m.speed || 0),
    rhythm: m.rhythm || g.rhythm,
    timbre: g.timbre,
    contour: m.contour || g.contour,
    melody: m.melody || g.melody,
    phrasing: g.phrasing,
    brightness: g.brightness * (m.brightness || 1),
    harmony: g.harmony,
    growl: m.growl || g.growl,
    purr: m.purr || g.purr,
    trill: g.trill,
    seed: g.seed,
    gain: m.gain || 1,
  };
  if (settingsOnly) return settings;
  return { samples: renderCall(settings), gain: settings.gain };
}

// ---- Words ----
const fill = (line, food) => line.replaceAll('{N}', NameOf()).replaceAll('{n}', nameOf()).replaceAll('{F}', food ? food.name : '')
  .replace(/\{(they|them|their|themself)\}/g, (_, w) => pr(w)).replace(/\{They\}/g, () => Pr('they'));
const REACTIONS = {
  love: [
    '{N} finishes the {F} and sniffs at your hand, hoping for more.',
    '{N} gobbles the {F} and does a happy little wiggle.',
    '{N} eats the {F} in two bites and looks up at you, beaming.',
  ],
  like: [
    '{N} munches the {F} contentedly.',
    '{N} eats the {F} and gives a satisfied little sigh.',
    '{N} nibbles the {F} all the way down to nothing.',
  ],
  dislike: [
    '{N} eats the {F} very slowly, staring at you the whole time.',
    '{N} chews the {F} with a sour little face, but finishes it.',
    '{N} eats the {F}, then turns round so you can only see {their} back.',
  ],
  hate: [
    '{N} takes one bite of the {F} and spits it right out. Bleh!',
    '{N} sniffs the {F}, licks it, and spits it out in disgust.',
    'Pthoo! The {F} goes flying. {N} did not swallow a single bit.',
  ],
};
const MOOD_LINES = {
  happy: ['{N} is happy and hums to {themself}.', '{N} is content, watching you with bright eyes.'],
  grumpy: ['{N} is grumpy and won\'t quite look at you.'],
  sad: ['{N} is sad and sits very still.'],
  scared: ['{N} is scared and trembling.'],
  excited: ['{N} is excited and bouncing on the spot.'],
  curious: ['{N} is curious and keeps peeking at the door.'],
  loving: ['{N} is feeling loving and leans against you.'],
};
const MOOD_WORDS = { happy: 'happy', grumpy: 'grumpy', sad: 'sad', scared: 'scared', excited: 'excited', curious: 'curious', loving: 'loving' };

// What can be waiting when you come back: at most one thing, never worse for
// a longer absence (never punish neglect).
const RETURNS = [
  { mood: 'sad', line: 'You come back. {N} had a bad dream and wants a cuddle.' },
  { mood: 'scared', line: 'You come back. There was thunder while you were gone, and {n} is hiding.' },
  { mood: 'curious', line: 'You come back. {N} found a beetle and has been following it around.' },
  { mood: 'excited', line: 'You come back. {N} spots you and bounces with excitement.' },
  { mood: 'loving', line: 'You come back. {N} runs over and leans against your leg.' },
  { mood: null, line: 'You come back. {N} has been napping, and wakes up happy to see you.' },
  { mood: null, line: 'You come back. {N} was humming to {themself} and stops to greet you.' },
];

// Judged from the tastes as they actually are, so an older save (made before
// pickiness existed) gets the right answer too.
function eaterKind() {
  const good = FOODS.filter(f => S.tastes[f.id] === 'love' || S.tastes[f.id] === 'like').length;
  return good >= 8 ? 'an easy eater' : good <= 4 ? 'a picky eater' : 'an eater with strong opinions';
}
function eaterSummary() {
  const n = {}; for (const t of TASTES) n[t] = FOODS.filter(f => S.tastes[f.id] === t).length;
  const part = (count, one, many) => `${count === 0 ? 'no' : count} ${count === 1 ? one : many}`;
  return `Turns out ${nameOf()} is ${eaterKind()}: ${part(n.love, 'love', 'loves')}, ${part(n.like, 'like', 'likes')}, ${part(n.dislike, 'dislike', 'dislikes')} and ${part(n.hate, 'hate', 'hates')}.`;
}

function sizeWord() {
  const d = S.diet;
  return d > 3 ? 'big and round' : d > 1.2 ? 'sturdy' : d < -3 ? 'tiny' : d < -1.2 ? 'small' : 'medium-sized';
}
function bondWord() {
  const b = S.bond;
  return b >= 25 ? 'best friends' : b >= 15 ? 'close friends' : b >= 8 ? 'friends' : b >= 3 ? 'getting to know each other' : 'just met';
}

// ---- Page ----
function render() {
  const hatched = S.stage !== 'egg';
  $('egg').hidden = hatched;
  $('naming').hidden = !hatched || !!S.name;
  $('life').hidden = !hatched;
  if (hatched) {
    const kind = S.revealed ? ` ${eaterKind()[0].toUpperCase()}${eaterKind().slice(1)}.` : '';
    $('status').textContent = `${NameOf()} (${S.gender}): ${sizeWord()}, feeling ${MOOD_WORDS[S.mood || 'happy']}. Bond: ${bondWord()}.${kind}`;
    $('listen').textContent = `How is ${nameOf()}?`;
    $('cuddle').textContent = `Cuddle ${nameOf()}`;
    $('feed').textContent = $('foods').hidden ? `Feed ${nameOf()}: show foods` : 'Hide foods';
  }
  refreshTunes();
  for (const f of FOODS) {
    const t = S.tried[f.id];
    $(`taste-${f.id}`).textContent = `${f.name}: ${t ? TASTE_WORDS[t] : 'not tried yet'}`;
  }
}

// Announce changes the player can't otherwise notice (size, bond).
function changes(before) {
  const out = [];
  if (sizeWord() !== before.size) {
    const smaller = S.diet < before.diet;
    out.push(`${NameOf()} seems to be getting ${smaller ? 'smaller' : 'bigger'}, and ${pr('their')} voice a little ${smaller ? 'higher' : 'lower'}.`);
  }
  if (bondWord() !== before.bond) out.push(`You and ${nameOf()} are now ${bondWord()}.`);
  return out.join(' ');
}
const snapshot = () => ({ size: sizeWord(), bond: bondWord(), diet: S.diet });
// ---- Songs ----
// The tune book is shared by every Tuneling and survives Start over.
const TUNES_KEY = 'sound-lab:nest:tunes';
let tunes = [];
try { tunes = JSON.parse(localStorage.getItem(TUNES_KEY)) || []; } catch { tunes = []; }
const saveTunes = () => localStorage.setItem(TUNES_KEY, JSON.stringify(tunes));
const HUM_SECONDS = 7;
const LESSONS_PER_VISIT = 3;   // then sleepy until you come back
const SONG_CHANCE = 0.25;      // how often a happy call ends with a bit of a tune

// Off-note chance: 60% on the first lesson, shrinking steadily (Blake's rule).
const offChance = lessons => 0.6 * Math.pow(0.75, Math.max(0, lessons - 1));
const learned = lessons => offChance(lessons) < 0.08;
const lessonsOf = tune => (S.songs || {})[tune.id] || 0;

// A sung attempt: every note may go wrong in one of four ways.
function attempt(notes, off) {
  const out = [];
  notes.forEach((nt, i) => {
    if (Math.random() >= off) { out.push({ ...nt }); return; }
    const r = Math.random();
    if (r < 0.35) out.push({ ...nt, semis: nt.semis + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.25) }); // sharp or flat
    else if (r < 0.65) out.push({ ...nt, semis: nt.semis + (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 3)) }); // wrong note
    else if (r < 0.8 && notes.length > 2 && i > 0) { /* dropped */ }
    else out.push({ ...nt, length: Math.min(1.4, nt.length * 1.8) }); // held too long
  });
  return out.length ? out : [{ ...notes[0] }];
}

// The tune in this Tuneling's own voice, centred on its pitch.
function sing(notes, mood = S.mood || 'happy') {
  const mean = notes.reduce((a, n) => a + n.semis, 0) / notes.length;
  const shift = -Math.round(mean);
  const base = call(mood, true);
  return { samples: renderCall({ ...base, contour: 'flat', notes: notes.map(n => ({ ...n, semis: n.semis + shift })) }), gain: base.gain };
}

// The tune as you hummed it, in a plain soft tone, near where you hummed it.
function plainTone(tune) {
  let midi = tune.firstMidi;
  while (midi < 57) midi += 12;
  while (midi > 76) midi -= 12;
  const base = 440 * Math.pow(2, (midi - 69) / 12);
  let at = 0;
  const total = tune.notes.reduce((a, n) => a + n.length + 0.05, 0) + 0.1;
  const out = new Float32Array(Math.ceil(total * SAMPLE_RATE));
  for (const n of tune.notes) {
    const f = base * Math.pow(2, n.semis / 12), first = Math.floor(at * SAMPLE_RATE), count = Math.floor(n.length * SAMPLE_RATE);
    for (let i = 0; i < count; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, t / 0.02) * Math.min(1, (n.length - t) / 0.05);
      out[first + i] += 0.5 * env * (Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(4 * Math.PI * f * t));
    }
    at += n.length + 0.05;
  }
  return { samples: out };
}

// Happy moments sometimes end with a bit of a tune it has been taught: the
// first four notes, as well (or as badly) as it currently knows them.
function withSong(clips, text) {
  const known = tunes.filter(t => lessonsOf(t) > 0);
  if (!known.length || Math.random() >= SONG_CHANCE) return [clips, text];
  const tune = pick(known);
  const bit = attempt(tune.notes.slice(0, 4), offChance(lessonsOf(tune)));
  const how = learned(lessonsOf(tune)) ? 'hums the start of' : 'tries a wobbly bit of';
  return [[...clips, { ...sing(bit, 'happy'), gap: 0.1 }], `${text} Then ${nameOf()} ${how} ${tune.name}.`];
}
function finishHappy(clips, text, before) {
  const [c, t] = withSong(clips, text);
  finish(c, t, before);
}

// VoiceOver jumps somewhere unpredictable when the control under its cursor
// disappears. So when a step hides that control, focus moves to its new home
// first and the page only hides the old one a moment later.
const SETTLE_MS = 600;
function finish(clips, text, before, settle = false) {
  const secs = playSequence(clips);
  const extra = before ? changes(before) : '';
  save();
  if (settle) setTimeout(render, SETTLE_MS); else render();
  say(extra ? `${text} ${extra}` : text, secs);
}

$('hatch').addEventListener('click', () => {
  S.stage = 'baby';
  const secs = playSequence([{ samples: renderCrack(), gap: 0.3 }, call('happy')]);
  save();
  // Show the name box and move focus there BEFORE the hatch button hides.
  $('naming').hidden = false;
  $('name').focus();
  setTimeout(render, SETTLE_MS);
  say(`The egg cracks open, and a tiny Tuneling peeps at you. It's a ${S.gender}! What will you name ${pr('them')}?`, secs);
});

$('naming').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('name').value.trim().slice(0, 20);
  if (!name) { say('Type a name first.'); return; }
  S.name = name[0].toUpperCase() + name.slice(1);
  render();          // relabels the buttons with the name
  $('naming').hidden = false; // ...but keep the form until focus has moved
  $('listen').focus();
  finish([call('happy')], `${S.name} it is. ${S.name} sings ${pr('their')} name back to you, sort of.`, null, true);
});

$('listen').addEventListener('click', () => {
  const mood = S.mood || 'happy';
  const happy = ['happy', 'loving', 'excited', 'curious'].includes(mood);
  (happy ? finishHappy : finish)([call(mood)], fill(pick(MOOD_LINES[mood])));
});

$('cuddle').addEventListener('click', () => {
  const before = snapshot();
  const mood = S.mood;
  if (mood === 'grumpy' && !S.huffed) {
    S.huffed = true;
    finish([{ samples: renderHuff() }], fill('{N} turns away from you with a huff.'), before);
    return;
  }
  if (mood === 'grumpy') {
    S.mood = null; S.huffed = false; S.bond += 1;
    finishHappy([call('cuddle')], fill('{N} gives in and snuggles up. All forgiven.'), before);
  } else if (mood === 'sad' || mood === 'scared') {
    S.mood = null; S.bond += 2;
    const line = mood === 'sad' ? '{N} snuggles into you, and the sadness melts away.' : '{N} burrows into your arms, and the trembling stops.';
    finish([call(mood), call('cuddle')], fill(line), before);
  } else if (mood === 'excited') {
    S.bond += 1;
    finish([call('excited')], fill('{N} wriggles in your arms, far too excited to keep still.'), before);
  } else if (mood === 'loving') {
    S.bond += 1;
    finishHappy([call('loving')], fill('{N} purrs and melts into the cuddle.'), before);
  } else {
    S.bond += 1;
    finishHappy([call('cuddle')], fill(pick(['{N} chirps happily and nuzzles you.', '{N} snuggles in close.', '{N} squeaks and curls up in your hands.'])), before);
  }
});

$('away').addEventListener('click', () => {
  const r = pick(RETURNS);
  S.mood = r.mood; S.huffed = false; S.lessonsThisVisit = 0;
  finish([call(r.mood || 'happy')], fill(r.line));
});

// The food list stays folded away behind one button (Blake: twelve buttons
// buried everything below them). Opening it puts focus on the first food;
// choosing a food sends focus back to the Feed button, then folds the list.
function setFoodsOpen(open) {
  $('foods').hidden = !open;
  $('feed').setAttribute('aria-expanded', String(open));
  $('feed').textContent = open ? 'Hide foods' : `Feed ${nameOf()}: show foods`;
}
$('feed').addEventListener('click', () => {
  const open = $('foods').hidden;
  if (open) { setFoodsOpen(true); $('foods').querySelector('button').focus(); }
  else setFoodsOpen(false);
});
$('showtastes').addEventListener('click', () => {
  const open = $('tastes').hidden;
  $('tastes').hidden = !open;
  $('showtastes').setAttribute('aria-expanded', String(open));
  $('showtastes').textContent = open ? 'Hide tastes' : 'Show tastes found so far';
});

function feed(food) {
  $('feed').focus();
  setTimeout(() => setFoodsOpen(false), SETTLE_MS);
  const before = snapshot();
  const taste = S.tastes[food.id];
  const first = !S.tried[food.id];
  S.tried[food.id] = taste;
  S.bites[food.id] = (S.bites[food.id] || 0) + 1;
  let text = fill(pick(REACTIONS[taste]), food);
  if (first) text += ` ${NameOf()} ${TASTE_WORDS[taste]}.`;
  let clips;

  if (taste === 'hate') {
    // Spat out: never swallowed, so no effect on body or voice, but it still
    // counts as one more taste, which is how hate slowly softens.
    clips = [{ samples: renderSpit(), gap: 0.15 }, call('hate')];
    if (S.bites[food.id] >= SOFTEN_HATE) {
      S.tastes[food.id] = 'dislike'; S.bites[food.id] = 0;
      text += ` Though, ${nameOf()} didn't spit quite as hard this time. Maybe ${pr('they')} doesn't hate ${food.name} as much as ${pr('they')} used to.`;
    }
  } else {
    S.diet = Math.max(-DIET_LIMIT, Math.min(DIET_LIMIT, S.diet + food.weight * DIET_STEP));
    clips = [call(taste === 'like' ? (S.mood || 'happy') : taste)];
    if (taste === 'love') {
      S.bond += 1;
      if (S.mood === 'sad' || S.mood === 'grumpy') { S.mood = null; S.huffed = false; text += ` That cheered ${pr('them')} right up.`; }
    } else if (taste === 'like') {
      S.bond += 1;
    } else {
      S.mood = 'grumpy'; S.huffed = false;
      if (S.bites[food.id] >= SOFTEN_DISLIKE) {
        S.tastes[food.id] = 'like'; S.bites[food.id] = 0;
        text += ` Still, ${nameOf()} seems to be getting used to ${food.name}.`;
      }
    }
  }
  if (!S.revealed && FOODS.every(f => S.tried[f.id])) {
    S.revealed = true;
    text += ` That's every food tried! ${eaterSummary()}`;
  }
  if (taste === 'love' || taste === 'like') finishHappy(clips, text, before);
  else finish(clips, text, before);
}

// Build food buttons and taste list once; afterwards only their text changes.
for (const f of FOODS) {
  const b = document.createElement('button');
  b.textContent = `Feed ${f.name}`;
  b.addEventListener('click', () => feed(f));
  $('foods').append(b);
  const li = document.createElement('li');
  li.id = `taste-${f.id}`;
  $('tastes').append(li);
}

// ---- Humming and the tune book ----
let heard = null;   // the last hummed tune, not yet saved
let humming = false;

$('hum').addEventListener('click', async () => {
  if (humming) return;
  humming = true;
  startAudio();
  // A rising beep says "go"; the first quarter second after it is ignored so
  // the beep itself isn't heard as a note.
  const beep = (f1, f2) => {
    const len = Math.floor(0.18 * SAMPLE_RATE), out = new Float32Array(len);
    for (let i = 0, ph = 0; i < len; i++) { const x = i / len; ph += 2 * Math.PI * (f1 + (f2 - f1) * x) / SAMPLE_RATE; out[i] = 0.4 * Math.sin(ph) * Math.sin(Math.PI * x); }
    return { samples: out };
  };
  const secs = playSequence([beep(660, 990)]);
  await new Promise(r => setTimeout(r, secs * 1000));
  let result;
  try {
    result = await listen(ctx, HUM_SECONDS);
  } catch (e) {
    humming = false;
    say('The microphone could not be used. Check that Safari is allowed to use it, then try again.');
    return;
  }
  humming = false;
  startAudio();
  playSequence([beep(990, 660)]);
  const { notes, firstMidi } = trackToNotes(result.track, result.hop);
  window.__nest.lastTrack = result.track;
  if (notes.length < 2) {
    say("I couldn't hear a tune that time. Try humming a little louder, close to the phone, after the beep.");
    return;
  }
  heard = { notes, firstMidi };
  const playSecs = playSequence([{ samples: new Float32Array(Math.floor(0.4 * SAMPLE_RATE)) }, plainTone(heard)]);
  $('heard').hidden = false;
  $('tunename').focus();
  say(`Here's what I heard: ${notes.length} notes. Name it and save it to the tune book, or hum again.`, playSecs);
});

$('replay').addEventListener('click', () => {
  if (!heard) return;
  playSequence([plainTone(heard)]);
});

function tuneButtonText(t) {
  const n = lessonsOf(t);
  const progress = !n ? 'not taught yet' : learned(n) ? 'learned' : `${n} lesson${n === 1 ? '' : 's'}`;
  return `Sing ${t.name} to ${nameOf()}, ${progress}`;
}
function addTuneButton(t) {
  const b = document.createElement('button');
  b.id = `tune-${t.id}`;
  b.textContent = tuneButtonText(t);
  b.addEventListener('click', () => lesson(t));
  $('tunebook').append(b);
  return b;
}
function refreshTunes() {
  for (const t of tunes) { const b = $(`tune-${t.id}`); if (b) b.textContent = tuneButtonText(t); }
  $('notunes').hidden = tunes.length > 0;
}

$('savetune').addEventListener('click', () => {
  if (!heard) return;
  const name = $('tunename').value.trim().slice(0, 30);
  if (!name) { say('Type a name for the tune first.'); return; }
  const t = { id: Date.now().toString(36), name, notes: heard.notes, firstMidi: heard.firstMidi };
  tunes.push(t); saveTunes();
  heard = null;
  const b = addTuneButton(t);
  refreshTunes();
  // Focus moves to the new tune's button first; the form hides a moment later.
  b.focus();
  setTimeout(() => { $('heard').hidden = true; $('tunename').value = ''; }, SETTLE_MS);
  say(`${name} is in the tune book.`);
});

function lesson(t) {
  S.songs = S.songs || {};
  if ((S.lessonsThisVisit || 0) >= LESSONS_PER_VISIT) {
    finish([call('sad')], fill(`{N} yawns a huge yawn. Too sleepy for another lesson. Leave and come back later, and {n} will remember where you left off.`));
    return;
  }
  const before = lessonsOf(t);
  if (learned(before)) {
    finishHappy([plainTone(t), { ...sing(t.notes), gap: 0.2 }], fill(`{N} already knows ${t.name}, and sings it with you all the way through.`));
    return;
  }
  const n = before + 1;
  S.songs[t.id] = n;
  S.lessonsThisVisit = (S.lessonsThisVisit || 0) + 1;
  S.bond += 1;
  const off = offChance(n);
  const tried = attempt(t.notes, off);
  let line;
  if (learned(n)) line = `{N} has learned ${t.name}! {They} sings it all the way through, every note right. From now on it may turn up in {their} happy calls.`;
  else if (off > 0.45) line = `{N} listens closely, then tries ${t.name}. Lots of wrong notes, but {they} is trying so hard.`;
  else if (off > 0.25) line = `{N} sings ${t.name} back. Getting there, with a few wrong notes.`;
  else line = `{N} sings ${t.name} back, and it's nearly right.`;
  const clips = [plainTone(t), { samples: new Float32Array(Math.floor(0.3 * SAMPLE_RATE)) }, sing(learned(n) ? t.notes : tried)];
  finish(clips, fill(line));
  refreshTunes();
}

$('reset').addEventListener('click', () => {
  if (!confirm('Start over with a new egg? Your Tuneling and everything you learned about them will be gone.')) return;
  S = newTuneling();
  save(); render();
  say('A new egg sits in the nest.');
  setTimeout(() => $('hatch').focus(), 100);
});

window.__nest = { get S() { return S; }, get tunes() { return tunes; }, FOODS, VERSION, lastSeconds: 0, offChance, attempt, trackToNotes };
for (const t of tunes) addTuneButton(t);
refreshTunes();
render();
