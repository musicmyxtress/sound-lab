// Listening to a hummed tune. The microphone is read for a few seconds, a
// pitch is found about forty times a second (the YIN method), and the pitch
// track is cut into notes. Only the notes are kept; the audio is never saved.

// YIN pitch detection on one window of samples. Returns Hz, or 0 if the
// window has no clear pitch (silence, breath, a consonant).
export function detectPitch(buf, sampleRate, minHz = 70, maxHz = 1100) {
  const half = Math.floor(buf.length / 2);
  const tauMin = Math.floor(sampleRate / maxHz);
  const tauMax = Math.min(half - 1, Math.floor(sampleRate / minHz));
  const d = new Float32Array(tauMax + 1);
  // Difference: how unlike the signal is to itself shifted by tau.
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) { const x = buf[i] - buf[i + tau]; sum += x * x; }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference, then the first dip under 0.15.
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) { running += d[tau]; d[tau] = running ? (d[tau] * tau) / running : 1; }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < 0.15) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
  }
  if (tau < 0) return 0;
  // Parabolic interpolation between neighbours for a finer answer.
  const a = d[tau - 1] ?? d[tau], b = d[tau], c = d[tau + 1] ?? d[tau];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sampleRate / (tau + (Number.isFinite(shift) ? shift : 0));
}

const toMidi = hz => 69 + 12 * Math.log2(hz / 440);
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// Pitch track (one midi value or null per frame, `hop` seconds apart) into
// notes: a new note starts after a silence or a jump of about a semitone that
// lasts. Very short blips are dropped. Returns at most `max` notes as
// { semis (from the first note), length (seconds) }, plus the first note's
// midi so the plain-tone playback can sit near where it was hummed.
export function trackToNotes(track, hop, max = 8) {
  // Smooth single-frame glitches (octave jumps, consonants).
  const smooth = track.map((m, i) => {
    if (m == null) return null;
    const near = track.slice(Math.max(0, i - 2), i + 3).filter(v => v != null);
    return median(near);
  });
  const raw = [];
  let cur = null, off = 0;
  const close = () => {
    if (cur && cur.frames.length * hop >= 0.08) raw.push({ midi: median(cur.frames), length: cur.frames.length * hop });
    cur = null;
  };
  for (let i = 0; i < smooth.length; i++) {
    const m = smooth[i];
    if (m == null) { if (cur && ++off >= 2) close(); continue; }
    off = 0;
    if (!cur) { cur = { frames: [m] }; continue; }
    const centre = median(cur.frames.slice(-6));
    // A jump only counts if the next frame agrees, so a scoop into a note
    // doesn't split it.
    if (Math.abs(m - centre) > 0.8 && smooth[i + 1] != null && Math.abs(smooth[i + 1] - centre) > 0.8) {
      close(); cur = { frames: [m] };
    } else cur.frames.push(m);
  }
  close();
  if (!raw.length) return { notes: [], firstMidi: 60 };
  const first = raw[0].midi;
  const notes = raw.slice(0, max).map(n => ({
    semis: Math.round(n.midi - first),
    length: Math.min(1.0, Math.max(0.15, n.length)),
  }));
  return { notes, firstMidi: first };
}

// Records `seconds` of microphone sound through `ctx` and returns the pitch
// track. Voice processing is turned off: echo cancelling and noise
// suppression smear pitch.
export async function listen(ctx, seconds, skipSeconds = 0.25) {
  if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } finally {
    if (!stream && navigator.audioSession) navigator.audioSession.type = 'playback';
  }
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const hop = 0.025;
  const track = [];
  const started = performance.now();
  await new Promise(resolve => {
    const timer = setInterval(() => {
      const t = (performance.now() - started) / 1000;
      if (t >= seconds) { clearInterval(timer); resolve(); return; }
      if (t < skipSeconds) return;
      an.getFloatTimeDomainData(buf);
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      const hz = rms > 0.008 ? detectPitch(buf, ctx.sampleRate) : 0;
      track.push(hz ? toMidi(hz) : null);
    }, hop * 1000);
  });
  src.disconnect();
  for (const t of stream.getTracks()) t.stop();
  // Back to normal playback so sound comes out of the speaker, not the earpiece.
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  return { track, hop };
}
