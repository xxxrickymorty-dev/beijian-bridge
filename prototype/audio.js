/* ----------------------------------------------
 * 编梁 · 北涧桥 — 程序化声音层
 * 独立脚本，无依赖、无外部音频、无网络。
 * 全部声音由振荡器与噪声实时合成；语音走 speechSynthesis。
 * 暴露 window.BridgeAudio。
 * ---------------------------------------------- */
(function (global) {
  'use strict';

  const AC = global.AudioContext || global.webkitAudioContext || null;
  const synth = global.speechSynthesis || null;
  const Utter = global.SpeechSynthesisUtterance || null;

  const supported = { audio: !!AC, speech: !!(synth && Utter) };

  /* 音量：整体压得很低，音乐垫在人声和音效下面 */
  const VOL = {
    master: 0.72,
    music: 0.50,      // 音乐总线（水声 + 垫 + 拨弦）
    sfx: 0.85,        // 音效总线
    voice: 0.92,      // 语音 utterance 音量
    duck: 0.38        // 说话时音乐降到这个比例
  };

  const state = { music: true, voice: true, sfx: true, muted: false };

  let ctx = null;
  let master = null, musicBus = null, sfxBus = null;
  let musicSend = null, sfxSend = null, reverb = null;
  let noiseBuf = null;

  let pad = null;          // { osc:[{o,g}], filter, gain, lfo }
  let amb = null;          // { src, lp, bp, gain, lfo }
  let musicPlaying = false;
  let musicWanted = false;
  let gestureReceived = false;
  let musicTimer = null;
  let birdTimer = null;
  let nextPluck = 0, nextChord = 0, chordIndex = 0;
  let pendingKill = [];

  let voice = null;
  let duckTimer = null;
  let speechToken = 0;

  /* 五声音阶：D 宫（D E F# A B） */
  const CHORDS = [
    [50, 57, 62],   // D3 A3 D4
    [47, 54, 59],   // B2 F#3 B3
    [45, 52, 57],   // A2 E3 A3
    [50, 54, 57]    // D3 F#3 A3
  ];
  const NOTE_POOL = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];

  /* 内置短句：只说关键节点，不逐步念 */
  const LINES = {
    start: '开始编拱。先立两块牛头。',
    head: '牛头落位。它是横着的主梁。',
    san: '三节苗，管跨度。',
    wu: '五节苗，把三节苗别住。',
    braces: '打上剪刀苗，桥就不晃了。',
    props: '撤掉支架，看它自己站住。',
    load: '压上去，节点只会更紧。',
    gallery: '起廊屋，拱就成了桥。',
    finish: '它自己站住了。八根短木，跨过二十九米。',
    encourage: '不要紧，再放一次。',
    break: '断了一根，五节苗不再连续。'
  };

  /* ---------------------------------------------------------- 基础工具 */
  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function makeNoise(seconds) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function safeResume() {
    if (!ctx) return Promise.resolve(false);
    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        return Promise.resolve(ctx.resume()).then(function () {
          return ctx.state === 'running';
        }).catch(function () { return false; });
      }
    } catch (e) { return Promise.resolve(false); }
    return Promise.resolve(ctx.state === 'running');
  }

  /* ---------------------------------------------------------- 初始化 */
  function init() {
    if (ctx) return ctx;
    if (!AC) return null;
    try {
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = state.muted ? 0.0001 : VOL.master;
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = VOL.sfx;
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.0001;   // 必须由 unlock / musicStart 淡入
      musicBus.connect(master);

      /* 一小段合成混响，给拨弦和钟声一点空间 */
      reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(1.9, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.30;
      reverb.connect(wet);
      wet.connect(master);

      musicSend = ctx.createGain();
      musicSend.gain.value = 0.22;
      musicSend.connect(reverb);

      sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.16;
      sfxSend.connect(reverb);

      noiseBuf = makeNoise(2);
    } catch (e) {
      ctx = null;
      master = musicBus = sfxBus = null;
      return null;
    }
    return ctx;
  }

  /* 手势解锁：必须由 click / pointerdown / keydown 调用 */
  function unlock() {
    const c = init();
    if (!c) return Promise.resolve(false);
    gestureReceived = true;
    if (state.music && musicWanted && !musicPlaying) {
      /* 先启动，再等 resume；音乐总线有 5s 淡入 */
      startMusic();
    }
    return safeResume().then(function (ok) {
      if (ok && state.music && musicWanted && !musicPlaying) startMusic();
      return ok;
    });
  }

  /* ---------------------------------------------------------- 开关 */
  function setMusic(on) {
    if (on) startMusic();
    else musicStop();
    return state.music;
  }

  function setVoice(on) {
    state.voice = !!on;
    if (!state.voice) cancelSpeech();
    return state.voice;
  }

  function setSfx(on) {
    state.sfx = !!on;
    return state.sfx;
  }

  function setMuted(on) {
    state.muted = !!on;
    if (state.muted) cancelSpeech();
    if (master) {
      const t = now();
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.linearRampToValueAtTime(state.muted ? 0.0001 : VOL.master, t + 0.25);
      } catch (e) {}
    }
    if (!state.muted && state.music && musicWanted && !musicPlaying) startMusic();
    return state.muted;
  }

  function getState() {
    return { music: state.music, voice: state.voice, sfx: state.sfx, muted: state.muted };
  }

  /* ---------------------------------------------------------- 混响 / 噪声工具 */
  function noiseHit(t, dur, opt) {
    if (!noiseBuf) return;
    opt = opt || {};
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opt.type || 'bandpass';
    f.frequency.value = opt.freq || 800;
    f.Q.value = opt.q || 1;
    const g = ctx.createGain();
    const peak = opt.gain === undefined ? 0.1 : opt.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opt.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(opt.bus || sfxBus);
    if (opt.send) g.connect(opt.send);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.03);
  }

  function pluckVoice(t, midi, gain, bus, send) {
    if (!ctx) return;
    const f = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(720, t + 1.05);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    o1.detune.value = (Math.random() * 2 - 1) * 3;

    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.004;
    const h = ctx.createGain();
    h.gain.value = 0.22;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);

    o1.connect(lp);
    o2.connect(h);
    h.connect(lp);
    lp.connect(g);
    g.connect(bus || sfxBus);
    if (send) g.connect(send);

    o1.start(t); o2.start(t);
    o1.stop(t + 1.8); o2.stop(t + 1.8);
  }

  function bell(t, freq, gain, bus, send) {
    const parts = [[1, 1.0, 1.7], [2.01, 0.32, 1.1], [3.01, 0.16, 0.75]];
    parts.forEach(function (p) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * p[0];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * p[1], t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      o.connect(g);
      g.connect(bus || sfxBus);
      if (send) g.connect(send);
      o.start(t);
      o.stop(t + p[2] + 0.05);
    });
  }

  /* ---------------------------------------------------------- 音效 */
  function sfx(name, opts) {
    opts = opts || {};
    if (!ctx || state.muted || !state.sfx) return false;
    if (ctx.state !== 'running') return false;

    const t = now() + 0.005;
    const p = opts.pitch || 1;
    const v = opts.gain === undefined ? 1 : opts.gain;

    if (name === 'knock' || name === 'place') {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(155 * p, t);
      o.frequency.exponentialRampToValueAtTime(52 * p, t + 0.19);
      o.connect(g);
      g.connect(sfxBus);
      o.start(t); o.stop(t + 0.34);
      noiseHit(t, 0.055, { type: 'bandpass', freq: 1150 * p, q: 1.1, gain: 0.12 * v });
      noiseHit(t + 0.01, 0.09, { type: 'lowpass', freq: 420 * p, q: 0.7, gain: 0.08 * v });
      return true;
    }

    if (name === 'creak') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 4;
      f.frequency.setValueAtTime(300, t);
      f.frequency.linearRampToValueAtTime(520, t + 0.26);
      f.frequency.linearRampToValueAtTime(340, t + 0.62);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.075 * v, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
      src.connect(f); f.connect(g); g.connect(sfxBus); g.connect(sfxSend);
      src.start(t); src.stop(t + 0.82);

      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(88, t);
      o.frequency.linearRampToValueAtTime(104, t + 0.3);
      o.frequency.linearRampToValueAtTime(76, t + 0.7);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(0.035 * v, t + 0.08);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(og); og.connect(sfxBus);
      o.start(t); o.stop(t + 0.8);
      return true;
    }

    if (name === 'chime') {
      bell(t, (opts.freq || 587.33) * p, 0.10 * v, sfxBus, sfxSend);
      return true;
    }

    if (name === 'whoosh') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.8;
      f.frequency.setValueAtTime(380, t);
      f.frequency.exponentialRampToValueAtTime(1900, t + 0.30);
      f.frequency.exponentialRampToValueAtTime(320, t + 0.72);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.10 * v, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      src.connect(f); f.connect(g); g.connect(sfxBus); g.connect(sfxSend);
      src.start(t); src.stop(t + 0.84);
      return true;
    }

    if (name === 'success') {
      [62, 66, 69, 74].forEach(function (m, i) {
        pluckVoice(t + i * 0.105, m, 0.075 * v, sfxBus, sfxSend);
      });
      bell(t + 0.34, midiToFreq(74), 0.05 * v, sfxBus, sfxSend);
      return true;
    }

    if (name === 'error') {
      [57, 55].forEach(function (m, i) {
        const st = t + i * 0.17;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(midiToFreq(m), st);
        o.frequency.exponentialRampToValueAtTime(midiToFreq(m) * 0.94, st + 0.32);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.055 * v, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.42);
        o.connect(g); g.connect(sfxBus); g.connect(sfxSend);
        o.start(st); o.stop(st + 0.46);
      });
      return true;
    }

    return false;
  }

  /* 每步一个极轻的过渡音，不朗读，避免每步都念 */
  function step(index, label) {
    if (!ctx || state.muted || !state.sfx) return false;
    if (ctx.state !== 'running') return false;
    const t = now() + 0.01;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(430, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(sfxBus); g.connect(sfxSend);
    o.start(t); o.stop(t + 0.28);
    return true;
  }

  /* ---------------------------------------------------------- 音乐垫：pad + 稀疏拨弦 + 水声 */
  function startPad() {
    if (!ctx) return null;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 760;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0.13;
    filter.connect(gain);
    gain.connect(musicBus);
    gain.connect(musicSend);

    const osc = [];
    CHORDS[chordIndex].forEach(function (m, i) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = midiToFreq(m);
      o.detune.value = (Math.random() * 2 - 1) * 5;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.55 : 0.30;
      o.connect(og);
      og.connect(filter);
      o.start();
      osc.push({ o: o, g: og });
    });

    /* 缓慢呼吸 */
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.085;
    const lg = ctx.createGain();
    lg.gain.value = 0.028;
    lfo.connect(lg);
    lg.connect(gain.gain);
    lfo.start();

    return { osc: osc, filter: filter, gain: gain, lfo: lfo };
  }

  function changeChord() {
    if (!pad || !ctx) return;
    const t = now();
    const notes = CHORDS[chordIndex];
    pad.osc.forEach(function (v, i) {
      const f = midiToFreq(notes[i] || notes[notes.length - 1]);
      try {
        v.o.frequency.cancelScheduledValues(t);
        v.o.frequency.setValueAtTime(Math.max(1, v.o.frequency.value), t);
        v.o.frequency.exponentialRampToValueAtTime(f, t + 6);
      } catch (e) {}
    });
    try {
      pad.filter.frequency.cancelScheduledValues(t);
      pad.filter.frequency.setValueAtTime(Math.max(40, pad.filter.frequency.value), t);
      pad.filter.frequency.linearRampToValueAtTime(620 + Math.random() * 260, t + 5);
    } catch (e) {}
  }

  function startAmbience() {
    if (!ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 820;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.045;

    src.connect(lp); lp.connect(bp); bp.connect(gain); gain.connect(musicBus);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.018;
    lfo.connect(lg);
    lg.connect(gain.gain);

    src.start();
    lfo.start();
    return { src: src, lp: lp, bp: bp, gain: gain, lfo: lfo };
  }

  function killPad(p) {
    if (!p) return;
    try { p.lfo.stop(); } catch (e) {}
    try { p.lfo.disconnect(); } catch (e) {}
    p.osc.forEach(function (v) {
      try { v.o.stop(); } catch (e) {}
      try { v.o.disconnect(); } catch (e) {}
    });
    try { p.gain.disconnect(); } catch (e) {}
    try { p.filter.disconnect(); } catch (e) {}
  }

  function killAmb(a) {
    if (!a) return;
    try { a.src.stop(); } catch (e) {}
    try { a.src.disconnect(); } catch (e) {}
    try { a.lfo.stop(); } catch (e) {}
    try { a.lfo.disconnect(); } catch (e) {}
    try { a.gain.disconnect(); } catch (e) {}
  }

  function flushKills() {
    if (!pendingKill.length) return;
    pendingKill.forEach(function (item) {
      killPad(item.pad);
      killAmb(item.amb);
    });
    pendingKill = [];
  }

  function chirp() {
    if (!ctx || !musicPlaying || ctx.state !== 'running') return;
    const t = now() + 0.05;
    let dest = musicBus;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      pan.connect(musicBus);
      dest = pan;
    }
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.09 + Math.random() * 0.05);
      const f0 = 2200 + Math.random() * 900;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, st);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), st + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.8, st + 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.011 + Math.random() * 0.008, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.14);
      o.connect(g);
      g.connect(dest);
      o.start(st);
      o.stop(st + 0.17);
    }
  }

  function scheduleBirds() {
    if (!musicPlaying) return;
    clearTimeout(birdTimer);
    birdTimer = setTimeout(function () {
      if (musicPlaying) chirp();
      scheduleBirds();
    }, 9000 + Math.random() * 17000);
  }

  function scheduleMusic() {
    if (!ctx || !musicPlaying) return;
    const t = now();

    if (t >= nextChord) {
      chordIndex = (chordIndex + 1) % CHORDS.length;
      changeChord();
      nextChord = t + 16 + Math.random() * 8;
    }

    if (nextPluck < t + 0.9) {
      if (nextPluck < t) nextPluck = t + 0.4;
      const midi = NOTE_POOL[Math.floor(Math.random() * NOTE_POOL.length)];
      pluckVoice(nextPluck, midi, 0.055 + Math.random() * 0.045, musicBus, musicSend);
      if (Math.random() < 0.3) {
        pluckVoice(nextPluck + 0.16, midi + (Math.random() < 0.5 ? 2 : 3), 0.022, musicBus, musicSend);
      }
      nextPluck += 2.2 + Math.random() * 5.5;
    }
  }

  function startMusic() {
    musicWanted = true;
    state.music = true;
    if (!ctx) init();
    if (!ctx) return false;
    if (musicPlaying) return true;
    if (!gestureReceived && ctx.state !== 'running') return false;

    flushKills();
    musicPlaying = true;

    const t = now();
    try {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
      musicBus.gain.linearRampToValueAtTime(VOL.music, t + 5);
    } catch (e) {}

    pad = startPad();
    amb = startAmbience();
    nextPluck = t + 3.5;
    nextChord = t + 16;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 400);
    scheduleBirds();
    safeResume();
    return true;
  }

  function musicStop() {
    musicWanted = false;
    state.music = false;
    if (!ctx || !musicPlaying) return false;

    musicPlaying = false;
    clearInterval(musicTimer);
    musicTimer = null;
    clearTimeout(birdTimer);
    birdTimer = null;

    const t = now();
    try {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
      musicBus.gain.linearRampToValueAtTime(0.0001, t + 2.2);
    } catch (e) {}

    const item = { pad: pad, amb: amb };
    pendingKill.push(item);
    pad = null;
    amb = null;
    setTimeout(function () {
      const i = pendingKill.indexOf(item);
      if (i < 0) return;                 // 已被新一轮 musicStart 提前清理
      pendingKill.splice(i, 1);
      killPad(item.pad);
      killAmb(item.amb);
    }, 2400);
    return true;
  }

  /* ---------------------------------------------------------- 语音 */
  function bindVoices() {
    if (!synth || !synth.addEventListener || bindVoices.done) return;
    bindVoices.done = true;
    synth.addEventListener('voiceschanged', function () {
      voice = null;
      pickVoice();
    });
  }

  function pickVoice() {
    if (voice) return voice;
    if (!synth || !synth.getVoices) return null;
    let list = [];
    try { list = synth.getVoices() || []; } catch (e) { return null; }
    let best = null;
    list.forEach(function (v) {
      const lang = (v.lang || '').toLowerCase().replace('_', '-');
      if (lang.indexOf('zh') !== 0) return;
      let score = 1;
      if (lang.indexOf('zh-cn') === 0) score += 4;
      if (lang.indexOf('zh-hans') === 0) score += 3;
      if (v.localService) score += 1;
      if (/普通|mandarin|中文|chinese/i.test(v.name || '')) score += 1;
      if (!best || score > best.score) best = { v: v, score: score };
    });
    if (best) voice = best.v;
    return voice;
  }

  function shorten(text) {
    if (text === undefined || text === null) return '';
    let s = String(text).replace(/\s+/g, ' ').trim();
    if (s.length > 80) {
      const cut = s.slice(0, 80);
      const m = cut.match(/^.*[。！？；，、.!?;,]/);
      s = (m ? m[0] : cut) + '……';
    }
    return s;
  }

  function cancelSpeech() {
    speechToken++;
    if (synth) {
      try { synth.cancel(); } catch (e) {}
    }
    clearTimeout(duckTimer);
    duckTimer = null;
    duck(false);
  }

  function duck(on) {
    if (!ctx || !musicPlaying || !musicBus) return;
    const t = now();
    try {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
      musicBus.gain.linearRampToValueAtTime(VOL.music * (on ? VOL.duck : 1), t + (on ? 0.25 : 0.9));
    } catch (e) {}
  }

  function say(text, opts) {
    opts = opts || {};
    if (!synth || !Utter) return false;
    if (state.muted || !state.voice) return false;

    const line = shorten(text);
    if (!line) return false;

    const token = ++speechToken;
    try { synth.cancel(); } catch (e) {}
    clearTimeout(duckTimer);
    duckTimer = null;

    const u = new Utter(line);
    u.lang = opts.lang || 'zh-CN';
    u.rate = clamp(opts.rate || 0.92, 0.5, 1.6);
    u.pitch = clamp(opts.pitch === undefined ? 1 : opts.pitch, 0.5, 1.8);
    u.volume = clamp(opts.volume === undefined ? VOL.voice : opts.volume, 0, 1);

    const v = pickVoice();
    if (v) u.voice = v;

    const restore = function () {
      if (token !== speechToken) return;   // 被后一句取消/被静音
      clearTimeout(duckTimer);
      duckTimer = null;
      duck(false);
    };
    u.onend = restore;
    u.onerror = restore;

    duck(true);
    try {
      synth.speak(u);
    } catch (e) {
      restore();
      return false;
    }
    /* onend 不可靠时的兜底 */
    duckTimer = setTimeout(restore, Math.min(15000, 1600 + line.length * 300 / u.rate));
    return true;
  }

  function sayLine(key, opts) {
    return say(LINES[key] || key, opts);
  }

  /* ---------------------------------------------------------- 导出 */
  global.BridgeAudio = {
    version: '1.0.0',
    supported: supported,
    lines: LINES,
    volumes: VOL,
    init: init,
    unlock: unlock,
    setMusic: setMusic,
    setVoice: setVoice,
    setSfx: setSfx,
    setMuted: setMuted,
    state: getState,
    musicStart: startMusic,
    musicStop: musicStop,
    sfx: sfx,
    say: say,
    sayLine: sayLine,
    step: step
  };

  if (supported.speech) bindVoices();
})(typeof window !== 'undefined' ? window : this);
