(function () {
  const cfg = CBJ.config, L = CBJ.layout;
  const M = new CBJ.Machine(cfg);
  const SAVE_KEY = "cbj-save-v2";
  try { M.restore(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { /* no storage */ }
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(M.snapshot())); } catch (e) { /* no storage */ } };

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SUIT = { h: "♥", s: "♠", d: "♦", c: "♣" };
  const rankLabel = (r) => cfg.rankLabel[r] || r;
  const symName = (s) => cfg.symbols[s] || s;
  const cardName = (c) => rankLabel(c.r) + SUIT[c.suit];
  if (/[?&]debug/.test(location.search)) document.body.classList.add("debug");

  // Tests can queue exact random results; everything else stays random.
  const origRandInt = M.randInt.bind(M);
  let forced = [];
  M.randInt = (n) => (forced.length ? forced.shift() % n : origRandInt(n));

  // ---------------------------------------------------------------- sound (synthesised, no files)
  // Everything goes through a small "cabinet": speaker EQ, a compressor and a short box reverb, so the
  // sounds share one room like on the real machine. Melodies use a pulse wave (old sound chip timbre),
  // the reels are stepper motors whose buzz follows each reel's real speed.
  const SFX = (() => {
    let ctx = null, bus = null, master = null, muted = false, noiseBuf = null, chipBus = null;
    const waves = {};
    const reelVoices = [];
    try { muted = localStorage.getItem("cbj-mute") === "1"; } catch (e) { /* ignore */ }
    const VOL = 0.8;
    const ensure = () => {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC({ latencyHint: "interactive" });
        master = ctx.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ctx.destination);
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
        comp.connect(master);
        // cabinet speaker: no deep bass, a little presence, soft top
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70;
        const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 2400; pk.Q.value = 0.9; pk.gain.value = 3;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 8000;
        hp.connect(pk); pk.connect(lp); lp.connect(comp);
        bus = ctx.createGain(); bus.connect(hp);
        // short box reverb
        const len = Math.floor(ctx.sampleRate * 0.45), ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
        const conv = ctx.createConvolver(); conv.buffer = ir;
        const wet = ctx.createGain(); wet.gain.value = 0.16;
        bus.connect(conv); conv.connect(wet); wet.connect(hp);
        // melodies get a quick arcade echo
        chipBus = ctx.createGain(); chipBus.connect(bus);
        const dl = ctx.createDelay(1); dl.delayTime.value = 0.105;
        const fb = ctx.createGain(); fb.gain.value = 0.3;
        const dwet = ctx.createGain(); dwet.gain.value = 0.22;
        const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 4200;
        chipBus.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dwet); dwet.connect(bus);
        // white noise source material
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    };
    // pulse wave with a given duty cycle: the 12.5% / 25% "chip" sound
    const pulse = (duty) => {
      if (waves[duty]) return waves[duty];
      const N = 48, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      return (waves[duty] = ctx.createPeriodicWave(re, im));
    };
    const env = (g, t, a, peak, hold, rel) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    };
    // one chip note
    const chip = (freq, dur, vol = 0.12, when = 0, { duty = 0.25, vib = 0, slide = 0, rel = 0.035 } = {}) => {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
      o.setPeriodicWave(pulse(duty)); o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
      if (vib) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = 6.5; lg.gain.value = freq * vib; l.connect(lg); lg.connect(o.frequency);
        l.start(t); l.stop(t + dur + rel + 0.05);
      }
      env(g, t, 0.003, vol, Math.max(0, dur - 0.003), rel);
      o.connect(g); g.connect(chipBus); o.start(t); o.stop(t + dur + rel + 0.05);
    };
    // a small bell for the sparkle at the end of a win
    const bell = (freq, when, vol = 0.08) => {
      const c = ensure(); if (!c) return;
      [1, 2.76, 5.4].forEach((m, i) => {
        const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = freq * m;
        env(g, t, 0.002, vol / (i + 1), 0, 0.6 / (i + 1)); o.connect(g); g.connect(chipBus); o.start(t); o.stop(t + 0.8);
      });
    };
    const tone = (freq, dur, type, vol, when = 0, slide = 0) => {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq * slide), t + dur);
      env(g, t, 0.002, vol, 0, dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (dur, vol, freq, when = 0, q = 1, type = "bandpass") => {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
      env(g, t, 0.001, vol, 0, dur); s.connect(f); f.connect(g); g.connect(bus);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    };
    // a stepper reel: buzz at the step rate + a little air, both follow the reel's speed
    const reelVoice = (i) => {
      if (reelVoices[i]) return reelVoices[i];
      const c = ctx, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = "sawtooth"; o.frequency.value = 40; lp.type = "lowpass"; lp.frequency.value = 700; lp.Q.value = 2;
      g.gain.value = 0;
      const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.8;
      const ng = c.createGain(); ng.gain.value = 0;
      // the steps: the air noise is chopped at the step rate
      const am = c.createOscillator(), amg = c.createGain(); am.type = "square"; am.frequency.value = 40; amg.gain.value = 0.5;
      const chop = c.createGain(); chop.gain.value = 0.5; am.connect(amg); amg.connect(chop.gain);
      o.connect(lp); lp.connect(g); g.connect(bus);
      s.connect(bp); bp.connect(chop); chop.connect(ng); ng.connect(bus);
      o.start(); s.start(); am.start();
      return (reelVoices[i] = { o, g, ng, am, lp, detune: 1 + (i - 2) * 0.035 });
    };
    // ---- the machine's own sounds, cut from the owner's gameplay video (assets/sfx, see artwork/video/samples.txt)
    const SAMPLE_NAMES = ["spin", "hold", "nudgeStep", "nudgeArrive", "cardAdd", "gambleStart", "gambleIntro", "wheelSpin", "guessWin",
      "trigger21", "winCount", "mpLoop", "mpResult", "multiLoop", "rowLoop", "nudgePick", "chooseLoop", "guessLoop", "joker", "billIn"];
    const buffers = {};
    const channels = {};
    let loading = null;
    const loadSamples = () => {
      if (loading || !ctx) return loading;
      // all samples are WAV (cleaned with Demucs + noisereduce, see artwork/video/recut.py)
      loading = Promise.all(SAMPLE_NAMES.map((n) => fetch(`assets/sfx/${n}.wav`).then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a)).then((b) => { buffers[n] = b; }).catch(() => {})));
      return loading;
    };
    const stopChannel = (ch) => {
      const v = channels[ch]; if (!v) return;
      channels[ch] = null;
      try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); v.src.stop(ctx.currentTime + 0.1); } catch (e) { /* already stopped */ }
    };
    // play a sample; a channel holds one sound at a time (a new one cuts the old one)
    // duck: [[from, to], ...] seconds into the sound that are turned (almost) silent; end: stop (with a fade) here
    const play = (name, { loop = false, channel = null, vol = 1, duck = null, end = null } = {}) => {
      const c = ensure(); if (!c || !buffers[name]) return false;
      // a running tune that is already playing keeps playing (no restart on every lamp change)
      if (channel && loop && channels[channel] && channels[channel].name === name) return true;
      if (channel) stopChannel(channel);
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buffers[name]; src.loop = loop; g.gain.value = vol;
      src.connect(g); g.connect(bus);
      const t = c.currentTime;
      for (const [a, b] of duck || []) {
        g.gain.setValueAtTime(vol, t + a - 0.015); g.gain.linearRampToValueAtTime(vol * 0.1, t + a);
        g.gain.setValueAtTime(vol * 0.1, t + b); g.gain.linearRampToValueAtTime(vol, t + b + 0.03);
      }
      if (end) { g.gain.setValueAtTime(vol, t + end); g.gain.linearRampToValueAtTime(0, t + end + 0.08); src.stop(t + end + 0.1); }
      src.start();
      if (channel) channels[channel] = { src, g, name };
      return true;
    };
    return {
      has: (name) => !!buffers[name],
      play, stopChannel,
      unlock() { const c = ensure(); if (c) loadSamples(); return c; },
      toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : VOL; try { localStorage.setItem("cbj-mute", muted ? "1" : "0"); } catch (e) { /* ignore */ } return muted; },
      get muted() { return muted; },
      // chunky arcade button: press click, a little body, release click
      button() {
        noise(0.012, 0.5, 3800, 0, 1.6); tone(150, 0.035, "sine", 0.25, 0, 0.7);
        noise(0.01, 0.25, 5200, 0.07, 2);
      },
      motorOn() { ensure(); },
      motorOff() {},
      // called every frame with the reel's speed in symbols per second (i = 0..3 reels, 4 = card wheel)
      reel(i, vel) {
        if (!ctx || ctx.state !== "running" || buffers.spin) return;
        const v = reelVoice(i), t = ctx.currentTime, sp = Math.abs(vel);
        const step = (18 + sp * 2.1) * v.detune; // steps per second
        v.o.frequency.setTargetAtTime(step, t, 0.015);
        v.am.frequency.setTargetAtTime(step, t, 0.015);
        v.lp.frequency.setTargetAtTime(500 + sp * 22, t, 0.02);
        const lvl = Math.min(1, sp / 12) * (i === 4 ? 0.6 : 1);
        v.g.gain.setTargetAtTime(lvl * 0.07, t, 0.02);
        v.ng.gain.setTargetAtTime(lvl * 0.05, t, 0.02);
      },
      tick() {},
      // the reel is caught by its latch: sharp click, a thud, a short metallic ring
      stop(i) {
        if (buffers.spin && i < 4) return; // the spin sample already has the machine's own reel stops
        const k = 1 + ((i * 37) % 7) * 0.02;
        noise(0.014, 0.55, 3000 * k, 0, 0.9, "highpass");
        tone(120 * k, 0.07, "sine", 0.45, 0, 0.5);
        noise(0.09, 0.07, 2600 * k, 0.004, 14);
      },
      blip(hi) { chip(hi ? 1568 : 1175, 0.04, 0.07, 0, { duty: 0.125, rel: 0.02 }); },
      win(steps = 6) {
        const seq = [523, 659, 784, 1047, 1319, 1568].slice(0, steps);
        seq.forEach((f, i) => { chip(f, 0.07, 0.11, i * 0.065); chip(f / 2, 0.07, 0.05, i * 0.065, { duty: 0.5 }); });
        const e = seq.length * 0.065;
        chip(seq[seq.length - 1], 0.34, 0.1, e, { vib: 0.012, rel: 0.12 });
        chip(seq[seq.length - 1] * 0.75, 0.34, 0.05, e, { duty: 0.5, rel: 0.12 });
      },
      coin(i = 0) { chip(1760, 0.03, 0.06, i * 0.05, { duty: 0.125 }); chip(2349, 0.05, 0.05, i * 0.05 + 0.03, { duty: 0.125 }); },
      lose() {
        [523, 415, 330, 262].forEach((f, i) => chip(f, 0.12, 0.1, i * 0.13, { slide: 0.94, vib: i === 3 ? 0.03 : 0 }));
      },
      jackpot() {
        for (let r = 0; r < 4; r++) [523, 659, 784, 1047].forEach((f, i) => chip(f * (1 + r * 0.125), 0.06, 0.1, r * 0.32 + i * 0.06));
        chip(1568, 0.6, 0.1, 1.3, { vib: 0.015, rel: 0.2 }); chip(784, 0.6, 0.05, 1.3, { duty: 0.5, rel: 0.2 });
      },
      // Kisebb/Nagyobb hit, as the machine did it: "türrürürürr – trirürürü" (two quick warbling trills)
      // every step higher on the ladder sounds a little higher and brighter
      guessWin(level = 0) {
        const up = Math.pow(2, Math.min(level, 8) * 2 / 12);
        const trill = (t0, head, lo, hi, n, step, fall = 1, bass = 0) => {
          chip(head * up, 0.065, 0.12, t0);
          if (bass) chip(bass * up, 0.07 + n * step, 0.07, t0, { duty: 0.5, rel: 0.05 });
          for (let k = 0; k < n; k++) {
            const f = (k % 2 ? lo : hi) * Math.pow(fall, k) * up;
            chip(f, step * 0.85, 0.095, t0 + 0.07 + k * step, { rel: 0.012 });
            if (k % 2 === 0) chip(f * 1.26, step * 0.8, 0.035, t0 + 0.07 + k * step, { duty: 0.125, rel: 0.01 });
          }
          return t0 + 0.07 + n * step;
        };
        // "türrürürürr" – "trirürürü"
        const e1 = trill(0, 784, 659, 784, 16, 0.028, 0.997, 196);
        const e2 = trill(e1 + 0.07, 1047, 880, 1047, 10, 0.028, 1, 262);
        // quick shiny run up and a bell on top
        [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => chip(f * up, 0.03, 0.06, e2 + 0.04 + i * 0.03, { duty: 0.125, rel: 0.02 }));
        bell(2093 * up, e2 + 0.24, 0.1);
      },
      joker() { [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637].forEach((f, i) => chip(f, 0.035, 0.07, i * 0.035, { duty: 0.125, rel: 0.02 })); },
    };
  })();
  SFX.unlock(); // create the (suspended) audio context now and decode the samples while the page loads
  ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, () => SFX.unlock(), { once: true }));

  // ---------------------------------------------------------------- scaling
  const stage = $("stage");
  // views: "full" = the machine as it stands, "wide" = top glass left, reel glass + buttons right (for landscape
  // screens: everything ~1.7x bigger), "compact" = only the reel glass and buttons
  const WIDE_GAP = 40;
  function fit() {
    const b = document.body.classList, compact = b.contains("compact"), wide = b.contains("wide");
    // 3D view (view3d.js): the glasses are shown in 3D at roughly their own size
    if (b.contains("view3d")) { setResolution(Math.min(1.6, window.devicePixelRatio || 1)); return; }
    const lower = L.msgH + L.reelGlass.h + L.deckH;
    const h = compact ? lower : wide ? Math.max(L.top.h, lower) : L.top.h + lower;
    const W = wide ? 4096 + WIDE_GAP : 2048;
    const s = Math.min(window.innerWidth / W, window.innerHeight / h);
    stage.style.transform = `scale(${s})`;
    stage.style.position = "absolute";
    stage.style.left = Math.max(0, (window.innerWidth - W * s) / 2) + "px";
    stage.style.top = "0px";
    setResolution(s * (window.devicePixelRatio || 1));
  }
  window.addEventListener("resize", fit);

  // Canvases are drawn at the size they really appear on screen: a 3x canvas shrunk 10x by the browser
  // is both slow and pixelated. Static canvases keep their big original and get a high quality downscale.
  let RES = 1, resReady = false;
  function setResolution(px) {
    RES = Math.min(3, Math.max(0.35, px * 1.1));
    if (!resReady) return;
    for (const R of [...reels, cardWheel]) {
      R.k = RES; R.c.width = Math.round(R.W * RES); R.c.height = Math.round(R.H * RES); R.key = null;
    }
    symCache.clear(); prewarm();
    clearTimeout(setResolution.t);
    setResolution.t = setTimeout(sharpenStatic, 150);
  }
  // Printed parts that are plain images (the card row, the signs...) are shrunk by the browser in one go when
  // the machine is small, which comes out soft. Give each one a copy made at its on-screen size instead.
  const origImg = {};
  function sharpenImages() {
    document.querySelectorAll("#stage img.obj").forEach((im) => {
      const src0 = im.dataset.src0 || (im.dataset.src0 = im.getAttribute("src"));
      const o = origImg[src0] || (origImg[src0] = Object.assign(new Image(), { src: src0 }));
      if (!o.complete || !o.naturalWidth) { o.addEventListener("load", () => sharpenImages(), { once: true }); return; }
      const tw = Math.round(im.offsetWidth * RES), th = Math.round(im.offsetHeight * RES);
      if (!tw || !th || tw > o.naturalWidth * 0.7) { if (im.getAttribute("src") !== src0) im.src = src0; return; }
      if (im.dataset.tw === String(tw) && im.dataset.th === String(th)) return;
      im.dataset.tw = tw; im.dataset.th = th;
      const c = document.createElement("canvas"); c.width = tw; c.height = th;
      const q = c.getContext("2d");
      drawScaled(q, o, 0, 0, o.naturalWidth, o.naturalHeight, 0, 0, tw, th);
      im.src = c.toDataURL();
    });
  }
  function sharpenStatic() {
    sharpenImages();
    document.querySelectorAll("#stage canvas:not(.reel)").forEach((c) => {
      const cw = c.offsetWidth, ch = c.offsetHeight;
      if (!cw || !ch || !c.width) return;
      if (!c._src || c.width !== c._tw || c.height !== c._th) {
        const src = document.createElement("canvas");
        src.width = c.width; src.height = c.height;
        src.getContext("2d").drawImage(c, 0, 0);
        c._src = src;
      }
      let tw = Math.max(1, Math.round(cw * RES)), th = Math.max(1, Math.round(ch * RES));
      if (tw >= c._src.width) { tw = c._src.width; th = c._src.height; }
      if (c.width === tw && c.height === th && c._tw === tw) return;
      c.width = tw; c.height = th; c._tw = tw; c._th = th;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      // step down by halves for a clean result
      let cur = c._src;
      while (cur.width / 2 > tw * 1.5) {
        const h = document.createElement("canvas");
        h.width = Math.round(cur.width / 2); h.height = Math.round(cur.height / 2);
        const hg = h.getContext("2d"); hg.imageSmoothingQuality = "high"; hg.drawImage(cur, 0, 0, h.width, h.height);
        cur = h;
      }
      g.drawImage(cur, 0, 0, tw, th);
    });
  }

  // ---------------------------------------------------------------- the machine's lettering (as on the 25 / 175 signs)
  const MFONT = '"Cooper Black", "Cooper Std", "Goudy Stout", Georgia, serif';
  // western lettering of the KÁRTYA KERÉK sign (bundled font, style.css)
  const WFONT = '"Smokum", "Rockwell Extra Bold", Georgia, serif';
  const RED = { fill: ["#ff5a5f", "#e0212c", "#a8101b"], line: "#6e0b13" };
  const BLACK = { fill: ["#4a5263", "#1c2130", "#0b0e16"], line: "#05070c" };
  const ink = (suit) => (suit === "h" || suit === "d" ? RED : BLACK);
  const PIPS = {
    2: [[0.5, 0.18], [0.5, 0.82]],
    3: [[0.5, 0.18], [0.5, 0.5], [0.5, 0.82]],
    4: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.82], [0.7, 0.82]],
    5: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.5], [0.3, 0.82], [0.7, 0.82]],
    6: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]],
    7: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]],
    8: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.5, 0.66], [0.3, 0.82], [0.7, 0.82]],
    9: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]],
  };
  const MVAR = {
    fire: { fill: [[0, "#ffd84d"], [0.45, "#ff6d1c"], [0.7, "#ef2e17"], [1, "#b20c0c"]], line: [[0, "#fff3a0"], [1, "#ffbf1a"]], rim: "#2a0303", lw: 0.13, rw: 0.27 },
    gold: { fill: [[0, "#fff8b0"], [0.5, "#ffd21f"], [1, "#c98f00"]], line: [[0, "#5a2c00"], [1, "#2e1500"]], rim: null, lw: 0.1, rw: 0 },
    bright: { fill: [[0, "#fffde0"], [0.45, "#ffe64d"], [1, "#ffae00"]], line: [[0, "#7a1a00"], [1, "#3a0800"]], rim: "#000000", lw: 0.16, rw: 0.3 },
    ruby: { fill: [[0, "#ff9486"], [0.42, "#f4322c"], [1, "#a50b14"]], line: [[0, "#3d0307"], [1, "#1c0103"]], rim: "#120102", lw: 0.1, rw: 0.2 },
    cream: { fill: [[0, "#fffdf4"], [1, "#eed9ae"]], line: [[0, "#8a0c12"], [1, "#5a0409"]], rim: "#210202", lw: 0.12, rw: 0.22 },
  };
  function machineText(g, text, x, y, size, variant = "fire", squeeze = 1) {
    const v = MVAR[variant];
    g.save();
    g.translate(x, y); g.scale(squeeze, 1);
    g.font = `${size}px ${MFONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    const grad = (stops) => { const gr = g.createLinearGradient(0, -size * 0.45, 0, size * 0.45); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    if (v.rim) { g.lineWidth = size * v.rw; g.strokeStyle = v.rim; g.strokeText(text, 0, size * 0.04); }
    g.lineWidth = size * v.lw; g.strokeStyle = grad(v.line); g.strokeText(text, 0, 0);
    g.fillStyle = grad(v.fill); g.fillText(text, 0, 0);
    g.globalAlpha = 0.35; g.lineWidth = Math.max(1, size * 0.025); g.strokeStyle = "#ffffff";
    g.strokeText(text, -size * 0.02, -size * 0.03);
    g.restore();
  }
  // same look, but y is the text baseline (for exact centring with glyph metrics)
  function machineTextAt(g, text, x, y, size, variant, squeeze = 1) {
    const v = MVAR[variant];
    g.save();
    g.translate(x, y); g.scale(squeeze, 1);
    g.font = `${size}px ${MFONT}`; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.lineJoin = "round";
    const grad = (stops) => { const gr = g.createLinearGradient(0, -size * 0.7, 0, 0); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    if (v.rim) { g.lineWidth = size * v.rw; g.strokeStyle = v.rim; g.strokeText(text, 0, 0); }
    g.lineWidth = size * v.lw; g.strokeStyle = grad(v.line); g.strokeText(text, 0, 0);
    g.fillStyle = grad(v.fill); g.fillText(text, 0, 0);
    g.restore();
  }
  const mtCache = {};
  function machineTextImage(text, size, variant = "fire") {
    const key = text + "|" + size + "|" + variant;
    if (mtCache[key]) return mtCache[key];
    const c = document.createElement("canvas"), g = c.getContext("2d");
    g.font = `${size}px ${MFONT}`;
    const w = Math.ceil(g.measureText(text).width + size * 0.6), h = Math.ceil(size * 1.45), k = 2;
    c.width = w * k; c.height = h * k;
    const g2 = c.getContext("2d"); g2.scale(k, k);
    machineText(g2, text, w / 2, h / 2, size, variant);
    return (mtCache[key] = { src: c.toDataURL(), w, h });
  }
  function mtImg(text, size, variant, cls = "") {
    const t = machineTextImage(text, size, variant);
    const im = document.createElement("img");
    im.src = t.src; im.alt = text; im.className = "mt " + cls; im.draggable = false;
    im.style.width = t.w + "px"; im.style.height = t.h + "px";
    return im;
  }

  // ---------------------------------------------------------------- the "Classic BLACK JACK" logo, drawn crisp
  // red script "Classic" over the letters of BLACK / JACK, each on its own light blue tile (as on the glass);
  // the SUPER version has the yellow SUPER plate on top.
  const LOGO_SCRIPT = '"Brush Script MT", "Segoe Script", cursive';
  const LOGO_SLAB = '"Rockwell Extra Bold", "Rockwell", "Arial Black", serif';
  function drawBJLogo(g, W, H, opts = {}) {
    const DW = 600, DH = opts.super ? 540 : 430;
    const s = Math.min(W / DW, H / DH);
    g.save();
    g.translate((W - DW * s) / 2, (H - DH * s) / 2); g.scale(s, s);
    g.lineJoin = "round";
    let top = 0;
    if (opts.super) {
      // yellow SUPER plate
      g.save(); g.translate(150, 62); g.rotate(-0.04);
      roundRect(g, -128, -52, 256, 104, 18);
      const yg = g.createLinearGradient(0, -52, 0, 52); yg.addColorStop(0, "#ffe65a"); yg.addColorStop(1, "#f2a712");
      g.fillStyle = yg; g.fill(); g.lineWidth = 9; g.strokeStyle = "#5a1a04"; g.stroke();
      g.font = `900 84px ${LOGO_SLAB}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 10; g.strokeStyle = "#5a0508"; g.strokeText("SUPER", 0, 4);
      const rg = g.createLinearGradient(0, -34, 0, 34); rg.addColorStop(0, "#ff5a3c"); rg.addColorStop(1, "#c3121c");
      g.fillStyle = rg; g.fillText("SUPER", 0, 4);
      g.restore();
      top = 110;
    }
    // letter tiles
    const tile = (ch, x, y, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 8; g.shadowOffsetY = 4;
      roundRect(g, -52, -54, 104, 108, 14);
      const tg = g.createLinearGradient(-52, -54, 52, 54); tg.addColorStop(0, "#c4f1ff"); tg.addColorStop(0.5, "#6fcdf2"); tg.addColorStop(1, "#3ea4dc");
      g.fillStyle = tg; g.fill(); g.shadowColor = "transparent";
      g.lineWidth = 8; g.strokeStyle = "#0e2350"; g.stroke();
      roundRect(g, -44, -46, 88, 92, 10); g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,0.55)"; g.stroke();
      g.font = `900 88px ${LOGO_SLAB}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 11; g.strokeStyle = "#4a0508"; g.strokeText(ch, 0, 5);
      const lg = g.createLinearGradient(0, -40, 0, 44); lg.addColorStop(0, "#ff5b45"); lg.addColorStop(0.55, "#e0202a"); lg.addColorStop(1, "#a50f1a");
      g.fillStyle = lg; g.fillText(ch, 0, 5);
      g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeStyle = "#ffd0c0"; g.strokeText(ch, -2, 2); g.globalAlpha = 1;
      g.restore();
    };
    "BLACK".split("").forEach((ch, i) => tile(ch, 70 + i * 112, top + 196, (i % 2 ? 1 : -1) * 0.05));
    "JACK".split("").forEach((ch, i) => tile(ch, 126 + i * 112, top + 318, (i % 2 ? -1 : 1) * 0.05));
    // "Classic" script, on top of the tiles
    g.save(); g.translate(opts.super ? 70 : 40, top + (opts.super ? 118 : 108)); g.rotate(-0.13);
    g.font = `italic 700 ${opts.super ? 128 : 150}px ${LOGO_SCRIPT}`; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.lineWidth = 20; g.strokeStyle = "#2a0305"; g.strokeText("Classic", 0, 0);
    g.lineWidth = 10; g.strokeStyle = "#7a0a12"; g.strokeText("Classic", 0, 0);
    const cg = g.createLinearGradient(0, -90, 0, 10); cg.addColorStop(0, "#ff6a4a"); cg.addColorStop(0.6, "#e3202a"); cg.addColorStop(1, "#b0101c");
    g.fillStyle = cg; g.fillText("Classic", 0, 0);
    g.globalAlpha = 0.6; g.lineWidth = 2; g.strokeStyle = "#ffe0a0"; g.strokeText("Classic", -2, -3); g.globalAlpha = 1;
    g.restore();
    g.restore();
  }
  function bjLogoCanvas(W, H, opts = {}) {
    const c = document.createElement("canvas");
    c.width = Math.round(W); c.height = Math.round(H);
    if (!opts.sticker) { drawBJLogo(c.getContext("2d"), c.width, c.height, opts); return c; }
    // sticker look (as on the glass): the logo gets a thick yellow edge and a dark rim around it
    const pad = Math.round(Math.min(W, H) * 0.06);
    const inner = document.createElement("canvas"); inner.width = c.width - 2 * pad; inner.height = c.height - 2 * pad;
    drawBJLogo(inner.getContext("2d"), inner.width, inner.height, opts);
    const g = c.getContext("2d");
    const ring = (rad, color) => {
      const tint = document.createElement("canvas"); tint.width = inner.width; tint.height = inner.height;
      const tg = tint.getContext("2d"); tg.drawImage(inner, 0, 0); tg.globalCompositeOperation = "source-in"; tg.fillStyle = color; tg.fillRect(0, 0, tint.width, tint.height);
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.drawImage(tint, pad + Math.cos(a) * rad, pad + Math.sin(a) * rad); }
    };
    ring(pad * 0.95, "#2a0a04"); ring(pad * 0.62, "#ffcf2e");
    g.drawImage(inner, pad, pad);
    return c;
  }

  // MATCH PLAY neon signs: light letters with a red neon edge on a glowing red panel
  function drawMatchPlay(g, W, H, opts = {}) {
    const DW = 400, DH = 250, s = Math.min(W / DW, H / DH);
    g.save(); g.translate((W - DW * s) / 2, (H - DH * s) / 2); g.scale(s, s);
    g.lineJoin = "round";
    roundRect(g, 10, 10, opts.plus ? 330 : 380, 230, 34);
    const pg = g.createLinearGradient(0, 10, 0, 240); pg.addColorStop(0, "#e8262c"); pg.addColorStop(0.5, "#b3101a"); pg.addColorStop(1, "#6e0810");
    g.fillStyle = pg; g.fill(); g.lineWidth = 9; g.strokeStyle = "#3a0206"; g.stroke();
    roundRect(g, 22, 22, (opts.plus ? 330 : 380) - 24, 206, 26); g.lineWidth = 4; g.strokeStyle = "rgba(255,190,170,0.55)"; g.stroke();
    const word = (t, y, size) => {
      g.font = `900 ${size}px "Franklin Gothic Heavy", "Arial Black", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      const x = (opts.plus ? 330 : 380) / 2 + 10;
      g.save(); g.shadowColor = "rgba(255,60,40,0.95)"; g.shadowBlur = 18;
      g.lineWidth = 16; g.strokeStyle = "#ff3a2a"; g.strokeText(t, x, y); g.restore();
      g.lineWidth = 7; g.strokeStyle = "#7a0508"; g.strokeText(t, x, y);
      const tg = g.createLinearGradient(0, y - size / 2, 0, y + size / 2); tg.addColorStop(0, "#fffbe8"); tg.addColorStop(1, "#ffd9a0");
      g.fillStyle = tg; g.fillText(t, x, y);
    };
    word("MATCH", 82, 92); word("PLAY", 176, 92);
    if (opts.plus) {
      // the big "+" with the small PLUS tag
      g.save(); g.translate(352, 150);
      g.lineWidth = 12; g.strokeStyle = "#3a0206"; g.fillStyle = "#e3202a";
      g.beginPath(); g.rect(-14, -70, 28, 140); g.rect(-50, -14, 100, 28); g.fill(); g.stroke();
      g.beginPath(); g.rect(-14, -70, 28, 140); g.rect(-50, -14, 100, 28); g.fillStyle = "#ff4a3a"; g.fill();
      g.restore();
      g.save(); g.translate(300, 118); roundRect(g, -44, -20, 88, 40, 10);
      g.fillStyle = "#ffd23a"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#5a1a04"; g.stroke();
      g.font = `900 30px "Franklin Gothic Heavy", "Arial Black", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#c3121c"; g.fillText("PLUS", 0, 2);
      g.restore();
    }
    g.restore();
  }

  // ---------------------------------------------------------------- scene: every printed object is its own sprite
  // (game/scene.js, built by tools/build_scene.ps1). Objects linked to a lamp id ARE the lamp.
  const lamps = {};
  const SCENE = CBJ.scene && CBJ.scene.length ? CBJ.scene : null;
  const sceneLamp = {};
  // (the two ladder logos lClassic / lSuperBJ stay the original drawings, as the owner wants)
  // the small Classic BLACK JACK logos (wheel) use the big top logo of the glass, scaled down
  const BJ_LOGOS = {};
  const USE_MAIN_LOGO = { w_bj: true };
  const MP_SIGNS = {}; // Match Play signs: the original drawings stay (owner's choice)
  // Match Play wheel symbols, clockwise from the top: each is centred in its cell of the disc by what is
  // actually drawn (the sprites have uneven empty margins) and fitted to the same box
  const WHEEL_ORDER = ["w_bar", "w_csengo", "w_bj", "w_szilva", "w_citrom", "w_dinnye", "w_narancs", "w_szolo"];
  function placeOnWheel(im, id) {
    const D = L.wheelDisc; if (!D || !im.naturalWidth) return;
    const k = Math.min(1, 200 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const q = c.getContext("2d"); q.drawImage(im, 0, 0, w, h);
    let d; try { d = q.getImageData(0, 0, w, h).data; } catch { return; }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 60) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return;
    const bw = (x1 - x0 + 1) / k, bh = (y1 - y0 + 1) / k, bx = (x0 + x1 + 1) / 2 / k, by = (y0 + y1 + 1) / 2 / k;
    const a = -Math.PI / 2 + (WHEEL_ORDER.indexOf(id) * Math.PI) / 4, R = (D.r + D.inner) / 2 + 4;
    const cx = D.cx + R * Math.cos(a), cy = D.cy + R * Math.sin(a);
    const boxW = id === "w_bj" ? 172 : id === "w_bar" ? 112 : id === "w_csengo" ? 140 : 128, boxH = id === "w_bar" ? 68 : id === "w_bj" ? 126 : id === "w_csengo" ? 112 : 100;
    const s = Math.min(boxW / bw, boxH / bh);
    Object.assign(im.style, { left: cx - bx * s + "px", top: cy - by * s + "px", width: im.naturalWidth * s + "px", height: im.naturalHeight * s + "px" });
  }
  // printed parts redrawn in code instead of their sprite (the sprite had "KĂRTYA" instead of "KÁRTYA")
  const CODE_DRAWN = { kerekSign: true };
  const whenFontsReady = (fn) => (document.fonts && document.fonts.load ? Promise.all([document.fonts.load(`italic 700 60px ${LOGO_SCRIPT}`), document.fonts.load(`900 60px ${LOGO_SLAB}`)]).then(fn, fn) : fn());
  if (SCENE) {
    document.body.classList.add("scene");
    $("topBase").src = "assets/top_bg.png";
    for (const o of SCENE) {
      if (CODE_DRAWN[o.id]) continue;
      const im = document.createElement("img");
      im.src = o.src; im.alt = ""; im.draggable = false;
      im.className = `obj z${o.z || 2}` + (o.lamp ? " lamp" : "");
      if (o.lamp) im.dataset.id = o.lamp;
      Object.assign(im.style, { left: o.rect[0] + "px", top: o.rect[1] + "px", width: o.rect[2] + "px", height: o.rect[3] + "px" });
      $(o.panel === "top" ? "topObjects" : "reelObjects").appendChild(im);
      if (o.lamp) { lamps[o.lamp] = im; sceneLamp[o.lamp] = true; }
      // the Classic BLACK JACK logos are drawn crisp instead of the blurry photo sprites
      if (BJ_LOGOS[o.id]) {
        const k = BJ_LOGOS[o.id].grow || 1, r = o.rect, w = r[2] * k, h = r[3] * k;
        // a little bigger than the photo sprite so the letters on the tiles stay readable (kept on its podium)
        if (k !== 1) Object.assign(im.style, { left: r[0] + (r[2] - w) / 2 + "px", top: r[1] + r[3] - h + "px", width: w + "px", height: h + "px" });
        whenFontsReady(() => { im.src = bjLogoCanvas(w * 3, h * 3, BJ_LOGOS[o.id]).toDataURL(); });
      }
      // the big top logo on a peach sticker plate (assets/sprites/bj.png, made with tools/add_rim.py)
      if (USE_MAIN_LOGO[o.id]) im.src = "assets/sprites/bj.png";
      if (WHEEL_ORDER.includes(o.id)) im.addEventListener("load", () => { placeOnWheel(im, o.id); delete im.dataset.tw; sharpenImages(); }, { once: true });
      if (MP_SIGNS[o.id]) {
        const c = document.createElement("canvas"); c.width = Math.round(o.rect[2] * 3); c.height = Math.round(o.rect[3] * 3);
        drawMatchPlay(c.getContext("2d"), c.width, c.height, MP_SIGNS[o.id]);
        im.src = c.toDataURL();
      }
    }
    // track fields: the whole track is one drawn object; each field's lamp is a clipped, brighter copy of it
    const clipLamp = (whole, id, R, parentId) => {
      const d = document.createElement("div");
      d.className = "obj z2 lamp cliplamp"; d.dataset.id = id;
      Object.assign(d.style, { left: R[0] + "px", top: R[1] + "px", width: R[2] + "px", height: R[3] + "px" });
      const im = document.createElement("img");
      im.src = whole.src; im.alt = ""; im.draggable = false;
      Object.assign(im.style, { position: "absolute", left: whole.rect[0] - R[0] + "px", top: whole.rect[1] - R[1] + "px", width: whole.rect[2] + "px", height: whole.rect[3] + "px" });
      d.appendChild(im);
      $(parentId).appendChild(d);
      lamps[id] = d; sceneLamp[id] = true;
    };
    const track = SCENE.find((o) => o.id === "trackWhole");
    // numbers in the empty circles of the track and of the 17–21 column — only where the circle itself is drawn.
    // Same height for every number; two-digit numbers are squeezed, not shrunk.
    const num = (n, cx, cy, d, disc, lampId) => {
      if (lampId) {
        // the lamp: the same disc, lit — warm glowing face with a dark red number
        const L2 = document.createElement("canvas"), k = 3, D = d * 1.5;
        L2.width = D * k; L2.height = D * k; L2.className = "num lamp cliplamp disclamp"; L2.dataset.id = lampId;
        Object.assign(L2.style, { left: cx - D / 2 + "px", top: cy - D / 2 + "px", width: D + "px", height: D + "px", zIndex: 5 });
        const q = L2.getContext("2d"); q.scale(k, k);
        const r0 = d / 2 - 3;
        const glow = q.createRadialGradient(D / 2, D / 2, r0 * 0.6, D / 2, D / 2, D / 2);
        glow.addColorStop(0, "rgba(255,200,80,0.75)"); glow.addColorStop(1, "rgba(255,120,0,0)");
        q.fillStyle = glow; q.fillRect(0, 0, D, D);
        const face = q.createRadialGradient(D / 2 - r0 * 0.3, D / 2 - r0 * 0.35, r0 * 0.1, D / 2, D / 2, r0);
        face.addColorStop(0, "#fffbe0"); face.addColorStop(0.5, "#ffd24a"); face.addColorStop(1, "#ff8a00");
        q.beginPath(); q.arc(D / 2, D / 2, r0, 0, Math.PI * 2); q.fillStyle = face; q.fill();
        q.lineWidth = 2.5; q.strokeStyle = "#fff2b0"; q.stroke();
        q.font = `${d * 0.66}px ${MFONT}`; q.textAlign = "center"; q.textBaseline = "alphabetic";
        const mm = q.measureText(String(n)), sq2 = String(n).length > 1 ? 0.8 : 1;
        q.save(); q.translate(D / 2, D / 2 + (mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent) / 2); q.scale(sq2, 1);
        q.fillStyle = "#7a0a0a"; q.fillText(String(n), 0, 0); q.restore();
        $("topObjects").appendChild(L2);
        lamps[lampId] = L2; sceneLamp[lampId] = true;
      }
      const c = document.createElement("canvas");
      const k = 3, size = d * 0.66;
      c.width = d * k; c.height = d * k; c.className = "num";
      Object.assign(c.style, { left: cx - d / 2 + "px", top: cy - d / 2 + "px", width: d + "px", height: d + "px" });
      const g = c.getContext("2d"); g.scale(k, k);
      if (disc) {
        const rg = g.createRadialGradient(d * 0.45, d * 0.4, d * 0.05, d / 2, d / 2, d / 2);
        rg.addColorStop(0, "#3a1a14"); rg.addColorStop(1, "#140605");
        g.beginPath(); g.arc(d / 2, d / 2, d / 2 - 3, 0, Math.PI * 2); g.fillStyle = rg; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = "#d9c27a"; g.stroke();
        g.beginPath(); g.arc(d / 2, d / 2, d / 2 - 1, 0, Math.PI * 2); g.lineWidth = 1.5; g.strokeStyle = "rgba(0,0,0,0.6)"; g.stroke();
      }
      // centre on the real glyph box, not on the font's baseline
      g.font = `${size}px ${MFONT}`; g.textAlign = "center"; g.textBaseline = "alphabetic";
      const m = g.measureText(String(n));
      const sq = String(n).length > 1 ? 0.8 : 1;
      const offX = ((m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2) * sq;
      const offY = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      g.textBaseline = "alphabetic";
      machineTextAt(g, String(n), d / 2 + offX, d / 2 + offY, size, "bright", sq);
      $("topObjects").appendChild(c);
    };
    // code-drawn parts: KISEBB / NAGYOBB lamps, the card wheel window frame and its label
    const codeParts = [];
    const codeCanvas = (parentId, rect, z, lampId) => {
      const c = document.createElement("canvas"), k = 2;
      codeParts.push(c);
      c.width = rect[2] * k; c.height = rect[3] * k;
      c.className = `obj z${z}` + (lampId ? " lamp" : "");
      Object.assign(c.style, { left: rect[0] + "px", top: rect[1] + "px", width: rect[2] + "px", height: rect[3] + "px" });
      $(parentId).appendChild(c);
      if (lampId) { c.dataset.id = lampId; lamps[lampId] = c; sceneLamp[lampId] = true; }
      const g = c.getContext("2d"); g.scale(k, k);
      return g;
    };
    const plaque = (g, w, h, r) => {
      roundRect(g, 2, 2, w - 4, h - 4, r);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#5a0a10"); gr.addColorStop(1, "#2a0306");
      g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = "#c0141c"; g.stroke();
    };
    // the steel-blue "podium" every ladder sign stands on (as under the 25/175 and the 4)
    const podium = (g, w, h) => {
      const top = h * 0.68, inset = w * 0.09, flare = w * 0.025;
      g.lineJoin = "round";
      // front band
      g.beginPath();
      g.moveTo(3, top); g.lineTo(w - 3, top); g.lineTo(w - 3 + flare * 0.2, h - 4);
      g.quadraticCurveTo(w - 3, h - 1, w - 12, h - 2); g.lineTo(12, h - 2); g.quadraticCurveTo(3, h - 1, 3 - flare * 0.2, h - 4); g.closePath();
      const band = g.createLinearGradient(0, top, 0, h); band.addColorStop(0, "#4a5668"); band.addColorStop(0.4, "#2a3240"); band.addColorStop(1, "#151a22");
      g.fillStyle = band; g.fill(); g.lineWidth = 3; g.strokeStyle = "#0b0e14"; g.stroke();
      // top face
      g.beginPath();
      g.moveTo(3 + inset, 4); g.lineTo(w - 3 - inset, 4); g.quadraticCurveTo(w - 3 - inset * 0.4, 6, w - 3, top); g.lineTo(3, top);
      g.quadraticCurveTo(3 + inset * 0.4, 6, 3 + inset, 4); g.closePath();
      const face = g.createLinearGradient(0, 0, w, top); face.addColorStop(0, "#9eaec0"); face.addColorStop(0.45, "#6a7b90"); face.addColorStop(1, "#3a4658");
      g.fillStyle = face; g.fill(); g.lineWidth = 3; g.strokeStyle = "#0b0e14"; g.stroke();
      const sheen = g.createLinearGradient(0, 4, 0, top); sheen.addColorStop(0, "rgba(255,255,255,0.22)"); sheen.addColorStop(0.5, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(0,0,0,0.18)");
      g.fillStyle = sheen; g.fill();
      g.beginPath(); g.moveTo(6, top + 2.5); g.lineTo(w - 6, top + 2.5); g.lineWidth = 1.5; g.strokeStyle = "rgba(150,168,190,0.45)"; g.stroke();
    };
    // the Match Play wheel as on the owner's photo: one red disc with a thin gold rim, a slightly lighter
    // middle with a darker ring around it, no segments
    const wheelDisc = (g, r, ri) => {
      const disc = (rad, fill) => { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
      disc(r, "#3a1a04");
      const gold = g.createLinearGradient(0, -r, 0, r); gold.addColorStop(0, "#ffd66a"); gold.addColorStop(0.5, "#d99a28"); gold.addColorStop(1, "#8a5a10");
      disc(r - 3, gold);
      disc(r - 12, "#4a0610");
      const red = g.createRadialGradient(0, 0, ri * 0.8, 0, 0, r - 14);
      red.addColorStop(0, "#d51d2a"); red.addColorStop(0.7, "#c01522"); red.addColorStop(1, "#8e0c18");
      disc(r - 15, red);
      // the eight dark cells the symbols sit in, as on the photo: wedge-shaped, rounded, red spokes between them
      const c0 = ri + 16, c1 = r - 24, half = Math.PI / 8 - 0.07;
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 4;
        g.beginPath();
        g.arc(0, 0, c1, a - half, a + half);
        g.arc(0, 0, c0, a + half * 0.84, a - half * 0.84, true);
        g.closePath();
        const cell = g.createRadialGradient(0, 0, c0, 0, 0, c1);
        cell.addColorStop(0, "#3a0408"); cell.addColorStop(0.6, "#52070f"); cell.addColorStop(1, "#420509");
        g.lineJoin = "round"; g.lineWidth = 14; g.strokeStyle = cell; g.fillStyle = cell;
        g.stroke(); g.fill();
        g.lineWidth = 2; g.strokeStyle = "rgba(255,120,120,0.18)"; g.stroke();
      }
      disc(ri + 6, "#7a0a16");
      const mid = g.createRadialGradient(-ri * 0.2, -ri * 0.25, ri * 0.1, 0, 0, ri);
      mid.addColorStop(0, "#f04656"); mid.addColorStop(0.7, "#d42234"); mid.addColorStop(1, "#b0142a");
      disc(ri, mid);
    };
    const drawCodeParts = () => {
      codeParts.splice(0).forEach((c) => c.remove());
      for (const R of L.ladderPodiums || []) podium(codeCanvas("topObjects", R, 1, null), R[2], R[3]);
      // (code-drawn pay plaques switched off: the original drawings with their BONUS ribbons are back)
      if (L.bjPlaques && L.bjPlaquesDrawn) for (const [kind, P] of Object.entries(L.bjPlaques)) {
        const pays = cfg.blackjack && cfg.blackjack.pay[kind === "super" ? "superbj" : "classicbj"];
        for (const [pts, y] of Object.entries(P.y)) {
          const id = (kind === "super" ? "bps_" : "bpc_") + pts, R = [P.x, y, P.w, P.h];
          payPlaque(codeCanvas("topObjects", R, 2, id), P.w, P.h, String(pays ? pays[pts] : ""));
        }
      }
      // sun rays behind EXTRA LÉPÉS: turn slowly, shine up when the help is yours
      for (const S of L.sunbursts || []) {
        const R = [S.cx - S.r, S.cy - S.r, S.r * 2, S.r * 2];
        const g = codeCanvas("topObjects", R, 1, null);
        g.canvas.classList.add("sunburst"); if (S.soft) g.canvas.classList.add("soft"); g.canvas.dataset.for = S.for;
        g.translate(S.r, S.r);
        const n = S.soft ? 20 : 16;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n / 2;
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, S.r, a0, a1); g.closePath();
          const rg = g.createRadialGradient(0, 0, S.r * 0.15, 0, 0, S.r);
          rg.addColorStop(0, k % 2 ? "rgba(255,244,170,0.95)" : "rgba(255,210,90,0.95)"); rg.addColorStop(0.6, "rgba(255,170,40,0.5)"); rg.addColorStop(1, "rgba(255,140,20,0)");
          g.fillStyle = rg; g.fill();
        }
        const core = g.createRadialGradient(0, 0, 0, 0, 0, S.r * 0.55);
        core.addColorStop(0, "rgba(255,250,210,0.9)"); core.addColorStop(1, "rgba(255,220,120,0)");
        g.fillStyle = core; g.beginPath(); g.arc(0, 0, S.r * 0.55, 0, Math.PI * 2); g.fill();
      }
      if (L.wheelDisc) {
        const D = L.wheelDisc, R = [D.cx - D.r - 6, D.cy - D.r - 6, D.r * 2 + 12, D.r * 2 + 12];
        const g = codeCanvas("topObjects", R, 1, null);
        g.translate(D.r + 6, D.r + 6);
        wheelDisc(g, D.r, D.inner);
      }
      for (const [id, text] of [["kisebb", "KISEBB"], ["nagyobb", "NAGYOBB"]]) {
        const r = L[id], R = [r[0] - 6, r[1] - 8, r[2] + 12, r[3] + 16];
        const g = codeCanvas("reelObjects", R, 2, id);
        plaque(g, R[2], R[3], 12);
        machineText(g, text, R[2] / 2, R[3] / 2 + 2, R[3] * 0.62, "fire");
      }
      // the collected cards 2..9 on the blue ribbon (bottom 2, top 9), each its own lamp
      const suitOf = { 2: "h", 3: "s", 4: "d", 5: "c", 6: "h", 7: "s", 8: "d", 9: "c" };
      Object.entries(L.collect).forEach(([rank, r], i) => {
        const R = [r[0] - 14, r[1] - 12, r[2] + 28, r[3] + 24];
        const g = codeCanvas("reelObjects", R, 2, "c_" + rank);
        g.translate(R[2] / 2, R[3] / 2); g.rotate((i % 2 ? -1 : 1) * 0.1);
        drawPlayingCard(g, rank, suitOf[rank], r[2] * 0.94, r[3] * 0.94);
      });
      // multiplier panels as on the machine: light-blue glass cards in a silver rim, leaning left and right in turn
      // so the column zigzags; red "X6" on a dark red cushion, below it the cards (or suit signs) it pays for
      const multiLook = {
        x6: { label: "X6", cards: ["K", "A"], lean: 1 },
        x3: { label: "X3", cards: ["J", "Q", "K", "A"], lean: -1 },
        x2b: { label: "X2", pips: ["c", "s"], lean: 1 },
        x2r: { label: "X2", pips: ["h", "d"], lean: -1 },
        x1: { label: "X1½", cards: ["2", "3", "4", "5", "6", "7", "8", "9"], lean: 1 },
      };
      for (const [id, r] of Object.entries(L.multi)) {
        const look = multiLook[id];
        const R = [r[0] - 6, r[1] - 6, r[2] + 12, r[3] + 12];
        const g = codeCanvas("reelObjects", R, 2, "m_" + id);
        const imgs = (look.cards || []).map(cardImage);
        Promise.all(imgs.map(imgReady)).then(() => drawMultiPanel(g, R[2], R[3], look, imgs));
      }
      const w = L.cardWheel, F = [w.x - 16, w.y - 14, w.w + 32, w.h + 28];
      const g = codeCanvas("reelObjects", F, 3, null);
      const rr = (x, y, ww, hh, r) => { g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
      g.beginPath(); rr(0, 0, F[2], F[3], 22); rr(16, 14, w.w, w.h, 14);
      const gr = g.createLinearGradient(0, 0, F[2], F[3]); gr.addColorStop(0, "#ff4a3a"); gr.addColorStop(0.5, "#d0141e"); gr.addColorStop(1, "#7a0710");
      g.fillStyle = gr; g.fill("evenodd");
      g.lineWidth = 2.5; g.strokeStyle = "#3a0206"; g.stroke();
      g.beginPath(); roundRect(g, 16, 14, w.w, w.h, 14); g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.45)"; g.stroke();
      const S = [w.x + w.w / 2 - 22, w.y + w.h + 14, 44, 40];
      const gs = codeCanvas("reelObjects", S, 2, null);
      const sg = gs.createLinearGradient(0, 0, 44, 0); sg.addColorStop(0, "#8a0a12"); sg.addColorStop(0.5, "#e0202a"); sg.addColorStop(1, "#8a0a12");
      gs.fillStyle = sg; gs.fillRect(0, 0, 44, 40);
      // KÁRTYA KERÉK above the card wheel (fanned gold letter tiles) and SOK SZERENCSÉT below it (arched plaque)
      const Kb = [w.x - 32, w.y - 150, w.w + 64, 150];
      const gk = codeCanvas("reelObjects", Kb, 3, null);
      const Lb = [w.x - 18, w.y + w.h + 36, w.w + 36, 94];
      const gl = codeCanvas("reelObjects", Lb, 3, null);
      document.fonts.load(`40px ${WFONT}`).then(() => { kerekSign(gk, Kb[2], Kb[3]); luckSign(gl, Lb[2], Lb[3]); });
    };
    drawCodeParts();
    const drawNums = () => {
      drawCodeParts();
      refreshLamps();
      // track: numbers go exactly onto the circles found in the drawn track (nearest one to each field)
      const circles = (CBJ.trackCircles || []).slice();
      L.bjTrack.forEach((r, i) => {
        if (!track) return;
        let cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2, d = 56;
        if (circles.length) {
          let bi = 0, bd = Infinity;
          circles.forEach((c, k) => { const dd = (c.x - cx) ** 2 + (c.y - cy) ** 2; if (dd < bd) { bd = dd; bi = k; } });
          const c = circles.splice(bi, 1)[0];
          cx = c.x; cy = c.y; d = Math.max(50, c.r * 2 * 1.35);
        }
        num(i + 1, cx, cy, d, true, "t_" + (i + 1));
      });
      // 17–21: centre of each placed circle sprite
      for (const o of SCENE) if (o.id === "bjCircle" && o.lamp) {
        const p = o.lamp.slice(3);
        num(p, o.rect[0] + o.rect[2] / 2, o.rect[1] + o.rect[3] / 2, Math.min(o.rect[2], o.rect[3]) * 0.62);
      }
    };
    (document.fonts && document.fonts.load ? document.fonts.load(`40px ${MFONT}`) : Promise.resolve()).then(drawNums, drawNums);
  }

  // Lamps without a redrawn sprite yet fall back to a cut-out layer (assets/lamps/<id>.png) over the base image.
  const LR = CBJ.lampRects || { top: {}, reel: {} };
  function makeLamp(parent, id, r, opts = {}) {
    if (sceneLamp[id]) {
      const el = lamps[id];
      if (opts.onClick) { el.classList.add("clickable"); el.addEventListener("click", opts.onClick); }
      return;
    }
    const panel = parent.id === "topLamps" ? "top" : "reel";
    const rect = LR[panel][id] || r;
    const d = document.createElement("div");
    d.className = "lamp" + (opts.cls ? " " + opts.cls : "");
    d.dataset.id = id;
    Object.assign(d.style, { left: rect[0] + "px", top: rect[1] + "px", width: rect[2] + "px", height: rect[3] + "px" });
    if (LR[panel][id]) {
      const im = document.createElement("img");
      im.src = `assets/lamps/${id}.png`;
      im.alt = "";
      im.draggable = false;
      d.appendChild(im);
    } else {
      d.classList.add("nolayer");
    }
    if (opts.onClick) { d.classList.add("clickable"); d.addEventListener("click", opts.onClick); }
    parent.appendChild(d);
    lamps[id] = d;
  }
  function setLamp(id, state) {
    const d = lamps[id];
    if (!d) return;
    d.classList.remove("on", "blink", "fast");
    if (state === "on") d.classList.add("on");
    else if (state === "blink") d.classList.add("blink");
    else if (state === "fast") d.classList.add("blink", "fast");
  }

  const topL = $("topLamps"), reelL = $("reelLamps");
  for (const [id, r] of Object.entries(L.ladder)) makeLamp(topL, id, r);
  for (const [sym, r] of Object.entries(L.wheel)) makeLamp(topL, "w_" + sym, r, { round: true });
  makeLamp(topL, "wc", L.wheelCenter, { round: true });
  L.roundLamps.forEach((r, i) => makeLamp(topL, "rc" + (i + 1), r));
  makeLamp(topL, "plus", L.plus);
  makeLamp(topL, "stop", L.stop);
  makeLamp(topL, "lepesFel", L.lepesFel);
  makeLamp(topL, "lepesLe", L.lepesLe);
  for (const [k, r] of Object.entries(L.helps)) makeLamp(topL, "h_" + k, r);
  L.triangles.forEach((r, i) => makeLamp(topL, "tri" + i, r, { cls: "tri", onClick: () => onTriangle(i) }));
  makeLamp(topL, "joker", L.joker, { round: true });
  L.bjTrack.forEach((r, i) => makeLamp(topL, "t_" + (i + 1), r, { round: true }));
  for (const [p, r] of Object.entries(L.bjCircle)) makeLamp(topL, "bc_" + p, r, { round: true });
  for (const [p, r] of Object.entries(L.bjPaySuper)) makeLamp(topL, "bps_" + p, r);
  for (const [p, r] of Object.entries(L.bjPayClassic)) makeLamp(topL, "bpc_" + p, r);
  makeLamp(topL, "hdrSuper", L.bjHdrSuper);
  makeLamp(topL, "hdrDupla", L.bjHdrDupla);
  makeLamp(topL, "hdrClassic", L.bjHdrClassic);
  for (const [rank, r] of Object.entries(L.collect)) makeLamp(reelL, "c_" + rank, r);
  for (const [id, r] of Object.entries(L.multi)) makeLamp(reelL, "m_" + id, r);
  makeLamp(reelL, "kisebb", L.kisebb);
  makeLamp(reelL, "nagyobb", L.nagyobb);
  const cr = L.cardRow, cw = cr.w / cr.n;
  cfg.ranks.forEach((r, i) => makeLamp(reelL, "r_" + r, [Math.round(cr.x + i * cw), cr.y, Math.round(cw), cr.h]));

  const disp = $("display"), dd = L.display;
  Object.assign(disp.style, { left: dd[0] + "px", top: dd[1] + "px", width: dd[2] + "px", height: dd[3] + "px" });
  const sl = $("ledStake"), s0 = L.stakeLed;
  Object.assign(sl.style, { left: s0[0] + "px", top: s0[1] + "px", width: s0[2] + "px", height: s0[3] + "px" });

  // ---------------------------------------------------------------- sprites
  const sprites = {};
  const loadSprites = () => Promise.all(Object.keys(cfg.symbols).map((n) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { const inf = (spriteInfo[n] = measureSprite(im)); sprites[n] = inf ? litSprite(im, inf) : im; res(); };
    im.onerror = () => res();
    im.src = `assets/sprites/${n}.png`;
  })));
  // The fruit drawings differ in shape and in empty margin, so fitting each into the same box makes some look
  // much bigger than others. Instead every symbol is drawn so its visible (opaque) area is the same.
  // The BAR plate and the logo keep the plain box fit.
  const spriteInfo = {};
  const BOX_FIT = { bar: true, bj: true };
  // light on every symbol for a 3D look, as if lit from the upper left inside the machine:
  // a soft glow on the upper left of the shape, shade towards the lower right (only over the drawing itself)
  function litSprite(im, inf) {
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const g = c.getContext("2d");
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = "source-atop";
    const R = Math.max(inf.sw, inf.sh);
    const lx = inf.sx + inf.sw * 0.3, ly = inf.sy + inf.sh * 0.22;
    const gr = g.createRadialGradient(lx, ly, R * 0.02, lx, ly, R * 0.95);
    gr.addColorStop(0, "rgba(255,255,245,0.42)"); gr.addColorStop(0.3, "rgba(255,255,245,0.1)");
    gr.addColorStop(0.55, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(30,10,0,0.42)");
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function measureSprite(im) {
    const k = Math.min(1, 160 / Math.max(im.width, im.height));
    const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const q = c.getContext("2d"); q.drawImage(im, 0, 0, w, h);
    let d;
    try { d = q.getImageData(0, 0, w, h).data; } catch { return null; }
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) {
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    return { sx: x0 / k, sy: y0 / k, sw: bw / k, sh: bh / k, fill: n / (bw * bh) };
  }
  // A big drawing shrunk ~10x in one drawImage comes out soft and grainy. Keep a chain of halved copies
  // (made with high quality smoothing) and always draw from the one just above the target size.
  const mipCache = new WeakMap();
  function mipFor(im, sw, dw) {
    let chain = mipCache.get(im);
    if (!chain) mipCache.set(im, (chain = [im]));
    let i = 0;
    for (;;) {
      const cur = chain[i];
      if ((sw * cur.width) / im.width / 2 < dw * 1.1 || cur.width < 16) return { img: cur, k: cur.width / im.width };
      if (!chain[i + 1]) {
        const h = document.createElement("canvas");
        h.width = Math.max(1, Math.round(cur.width / 2)); h.height = Math.max(1, Math.round(cur.height / 2));
        const q = h.getContext("2d"); q.imageSmoothingQuality = "high"; q.drawImage(cur, 0, 0, h.width, h.height);
        chain.push(h);
      }
      i++;
    }
  }
  function drawScaled(g, im, sx, sy, sw, sh, dx, dy, dw, dh) {
    const scale = Math.abs(g.getTransform().a) || 1;
    const { img, k } = mipFor(im, sw, dw * scale);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, sx * k, sy * k, sw * k, sh * k, dx, dy, dw, dh);
  }
  // draw symbol s centred on (cx, cy): same visible area (area * box^2) for every fruit, never beyond maxW x maxH
  function drawSprite(g, s, cx, cy, box, maxW, maxH, area = 0.75) {
    const im = sprites[s], inf = spriteInfo[s];
    if (!im) return;
    if (!inf || BOX_FIT[s]) {
      let h = maxH, w = (im.width * h) / im.height;
      if (w > maxW) { w = maxW; h = (im.height * w) / im.width; }
      drawScaled(g, im, 0, 0, im.width, im.height, cx - w / 2, cy - h / 2, w, h);
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }
    const aspect = inf.sw / inf.sh;
    let h = Math.sqrt((area * box * box) / (inf.fill * aspect)), w = h * aspect;
    const k = Math.min(1, maxW / w, maxH / h);
    w *= k; h *= k;
    drawScaled(g, im, inf.sx, inf.sy, inf.sw, inf.sh, cx - w / 2, cy - h / 2, w, h);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // ---------------------------------------------------------------- pay table, drawn from config (scene mode)
  function drawPaytable() {
    const c = $("paytable");
    const X = 30, Y = 852, W = 1180, H = 268;
    Object.assign(c.style, { left: X + "px", top: Y + "px", width: W + "px", height: H + "px" });
    c.width = W * 2; c.height = H * 2;
    const g = c.getContext("2d");
    g.setTransform(2, 0, 0, 2, 0, 0);
    roundRect(g, 4, 4, W - 8, H - 8, 26);
    g.fillStyle = "#5a0d18"; g.fill();
    roundRect(g, 18, 16, W - 36, H - 32, 18);
    const bg = g.createLinearGradient(0, 16, 0, H - 16);
    bg.addColorStop(0, "#c9e9f5"); bg.addColorStop(1, "#8fc6de");
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = "#e9f7fb"; g.stroke();

    const rows = [];
    for (const [s, m] of Object.entries(cfg.pay4).sort((a, b) => b[1] - a[1])) rows.push({ syms: [s, s, s, s], m });
    for (const [s, m] of Object.entries(cfg.pay3).sort((a, b) => b[1] - a[1])) rows.push({ syms: [s, s, s, null], m });
    const perCol = 5, colW = 210, rowH = (H - 40) / perCol;
    const num = (x, y, t) => machineText(g, String(t), x + 22, y + 1, 34, "fire", String(t).length > 1 ? 0.85 : 1);
    const sym = (s, x, y, h) => {
      const im = sprites[s];
      if (!s) { g.fillStyle = "#b11d27"; roundRect(g, x + 6, y - 5, h * 0.8, 10, 5); g.fill(); return; }
      if (!im) return;
      drawSprite(g, s, x + (h * 1.15) / 2, y, h, h * 1.15, h * 1.1);
    };
    rows.forEach((r, i) => {
      const col = Math.floor(i / perCol), row = i % perCol;
      const x = 34 + col * colW, y = 20 + rowH * (row + 0.5);
      r.syms.forEach((s, k) => sym(s, x + k * 36, y, 32));
      num(x + 150, y, r.m);
    });
    // runs from the edge (cherry, star): 3 / 2 / 1
    const runs = Object.entries(cfg.runPay);
    runs.forEach(([s, pays], j) => {
      const x = 34 + 4 * colW + j * 150;
      [3, 2, 1].forEach((n, k) => {
        const y = 20 + ((H - 40) / 3) * (k + 0.5);
        for (let q = 0; q < 3; q++) sym(q < n ? s : null, x + q * 30, y, 28);
        num(x + 96, y, pays[n]);
      });
    });
  }

  // ---------------------------------------------------------------- printed strips (redrawn from the game's own reel order)
  function makeStripCanvas(line) {
    const w = L.printedStripW, dx = line.x1 - line.x0, dy = line.y1 - line.y0, len = Math.hypot(dx, dy);
    const c = document.createElement("canvas");
    c.className = "strip";
    Object.assign(c.style, {
      left: line.x0 - w / 2 + "px", top: line.y0 + "px", width: w + "px", height: len + "px",
      transformOrigin: "50% 0", transform: `rotate(${Math.atan2(-dx, dy)}rad)`,
    });
    c.width = w * 3; c.height = Math.round(len * 3);
    const g = c.getContext("2d");
    g.setTransform(3, 0, 0, 3, 0, 0);
    $("reelGlass").insertBefore(c, $("reelLamps"));
    return { g, w, len };
  }
  function stripFrame(g, w, len) {
    roundRect(g, 0.5, 0.5, w - 1, len - 1, 4);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#cfc8b5"); gr.addColorStop(0.5, "#f6f1e2"); gr.addColorStop(1, "#cfc8b5");
    g.fillStyle = gr; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = "#3d3a33"; g.stroke();
  }
  // one printed strip per reel, straight, just right of its frame (between the frames), above the glass
  function stripLines() {
    if (frameWins.length !== 4) return L.printedStrips;
    const win = frameWins.map((f) => f.window);
    return win.map((w, i) => {
      const right = w[0] + w[2];
      const gap = i < 3 ? win[i + 1][0] - right : win[2][0] + win[2][2] < win[3][0] ? win[3][0] - (win[2][0] + win[2][2]) : 80;
      const x = right + gap / 2;
      return { x0: x, y0: w[1] - 10, x1: x, y1: w[1] + w[3] + 10 };
    });
  }
  function drawPrintedStrips() {
    stripLines().forEach((line, i) => {
      const { g, w, len } = makeStripCanvas(line);
      stripFrame(g, w, len);
      const strip = M.strips[i], ch = len / strip.length;
      strip.forEach((cell, k) => {
        const y = k * ch;
        if (k) { g.fillStyle = "rgba(60,55,45,0.45)"; g.fillRect(3, y, w - 6, 0.8); }
        const im = sprites[cell.s];
        if (!im) return;
        drawSprite(g, cell.s, w / 2, y + ch / 2, ch * 0.8, w - 6, ch * 0.86);
      });
    });
  }

  // ---------------------------------------------------------------- reels + card wheel
  // reels sit behind their drawn frames: size, place and tilt come from the frame's measured window
  const frameWins = SCENE ? SCENE.filter((o) => o.window).sort((a, b) => a.rect[0] - b.rect[0]) : [];
  const reels = L.reels.map((hole0, i) => {
    const fw = frameWins[i];
    const hole = fw ? { x: fw.window[0], y: fw.window[1], w: fw.window[2], h: fw.window[3], tilt: fw.window[4] } : { ...hole0, tilt: 0 };
    const c = $("reel" + i);
    if (fw) {
      const m = `url(${fw.mask})`;
      Object.assign(c.style, { maskImage: m, webkitMaskImage: m, maskSize: "100% 100%", webkitMaskSize: "100% 100%", borderRadius: "0" });
    }
    Object.assign(c.style, { left: hole.x + "px", top: hole.y + "px", width: hole.w + "px", height: hole.h + "px" });
    c.width = hole.w * 3; c.height = hole.h * 3;
    return { c, g: c.getContext("2d"), hole, W: hole.w, H: hole.h, k: 3, pos: M.s.stops[i], anim: null, speed: 0 };
  });
  const cardWheel = (() => {
    const w = L.cardWheel, c = $("cardWheel");
    Object.assign(c.style, { left: w.x + "px", top: w.y + "px", width: w.w + "px", height: w.h + "px" });
    c.width = w.w * 2; c.height = w.h * 2;
    return { c, g: c.getContext("2d"), W: w.w, H: w.h, k: 2, pos: M.s.cardPos, anim: null, speed: 0 };
  })();
  let winMark = null;
  let riskRun = false; // the "risk it at 20" run is on (Kisebb/Nagyobb)
  let nudgeSel = null; // reel chosen with TART during Super lépések

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---- card graphics in the machine's style: light blue cards, heavy outlined letters, vector pips

  function pipPath(g, suit, s) {
    g.beginPath();
    if (suit === "d") {
      g.moveTo(0, -s); g.lineTo(s * 0.72, 0); g.lineTo(0, s); g.lineTo(-s * 0.72, 0); g.closePath();
    } else if (suit === "h") {
      g.moveTo(0, s * 0.95);
      g.bezierCurveTo(-s * 1.25, s * 0.05, -s * 0.95, -s * 1.05, 0, -s * 0.42);
      g.bezierCurveTo(s * 0.95, -s * 1.05, s * 1.25, s * 0.05, 0, s * 0.95);
    } else if (suit === "s") {
      g.moveTo(0, -s);
      g.bezierCurveTo(s * 1.3, -s * 0.05, s * 0.75, s * 0.85, 0, s * 0.38);
      g.bezierCurveTo(-s * 0.75, s * 0.85, -s * 1.3, -s * 0.05, 0, -s);
      g.moveTo(0, s * 0.2); g.lineTo(s * 0.32, s); g.lineTo(-s * 0.32, s); g.closePath();
    } else {
      const r = s * 0.42;
      g.arc(0, -s * 0.5, r, 0, Math.PI * 2);
      g.moveTo(-s * 0.48 + r, s * 0.08); g.arc(-s * 0.48, s * 0.08, r, 0, Math.PI * 2);
      g.moveTo(s * 0.48 + r, s * 0.08); g.arc(s * 0.48, s * 0.08, r, 0, Math.PI * 2);
      g.moveTo(0, -s * 0.1); g.lineTo(s * 0.3, s); g.lineTo(-s * 0.3, s); g.closePath();
    }
  }
  function drawPip(g, suit, x, y, s) {
    const c = ink(suit);
    g.save(); g.translate(x, y);
    pipPath(g, suit, s);
    const gr = g.createLinearGradient(0, -s, 0, s);
    gr.addColorStop(0, c.fill[0]); gr.addColorStop(0.45, c.fill[1]); gr.addColorStop(1, c.fill[2]);
    g.fillStyle = gr; g.fill("nonzero");
    g.lineWidth = Math.max(1, s * 0.09); g.strokeStyle = c.line; g.stroke();
    g.restore();
  }
  function blueCard(g, x, y, w, h, r) {
    g.save();
    g.shadowColor = "rgba(40,60,80,0.35)"; g.shadowBlur = 5; g.shadowOffsetY = 2;
    roundRect(g, x, y, w, h, r);
    const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h);
    gr.addColorStop(0, "#e6f6fb"); gr.addColorStop(0.55, "#bfe2ee"); gr.addColorStop(1, "#98c9dc");
    g.fillStyle = gr; g.fill();
    g.restore();
    roundRect(g, x, y, w, h, r);
    g.lineWidth = Math.max(1.5, w * 0.045); g.strokeStyle = "#5b93ab"; g.stroke();
    roundRect(g, x + w * 0.1, y + w * 0.1, w * 0.8, h - w * 0.2, r * 0.6);
    g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,0.8)"; g.stroke();
  }
  function bigLetter(g, text, suit, x, y, size) {
    const c = ink(suit);
    g.save();
    g.font = `${size}px ${MFONT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = size * 0.16; g.strokeStyle = c.line; g.strokeText(text, x, y);
    const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    gr.addColorStop(0, c.fill[0]); gr.addColorStop(0.5, c.fill[1]); gr.addColorStop(1, c.fill[2]);
    g.fillStyle = gr; g.fillText(text, x, y);
    g.globalAlpha = 0.55; g.lineWidth = size * 0.035; g.strokeStyle = "#ffffff";
    g.strokeText(text, x - size * 0.03, y - size * 0.03);
    g.restore();
  }

  // ---- KÁRTYA KERÉK / SOK SZERENCSÉT: gold with dark brown western letters (WFONT), bent along gentle arcs
  const GOLD = [[0, "#fff4c0"], [0.35, "#fbd96e"], [0.75, "#e6b243"], [1, "#b97c1e"]];
  function goldFill(g, y0, y1) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    GOLD.forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  }
  // one western letter, dark brown with a thin dark rim, centred on the origin
  function westernGlyph(g, ch, size, sx = 1, sy = 1.18) {
    g.save(); g.scale(sx, sy);
    g.font = `${size}px ${WFONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, "#7a3210"); gr.addColorStop(1, "#3a1204");
    g.lineWidth = size * 0.05; g.strokeStyle = "#240a02"; g.strokeText(ch, 0, size * 0.04);
    g.fillStyle = gr; g.fillText(ch, 0, size * 0.04);
    g.restore();
  }
  // letters along an arc whose centre is (cx, cy), radius r (the text sits on top of the circle)
  function arcText(g, text, cx, cy, r, size, sx = 1) {
    g.save(); g.font = `${size}px ${WFONT}`;
    const ws = [...text].map((ch) => g.measureText(ch).width * sx * 1.06);
    const total = ws.reduce((a, b) => a + b, 0);
    let a = -total / 2 / r;
    [...text].forEach((ch, i) => {
      const t = a + ws[i] / 2 / r;
      g.save(); g.translate(cx + r * Math.sin(t), cy - r * Math.cos(t)); g.rotate(t);
      westernGlyph(g, ch, size, sx); g.restore();
      a += ws[i] / r;
    });
    g.restore();
  }
  // gold tile with a bevel (one card of the fan)
  function goldTile(g, w, h, r) {
    g.save(); g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 5; g.shadowOffsetY = 2;
    roundRect(g, -w / 2, -h / 2, w, h, r); g.fillStyle = goldFill(g, -h / 2, h / 2); g.fill(); g.restore();
    roundRect(g, -w / 2, -h / 2, w, h, r); g.lineWidth = 2; g.strokeStyle = "#7a4a0c"; g.stroke();
    roundRect(g, -w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5, r * 0.6); g.lineWidth = 1; g.strokeStyle = "rgba(255,252,225,0.85)"; g.stroke();
  }
  function kerekSign(g, W, H) {
    const rows = [
      { text: "KÁRTYA", r: 150, cy: 150 + 32, tw: 33, th: 54, size: 44 },
      { text: "KERÉK", r: 150, cy: 150 + 96, tw: 33, th: 50, size: 41 },
    ];
    for (const row of rows) {
      const n = row.text.length, step = (row.tw + 2) / row.r, cx = W / 2;
      [...row.text].forEach((ch, i) => {
        const t = (i - (n - 1) / 2) * step;
        g.save(); g.translate(cx + row.r * Math.sin(t), row.cy - row.r * Math.cos(t)); g.rotate(t);
        goldTile(g, row.tw, row.th, 5);
        // accented capitals are a bit smaller and lower, so the accent stays on the tile
        const acc = /[ÁÉ]/.test(ch), size = row.size * (acc ? 0.84 : 1);
        g.font = `${size}px ${WFONT}`;
        g.translate(0, acc ? row.th * 0.08 : 0);
        westernGlyph(g, ch, size, Math.min(1, (row.tw * 0.8) / g.measureText(ch).width), 1.12);
        g.restore();
      });
    }
  }
  // one arched gold plaque, SOK over SZERENCSÉT
  function luckSign(g, W, H) {
    const r1 = 330, r0 = r1 - (H - 16), cx = W / 2, cy = 8 + r1, half = (W / 2 - 6) / r1;
    const band = () => {
      g.beginPath();
      g.arc(cx, cy, r1, -Math.PI / 2 - half, -Math.PI / 2 + half);
      g.arc(cx, cy, r0, -Math.PI / 2 + half * 0.93, -Math.PI / 2 - half * 0.93, true);
      g.closePath();
    };
    g.save(); g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 8; g.shadowOffsetY = 3;
    band(); g.fillStyle = goldFill(g, 8, H - 8); g.fill(); g.restore();
    band(); g.lineJoin = "round"; g.lineWidth = 3; g.strokeStyle = "#7a4a0c"; g.stroke();
    g.save(); g.translate(cx, cy); g.scale(0.965, 0.955); g.translate(-cx, -cy); band(); g.restore();
    g.lineWidth = 1.2; g.strokeStyle = "rgba(255,252,225,0.85)"; g.stroke();
    const lh = (r1 - r0) / 2;
    arcText(g, "SOK", cx, cy, r1 - lh * 0.56, lh * 0.84);
    arcText(g, "SZERENCSÉT", cx, cy, r1 - lh * 1.5, lh * 0.84, 0.9);
  }

  // ---- multiplier panel (see artwork/m_right.png): slanted glass card, silver rim, red label cushion, cards below
  function cardImage(rank) {
    const cache = (cardImage.cache = cardImage.cache || {});
    if (!cache[rank]) { const im = new Image(); im.src = `assets/objects/r_${rank}.png`; cache[rank] = im; }
    return cache[rank];
  }
  function imgReady(im) {
    return im.complete ? Promise.resolve() : new Promise((res) => im.addEventListener("load", res) || im.addEventListener("error", res));
  }

  function drawMultiPanel(g, W, H, look, imgs) {
    const sk = 0.2, ph = H - 12, pw = W - sk * ph - 12, rad = 14;
    g.save();
    // lean 1: bottom shifted right, -1: shifted left; neighbours meet edge to edge
    g.translate(W / 2, H / 2); g.transform(1, 0, sk * look.lean, 1, 0, 0);
    // silver rim with a drop shadow
    g.save(); g.shadowColor = "rgba(0,0,0,0.7)"; g.shadowBlur = 10; g.shadowOffsetX = 3; g.shadowOffsetY = 5;
    roundRect(g, -pw / 2, -ph / 2, pw, ph, rad);
    const rim = g.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
    rim.addColorStop(0, "#ffffff"); rim.addColorStop(0.3, "#c9d3da"); rim.addColorStop(0.55, "#7f8c96"); rim.addColorStop(0.8, "#e3e9ed"); rim.addColorStop(1, "#6b7780");
    g.fillStyle = rim; g.fill(); g.restore();
    roundRect(g, -pw / 2, -ph / 2, pw, ph, rad); g.lineWidth = 2.5; g.strokeStyle = "#1d2429"; g.stroke();
    // light blue field
    const b = 8, fw = pw - 2 * b, fh = ph - 2 * b;
    roundRect(g, -fw / 2, -fh / 2, fw, fh, rad - 5);
    const field = g.createLinearGradient(0, -fh / 2, 0, fh / 2);
    field.addColorStop(0, "#d8f0f8"); field.addColorStop(0.5, "#aad5e7"); field.addColorStop(1, "#86bcd3");
    g.fillStyle = field; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#4d7f96"; g.stroke();

    // dark red cushion with the red multiplier on it
    const lh = fh * 0.4, lw = fw * 0.88, ly = -fh / 2 + fh * 0.05 + lh / 2;
    g.save(); g.shadowColor = "rgba(20,0,0,0.5)"; g.shadowBlur = 4; g.shadowOffsetY = 2;
    roundRect(g, -lw / 2, ly - lh / 2, lw, lh, lh * 0.45);
    const cush = g.createLinearGradient(0, ly - lh / 2, 0, ly + lh / 2);
    cush.addColorStop(0, "#a3141d"); cush.addColorStop(0.5, "#730910"); cush.addColorStop(1, "#4a0409");
    g.fillStyle = cush; g.fill(); g.restore();
    roundRect(g, -lw / 2, ly - lh / 2, lw, lh, lh * 0.45); g.lineWidth = 2; g.strokeStyle = "#2a0205"; g.stroke();
    roundRect(g, -lw / 2 + 5, ly - lh / 2 + 3, lw - 10, lh * 0.34, lh * 0.2); g.fillStyle = "rgba(255,190,190,0.16)"; g.fill();
    const size = lh * 0.98;
    g.font = `${size}px ${MFONT}`;
    const squeeze = Math.min(1.08, (lw * 0.84) / g.measureText(look.label).width);
    g.save(); g.translate(0, ly); g.transform(1, 0, -0.16, 1, 0, 0);
    machineText(g, look.label, 0, size * 0.03, size, "ruby", squeeze);
    g.restore();

    // what the multiplier pays for
    const top = ly + lh / 2 + 3, ah = fh / 2 - top - 5, cy = top + ah / 2;
    if (look.pips) {
      const s = ah * 0.43;
      look.pips.forEach((su, i) => glossyPip(g, su, (i ? 1 : -1) * fw * 0.2, cy, s));
    } else {
      const n = imgs.length, ch = ah * 0.96, cw = ch * (259 / 366), room = fw * 0.9;
      const gap = 4, step = n * cw + (n - 1) * gap <= room ? cw + gap : (room - cw) / (n - 1);
      const x0 = -((n - 1) * step + cw) / 2;
      imgs.forEach((im, i) => {
        if (!im.naturalWidth) return;
        g.save(); g.shadowColor = "rgba(20,40,60,0.45)"; g.shadowBlur = 4; g.shadowOffsetX = 1; g.shadowOffsetY = 2;
        g.drawImage(im, x0 + i * step, cy - ch / 2, cw, ch); g.restore();
      });
    }

    // glass sheen over the whole card
    g.save(); roundRect(g, -fw / 2, -fh / 2, fw, fh, rad - 5); g.clip();
    const sheen = g.createLinearGradient(-fw / 2, -fh / 2, fw * 0.15, fh * 0.2);
    sheen.addColorStop(0, "rgba(255,255,255,0.4)"); sheen.addColorStop(0.42, "rgba(255,255,255,0.08)"); sheen.addColorStop(0.43, "rgba(255,255,255,0)");
    g.fillStyle = sheen; g.fillRect(-fw / 2, -fh / 2, fw, fh);
    g.restore();
    g.restore();
  }
  // a big suit sign with a glossy highlight (the ×2 panels)
  function glossyPip(g, suit, x, y, s) {
    g.save(); g.shadowColor = "rgba(20,40,60,0.5)"; g.shadowBlur = 5; g.shadowOffsetY = 2;
    drawPip(g, suit, x, y, s); g.restore();
    g.save(); g.translate(x, y); pipPath(g, suit, s); g.clip();
    const hl = g.createLinearGradient(-s, -s, s * 0.2, s * 0.2);
    hl.addColorStop(0, "rgba(255,255,255,0.75)"); hl.addColorStop(0.45, "rgba(255,255,255,0.15)"); hl.addColorStop(0.46, "rgba(255,255,255,0)");
    g.fillStyle = hl; g.fillRect(-s * 1.4, -s * 1.2, s * 2.8, s * 2.4);
    g.restore();
    g.save(); g.translate(x, y); pipPath(g, suit, s); g.lineWidth = Math.max(1.5, s * 0.1); g.strokeStyle = "#e9f3f7"; g.globalAlpha = 0.35; g.stroke(); g.restore();
  }

  // a full playing card (number cards 2..9) centred on the origin
  function drawPlayingCard(g, rank, suit, w, h) {
    g.save();
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 8; g.shadowOffsetY = 3;
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.1);
    const gr = g.createLinearGradient(0, -h / 2, 0, h / 2); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#e3eef3");
    g.fillStyle = gr; g.fill(); g.restore();
    roundRect(g, -w / 2, -h / 2, w, h, w * 0.1); g.lineWidth = w * 0.035; g.strokeStyle = "#8fb8cc"; g.stroke();
    const c = ink(suit);
    g.save(); g.font = `${w * 0.24}px ${MFONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = c.fill[1];
    g.fillText(rank, -w * 0.36, -h * 0.4);
    g.translate(w * 0.36, h * 0.4); g.rotate(Math.PI); g.fillText(rank, 0, 0); g.restore();
    const ix = w * 0.62, iy = h * 0.7, ps = w * (+rank >= 7 ? 0.075 : 0.1);
    for (const [px, py] of PIPS[rank] || []) {
      g.save(); g.translate(-ix / 2 + px * ix, -iy / 2 + py * iy); if (py > 0.55) g.rotate(Math.PI);
      drawPip(g, suit, 0, 0, ps); g.restore();
    }
  }

  const jokerImg = new Image();
  jokerImg.src = "assets/objects/joker.png";
  // the card on a symbol, as printed on the reel strips: an upright matte card, pale greyish pink, thin dark rim,
  // the rank in the top left corner and the suit below the middle; (x, y) is its top left corner
  function drawTag(g, cell, x, y, w, h) {
    const rad = w * 0.1;
    g.save();
    g.save(); g.shadowColor = "rgba(40,25,20,0.3)"; g.shadowBlur = 3; g.shadowOffsetX = 1; g.shadowOffsetY = 1.5;
    roundRect(g, x, y, w, h, rad);
    // light across the card: a bit dim on the left, bright in the middle, greyer to the right
    const paper = g.createLinearGradient(x, y, x + w, y + h * 0.18);
    paper.addColorStop(0, "#e2d8d2"); paper.addColorStop(0.42, "#f8f1ec"); paper.addColorStop(0.7, "#e2d8d3"); paper.addColorStop(1, "#b8aeaa");
    g.fillStyle = paper; g.fill(); g.restore();
    roundRect(g, x, y, w, h, rad); g.lineWidth = 1.6; g.strokeStyle = "#5e4c48"; g.stroke();
    roundRect(g, x + 2.5, y + 2.5, w - 5, h - 5, rad * 0.6); g.lineWidth = 0.8; g.strokeStyle = "rgba(255,255,255,0.55)"; g.stroke();
    if (cell.c === "JOKER") {
      if (jokerImg.complete && jokerImg.naturalWidth) {
        const k = Math.min((w - 6) / jokerImg.naturalWidth, (h - 6) / jokerImg.naturalHeight);
        const iw = jokerImg.naturalWidth * k, ih = jokerImg.naturalHeight * k;
        drawScaled(g, jokerImg, 0, 0, jokerImg.naturalWidth, jokerImg.naturalHeight, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      }
    } else {
      const red = cell.suit === "h" || cell.suit === "d", ink2 = red ? "#c4282c" : "#3b3133";
      const t = rankLabel(cell.c), fs = h * (t.length > 1 ? 0.3 : 0.36);
      g.font = `bold ${fs}px Georgia, "Times New Roman", serif`; g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = ink2;
      g.save(); g.translate(x + w * 0.13, y + h * 0.07); if (t.length > 1) g.scale(0.8, 1); g.fillText(t, 0, 0); g.restore();
      // matte suit: flat colour, a slightly darker rim
      g.save(); g.translate(x + w * 0.52, y + h * 0.7);
      pipPath(g, cell.suit, w * 0.2); g.fillStyle = ink2; g.fill("nonzero");
      g.lineWidth = 1; g.strokeStyle = red ? "#8e1a1e" : "#1e1718"; g.stroke();
      g.restore();
    }
    g.restore();
  }

  // one symbol with its card tag, pre-rendered at the current resolution
  const symCache = new Map();
  const SYM_BOX = { x: -104, y: -70, w: 224, h: 140 };
  function symbolSprite(cell) {
    const key = cell.s + "|" + (cell.c || "") + "|" + (cell.suit || "");
    let c = symCache.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = Math.ceil(SYM_BOX.w * RES); c.height = Math.ceil(SYM_BOX.h * RES);
      const g = c.getContext("2d");
      g.setTransform(RES, 0, 0, RES, -SYM_BOX.x * RES, -SYM_BOX.y * RES);
      drawSymbolRaw(g, cell, 0, 0);
      if (sprites[cell.s] && (cell.c !== "JOKER" || (jokerImg.complete && jokerImg.naturalWidth))) symCache.set(key, c);
    }
    return c;
  }
  function drawSymbol(g, cell, x, y) {
    // the sprite is pre-rendered at screen resolution: put it on whole device pixels, 1:1, so it stays crisp
    const c = symbolSprite(cell), t = g.getTransform();
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, Math.round((x + SYM_BOX.x) * t.a + t.e), Math.round((y + SYM_BOX.y) * t.d + t.f));
    g.restore();
  }
  function drawSymbolRaw(g, cell, x, y) {
    const im = sprites[cell.s];
    const maxH = 100, maxW = cell.s === "bar" ? 136 : 138; // the BAR is a long rectangle
    let r = { x: x - 60, y: y - 45, w: 100, h: 90 };
    if (im) {
      // with a card the pair sits a little further left, so the card stays clear of the window frame
      r = drawSprite(g, cell.s, x - (cell.c ? 20 : 10), y, 100, maxW, BOX_FIT[cell.s] ? maxH : 108) || r;
    } else {
      g.fillStyle = "#333"; g.font = "bold 22px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(symName(cell.s), x, y);
    }
    // the card: top level with the symbol's top, 3/4 of its height, overlapping its right side
    if (cell.c) {
      const ch = Math.max(52, r.h * 0.75), cw = ch * 0.72;
      const cx = Math.min(SYM_BOX.x + SYM_BOX.w - cw - 3, r.x + r.w - cw * 0.28);
      drawTag(g, cell, cx, r.y, cw, ch);
    }
  }

  const DRUM = "#cdcab0"; // the drum as on the photo: a muted silvery beige
  function drumShade(g, W, H) {
    // round drum: darker towards the top and bottom, a little at the sides
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(28,24,12,0.62)"); gr.addColorStop(0.17, "rgba(28,24,12,0.2)"); gr.addColorStop(0.38, "rgba(28,24,12,0)");
    gr.addColorStop(0.62, "rgba(28,24,12,0)"); gr.addColorStop(0.83, "rgba(28,24,12,0.2)"); gr.addColorStop(1, "rgba(28,24,12,0.62)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const gx = g.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, "rgba(0,0,0,0.12)"); gx.addColorStop(0.15, "rgba(0,0,0,0)"); gx.addColorStop(0.85, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,0,0.12)");
    g.fillStyle = gx; g.fillRect(0, 0, W, H);
    // a faint lamp behind the drum: the translucent strip glows warm in the middle
    g.save(); g.globalCompositeOperation = "screen";
    const bl = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
    bl.addColorStop(0, "rgba(255,238,196,0.3)"); bl.addColorStop(0.45, "rgba(255,230,180,0.12)"); bl.addColorStop(1, "rgba(255,230,180,0)");
    g.fillStyle = bl; g.fillRect(0, 0, W, H);
    g.restore();
  }
  function drumBackground(g, W, H) { g.fillStyle = DRUM; g.fillRect(0, 0, W, H); drumShade(g, W, H); }

  // The strip is drawn sharp into a tall buffer, then averaged over the distance the drum turns in
  // one camera frame (1/60 s): at speed the symbols melt into streaks like on the real machine.
  const EXPOSURE = 1 / 55;
  function drawDrum(R, W, H, pitch, drawItems) {
    const k = R.k, blur = Math.min(Math.abs(R.vel || 0) * pitch * EXPOSURE, pitch * 1.3);
    const margin = Math.ceil(blur / 2) + 2;
    if (!R.buf) R.buf = document.createElement("canvas");
    const b = R.buf, bw = Math.round(W * k), bh = Math.round((H + 2 * margin) * k);
    if (b.width !== bw || b.height !== bh) { b.width = bw; b.height = bh; }
    const bg = b.getContext("2d");
    bg.setTransform(k, 0, 0, k, 0, margin * k);
    bg.fillStyle = DRUM; bg.fillRect(0, -margin, W, H + 2 * margin);
    drawItems(bg);
    const g = R.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const n = blur < 1.5 ? 1 : Math.min(14, Math.max(3, Math.ceil(blur / 5)));
    for (let j = 0; j < n; j++) {
      const dy = n === 1 ? 0 : -blur / 2 + (blur * j) / (n - 1);
      g.globalAlpha = 1 / (j + 1); // running average of opaque copies = even streak
      g.drawImage(b, 0, Math.round((-margin + dy) * k));
    }
    g.globalAlpha = 1;
    g.setTransform(k, 0, 0, k, 0, 0);
    drumShade(g, W, H);
  }

  function drawReel(i, t) {
    const R = reels[i], { g, hole } = R, W = hole.w, H = hole.h;
    const hi = winMark && winMark.cells.includes(i);
    const key = R.pos + "|" + R.vel + "|" + M.s.holds[i] + "|" + (nudgeSel === i) + "|" + M.strips[i].length;
    if (!hi && key === R.key) return;
    R.key = hi ? null : key;
    const strip = M.strips[i], n = strip.length, p = R.pos, cy = H / 2, pitch = H * (L.reelPitch / 348);
    drawDrum(R, W, H, pitch, (bg) => {
      const base = Math.floor(p);
      for (let k = base - 4; k <= base + 4; k++) {
        const y = cy + (k - p) * pitch;
        if (y < -pitch * 1.5 || y > H + pitch * 1.5) continue;
        drawSymbol(bg, strip[((k % n) + n) % n], W / 2, y);
      }
    });
    g.fillStyle = "rgba(40,30,20,0.55)"; g.fillRect(0, cy - 1, W, 2);
    if (winMark && winMark.cells.includes(i)) {
      const a = 0.55 + 0.45 * Math.sin((t - winMark.t0) / 110);
      g.save(); g.shadowColor = "rgba(255,190,40,0.95)"; g.shadowBlur = 18; g.strokeStyle = `rgba(255,196,40,${a})`; g.lineWidth = 6;
      roundRect(g, 8, cy - pitch / 2 + 4, W - 16, pitch - 8, 14); g.stroke(); g.restore();
    }
    if (M.s.holds[i] || nudgeSel === i) {
      g.fillStyle = nudgeSel === i ? "rgba(230,150,10,0.92)" : "rgba(200,20,10,0.88)"; roundRect(g, W / 2 - 58, H - 46, 116, 34, 8); g.fill();
      g.fillStyle = "#fff"; g.font = "900 22px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(nudgeSel === i ? "LÉPTET" : "TART", W / 2, H - 29);
    }
    const shine = g.createLinearGradient(0, 0, W, H);
    shine.addColorStop(0, "rgba(255,255,255,0.10)"); shine.addColorStop(0.4, "rgba(255,255,255,0)");
    g.fillStyle = shine; g.fillRect(0, 0, W, H);
  }

  // card wheel face, as on the machine: big outlined letter on the cream drum + light blue card with the pip
  function drawCard(g, card, x, y) {
    // the letter and the card as one group, centred on x
    const txt = rankLabel(card.r), cw = 86, gap = 8, lw = txt.length > 1 ? 70 : 58;
    const x0 = x - (lw + gap + cw) / 2;
    blueCard(g, x0 + lw + gap, y - 50, cw, 100, 10);
    drawPip(g, card.suit, x0 + lw + gap + cw / 2, y, 25);
    bigLetter(g, txt, card.suit, x0 + lw / 2, y + 2, txt.length > 1 ? 60 : 90);
  }

  function drawCardWheel() {
    const w = L.cardWheel, W = w.w, H = w.h, strip = M.cards;
    const key = cardWheel.pos + "|" + cardWheel.vel + "|" + strip.length;
    if (key === cardWheel.key) return;
    cardWheel.key = key;
    const n = strip.length, p = cardWheel.pos, cy = w.centerY - w.y, base = Math.floor(p);
    drawDrum(cardWheel, W, H, w.pitch, (bg) => {
      for (let k = base - 3; k <= base + 3; k++) {
        const y = cy + (k - p) * w.pitch;
        if (y < -w.pitch * 1.5 || y > H + w.pitch * 1.5) continue;
        drawCard(bg, strip[((k % n) + n) % n], W / 2, y);
      }
    });
    // the dark middle line, level with the one across the reels
    const g = cardWheel.g;
    g.fillStyle = "rgba(40,30,20,0.55)"; g.fillRect(0, cy - 1, W, 2);
  }

  function frame(t) {
    for (const R of [...reels, cardWheel]) {
      if (!R.anim) continue;
      const a = R.anim, el = (t - a.t0) / 1000;
      const at = (e) => a.from - travel(a, e) + (a.jump && e > a.jumpAt ? a.jump : 0);
      R.pos = at(el);
      R.vel = el < a.T ? (travel(a, el + 0.004) - travel(a, el - 0.004)) / 0.008 : 0;
      if (el >= a.T + a.tb) { R.pos = a.end; R.vel = 0; R.anim = null; a.done(); }
    }
    reels.forEach((R, i) => { if (R.anim || R.vel !== R.lastVel) { SFX.reel(i, R.vel || 0); R.lastVel = R.vel; } drawReel(i, t); });
    if (cardWheel.anim || cardWheel.vel !== cardWheel.lastVel) { SFX.reel(4, cardWheel.vel || 0); cardWheel.lastVel = cardWheel.vel; }
    drawCardWheel();
    requestAnimationFrame(frame);
  }

  // Reel motion like a real stepper reel: a short kick backwards, a hard spin-up, even cruising speed,
  // braking a little past the symbol, one small spring back. A step (Super lépések) is one quick snap.
  const BOUNCE = 0.2, BOUNCE_T = 0.15;
  const WIND_T = 0.05, WIND_B = 0.1, ACC_T = 0.12, DEC_T = 0.12;
  function travel(a, el) {
    const B = a.bounce ?? BOUNCE, S = a.dist + B;
    if (el < 0) return 0;
    if (el < a.T) {
      if (a.step) { const u = el / a.T; return S * (1 - Math.pow(1 - u, 3)); }
      const v0 = (WIND_B * Math.PI) / WIND_T, cruise = a.T - WIND_T - ACC_T - DEC_T;
      const vmax = (S - (v0 * ACC_T) / 2) / (ACC_T / 2 + cruise + DEC_T / 2);
      if (el < WIND_T) return -WIND_B * Math.sin((Math.PI * el) / WIND_T);
      if (el < WIND_T + ACC_T) { const u = el - WIND_T; return v0 * u + ((vmax - v0) * u * u) / (2 * ACC_T); }
      const xa = ((v0 + vmax) / 2) * ACC_T;
      if (el < a.T - DEC_T) return xa + vmax * (el - WIND_T - ACC_T);
      const r = a.T - el;
      return S - (vmax * r * r) / (2 * DEC_T);
    }
    // mechanical settle: springs back past the stop once, then locks in
    const b = Math.min(1, (el - a.T) / a.tb);
    const e = 1 - Math.cos(b * Math.PI * 1.5) * Math.pow(1 - b, 2);
    return S - B * Math.min(1.12, e);
  }
  // Every reel runs the same speed profile and stops at a fixed time, strictly left to right at even
  // intervals. The few symbols of difference to the real target are skipped mid-spin, inside the blur.
  function animateTo(R, n, target, T, speed) {
    return new Promise((done) => {
      const from = R.pos;
      const mod = ((((from - target) % n) + n) % n);
      const cruise = T - WIND_T - ACC_T - DEC_T;
      const D = speed * (ACC_T / 2 + cruise + DEC_T / 2) - BOUNCE;
      const dist = mod + n * Math.max(1, Math.round((D - mod) / n));
      R.anim = { t0: performance.now(), T, tb: BOUNCE_T, from, dist: D, jump: D - dist, jumpAt: WIND_T + ACC_T + cruise * 0.5, end: target, done };
    });
  }
  const REEL_SPEED = 46; // symbols per second at full speed
  // timing as in the owner's video: first reel stops 0.84 s after START, the others every 0.225 s (matches the spin sample)
  // The spin sample holds all four reel stops (0.88, 1.11, 1.34, 1.52 s): the stops of held reels are ducked
  // out, and the sound ends shortly after the last reel that really spins has stopped.
  const SPIN_STOPS = [0.88, 1.11, 1.34, 1.52];
  const spinReels = (stops, held) => {
    const spinning = reels.map((_, i) => !(held && held[i]));
    const last = Math.max(...SPIN_STOPS.filter((_, i) => spinning[i]));
    SFX.stopChannel("bg"); SFX.stopChannel("count");
    SFX.play("spin", { channel: "reels", duck: SPIN_STOPS.filter((_, i) => !spinning[i]).map((t) => [t - 0.02, t + 0.2]), end: last < 1.5 ? last + 0.25 : null });
    SFX.motorOn();
    return Promise.all(reels.map((R, i) =>
      spinning[i] ? animateTo(R, M.strips[i].length, stops[i], 0.84 + i * 0.225, REEL_SPEED).then(() => SFX.stop(i)) : Promise.resolve())).then(() => SFX.motorOff());
  };
  // the card wheel turns quickly, like in the video (~0.5 s)
  // (the wheelSpin sample is only the wheel's whirr: it used to run into the start of the win tune, which then
  // sounded cut off after every turn, win or not)
  const WHEEL_T = 0.55;
  const spinCardWheel = (pos) => {
    SFX.play("wheelSpin", { channel: "wheel" });
    return animateTo(cardWheel, M.cards.length, pos, WHEEL_T, 30).then(() => SFX.stop(4));
  };

  // ---------------------------------------------------------------- LEDs, message bar, buttons
  function bankValue() {
    const g = M.s.gamble;
    if (M.s.phase === "multi") return M.s.pending;
    if (M.s.phase === "rowcatch") return M.rowValue();
    if (M.s.phase !== "gamble" || !g || g.level < 0) return 0;
    const st = cfg.ladder[g.level];
    return !st.options && st.prize.credit ? st.prize.credit * M.stake : 0;
  }
  let shownCredit = null;
  // a 7-segment field: the number right aligned over dim "8"s (DSEG draws "!" as an empty digit cell)
  function setLed(id, value, digits) {
    const el = $(id), txt = String(Math.max(0, Math.round(value))).slice(-digits);
    if (el.dataset.v === txt) return;
    el.dataset.v = txt;
    el.innerHTML = `<span class="ghost">${"8".repeat(digits)}</span><span class="val">${"!".repeat(digits - txt.length)}${txt}</span>`;
  }
  function updateLeds() {
    setLed("ledWin", M.s.lastWin, 5);
    setLed("ledBank", bankValue(), 5);
    setLed("ledCredit", shownCredit ?? M.s.credit, 6);
    setLed("ledStake", M.stake, 4);
  }

  let bannerTimer = null;
  // the message bar of the machine stays empty (as on the real one); texts only go to the console
  const SHOW_TEXT = false;
  function say(text, ms = 1800) {
    if (!SHOW_TEXT) { if (text) console.debug("[gép]", text); return; }
    const el = $("bannerText");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    if (ms) bannerTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  function setButtons() {
    const ph = M.s.phase;
    const caps = ["TART", "TART", "TART", "TART", "TÉT", "START"];
    const hot = [false, false, false, false, false, false];
    const tartCaps = (label) => { for (let i = 0; i < 4; i++) { caps[i] = label; hot[i] = !!label; } };
    if (ph === "multi" || ph === "gamble") { tartCaps(""); caps[4] = "ELVISZ"; hot[4] = true; caps[5] = "VÁLASZT"; hot[5] = true; }
    if (ph === "gamble" && M.riskOptions() && !riskRun) tartCaps("KOCKÁZAT");
    if (riskRun) { tartCaps(""); caps[4] = ""; hot[4] = false; caps[5] = "ELKAP"; hot[5] = true; }
    if (["joker", "choose", "matchplay", "mpdir", "plusstop", "rowcatch", "nudgepick"].includes(ph)) { tartCaps(ph === "rowcatch" ? "ELVISZ" : ""); caps[5] = ph === "rowcatch" ? "ELKAP" : ph === "mpdir" ? "FEL / LE" : "VÁLASZT"; hot[5] = true; }
    if (ph === "nudge") { tartCaps("TÁRCSA"); caps[4] = "KÉSZ"; hot[4] = true; caps[5] = picker ? "FEL / LE" : ""; hot[5] = !!picker; }
    if (ph === "blackjack") { tartCaps("MEGÁLL"); caps[4] = "MEGÁLL"; hot[4] = true; caps[5] = "LAP"; hot[5] = true; }
    caps.forEach((c, i) => {
      const el = $("cap" + i);
      const want = c + (hot[i] ? "|hot" : "");
      if (el.dataset.t !== want) {
        el.dataset.t = want;
        el.replaceChildren();
        if (c) el.appendChild(mtImg(c, 30, hot[i] ? "fire" : "gold"));
      }
      el.classList.toggle("hot", hot[i]);
    });
    document.querySelectorAll(".mbtn").forEach((b) => {
      const i = +b.dataset.b;
      b.classList.toggle("lit", (i < 4 && ph === "idle" && M.s.holds[i]) || (ph !== "idle" && hot[i]));
      b.classList.toggle("dim", ph !== "idle" && !hot[i]);
    });
  }

  // ---------------------------------------------------------------- picker: options alternate, START takes the lit one
  let picker = null;
  // order: the sequence the light walks (e.g. up and down); default is round and round
  function startPicker({ ids, values, ms, onPick, hi = "on", base = () => "off", random = false, loop = null, order = null }) {
    stopPicker();
    picker = { ids, values, idx: 0, pos: 0, onPick, hi, base, loop: loop && SFX.play(loop, { loop: true, channel: "bg" }) };
    const step = () => {
      picker.prev = picker.idx; picker.t = performance.now();
      if (random) picker.idx = Math.floor(Math.random() * ids.length);
      else if (order) { picker.pos = (picker.pos + 1) % order.length; picker.idx = order[picker.pos]; }
      else picker.idx = (picker.idx + 1) % ids.length;
      applyPicker(); if (!picker.loop) SFX.blip(picker.idx % 2);
    };
    picker.timer = setInterval(step, ms);
    applyPicker();
  }
  function applyPicker() { if (picker) picker.ids.forEach((id, i) => setLamp(id, i === picker.idx ? picker.hi : picker.base(id))); }
  function stopPicker() { if (picker) { clearInterval(picker.timer); if (picker.loop) SFX.stopChannel("bg"); picker = null; } }
  // a human needs a moment to press: a press within REACT_MS after a lamp change still takes the lamp before it
  const REACT_MS = 140;
  function takePick() {
    const p = picker;
    stopPicker();
    if (p.t && p.prev != null && performance.now() - p.t < REACT_MS) p.idx = p.prev;
    setLamp(p.ids[p.idx], "fast");
    p.onPick(p.values[p.idx], p.idx);
  }

  const levelIds = (level) => { const st = cfg.ladder[level]; return st.options ? st.options.map((o) => o.id) : [st.id]; };

  function refreshLamps() {
    const s = M.s, ph = s.phase, g = s.gamble;
    for (const id of Object.keys(L.ladder)) setLamp(id, "off");
    if ((ph === "gamble" && g) || ph === "choose") {
      const lvl = ph === "choose" ? s.choice.level : g.level;
      if (lvl >= 0) levelIds(lvl).forEach((id) => setLamp(id, "on"));
      if (ph === "gamble" && lvl + 1 < cfg.ladder.length) levelIds(lvl + 1).forEach((id) => setLamp(id, "blink"));
    }
    cfg.matchPlay.wheel.forEach((sym, i) => setLamp("w_" + sym, s.wheelLit[i] ? "on" : "off"));
    const nextRound = s.roundLit.indexOf(false);
    s.roundLit.forEach((lit, i) => setLamp("rc" + (i + 1), lit ? "on" : ph === "rowcatch" && i === nextRound ? "blink" : "off"));
    const ng = s.nudge;
    setLamp("lepesFel", "off");
    setLamp("lepesLe", "off");
    setLamp("wc", ph === "matchplay" ? "blink" : s.wheelLit.every(Boolean) ? "on" : "off");
    setLamp("plus", "off"); setLamp("stop", "off");
    for (const k of Object.keys(cfg.helps)) setLamp("h_" + k, s.helps[k] ? "on" : "off");
    document.querySelectorAll("canvas.sunburst").forEach((c) => c.classList.toggle("lit", !!(lamps[c.dataset.for] && lamps[c.dataset.for].classList.contains("on"))));
    cfg.triangles.forEach((k, i) => {
      const usable = triangleUsable(k);
      setLamp("tri" + i, usable ? "on" : "off");
      lamps["tri" + i].classList.toggle("usable", usable);
    });
    const ci = shownCollect ?? s.collectIdx;
    cfg.collectRanks.forEach((r, i) => setLamp("c_" + r, i < ci ? "on" : "off"));
    for (const id of Object.keys(L.multi)) setLamp("m_" + id, "off");
    setLamp("kisebb", "off"); setLamp("nagyobb", "off");
    const showCard = ph === "gamble" || ph === "blackjack";
    cfg.ranks.forEach((r) => setLamp("r_" + r, showCard && M.card.r === r ? "on" : "off"));
    // black jack
    const bj = s.bj;
    for (let p = 1; p <= 16; p++) setLamp("t_" + p, (bj && bj.points >= p) || (ph === "nudge" && ng.steps >= p) ? "on" : "off");
    for (let p = 17; p <= 21; p++) {
      setLamp("bc_" + p, bj && bj.points === p ? "blink" : "off");
      setLamp("bps_" + p, bj && bj.kind === "superbj" && bj.points === p ? "blink" : "off");
      setLamp("bpc_" + p, bj && bj.kind === "classicbj" && bj.points === p ? "blink" : "off");
    }
    setLamp("hdrSuper", bj && bj.kind === "superbj" ? "on" : "off");
    setLamp("hdrClassic", bj && bj.kind === "classicbj" ? "on" : "off");
    setLamp("hdrDupla", bj && bj.dupla ? "on" : "off");
    applyPicker();
  }
  // the collected cards 2..9 as shown: the old row stays lit while the reels turn, and after a win until it is paid
  let shownCollect = null, clearCardsWhenPaid = false;
  function refresh() {
    let cleared = [];
    if (clearCardsWhenPaid && !busy && M.s.phase === "idle") {
      clearCardsWhenPaid = false;
      cleared = cfg.collectRanks.slice(0, shownCollect || 0);
      shownCollect = null;
    }
    updateLeds(); setButtons(); refreshLamps();
    // the cleared cards flash once, then go dark
    if (cleared.length) { cleared.forEach((r) => setLamp("c_" + r, "fast")); setTimeout(refreshLamps, 700); }
  }

  // ---------------------------------------------------------------- flows
  let busy = false;
  const run = async (fn) => { if (busy) return; busy = true; try { await fn(); } finally { busy = false; refresh(); save(); } };

  async function doSpin() {
    winMark = null;
    const collectBefore = M.s.collectIdx;
    const res = M.spin();
    if (res.error) { say(res.error); return; }
    shownCollect = collectBefore;
    shownCredit = M.s.phase === "idle" ? M.s.credit - res.win.amount : M.s.credit;
    const lastWin = M.s.lastWin; M.s.lastWin = 0;
    refresh();
    await spinReels(res.stops, res.held);
    M.s.lastWin = lastWin; shownCredit = null;
    if (res.win.amount) {
      winMark = { cells: res.win.cells, t0: performance.now() }; if (!SFX.has("multiLoop")) SFX.win();
      say(`${res.win.desc} — ${res.win.amount} Ft`, 2200);
      refresh();
      await sleep(1200);
    }
    // a win clears the collected cards only once it has been paid; otherwise the new cards light up now
    if (res.collectionReset) clearCardsWhenPaid = true;
    else shownCollect = null;
    refresh();
    if (res.collected.length) SFX.play("cardAdd", {});
    for (const r of res.collected) { setLamp("c_" + r, "fast"); await sleep(450); setLamp("c_" + r, "on"); }
    // automatic hold: the machine holds a started line by itself, TART changes it
    if (res.autoHeld && res.autoHeld.length && M.s.phase === "idle") {
      M.applyHolds(res.autoHeld);
      if (!SFX.play("hold", {})) res.autoHeld.forEach((i, k) => setTimeout(() => SFX.blip(1), k * 90));
      refresh();
    }
    await next(res.trigger, res);
  }

  // whatever the engine is waiting for: joker catch, multiplier menu, PLUS/STOP, Kisebb/Nagyobb
  async function next(trigger, res) {
    const ph = M.s.phase;
    if (ph === "joker") return startJokerPicker(trigger, res);
    if (ph === "multi") return startMulti(trigger);
    if (ph === "gamble") return enterGamble(trigger);
    if (ph === "plusstop") return startPlusStop();
    if (ph === "matchplay") return startMatchRunner();
    if (ph === "mpdir") return startMpDir();
  }

  function startJokerPicker(trigger, res) {
    say("JOKER! — kapd el a START-tal", 0); if (!SFX.play("joker")) SFX.joker();
    setLamp("joker", "blink");
    const free = Object.keys(M.s.helps).filter((k) => !M.s.helps[k]);
    const cards = (res && res.jokerCards || []).map((r) => "c_" + r);
    const ids = free.map((k) => "h_" + k).concat(cards);
    startPicker({
      ids, values: free.concat(cards), ms: 190,
      onPick: (k) => run(async () => {
        const r = M.jokerCatch(k);
        setLamp("joker", "off");
        if (r.card) {
          say(r.card === "9" ? "Megvan a 9-es — KISEBB / NAGYOBB!" : `Megkaptad a lapokat ${r.card}-ig`, 1800);
          refresh();
          for (const c of r.collected) { setLamp("c_" + c, "fast"); await sleep(160); setLamp("c_" + c, "on"); }
        } else say(`Megkaptad: ${cfg.helps[r.help]}`, 1800);
        refresh();
        await sleep(1100);
        await next(r.card === "9" ? "collection" : trigger);
      }),
    });
    refresh();
  }

  // -- multiplier menu after every win: keep risking as long as you like, TART takes it
  function startMulti(trigger) {
    say(`${M.s.pending} Ft — szorzó? START választ, TÉT elviszi`, 0);
    const opts = cfg.multiplier.options;
    startPicker({ ids: opts.map((o) => "m_" + o.id), values: opts.map((o) => o.id), ms: 620, loop: "multiLoop", order: [...opts.keys(), ...[...opts.keys()].slice(1, -1).reverse()], onPick: (id) => run(() => doMulti(id, trigger)) });
    refresh();
  }
  async function doMulti(id, trigger) {
    const r = id === null ? M.multiCollect() : M.multiChoose(id);
    if (r.card) {
      say(`${r.opt.label} — pörög a kártyakerék…`, 0);
      await spinCardWheel(r.pos);
      say(r.hit ? `${cardName(r.card)} — NYERT! ${r.amount} Ft` : `${cardName(r.card)} — nem jött be, elbukva`, 2400);
      // a hit plays the machine's win trill and the menu comes back; a miss ends it at once, you can spin again
      if (r.hit) { if (!SFX.play("guessWin", {})) SFX.win(4); await sleep(1150); }
      else await sleep(250);
    } else {
      say(`Elvitted: ${r.amount} Ft`, 1600);
      if (r.amount) SFX.play("winCount", { channel: "count" });
      await sleep(700);
    }
    await next(r.trigger || trigger);
  }

  // -- Kisebb / Nagyobb
  async function enterGamble(trigger) {
    say(trigger === "21" ? "21! — KISEBB vagy NAGYOBB" : "2–9 ÖSSZEGYŰJTVE! — KISEBB / NAGYOBB", 0);
    refresh();
    // the machine announces the bonus: its "21" tune, or the Kisebb/Nagyobb intro, then the start sound
    if (SFX.play(trigger === "21" ? "trigger21" : "gambleIntro", { channel: "bg" })) await sleep(trigger === "21" ? 2400 : 1600);
    SFX.play("gambleStart", {});
    await spinCardWheel(M.s.cardPos);
    startGuessPicker();
  }
  function startGuessPicker() {
    if (M.s.phase !== "gamble") return;
    say(`${cardName(M.card)} — KISEBB vagy NAGYOBB? (START)`, 0);
    startPicker({ ids: ["kisebb", "nagyobb"], values: ["lower", "higher"], ms: 700, loop: "guessLoop", onPick: (dir) => run(() => doGuess(dir)) });
    refresh();
  }
  async function doGuess(dir) {
    const r = M.guess(dir);
    setLamp(dir === "lower" ? "kisebb" : "nagyobb", "on");
    await spinCardWheel(r.pos);
    if (r.result === "win") {
      say(`${cardName(r.next)} — talált! ${M.ladderLabel(r.level)}`, 1600); if (!SFX.play("guessWin", {})) SFX.guessWin(r.level);
      await ladderChase(r.level, 1300);
      if (r.collect) { await afterCollect(r.collect); return; }
    } else if (r.result === "equal-saved") {
      say(`${cardName(r.next)} — egyenlő, JÓ AZ EGYENLŐ mentett meg!`, 1800);
      await sleep(1300);
    } else {
      say(`${cardName(r.next)} — ${r.result === "equal-lose" ? "egyenlő" : "nem talált"}, vége`, 2000); if (!SFX.has("guessWin")) SFX.lose();
      return;
    }
    startGuessPicker();
  }
  // running light: the ladder lights up from the bottom to the level just won, a few times, during the win tune
  async function ladderChase(level, ms) {
    const steps = [];
    for (let l = 0; l <= level; l++) steps.push(levelIds(l));
    const t0 = performance.now(), per = Math.max(45, Math.min(110, ms / 3 / Math.max(1, steps.length)));
    let k = 0;
    while (performance.now() - t0 < ms - per) {
      const i = k % (steps.length + 2);
      for (const id of Object.keys(L.ladder)) setLamp(id, "off");
      steps.forEach((ids, j) => ids.forEach((id) => setLamp(id, j <= i ? "on" : "off")));
      k++;
      await sleep(per);
    }
    refresh();
  }
  async function doCollect() {
    const c = M.collect();
    if (c.error) { say(c.error, 2000); return; }
    stopPicker();
    await afterCollect(c);
  }
  async function afterCollect(c) {
    if (c.error) { say(c.error); return; }
    if (c.choose) {
      say(`Válassz: ${c.options.map((o) => o.label).join(" / ")} — START`, 0);
      startPicker({ ids: c.options.map((o) => o.id), values: c.options.map((o) => o.id), ms: 700, loop: "guessLoop", onPick: (id) => run(() => afterCollect(M.choose(id))) });
      refresh();
      return;
    }
    if (c.amount) { SFX.play("winCount", { channel: "count" }); say(`${c.step.label} — ${c.amount} Ft`, 1600); await sleep(1000); await next(); return; }
    if (c.notReady) { say(`${c.step.label}: a működését még meg kell beszélnünk`, 2600); return; }
    if (c.feature === "rowcatch") { startRowPicker(); return; }
    if (c.feature === "superlepesek") { startNudgePicker(); return; }
    if (c.feature === "matchplay" || c.feature === "matchplayplus") {
      say(c.feature === "matchplayplus" ? "MATCH PLAY +!" : "MATCH PLAY!", 1400);
      await sleep(900);
      startMatchRunner();
      return;
    }
    if (c.feature === "classicbj" || c.feature === "superbj") {
      say(c.feature === "superbj" ? "SUPER CLASSIC BLACK JACK!" : "CLASSIC BLACK JACK!", 1400);
      await sleep(900);
      await showDeal(c.deal);
    }
  }

  function triangleUsable(k) {
    const s = M.s, ph = s.phase;
    if (riskRun) return false;
    if (k === "fizet") return (ph === "gamble" && s.gamble && s.gamble.level >= 0) || ph === "multi";
    return (ph === "gamble" && s.helps[k] && (k === "extra" || k === "masik")) ||
      (ph === "blackjack" && (k === "masik" || (k === "dupla" && s.helps.dupla && s.bj && !s.bj.dupla)));
  }
  async function onTriangle(i) {
    const k = cfg.triangles[i];
    if (busy) return;
    if (!triangleUsable(k)) { SFX.blip(0); return; } // not now: a short "no" beep instead of silence
    if (k === "fizet") { onTet(); return; }
    if (M.s.phase === "blackjack" && k === "masik") return run(async () => { await showDeal(M.bjHit()); });
    return run(async () => {
      const r = M.useHelp(k);
      if (r.error) { say(r.error, 2400); return; }
      if (k === "dupla") { say("DUPLA BLACK JACK — a nyeremény duplázódik!", 1800); return; }
      stopPicker();
      say(`${cfg.helps[k]}!`, 1400);
      if (r.card) { await spinCardWheel(r.pos); }
      if (r.collect) { await sleep(700); await afterCollect(r.collect); return; }
      if (k === "extra") { say(`Extra lépés — ${M.ladderLabel(r.level)}`, 1400); await sleep(900); }
      startGuessPicker();
    });
  }

  // -- Match Play
  function startMatchRunner() {
    say(M.s.mp && M.s.mp.plus ? "MATCH PLAY + — kapd el a START-tal!" : "MATCH PLAY — kapd el a START-tal!", 0);
    const wheel = cfg.matchPlay.wheel;
    startPicker({
      ids: wheel.map((s) => "w_" + s), values: wheel.map((_, i) => i), ms: 130, hi: "fast", loop: "mpLoop",
      base: (id) => (M.s.wheelLit[wheel.indexOf(id.slice(2))] ? "on" : "off"),
      onPick: (idx) => run(() => mpCatch(idx)),
    });
    refresh();
  }
  async function mpCatch(idx) {
    const r = M.matchCatch(idx);
    if (r.error) return;
    SFX.play("mpResult", {});
    say(`Elkapva: ${symName(r.sym)}`, 0);
    refresh();
    await spinReels(r.stops, null);
    await sleep(300);
    startMpDir();
  }
  // the caught symbol sits on 2 reels: LÉPÉS FEL / LE flash in turn, START picks which way the others step
  function startMpDir() {
    say(`${symName(M.s.mp.caught.sym)} — FEL vagy LE? (START)`, 0);
    startPicker({ ids: ["lepesFel", "lepesLe"], values: ["up", "down"], ms: 420, loop: "nudgePick", onPick: (dir) => run(() => mpStep(dir)) });
    refresh();
  }
  async function mpStep(dir) {
    const before = M.s.credit;
    const r = M.matchStep(dir);
    if (r.error) return;
    shownCredit = before;
    refresh();
    setLamp(dir === "up" ? "lepesFel" : "lepesLe", "on");
    for (const st of r.steps) {
      SFX.play("nudgeStep", {});
      await Promise.all(st.moved.map((i) => nudgeAnim(i, dir === "up" ? 1 : -1, st.stops[i])));
    }
    SFX.play("nudgeArrive", {});
    shownCredit = null;
    winMark = { cells: r.cells, t0: performance.now() };
    say(`${r.count} × ${symName(r.sym)} — ${r.amount - r.jackpot} Ft`, 2200);
    refresh();
    if (r.jackpot) { await sleep(1600); setLamp("wc", "fast"); say(`HA MINDEN VILÁGÍT — JACKPOT ${r.jackpot} Ft!`, 3000); SFX.jackpot(); await sleep(2600); }
    await sleep(1000);
    await next();
  }
  function startPlusStop() {
    say("PLUS vagy STOP — START!", 0);
    startPicker({ ids: ["plus", "stop"], values: [true, false], ms: 300, onPick: (isPlus) => run(() => psCatch(isPlus)) });
    refresh();
  }
  async function psCatch(isPlus) {
    M.plusStop(isPlus);
    say(isPlus ? "PLUS — újabb Match Play!" : "STOP", 1500);
    await sleep(1300);
    await next();
  }

  // -- 2nd step: round lamps — START while the "4" is lit catches the next lamp; a miss ends it
  function startRowPicker() {
    const caught = M.s.roundLit.filter(Boolean).length;
    say(caught ? `KEREK LÁMPÁK ${caught}/5 = ${M.rowValue()} Ft — START tovább, TART elviszi` : "KEREK LÁMPÁK — START, amikor a 4-es ég!", 0);
    startPicker({ ids: ["l4", "_gap"], values: [true, false], ms: 380, loop: "rowLoop", onPick: (hit) => run(() => doRowCatch(hit)) });
    refresh();
  }
  async function doRowCatch(hit) {
    const r = M.rowCatch(hit);
    if (r.miss) {
      say(r.caught ? `Mellé — elbukva (${r.caught} lámpa)` : "Mellé — vége", 2000);
      return;
    }
    setLamp("rc" + (r.index + 1), "fast");
    await sleep(600);
    if (r.complete) {
      say(`MIND AZ 5 KEREK LÁMPA — ${r.amount} Ft!`, 2200);
      await sleep(1600);
      await next();
      return;
    }
    startRowPicker();
  }

  // -- Super lépések: first the number of steps is caught on the right-hand track
  function startNudgePicker() {
    say("SUPER LÉPÉSEK — kapd el a lépésszámot a START-tal!", 0);
    const n = cfg.nudge.maxSteps;
    startPicker({
      ids: [...Array(n).keys()].map((i) => "t_" + (i + 1)), values: [...Array(n).keys()].map((i) => i + 1), ms: 110,
      onPick: (steps) => run(async () => {
        M.nudgePick(steps);
        say(`SUPER LÉPÉSEK: ${steps} lépés — válassz tárcsát a TART-tal`, 0);
      }),
    });
    refresh();
  }

  // -- Super lépések
  function nudgeAnim(i, delta, stop) {
    const R = reels[i];
    return new Promise((done) => {
      const from = R.pos;
      R.anim = { t0: performance.now(), step: true, T: 0.11 + 0.05 * Math.abs(delta), tb: 0.1, bounce: 0.09 * Math.sign(-delta), from, dist: -delta, end: stop, done };
    });
  }
  function selectNudgeReel(i) {
    nudgeSel = i;
    say(`${i + 1}. tárcsa — FEL vagy LE? (START) · még ${M.s.nudge.steps} lépés`, 0);
    startPicker({ ids: ["lepesFel", "lepesLe"], values: ["up", "down"], ms: 420, loop: "nudgePick", onPick: (dir) => run(() => doNudge(i, dir)) });
    refresh();
  }
  async function doNudge(i, dir) {
    const r = M.nudgeMove(i, dir);
    if (r.error) return;
    SFX.play("nudgeStep", {});
    await nudgeAnim(i, r.delta, r.stop);
    SFX.play("nudgeArrive", {});
    if (r.finish) { nudgeSel = null; await nudgeResult(r.finish); return; }
    selectNudgeReel(i);
  }
  async function nudgeResult(f) {
    nudgeSel = null;
    if (f.win.amount) {
      winMark = { cells: f.win.cells, t0: performance.now() };
      say(`${f.win.desc} — ${f.win.amount} Ft`, 2200);
      refresh();
      await sleep(1400);
    } else {
      say("Super lépések vége — nincs nyerő sor", 2000);
    }
    await next(null);
  }

  // -- Black Jack: triangle "Másik kártya" = new card, TART = stand
  async function showDeal(d) {
    if (d.error) { say(d.error); return; }
    await spinCardWheel(d.pos);
    refresh();
    if (d.bust) { say(`${cardName(d.card)} — ${d.points} pont, BESOKALLT`, 2400); SFX.lose(); return; }
    if (d.stand) { say(`${cardName(d.card)} — 21! Nyeremény: ${d.stand.amount} Ft`, 2000); await sleep(1400); await next(); return; }
    say(`${cardName(d.card)} — ${d.points} pont. Lap: Másik kártya háromszög · Megáll: TART`, 0);
  }
  async function bjStand() {
    const r = M.bjStand();
    say(r.amount ? `Megálltál ${r.points} ponton — ${r.amount} Ft${r.dupla ? " (dupla)" : ""}` : `Megálltál ${r.points} ponton — nincs nyeremény`, 2200);
    if (r.amount) { await sleep(1400); await next(); }
  }

  // ---------------------------------------------------------------- input
  // -- at 20 (Kisebb/Nagyobb) a win can be risked: the fields around it flash in turn, START catches one
  function startRisk() {
    const opts = M.riskOptions();
    if (!opts) return;
    stopPicker();
    riskRun = true;
    say(`Kockázat: ${opts.map((o) => o.label).join(" / ")} — START`, 0);
    startPicker({ ids: opts.map((o) => o.id), values: opts.map((o) => o.id), ms: 480, hi: "fast", loop: "guessLoop",
      onPick: (id) => run(async () => { riskRun = false; await afterCollect(M.riskPick(id)); }) });
    refresh();
  }
  function onTart(i) {
    if (busy) return;
    const ph = M.s.phase;
    if (ph === "gamble" && M.riskOptions() && !riskRun) { startRisk(); return; }
    if (ph === "idle") { if (M.toggleHold(i)) refresh(); return; }
    if (ph === "nudge") selectNudgeReel(i);
    if (ph === "blackjack") run(bjStand);
    if (ph === "rowcatch") {
      stopPicker();
      run(async () => {
        const r = M.rowStop();
        say(r.amount ? `Elvitted: ${r.caught} kerek lámpa — ${r.amount} Ft` : "Nem volt elkapott lámpa", 1800);
        await sleep(1200);
        await next();
      });
    }
  }
  function onTet() {
    if (busy) return;
    if (M.s.phase === "nudge") { stopPicker(); run(async () => { await nudgeResult(M.nudgeFinish()); }); return; }
    // TÉT doubles as ELVISZ: take the win from the multiplier menu, stop on the ladder
    if (M.s.phase === "multi") { stopPicker(); run(() => doMulti(null)); return; }
    if (M.s.phase === "gamble" && !riskRun) { run(doCollect); return; }
    if (M.s.phase === "blackjack") { run(bjStand); return; }
    if (M.cycleStake()) { refresh(); save(); }
  }
  function onStart() {
    if (busy) return;
    if (picker) { takePick(); return; }
    const ph = M.s.phase;
    if (ph === "idle") run(doSpin);
    else if (ph === "blackjack") run(async () => { await showDeal(M.bjHit()); });
    else if (ph === "nudge") say(`Előbb válassz tárcsát a TART-tal · még ${M.s.nudge.steps} lépés`, 0);
  }
  document.querySelectorAll(".mbtn").forEach((b) => b.addEventListener("pointerdown", () => {
    const i = +b.dataset.b;
    SFX.button();
    if (i < 4) onTart(i); else if (i === 4) onTet(); else onStart();
  }));
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["1", "2", "3", "4"].includes(k)) onTart(+k - 1);
    else if (k === "t") onTet();
    else if (k === " " || k === "enter") { e.preventDefault(); onStart(); }
    else if (["q", "w", "e", "r"].includes(k)) onTriangle("qwer".indexOf(k));
  });

  // ---------------------------------------------------------------- side panels & test mode
  const VIEWS = ["wide", "full", "compact"], VIEW_NAME = { wide: "Széles nézet", full: "Teljes gép", compact: "Közeli nézet" };
  let view = "wide";
  const setView = (v) => {
    view = VIEWS.includes(v) ? v : "wide";
    document.body.classList.toggle("compact", view === "compact");
    document.body.classList.toggle("wide", view === "wide");
    // the button names the view it switches to
    $("btnView").textContent = VIEW_NAME[VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]];
    try { localStorage.setItem("cbj-view", view); } catch (e) { /* ignore */ }
    fit();
  };
  $("btnView").onclick = () => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]);
  $("btnFull").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  document.addEventListener("fullscreenchange", () => { $("btnFull").textContent = document.fullscreenElement ? "Kilépés" : "Teljes képernyő"; fit(); });
  try { setView(localStorage.getItem("cbj-view") || (window.innerWidth > window.innerHeight ? "wide" : "full")); } catch (e) { setView("wide"); }
  const soundLabel = () => ($("btnSound").textContent = SFX.muted ? "Hang: ki" : "Hang: be");
  soundLabel();
  $("btnSound").onclick = () => { SFX.toggle(); soundLabel(); };
  $("btnHelp").onclick = () => { $("helpPanel").hidden = !$("helpPanel").hidden; $("testPanel").hidden = true; };
  $("btnTest").onclick = () => { $("testPanel").hidden = !$("testPanel").hidden; $("helpPanel").hidden = true; };
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => (b.closest(".panel").hidden = true)));

  function findStops(pred, allowWin = false) {
    for (let t = 0; t < 50000; t++) {
      const stops = M.strips.map((st) => origRandInt(st.length));
      const line = stops.map((p, i) => M.cell(i, p));
      const win = M.evaluate(line).mult > 0;
      if (pred(line) && (allowWin ? win : !win)) return stops;
    }
    return null;
  }
  function forceSpin(stops) {
    if (!stops || M.s.phase !== "idle" || busy) return;
    M.s.holds = [false, false, false, false];
    forced = stops.slice();
    run(doSpin);
  }
  const noJoker = (l) => !l.some((c) => c.c === "JOKER");
  const lineRanks = (l) => l.filter((c) => c.c && c.c !== "JOKER").map((c) => c.c);
  document.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
    const t = b.dataset.t;
    if (busy) return;
    const idle = M.s.phase === "idle";
    if (t === "win") forceSpin(findStops((l) => noJoker(l) && M.evaluate(l).mult >= 5, true));
    if (t === "21") forceSpin(findStops((l) => noJoker(l) && lineRanks(l).length >= 2 && CBJ.canMake21(lineRanks(l))));
    if (t === "col" && idle) { M.s.collectIdx = cfg.collectRanks.length - 1; refresh(); forceSpin(findStops((l) => noJoker(l) && l.some((c) => c.c === "9"))); }
    if (t === "joker") forceSpin(findStops((l) => l.some((c) => c.c === "JOKER")));
    if (t === "helps") { for (const k of Object.keys(M.s.helps)) M.s.helps[k] = true; refresh(); save(); }
    if (t === "lvl3" && idle) run(async () => { M.startGamble(); M.s.gamble.level = 2; await enterGamble("21"); });
    if ((t === "mp" || t === "mpp") && idle) { M.startMatchPlay(t === "mpp"); startMatchRunner(); }
    if (t === "bj" && idle) run(async () => { say("CLASSIC BLACK JACK!", 1200); await sleep(700); await showDeal(M.startBlackJack("classicbj")); });
    if (t === "wheel") { M.s.wheelLit = M.s.wheelLit.map((_, i) => i !== 0); refresh(); save(); }
    if (t === "row" && idle) { M.s.roundLit = M.s.roundLit.map(() => false); M.s.phase = "rowcatch"; startRowPicker(); }
    if (t === "nudge" && idle) { M.s.phase = "nudgepick"; startNudgePicker(); }
    if (t === "credit") { M.s.credit += 5000; refresh(); save(); }
    if (t === "reset") { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } location.reload(); }
  }));

  // ---------------------------------------------------------------- boot
  function letterButtons() {
    const look = { TART: ["TART", "fire"], "TÉT": ["TÉT", "cream"], START: ["START", "gold"] };
    document.querySelectorAll(".mbtn").forEach((b) => {
      const [t, v] = look[b.textContent.trim()] || look[b.dataset.label] || ["", "fire"];
      if (!t) return;
      b.dataset.label = t;
      b.replaceChildren(mtImg(t, t.length > 4 ? 46 : 52, v, "btnlabel"));
    });
    const plaques = { tet: ["TÉT", 32], l1: ["NYEREMÉNY", 25], l2: ["BONUS BANK", 25], l3: ["KREDIT", 27] };
    for (const [cls, [t, s]] of Object.entries(plaques)) {
      const el = document.querySelector(`#tetPanel .${cls}`);
      if (el) el.replaceChildren(mtImg(t, s, "gold"));
    }
  }
  const fontsReady = document.fonts && document.fonts.load ? document.fonts.load(`40px ${MFONT}`) : Promise.resolve();
  fontsReady.then(() => {
    for (const k in mtCache) delete mtCache[k];
    document.querySelectorAll(".cap").forEach((el) => delete el.dataset.t);
    letterButtons(); refresh();
  }, () => {});
  fit();
  refresh();
  say("CLASSIC BLACK JACK — START", 3000);
  loadSprites().then(() => { drawPrintedStrips(); if (SCENE) drawPaytable(); resReady = true; fit(); requestAnimationFrame(frame); prewarm(); });
  // draw every reel symbol once in the background, so the first spin does not stutter
  function prewarm() {
    const cells = M.strips.flat();
    let i = 0;
    const step = (dl) => { while (i < cells.length && (!dl || dl.timeRemaining() > 2)) symbolSprite(cells[i++]); if (i < cells.length) (window.requestIdleCallback || setTimeout)(step); };
    (window.requestIdleCallback || setTimeout)(step);
  }
  CBJ.ui = { M, refresh, say, save, SFX };
})();
