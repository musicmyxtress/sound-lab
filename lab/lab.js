// Shared sound-lab page builder. Each lab supplies a list of settings and an
// engine file; this builds the accessible sliders, Play button, step-size
// switch and saved spots, so a new idea is one small file, not a new page.

const $ = (tag, props = {}, ...kids) => {
  const el = Object.assign(document.createElement(tag), props);
  for (const k of kids) el.append(k);
  return el;
};

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

export function createLab({ title, version, engineUrl, processor, groups, notes }) {
  const key = `sound-lab:${processor}`;
  const all = groups.flatMap(g => g.params);
  const values = {};
  const saved = JSON.parse(localStorage.getItem(key + ':values') || '{}');
  for (const p of all) {
    if (p.choices) { p.min = 0; p.max = p.choices.length - 1; p.fine = p.coarse = 1; }
    const s = saved[p.id];
    values[p.id] = typeof s === 'number' && s >= p.min && s <= p.max ? s : p.default;
  }
  const fmt = (p, v) => (p.choices ? p.choices[v] : p.format ? p.format(v) : String(v));

  let ctx = null, node = null, playing = false, coarse = false;
  const send = msg => node && node.port.postMessage(msg);
  const sliders = {};

  const main = document.getElementById('lab');
  document.title = `${title} lab`;
  main.append($('h1', { textContent: `${title}, version ${version}` }));
  if (notes) main.append($('p', { textContent: notes }));

  const play = $('button', { className: 'big', textContent: 'Play' });
  play.onclick = async () => {
    if (!ctx) {
      unmuteIOS();
      ctx = new AudioContext({ latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule(engineUrl);
      node = new AudioWorkletNode(ctx, processor, { outputChannelCount: [2] });
      node.connect(ctx.destination);
      for (const p of all) send({ type: 'param', id: p.id, value: values[p.id] });
    }
    await ctx.resume();
    playing = !playing;
    send({ type: playing ? 'play' : 'stop' });
    play.textContent = playing ? 'Stop' : 'Play';
  };
  main.append(play);

  const stepBtn = $('button', { textContent: 'Step size: fine' });
  stepBtn.onclick = () => {
    coarse = !coarse;
    stepBtn.textContent = `Step size: ${coarse ? 'coarse' : 'fine'}`;
    for (const p of all) if (!p.choices) sliders[p.id].step = coarse ? p.coarse : p.fine;
  };
  main.append(stepBtn);

  const setValue = (p, v, fromSlider) => {
    values[p.id] = v;
    const el = sliders[p.id];
    if (!fromSlider) el.value = v;
    const text = fmt(p, v);
    el.setAttribute('aria-valuetext', text);
    el.nextElementSibling.textContent = text;
    send({ type: 'param', id: p.id, value: v });
    localStorage.setItem(key + ':values', JSON.stringify(values));
  };

  for (const g of groups) {
    const sec = $('section', {}, $('h2', { textContent: g.name }));
    for (const p of g.params) {
      const id = `p-${p.id}`;
      const input = $('input', { type: 'range', id, min: p.min, max: p.max, step: p.fine, value: values[p.id] });
      input.oninput = () => setValue(p, Number(input.value), true);
      sliders[p.id] = input;
      // The visible value is hidden from VoiceOver; the slider already says it.
      const shown = $('span', { className: 'value', ariaHidden: 'true' });
      sec.append($('div', { className: 'param' }, $('label', { htmlFor: id, textContent: p.label }), input, shown));
      setValue(p, values[p.id]);
    }
    main.append(sec);
  }

  // Saved spots: a record of where the sliders were, readable by Claude.
  const spots = JSON.parse(localStorage.getItem(key + ':spots') || '[]');
  const list = $('ol');
  const describe = s => `${s.name} (version ${s.version}): ` +
    all.filter(p => p.id in s.values).map(p => `${p.label} ${fmt(p, s.values[p.id])}`).join(', ');
  const store = () => localStorage.setItem(key + ':spots', JSON.stringify(spots));
  const render = () => {
    list.replaceChildren(...spots.map((s, i) => {
      const restore = $('button', { textContent: `Restore spot ${i + 1}` });
      restore.onclick = () => {
        for (const p of all) if (p.id in s.values) setValue(p, s.values[p.id]);
        restore.focus();
      };
      return $('li', {}, $('span', { textContent: describe(s) }), ' ', restore);
    }));
  };
  const saveBtn = $('button', { className: 'big', textContent: 'Save this spot' });
  const status = $('p', { role: 'status' });
  saveBtn.onclick = () => {
    spots.push({ name: `Spot ${spots.length + 1}`, version, values: { ...values } });
    store(); render();
    status.textContent = `Saved spot ${spots.length}`;
  };
  const copyBtn = $('button', { textContent: 'Copy all spots' });
  copyBtn.onclick = async () => {
    const text = `${title} lab saved spots:\n` + spots.map(describe).join('\n') +
      `\n\nRaw: ${JSON.stringify(spots)}`;
    try { await navigator.clipboard.writeText(text); status.textContent = 'Copied. Paste it to Claude.'; }
    catch { status.textContent = 'Copy failed.'; }
  };
  const clearBtn = $('button', { textContent: 'Delete all spots' });
  clearBtn.onclick = () => {
    if (!confirm('Delete all saved spots?')) return;
    spots.length = 0; store(); render();
    status.textContent = 'All spots deleted';
  };
  const resetBtn = $('button', { textContent: 'Reset sliders to defaults' });
  resetBtn.onclick = () => {
    for (const p of all) setValue(p, p.default);
    status.textContent = 'Sliders reset';
  };
  main.append($('section', {}, $('h2', { textContent: 'Saved spots' }),
    saveBtn, copyBtn, clearBtn, resetBtn, status, list));
  render();
}
