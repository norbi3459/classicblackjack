// "3D" for phones: a still of the 3D cabinet, rendered in advance (tools/render_cabinet.js), with the live game laid
// onto its two glasses and the buttons on the picture pressable. No WebGL, no three.js, no 3D DOM: it works wherever
// the 2D game works, and a phone stays cool. Computers get the real, turnable 3D (view3d.js).
(function () {
  const $ = (id) => document.getElementById(id);
  let meta = null, metaP = null, root = null, on = false, zoom = 0.5, parts = null, obs = null;
  const shotName = () => (window.innerHeight >= window.innerWidth ? "portrait" : "landscape");

  // loads the positions and both pictures (so turning the phone is instant)
  function ready() {
    if (metaP) return metaP;
    metaP = fetch("assets/cab/cab.json").then((r) => r.json()).then((m) => {
      meta = m;
      return Promise.all(Object.keys(m).map((n) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = `assets/cab/${n}.webp`; })));
    }).then(() => meta, (e) => { metaP = null; throw e; });
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
    const img = document.createElement("img");
    img.className = "cab-shot"; img.alt = ""; img.draggable = false;
    root.appendChild(img);
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
        e.preventDefault();
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
    acc.addEventListener("click", () => window.CBJ.money && window.CBJ.money.open());
    root.appendChild(acc);
    document.body.appendChild(root);
    parts = { img, glasses, buttons, acc };
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
        const text = src ? null : (b && b.textContent) || "";
        if (src) { const im = new Image(); im.src = src; im.alt = ""; c.appendChild(im); }
        else if (text) c.textContent = text;
      }
    });
  }

  function layout() {
    if (!on || !meta) return;
    const m = meta[shotName()], W0 = window.innerWidth, H0 = window.innerHeight;
    const s = Math.min(W0 / m.w, H0 / m.h), W = m.w * s, H = m.h * s, ox = (W0 - W) / 2, oy = (H0 - H) / 2;
    const px = (q) => q.map(([x, y]) => [ox + x * W, oy + y * H]);
    const src = `assets/cab/${shotName()}.webp`;
    if (parts.img.getAttribute("src") !== src) parts.img.src = src;
    Object.assign(parts.img.style, { left: ox + "px", top: oy + "px", width: W + "px", height: H + "px" });
    m.glasses.forEach((g) => {
      const G = parts.glasses.find((x) => x.id === g.id), q = px(g.quad);
      // the panel is shrunk (a plain 2D scale) to about its size on the screen, then that box is laid onto the glass
      // (browsers draw a perspective-laid box at 1 pixel per CSS pixel: the box is made K times bigger and laid on
      // K times smaller, so the glass comes out at the screen's full sharpness)
      const topW = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
      const z = topW / g.w, K = Math.min(2, window.devicePixelRatio || 1), zk = z * K;
      if (g.id === "topGlass") zoom = z;
      Object.assign(G.box.style, { width: g.w * zk + "px", height: g.h * zk + "px", transform: onto(g.w * zk, g.h * zk, q) });
      Object.assign(G.el.style, { transform: `scale(${zk})` });
    });
    m.buttons.forEach((bq, i) => {
      Object.assign(parts.buttons[i].style, { width: "100px", height: "100px", transform: onto(100, 100, px(bq)) });
    });
    Object.assign(parts.acc.style, { width: "100px", height: "140px", transform: onto(100, 140, px(m.acc)) });
    window.dispatchEvent(new Event("cabresize"));
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
    layout();
    sync();
    if (!obs) {
      obs = new MutationObserver(() => on && sync());
      obs.observe($("deck"), { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-t"] });
    }
    window.addEventListener("resize", layout);
    window.dispatchEvent(new Event("resize"));
  }

  function leave() {
    if (!on) return;
    on = false;
    window.removeEventListener("resize", layout);
    parts.glasses.forEach((G) => {
      const [parent, next] = G.home;
      parent.insertBefore(G.el, next && next.parentNode === parent ? next : null);
      Object.assign(G.el.style, { transform: "", transformOrigin: "" });
    });
    root.hidden = true;
    document.body.classList.remove("cab3d");
    window.dispatchEvent(new Event("resize"));
  }

  (window.CBJ = window.CBJ || {}).cab = { ready, enter, leave, on: () => on, zoom: () => zoom };
})();
