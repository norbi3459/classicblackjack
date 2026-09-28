// "3D" for phones: the 3D cabinet rendered in advance from 7 angles (tools/render_cabinet.js), with the live game laid
// onto its two glasses and the buttons on the picture pressable. Drag turns the machine (from angle to angle), two
// fingers zoom and move it, a double tap puts it back. No WebGL, no three.js, no 3D DOM: it works wherever the 2D
// game works, and a phone stays cool. Computers get the real, turnable 3D (view3d.js).
(function () {
  const $ = (id) => document.getElementById(id);
  // Safari draws a perspective-laid box at the screen's full density by itself; other browsers at 1 pixel per CSS
  // pixel, so there the box is made twice as big and laid on half as big (sharp, at some memory)
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const K = IOS ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const MAX_ZOOM = 2.2, STEP_PX = 34;
  let meta = null, metaP = null, root = null, on = false, parts = null, obs = null;
  let view = -1, shown = -1, zoom = 1, panX = 0, panY = 0, glassZoom = 0.5;
  const orient = () => (window.innerHeight >= window.innerWidth ? "portrait" : "landscape");
  const url = (v) => `assets/cab/${v.src}`;

  // loads the positions and the pictures of the phone's current orientation (the other one when it turns)
  const loaded = {};
  function preload(o) {
    return Promise.all(meta[o].views.map((v) => loaded[v.src] || (loaded[v.src] = new Promise((ok) => {
      const im = new Image(); im.onload = im.onerror = () => ok(im); im.src = url(v);
    }))));
  }
  function ready() {
    if (metaP) return metaP;
    metaP = fetch("assets/cab/cab.json").then((r) => r.json()).then((m) => { meta = m; return preload(orient()); })
      .then(() => meta, (e) => { metaP = null; throw e; });
    return metaP;
  }

  // CSS matrix3d that lays a w x h box onto the four corners q (top-left, top-right, bottom-right, bottom-left)
  function onto(w, h, q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const det = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / det, hh = (dx1 * sy - sx * dy1) / det;
    const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
    return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${x0},${y0},0,1)`;
  }

  function build() {
    root = document.createElement("div");
    root.id = "cab";
    root.hidden = true;
    // two pictures: the next angle is decoded behind the shown one, then they swap (no blank frame)
    const shots = [0, 1].map(() => {
      const im = document.createElement("img");
      im.className = "cab-shot"; im.alt = ""; im.draggable = false;
      root.appendChild(im);
      return im;
    });
    const glasses = ["topGlass", "reelGlass"].map((id) => {
      const box = document.createElement("div");
      box.className = "cab-glass";
      root.appendChild(box);
      return { id, el: $(id), box, home: null };
    });
    const buttons = [...Array(6).keys()].map((i) => {
      const d = document.createElement("div");
      d.className = "cab-btn" + (i < 4 ? " tart" : i === 4 ? " tet" : " start");
      d.innerHTML = '<div class="cab-glow"></div><div class="cab-cap"></div>';
      d.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        d.classList.remove("press"); void d.offsetWidth; d.classList.add("press");
        const b = document.querySelector(`.mbtn[data-b="${i}"]`);
        if (b) b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      root.appendChild(d);
      return d;
    });
    const acc = document.createElement("div");
    acc.className = "cab-acc";
    acc.innerHTML = '<div class="cab-slot"></div>';
    acc.addEventListener("pointerdown", (e) => e.stopPropagation());
    acc.addEventListener("click", () => window.CBJ.money && window.CBJ.money.open());
    root.appendChild(acc);
    const hint = document.createElement("div");
    hint.className = "cab-hint";
    hint.textContent = "Húzd: forgatás · két ujj: nagyítás · dupla koppintás: vissza";
    root.appendChild(hint);
    document.body.appendChild(root);
    parts = { shots, glasses, buttons, acc, hint };
    gestures();
  }

  // the live captions and lights of the game's own buttons, onto the picture's buttons
  function sync() {
    if (!parts) return;
    parts.buttons.forEach((d, i) => {
      const b = document.querySelector(`.mbtn[data-b="${i}"]`), cap = $("cap" + i);
      d.classList.toggle("lit", !!b && b.classList.contains("lit"));
      d.classList.toggle("dim", !!b && b.classList.contains("dim"));
      const src = cap && cap.firstElementChild ? cap.firstElementChild.src : "";
      const c = d.lastElementChild;
      if (c.dataset.src !== src) {
        c.dataset.src = src;
        c.replaceChildren();
        if (src) { const im = new Image(); im.src = src; im.alt = ""; c.appendChild(im); }
      }
    });
  }

  // where the picture is on the screen: fitted, then zoomed around the middle and moved by the pan
  function frame(m) {
    const W0 = window.innerWidth, H0 = window.innerHeight, s = Math.min(W0 / m.w, H0 / m.h);
    const W = m.w * s * zoom, H = m.h * s * zoom;
    const mx = Math.max(0, (W - W0) / 2), my = Math.max(0, (H - H0) / 2);
    panX = Math.max(-mx, Math.min(mx, panX)); panY = Math.max(-my, Math.min(my, panY));
    return { W, H, ox: (W0 - W) / 2 + panX, oy: (H0 - H) / 2 + panY };
  }
  function place(v, F) {
    const px = (q) => q.map(([x, y]) => [F.ox + x * F.W, F.oy + y * F.H]);
    v.glasses.forEach((g) => {
      const G = parts.glasses.find((x) => x.id === g.id), q = px(g.quad);
      // the panel is shrunk (a plain 2D scale) to about its size on the screen, then that box is laid onto the glass
      const z = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / g.w, zk = z * K;
      if (g.id === "topGlass") glassZoom = z;
      Object.assign(G.box.style, { width: g.w * zk + "px", height: g.h * zk + "px", transform: onto(g.w * zk, g.h * zk, q) });
      G.el.style.transform = `scale(${zk})`;
      G.box.style.visibility = "visible";
    });
    v.buttons.forEach((bq, i) => Object.assign(parts.buttons[i].style, { width: "100px", height: "100px", transform: onto(100, 100, px(bq)) }));
    Object.assign(parts.acc.style, { width: "100px", height: "140px", transform: onto(100, 140, px(v.acc)) });
  }
  let swapping = null;
  function layout() {
    if (!on || !meta) return;
    const m = meta[orient()];
    if (view < 0 || view >= m.views.length) view = m.start;
    const F = frame(m), v = m.views[view];
    const [a, b] = parts.shots;
    const cur = a.classList.contains("front") ? a : b.classList.contains("front") ? b : null;
    const fit = (im) => Object.assign(im.style, { left: F.ox + "px", top: F.oy + "px", width: F.W + "px", height: F.H + "px" });
    if (cur && cur.dataset.src === v.src) { fit(cur); place(v, F); return; }
    // another angle: decode it behind the shown one, then swap picture and glasses together
    const next = cur === a ? b : a, want = v.src, token = {};
    swapping = token;
    next.dataset.src = want; next.src = url(v); fit(next);
    const done = () => {
      if (swapping !== token) return;
      const F2 = frame(meta[orient()]);
      fit(next); place(v, F2);
      next.classList.add("front"); if (cur) cur.classList.remove("front");
      shown = view;
    };
    (next.decode ? next.decode() : Promise.resolve()).then(done, done);
  }
  const relayout = () => { layout(); window.dispatchEvent(new Event("cabresize")); };

  // ---- touch: one finger turns, two fingers zoom and move, a double tap puts it back
  function gestures() {
    const pts = new Map();
    let dragX = null, acc = 0, pinch = null, lastTap = 0, moved = false, settle = null;
    const setView = (dv) => {
      const n = meta[orient()].views.length, nv = Math.max(0, Math.min(n - 1, view + dv));
      if (nv !== view) { view = nv; layout(); }
    };
    const afterZoom = () => { clearTimeout(settle); settle = setTimeout(() => window.dispatchEvent(new Event("resize")), 250); };
    root.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved = false;
      if (pts.size === 1) { dragX = e.clientX; acc = 0; }
      if (pts.size === 2) {
        const [p, q] = [...pts.values()];
        pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), z: zoom, mx: (p[0] + q[0]) / 2, my: (p[1] + q[1]) / 2, px: panX, py: panY };
        dragX = null;
      }
    });
    root.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size >= 2) {
        const [p, q] = [...pts.values()];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        const z = Math.max(1, Math.min(MAX_ZOOM, pinch.z * (d / pinch.d)));
        // keep the point between the fingers where it is
        const W0 = window.innerWidth / 2, H0 = window.innerHeight / 2, k = z / pinch.z;
        zoom = z;
        panX = (pinch.px - (pinch.mx - W0)) * k + (mx - W0);
        panY = (pinch.py - (pinch.my - H0)) * k + (my - H0);
        moved = true;
        layout();
        return;
      }
      if (dragX !== null) {
        const dx = e.clientX - dragX;
        dragX = e.clientX;
        acc += dx;
        if (Math.abs(acc) > 6) moved = true;
        while (acc >= STEP_PX) { acc -= STEP_PX; setView(-1); }
        while (acc <= -STEP_PX) { acc += STEP_PX; setView(1); }
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pinch && pts.size < 2) { pinch = null; afterZoom(); if (pts.size === 1) { dragX = [...pts.values()][0][0]; acc = 0; } }
      if (pts.size === 0) {
        dragX = null;
        if (!moved && e.type === "pointerup") {
          const t = performance.now();
          if (t - lastTap < 300 && zoom !== 1) { zoom = 1; panX = panY = 0; layout(); afterZoom(); lastTap = 0; }
          else lastTap = t;
        }
      }
    };
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    // a mouse wheel zooms too (the picture version on a computer)
    root.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoom = Math.max(1, Math.min(MAX_ZOOM, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      layout(); afterZoom();
    }, { passive: false });
    // a drag that ended on a lamp must not click it
    root.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  function onResize() {
    const o = orient();
    if (meta && !loaded[meta[o].views[0].src]) preload(o);
    relayout();
  }

  function enter() {
    if (!meta) throw new Error("cab: not loaded");
    if (!root) build();
    on = true;
    document.body.classList.add("cab3d");
    parts.glasses.forEach((G) => {
      G.home = [G.el.parentNode, G.el.nextSibling];
      G.box.appendChild(G.el);
      G.el.style.transformOrigin = "0 0";
    });
    root.hidden = false;
    zoom = 1; panX = panY = 0;
    layout();
    sync();
    if (!obs) {
      obs = new MutationObserver(() => on && sync());
      obs.observe($("deck"), { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-t"] });
    }
    parts.hint.classList.remove("gone"); void parts.hint.offsetWidth;
    setTimeout(() => parts.hint.classList.add("gone"), 3500);
    window.addEventListener("resize", onResize);
    window.dispatchEvent(new Event("resize"));
  }

  function leave() {
    if (!on) return;
    on = false;
    window.removeEventListener("resize", onResize);
    parts.glasses.forEach((G) => {
      const [parent, next] = G.home;
      parent.insertBefore(G.el, next && next.parentNode === parent ? next : null);
      Object.assign(G.el.style, { transform: "", transformOrigin: "" });
    });
    root.hidden = true;
    parts.glasses.forEach((G) => (G.box.style.visibility = ""));
    parts.shots.forEach((im) => im.classList.remove("front"));
    document.body.classList.remove("cab3d");
    window.dispatchEvent(new Event("resize"));
  }

  // the glass's size on the screen (the game draws its canvases at this sharpness)
  (window.CBJ = window.CBJ || {}).cab = { ready, enter, leave, on: () => on, zoom: () => glassZoom };
})();
