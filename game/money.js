// Bill acceptor: pick a banknote, it goes into the slot (motor sound), then the credit counts up.
// The notes are the MNB's published "MINTA" specimen images (assets/money). No real money is involved anywhere.
(function () {
  const $ = (id) => document.getElementById(id);
  const NOTES = [500, 1000, 2000, 5000, 10000, 20000];
  const tray = $("moneyTray"), acc = $("acceptor");
  let busy = false;

  tray.querySelector(".tray-notes").append(...NOTES.map((v) => {
    const im = new Image();
    im.src = `assets/money/ft${v}.jpg`; im.alt = `${v} Ft`; im.title = `${v.toLocaleString("hu-HU")} Ft`;
    im.draggable = false;
    im.addEventListener("click", () => insert(v, im));
    return im;
  }));
  const open = () => { if (!busy) tray.hidden = false; };
  const close = () => (tray.hidden = true);
  acc.addEventListener("click", () => (tray.hidden ? open() : close()));
  tray.querySelector(".tray-close").addEventListener("click", close);
  acc.classList.add("ready");

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 2D: the note flies from the tray to the slot, then disappears into it top edge first
  async function fly2d(v, from) {
    // (the phones' 3D picture has its own slot)
    const slot = (document.body.classList.contains("cab3d") && document.querySelector("#cab .cab-slot")) || acc.querySelector(".slot");
    const a = from.getBoundingClientRect(), s = slot.getBoundingClientRect();
    const n = new Image();
    n.src = from.src; n.className = "flynote";
    Object.assign(n.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
    document.body.appendChild(n);
    // turned upright (short edge first), over the slot
    const w = s.width * 0.92, h = w * (a.width / a.height);
    await n.animate([
      { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px", transform: "rotate(0deg)" },
      { left: s.left + (s.width - w) / 2 + "px", top: s.top - h + "px", width: w + "px", height: h + "px", transform: "rotate(0deg)" },
    ], { duration: 450, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" }).finished;
    // the upright note: the image is landscape, so swap to a rotated copy
    n.style.transform = "none";
    Object.assign(n.style, { left: s.left + (s.width - w) / 2 + "px", top: s.top - h + "px", width: w + "px", height: h + "px", objectFit: "cover" });
    const c = document.createElement("canvas"); c.width = from.naturalHeight; c.height = from.naturalWidth;
    const q = c.getContext("2d"); q.translate(c.width, 0); q.rotate(Math.PI / 2); q.drawImage(from, 0, 0);
    n.src = c.toDataURL();
    // pulled in: it slides down behind the slot (clipped at the slot's line)
    n.style.clipPath = "inset(0 0 0 0)";
    await wait(80);
    await n.animate([{ top: s.top - h + "px", clipPath: "inset(0 0 0 0)" }, { top: s.top + "px", clipPath: `inset(0 0 ${h}px 0)` }],
      { duration: 850, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" }).finished;
    n.remove();
  }

  async function countUp(v) {
    const ui = CBJ.ui, steps = Math.min(40, Math.max(5, v / 250)), each = v / steps;
    for (let i = 0; i < steps; i++) {
      ui.M.s.credit += each; ui.refresh();
      if (ui.SFX.coin) ui.SFX.coin(0);
      await wait(35);
    }
    ui.M.s.credit = Math.round(ui.M.s.credit);
    ui.refresh(); ui.save();
  }

  async function insert(v, img) {
    if (busy) return;
    busy = true; close();
    acc.classList.remove("ready"); acc.classList.add("busy");
    const ui = CBJ.ui;
    if (!ui.SFX.play("billIn", { channel: "bill" })) ui.SFX.button();
    const v3 = window.CBJ.view3d;
    if (document.body.classList.contains("view3d") && v3 && v3.insertNote) await v3.insertNote(v, img);
    else await fly2d(v, img);
    await wait(document.body.classList.contains("view3d") ? 0 : 500);
    await countUp(v);
    acc.classList.remove("busy"); acc.classList.add("ready");
    busy = false;
  }

  (window.CBJ = window.CBJ || {}).money = { open, close, insert, notes: NOTES };
})();
