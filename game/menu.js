// Main menu: choose 2D or 3D (and the 2D layout), sound, full screen, help; then JÁTÉK.
// It opens on every start and from the MENÜ button. The 3D view (view3d.js + three.js) is only
// downloaded the first time 3D is chosen, so the 2D game starts quicker on a phone.
(function () {
  const $ = (id) => document.getElementById(id);
  const ui = CBJ.ui, SFX = ui.SFX;
  const menu = $("menu");
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };

  // the test menu is for working on the game, not for the demo: only on this computer or with ?teszt
  const dev = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || /[?&]teszt/.test(location.search);
  if (!dev) $("btnTest").remove();
  if (!document.fullscreenEnabled) { $("mnFull").hidden = true; $("btnFull").hidden = true; }

  // ---- 3D, loaded on demand
  let v3d = null;
  const load3d = () => v3d || (v3d = import("./view3d.js").then(() => CBJ.set3d, (e) => { v3d = null; throw e; }));
  // build the 3D scene while the menu is up (shaders, textures), so JÁTÉK goes straight in
  let ready3d = null;
  const prep3d = () => ready3d || (ready3d = load3d().then((set) => new Promise((ok, bad) => {
    setTimeout(() => { try { CBJ.prep3d(); ok(set); } catch (e) { ready3d = null; bad(e); } }, 30);
  })));
  const note = (t) => { const n = $("mnNote"); n.textContent = t || ""; n.hidden = !t; };
  const is3d = () => document.body.classList.contains("view3d");
  $("btn3d").onclick = () => load3d().then((set) => set(!is3d()));

  // ---- choices
  let want3d = store.get("cbj-3d") === "1";
  // 3D was being started last time and the page never got past it (a phone that ran out of memory reloads the
  // page): start in 2D and say so
  if (store.get("cbj-3d-boot")) {
    store.set("cbj-3d-boot", ""); store.set("cbj-3d", "0"); want3d = false;
    setTimeout(() => note("A 3D nézet legutóbb nem indult el ezen a készüléken, ezért 2D-ben indul. Újra kipróbálhatod."), 0);
  }
  if (want3d) prep3d().catch(() => {});
  const paint = () => {
    document.querySelectorAll("#mnView button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "3d") === want3d));
    $("mnLayout").hidden = want3d;
    document.querySelectorAll("#mnLayout button").forEach((b) => b.classList.toggle("on", b.dataset.l === ui.view()));
    $("mnSound").textContent = SFX.muted ? "HANG: KI" : "HANG: BE";
    $("mnFull").textContent = document.fullscreenElement ? "ABLAKBAN" : "TELJES KÉPERNYŐ";
  };
  const click = () => { try { SFX.button(); } catch (e) { /* no sound yet */ } };
  document.querySelectorAll("#mnView button").forEach((b) => (b.onclick = () => { click(); want3d = b.dataset.v === "3d"; note(""); if (want3d) prep3d().catch(() => {}); paint(); }));
  document.querySelectorAll("#mnLayout button").forEach((b) => (b.onclick = () => { click(); ui.setView(b.dataset.l); paint(); }));
  $("mnSound").onclick = () => { $("btnSound").click(); click(); paint(); };
  $("mnFull").onclick = () => { click(); $("btnFull").click(); };
  document.addEventListener("fullscreenchange", paint);
  $("mnHelp").onclick = () => { click(); $("helpPanel").hidden = false; $("helpPanel").classList.add("overMenu"); };

  // ---- open / close
  let started = false;
  const open = () => {
    paint();
    $("mnPlay").querySelector("span").textContent = started ? "FOLYTATÁS" : "JÁTÉK";
    menu.hidden = false; menu.classList.remove("closing");
    reels.start();
  };
  const close = () => {
    menu.classList.add("closing");
    reels.stop();
    setTimeout(() => { menu.hidden = true; $("helpPanel").classList.remove("overMenu"); }, 380);
  };
  $("btnMenu").onclick = open;
  $("mnPlay").onclick = async () => {
    const b = $("mnPlay"), label = b.querySelector("span");
    SFX.unlock();
    if (want3d !== is3d()) {
      if (want3d) { b.disabled = true; label.textContent = "3D BETÖLTÉSE…"; }
      try {
        if (want3d) {
          const set = await prep3d();
          store.set("cbj-3d-boot", "1");
          set(true);
          // still alive a few seconds later: this device can do 3D
          setTimeout(() => store.set("cbj-3d-boot", ""), 5000);
        } else (await load3d())(false);
      } catch (e) {
        want3d = false; store.set("cbj-3d", "0"); store.set("cbj-3d-boot", "");
        b.disabled = false; label.textContent = "JÁTÉK"; paint();
        note("A 3D nézet nem indult el ezen a készüléken (" + (e && e.message ? e.message : e) + "). Játssz 2D-ben!");
        return;
      }
      b.disabled = false;
    }
    if (!SFX.play("gambleStart", {})) SFX.button();
    started = true;
    close();
  };
  // while the menu is up the keys belong to it: Enter / Space = JÁTÉK
  window.addEventListener("keydown", (e) => {
    if (menu.hidden) return;
    e.stopImmediatePropagation();
    if ((e.key === "Enter" || e.key === " ") && !$("mnPlay").disabled && document.activeElement === document.body) { e.preventDefault(); $("mnPlay").click(); }
  }, true);

  // ---- loading: the bar under the button until every picture of the machine has arrived
  (function watchLoad() {
    const bar = $("mnLoad"), fill = bar.firstElementChild, t0 = performance.now();
    const tick = () => {
      const imgs = [...document.images].filter((im) => im.getAttribute("src") && !im.src.startsWith("data:"));
      const done = imgs.filter((im) => im.complete).length;
      fill.style.width = (imgs.length ? (100 * done) / imgs.length : 100) + "%";
      if ((done === imgs.length && document.readyState === "complete") || performance.now() - t0 > 20000) { bar.classList.add("done"); return; }
      setTimeout(tick, 150);
    };
    tick();
  })();

  // ---- chasing bulbs around the gold frame
  function placeBulbs() {
    const box = $("mnBulbs"), card = box.parentElement;
    const w = card.clientWidth, h = card.clientHeight, r = 22, inset = -7, gap = 24;
    const W = w - 2 * inset, H = h - 2 * inset, per = 2 * (W + H - 4 * r) + 2 * Math.PI * r;
    const n = Math.max(12, Math.round(per / gap / 3) * 3);
    const pt = (d) => {
      // walk the rounded rectangle: top, right, bottom, left edges with quarter circles in the corners
      const segs = [W - 2 * r, (Math.PI * r) / 2, H - 2 * r, (Math.PI * r) / 2, W - 2 * r, (Math.PI * r) / 2, H - 2 * r, (Math.PI * r) / 2];
      let k = 0;
      while (d > segs[k]) { d -= segs[k]; k = (k + 1) % 8; }
      const x0 = inset, y0 = inset, arc = (cx, cy, a0) => { const a = a0 + d / r; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
      switch (k) {
        case 0: return [x0 + r + d, y0];
        case 1: return arc(x0 + W - r, y0 + r, -Math.PI / 2);
        case 2: return [x0 + W, y0 + r + d];
        case 3: return arc(x0 + W - r, y0 + H - r, 0);
        case 4: return [x0 + W - r - d, y0 + H];
        case 5: return arc(x0 + r, y0 + H - r, Math.PI / 2);
        case 6: return [x0, y0 + H - r - d];
        default: return arc(x0 + r, y0 + r, Math.PI);
      }
    };
    box.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const [x, y] = pt((i * per) / n);
      const b = document.createElement("i");
      b.style.left = x + "px"; b.style.top = y + "px";
      box.appendChild(b);
    }
  }
  new ResizeObserver(placeBulbs).observe($("mnBulbs").parentElement);

  // ---- the four little reels: spin, stop one by one; every other round they line up (and the bulbs race)
  const reels = (function () {
    const SYMS = ["bj", "bar", "csengo", "szilva", "citrom", "dinnye", "narancs", "szolo", "cseresznye", "korte"];
    const strips = [...document.querySelectorAll(".mn-strip")].map((el, i) => {
      const order = SYMS.map((_, k) => SYMS[(k * (i + 3)) % SYMS.length]);
      [...order, ...order].forEach((s) => { const im = document.createElement("img"); im.src = CBJ.IMG(`assets/sprites/${s}.webp`); im.alt = ""; im.draggable = false; el.appendChild(im); });
      return { el, order, pos: i * 2.3, v: 0, target: null };
    });
    let raf = 0, timers = [], last = 0, round = 0;
    const cellPx = () => strips[0].el.firstElementChild.offsetHeight || 60;
    const n = SYMS.length;
    function frame(t) {
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      const c = cellPx();
      for (const s of strips) {
        if (s.target != null) {
          // ease into the target cell
          const d = s.target - s.pos, step = Math.max(0.03, d * 6 * dt);
          if (step >= d) { s.pos = s.target; s.target = null; s.v = 0; s.el.classList.remove("blur"); }
          else s.pos += step;
        } else s.pos += s.v * dt;
        // the middle of the window shows the cell at s.pos (the strip holds the symbols twice)
        const off = ((((s.pos % n) + n) % n) - 0.12) * c;
        s.el.style.transform = `translateY(${-off}px)`;
      }
      raf = requestAnimationFrame(frame);
    }
    function cycle() {
      round++;
      menu.classList.remove("win");
      const same = round % 2 === 0 ? SYMS[Math.floor(Math.random() * 3)] : null;
      strips.forEach((s, i) => {
        s.v = 11 + i; s.target = null; s.el.classList.add("blur");
        timers.push(setTimeout(() => {
          const sym = same || SYMS[Math.floor(Math.random() * n)];
          // stop a couple of cells further on, on that symbol
          const at = ((s.pos % n) + n) % n;
          let d = (s.order.indexOf(sym) - at + n) % n;
          if (d < 2) d += n;
          s.target = s.pos + d;
          s.v = 0;
        }, 900 + i * 320));
      });
      if (same) timers.push(setTimeout(() => menu.classList.add("win"), 900 + 3 * 320 + 700));
      timers.push(setTimeout(cycle, same ? 5200 : 3600));
    }
    return {
      start() { if (raf) return; last = 0; raf = requestAnimationFrame(frame); timers.push(setTimeout(cycle, 700)); },
      stop() { cancelAnimationFrame(raf); raf = 0; timers.forEach(clearTimeout); timers = []; menu.classList.remove("win"); },
    };
  })();
  document.addEventListener("visibilitychange", () => { if (menu.hidden) return; document.hidden ? reels.stop() : reels.start(); });

  open();
})();
