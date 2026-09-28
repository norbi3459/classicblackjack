// Renders the 3D cabinet (game/view3d.js) as still pictures for phones, and where its glasses and buttons are on them.
// Phones show this picture with the live game laid onto the glasses (game/cabinet.js): no WebGL, no three.js,
// nothing that can fail on an iPhone.
//   node tools/render_cabinet.js        (needs the game served on localhost:5173 and Playwright)
// Writes game/assets/cab/portrait.webp, landscape.webp and cab.json.
const path = require("path"), fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright")); }
const OUT = path.join(__dirname, "..", "game", "assets", "cab");
const SHOTS = {
  // upright phone: the glasses and the buttons fill the screen, a little from the right so the side shows
  portrait: { w: 1200, h: 2600, pos: [0.3, 1.5, 2.02], target: [0, 1.4, 0.1], fov: 43 },
  // phone on its side: the upper half of the machine, from the right
  landscape: { w: 2600, h: 1200, pos: [0.6, 1.56, 2.3], target: [0.02, 1.5, 0.1], fov: 31 },
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  p.on("pageerror", (e) => console.log("PAGEERR", e.message));
  await p.goto("http://localhost:5173/game/index.html?hq", { waitUntil: "networkidle" });
  await p.waitForFunction(() => !document.getElementById("menu").classList.contains("loading"), null, { timeout: 60000 });
  await p.evaluate(() => import("./view3d.js").then(() => CBJ.set3d(true)));
  await p.waitForTimeout(4000);
  const meta = {};
  for (const [name, S] of Object.entries(SHOTS)) {
    const r = await p.evaluate((S) => {
      const st = CBJ.view3d, THREE_V = st.camera.position.constructor;
      st.active = false; // stop the live loop, this frame is ours
      // blank caption plates (the page lays the live captions on them), no 3D triangles (the glass has its own)
      for (let i = 0; i < 6; i++) document.getElementById("cap" + i).dataset.t = " ";
      st.buttons.forEach((bt) => (bt.key = "x"));
      st.triangles.forEach((t) => (t.mesh.visible = false));
      st.gl.setPixelRatio(1); st.gl.setSize(S.w, S.h, false);
      st.camera.aspect = S.w / S.h; st.camera.fov = S.fov; st.camera.position.set(...S.pos);
      st.controls.target.set(...S.target); st.camera.lookAt(...S.target); st.camera.updateProjectionMatrix(); st.camera.updateMatrixWorld();
      // one pass of the live loop paints the buttons, then the still frame
      st.active = true; st.loop(performance.now()); st.active = false;
      st.camera.position.set(...S.pos); st.camera.lookAt(...S.target); st.camera.updateMatrixWorld();
      st.gl.render(st.scene, st.camera);
      const url = st.gl.domElement.toDataURL("image/webp", 0.9);
      const proj = (v) => { const q = v.clone().project(st.camera); return [+((q.x + 1) / 2).toFixed(5), +((1 - q.y) / 2).toFixed(5)]; };
      // a glass: its four corners (top-left, top-right, bottom-right, bottom-left of the panel)
      const quad = (g) => {
        g.obj.updateMatrixWorld();
        const w = parseFloat(g.node.style.width) || g.el.offsetWidth || 2048, h = parseFloat(g.node.style.height) || g.el.offsetHeight;
        return [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].map(([x, y]) => proj(new THREE_V(x, y, 0).applyMatrix4(g.obj.matrixWorld)));
      };
      const glasses = st.glasses.map((g) => ({ id: g.el.id, quad: quad(g), w: g.el.offsetWidth || 2048, h: g.el.offsetHeight }));
      // a button: the four corners of its cap's top face
      const buttons = st.buttons.map((bt) => {
        bt.cap.updateMatrixWorld();
        const s = 0.025, y = 0.008;
        return [[-s, y, -s], [s, y, -s], [s, y, s], [-s, y, s]].map(([x, yy, z]) => proj(new THREE_V(x, yy, z).applyMatrix4(bt.cap.matrixWorld)));
      });
      st.acc.updateMatrixWorld();
      const acc = [[-0.055, 0.08, 0.001], [0.055, 0.08, 0.001], [0.055, -0.08, 0.001], [-0.055, -0.08, 0.001]].map(([x, y, z]) => proj(new THREE_V(x, y, z).applyMatrix4(st.acc.matrixWorld)));
      return { url, glasses, buttons, acc };
    }, S);
    fs.writeFileSync(path.join(OUT, name + ".webp"), Buffer.from(r.url.split(",")[1], "base64"));
    meta[name] = { w: S.w, h: S.h, glasses: r.glasses, buttons: r.buttons, acc: r.acc };
    console.log(name, "saved", JSON.stringify(r.glasses.map((g) => g.quad)));
  }
  fs.writeFileSync(path.join(OUT, "cab.json"), JSON.stringify(meta));
  await b.close();
})();
