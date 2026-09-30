/* =========================================================================
   ЗВУК · процедурные эффекты и эмбиент-музыка на Web Audio API.
   Никаких внешних файлов — всё синтезируется на месте, поэтому игра
   работает даже без сервера и без интернета.
   ========================================================================= */
window.AUDIO = (function () {
  let ctx = null, master = null, musicBus = null, sfxBus = null;
  let noiseBuf = null, started = false, muted = false;
  const vol = { master: 0.8, music: 0.5, sfx: 0.8 };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol.master; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    /* буфер шума для скрежета, ветра и ударов */
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const active = () => ctx && !muted;
  const when = () => ctx.currentTime;

  function applyVol() {
    if (!ctx) return;
    master.gain.value = muted ? 0 : vol.master;
    musicBus.gain.value = vol.music;
    sfxBus.gain.value = vol.sfx;
  }

  /* ------------------------- огибающие и генераторы ------------------------- */
  function tone(freq, dur, type, gain, bus, slideTo) {
    if (!active()) return;
    const t0 = when();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, gain, bus, filterHz, q, type) {
    if (!active()) return;
    const t0 = when();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.value = filterHz || 900; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ------------------------------ эффекты ------------------------------ */
  const SFX = {
    hit:    () => { noise(0.09, 0.5, sfxBus, 2200, 1.2); tone(rnd(150, 200), 0.08, 'square', 0.16); },
    crit:   () => { noise(0.16, 0.6, sfxBus, 3600, 1.6); tone(rnd(520, 760), 0.14, 'sawtooth', 0.2, null, 180); },
    kill:   () => { tone(rnd(90, 130), 0.28, 'triangle', 0.28, null, 40); noise(0.3, 0.35, sfxBus, 700, 0.6); },
    miss:   () => { noise(0.08, 0.22, sfxBus, 5200, 1); },
    level:  () => { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sine', 0.26), i * 95)); },
    loot:   () => { tone(880, 0.09, 'sine', 0.22); setTimeout(() => tone(1320, 0.16, 'sine', 0.2), 80); },
    coin:   () => { [1046, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.09, 'square', 0.13), i * 55)); },
    bad:    () => { tone(120, 0.4, 'sawtooth', 0.26, null, 60); noise(0.35, 0.25, sfxBus, 400, 0.7); },
    boss:   () => { tone(80, 0.7, 'sawtooth', 0.32, null, 42); setTimeout(() => tone(58, 1.0, 'sawtooth', 0.3, null, 34), 260); },
    spell:  () => { tone(rnd(340, 520), 0.2, 'sine', 0.22, null, rnd(900, 1400)); noise(0.2, 0.2, sfxBus, 3000, 1.4, 'highpass'); },
    fire:   () => { noise(0.34, 0.32, sfxBus, 1400, 0.8); tone(rnd(180, 260), 0.22, 'sawtooth', 0.14, null, 90); },
    frost:  () => { [1600, 2200, 2800].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sine', 0.14), i * 45)); noise(0.3, 0.18, sfxBus, 5200, 1.5, 'highpass'); },
    bolt:   () => { noise(0.12, 0.5, sfxBus, 4200, 2); tone(1200, 0.16, 'square', 0.2, null, 240); },
    chest:  () => { noise(0.2, 0.3, sfxBus, 900, 0.9); setTimeout(() => SFX.loot(), 150); },
    click:  () => tone(660, 0.04, 'square', 0.09),
    hover:  () => tone(880, 0.03, 'sine', 0.05),
    death:  () => { [330, 247, 196, 147].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.24), i * 150)); },
    victory:() => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sine', 0.24), i * 130)); }
  };

  /* --------------------------- музыка: эмбиент ---------------------------
     Медленный дроун с блуждающими квинтами и редкими колокольчиками.
     Меняется по локациям: чем глубже, тем ниже и тревожнее. */
  let musicOn = false, musicTimer = null, chordStep = 0, musicLoc = 0;
  const SCALES = [
    [55.0, 82.4, 110.0],   // поля
    [49.0, 73.4, 98.0],    // лес
    [43.7, 65.4, 87.3],    // подземелье
    [41.2, 61.7, 82.4],    // горы
    [36.7, 55.0, 73.4],    // собор
    [32.7, 49.0, 65.4]     // бездна
  ];

  function droneStep() {
    if (!musicOn || !active()) return;
    const sc = SCALES[Math.min(musicLoc, SCALES.length - 1)];
    const root = sc[chordStep % sc.length];
    const t0 = when();
    /* долгий дроун из трёх слоёв */
    [[root, 'sine', 0.16], [root * 2, 'triangle', 0.07], [root * 1.5, 'sine', 0.05]].forEach(([f, ty, g]) => {
      const o = ctx.createOscillator(), gg = ctx.createGain(), fl = ctx.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 420 + Math.random() * 260;
      o.type = ty; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      gg.gain.setValueAtTime(0.0001, t0);
      gg.gain.linearRampToValueAtTime(g, t0 + 3.2);
      gg.gain.linearRampToValueAtTime(0.0001, t0 + 8.4);
      o.connect(fl); fl.connect(gg); gg.connect(musicBus);
      o.start(t0); o.stop(t0 + 8.6);
    });
    /* редкий далёкий колокол */
    if (Math.random() < 0.45) {
      const bell = root * 4 * (Math.random() < 0.5 ? 1 : 1.5);
      setTimeout(() => {
        if (!musicOn || !active()) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = bell;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.4);
        o.connect(g); g.connect(musicBus);
        o.start(); o.stop(ctx.currentTime + 3.6);
      }, Math.random() * 3000);
    }
    chordStep++;
  }

  const api = {
    SFX,
    play(name) { if (SFX[name]) SFX[name](); },
    /* включается по первому действию пользователя — политика браузеров */
    unlock() {
      ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      started = true;
    },
    setVolumes(v) {
      if (v.master !== undefined) vol.master = v.master;
      if (v.music !== undefined) vol.music = v.music;
      if (v.sfx !== undefined) vol.sfx = v.sfx;
      ensure(); applyVol();
    },
    getVolumes() { return Object.assign({}, vol); },
    setMuted(m) { muted = !!m; ensure(); applyVol(); },
    isMuted() { return muted; },
    musicStart(locIndex) {
      ensure();
      if (!ctx) return;
      musicLoc = locIndex || 0;
      if (musicOn) return;
      musicOn = true; chordStep = 0;
      droneStep();
      musicTimer = setInterval(droneStep, 6200);
    },
    musicStop() { musicOn = false; if (musicTimer) clearInterval(musicTimer); musicTimer = null; },
    setMusicLoc(i) { musicLoc = i; },
    isMusicOn() { return musicOn; },
    get started() { return started; }
  };
  return api;
})();
