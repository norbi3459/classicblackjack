// 3D view: the cabinet of 3d/build_cabinet.py rebuilt with three.js, with the live 2D game on its two glasses.
//
// The glasses are the game's own DOM panels (#topGlass, #reelGlass) placed in 3D with CSS3DRenderer, so they
// stay sharp and clickable. The WebGL cabinet is drawn on top of them with a transparent "hole" where each
// glass is: the hole writes depth, so the cabinet still hides the glass correctly when seen from the side.
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "./vendor/three/addons/CSS3DRenderer.js";
import { OrbitControls } from "./vendor/three/addons/OrbitControls.js";
import { RoomEnvironment } from "./vendor/three/addons/RoomEnvironment.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- dimensions, as in build_cabinet.py (m)
// Blender is Z-up with the machine facing -Y; here Y is up and the machine faces +Z.
// f = distance forward from the back face, z = height  ->  three (x, z, f - YB)
const W = 0.66, T = 0.02, WI = W - 2 * T, YB = 0.35;
const DECK_NOSE = [[0.59, 0.89], [0.63, 0.905], [0.67, 0.918], [0.705, 0.932], [0.725, 0.95], [0.732, 0.97],
  [0.728, 0.988], [0.715, 1.0], [0.585, 1.03]];
const SIDE_PROFILE = [[0, 0], [0.5, 0], [0.5, 0.74], [0.505, 0.79], [0.52, 0.83], [0.55, 0.865], ...DECK_NOSE,
  [0.415, 1.335], [0.405, 1.355], [0.395, 1.975], [0.385, 1.993], [0.37, 2.0], [0.02, 2.0], [0, 1.98]];
const DECK_PROFILE = [[0.36, 0.89], ...DECK_NOSE, [0.36, 1.03]];
const REEL_A = [0.585, 1.03], REEL_B = [0.415, 1.335];
const DECK_TOP_A = [0.585, 1.03], DECK_TOP_B = [0.715, 1.0];

let state = null;

function build() {
  // ---- renderers: the DOM glasses below, the WebGL cabinet on top (transparent where the glasses are)
  const root = document.createElement("div");
  root.id = "view3d";
  document.body.appendChild(root);
  const css = new CSS3DRenderer();
  css.domElement.className = "v3d-css";
  root.appendChild(css.domElement);
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
  gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.0;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;
  gl.domElement.className = "v3d-gl";
  root.appendChild(gl.domElement);

  const scene = new THREE.Scene(), cssScene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d11);
  scene.fog = new THREE.Fog(0x0d0d11, 5, 11);
  const pmrem = new THREE.PMREMGenerator(gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  camera.position.set(0.7, 1.55, 3.1);
  const controls = new OrbitControls(camera, css.domElement);
  controls.target.set(0, 1.32, 0.12);
  controls.enableDamping = true;
  controls.minDistance = 0.55;
  controls.maxDistance = 4.5;
  controls.minPolarAngle = 0.75;
  controls.maxPolarAngle = 1.62;
  controls.minAzimuthAngle = -0.8;
  controls.maxAzimuthAngle = 0.8;
  controls.screenSpacePanning = true;

  // ---- materials
  const std = (color, rough, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  const M = {
    body: new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12 }),
    matte: std(0x0b0b0b, 0.78),
    cavity: std(0x111113, 0.85),
    chrome: std(0xe6e6ea, 0.12, { metalness: 1 }),
    brass: std(0xd9a647, 0.25, { metalness: 1 }),
    yellow: std(0xf2a008, 0.35),
    grey: std(0x0f0f11, 0.5),
    blue: std(0x0d2699, 0.4),
  };

  // ---- geometry helpers
  const g3 = (f, z) => [z, f - YB]; // (y, z) of a profile point
  const add = (mesh, shadow = true) => { mesh.castShadow = shadow; mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  function prism(profile, x0, x1, mat, bevel = 0) {
    const shape = new THREE.Shape(profile.map(([f, z]) => new THREE.Vector2(f - YB, z)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: x1 - x0 - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 1,
    });
    geo.rotateY(-Math.PI / 2); // extrusion along -X, shape x -> world z
    geo.translate(x1 - bevel, 0, 0);
    geo.computeVertexNormals();
    return add(new THREE.Mesh(geo, mat));
  }
  const fbox = (x0, x1, f0, f1, z0, z1, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, f1 - f0), mat);
    m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (f0 + f1) / 2 - YB);
    return add(m);
  };
  const cylZ = (r, depth, x, f, z, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 40), mat);
    m.rotation.x = Math.PI / 2; m.position.set(x, z, f - YB);
    return add(m);
  };

  // ---- cabinet body
  prism(SIDE_PROFILE, -W / 2, -W / 2 + T, M.body, 0.004);
  prism(SIDE_PROFILE, W / 2 - T, W / 2, M.body, 0.004);
  prism(DECK_PROFILE, -WI / 2, WI / 2, M.body, 0.003);
  fbox(-WI / 2, WI / 2, 0.01, 0.375, 1.982, 1.998, M.body);
  fbox(-WI / 2, WI / 2, 0.0, 0.012, 0.0, 1.99, M.matte);
  fbox(-WI / 2, WI / 2, 0.372, 0.385, 1.33, 1.985, M.body);
  fbox(-WI / 2, WI / 2, 0.37, 0.41, 1.332, 1.356, M.body);
  // frame slab behind the reel glass, following the tilted edge
  const dir = [REEL_B[0] - REEL_A[0], REEL_B[1] - REEL_A[1]], len = Math.hypot(...dir);
  const out = [dir[1] / len, -dir[0] / len].map((v) => Math.abs(v)); // outward normal (forward, up)
  const off = (p, d) => [p[0] - out[0] * d, p[1] - out[1] * d];
  prism([off(REEL_A, 0.03), off(REEL_A, 0.016), off(REEL_B, 0.016), off(REEL_B, 0.03)], -WI / 2, WI / 2, M.body);
  // cash cavity, coin mech, door, plinth, locks
  fbox(-WI / 2, WI / 2, 0.35, 0.36, 0.7, 0.895, M.cavity);
  fbox(-WI / 2, WI / 2, 0.36, 0.505, 0.685, 0.7, M.cavity);
  fbox(-0.2, -0.08, 0.37, 0.49, 0.7, 0.85, M.grey);
  fbox(-0.175, -0.105, 0.47, 0.515, 0.705, 0.745, M.yellow);
  fbox(-WI / 2, WI / 2, 0.485, 0.497, 0.08, 0.685, M.body);
  fbox(-0.285, 0.285, 0.497, 0.504, 0.11, 0.64, M.body);
  cylZ(0.011, 0.012, 0, 0.508, 0.58, M.chrome);
  fbox(-0.00125, 0.00125, 0.5135, 0.5155, 0.5755, 0.5845, M.matte);
  fbox(-WI / 2, WI / 2, 0.03, 0.47, 0.0, 0.08, M.matte);
  cylZ(0.009, 0.01, 0.05, 0.734, 0.962, M.chrome);
  fbox(0.047, 0.053, 0.7395, 0.7425, 0.927, 0.957, M.brass);
  fbox(0.043, 0.057, 0.74, 0.744, 0.908, 0.93, M.blue);

  // ---- room
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), std(0x1c1c20, 0.55));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), std(0x16161b, 0.9));
  wall.position.set(0, 2.5, -0.6); scene.add(wall);

  // ---- lights
  scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x201a14, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-2.2, 3.2, 2.4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.4, bottom: -0.2, near: 0.5, far: 8 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.8);
  rim.position.set(2, 2.5, -1.5); scene.add(rim);
  // the lit glasses throw warm light on the deck and the buttons
  const glow1 = new THREE.PointLight(0xffb070, 0.5, 1.6, 2); glow1.position.set(0, 1.7, 0.45); scene.add(glow1);
  const glow2 = new THREE.PointLight(0x9fd8ff, 0.4, 1.0, 2); glow2.position.set(0, 1.2, 0.5); scene.add(glow2);

  // ---- the glasses: DOM panel + a hole of the same size in the WebGL picture
  const hole = new THREE.ShaderMaterial({
    blending: THREE.NoBlending,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    // a faint sheen of the glass itself, premultiplied (the page shows through the rest)
    fragmentShader: "varying vec2 vUv; void main() { float a = 0.06 * smoothstep(0.35, 1.0, vUv.y + 0.25 * (1.0 - vUv.x)); gl_FragColor = vec4(vec3(a), a); }",
  });
  const glasses = [];
  function glass(el, width, height, pos, tiltX) {
    const holeMesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.997, height * 0.997), hole);
    holeMesh.position.copy(pos); holeMesh.rotation.x = tiltX;
    scene.add(holeMesh);
    const obj = new CSS3DObject(el);
    obj.position.copy(pos); obj.rotation.x = tiltX;
    obj.scale.setScalar(width / el.offsetWidth);
    cssScene.add(obj);
    glasses.push({ el, obj, home: [el.parentNode, el.nextSibling] });
  }
  const topEl = $("topGlass"), reelEl = $("reelGlass");
  const topH = 0.6 * (topEl.offsetHeight / topEl.offsetWidth), reelH = 0.6 * (reelEl.offsetHeight / reelEl.offsetWidth);
  glass(topEl, 0.6, topH, new THREE.Vector3(0, 1.355 + topH / 2, 0.387 - YB), 0);
  const mid = [(REEL_A[0] + REEL_B[0]) / 2 - out[0] * 0.012, (REEL_A[1] + REEL_B[1]) / 2 - out[1] * 0.012];
  glass(reelEl, 0.6, reelH, new THREE.Vector3(0, mid[1], mid[0] - YB), -Math.atan2(out[1], out[0]));

  // ---- buttons on the deck, wired to the game's own buttons
  const slope = Math.atan2(DECK_TOP_A[1] - DECK_TOP_B[1], DECK_TOP_B[0] - DECK_TOP_A[0]);
  const bf = 0.652, bz = DECK_TOP_A[1] + ((bf - DECK_TOP_A[0]) / (DECK_TOP_B[0] - DECK_TOP_A[0])) * (DECK_TOP_B[1] - DECK_TOP_A[1]);
  const CAP = [0xe9e2dc, 0xe9e2dc, 0xe9e2dc, 0xe9e2dc, 0xd01812, 0x2ac048];
  const buttons = [];
  for (let i = 0; i < 6; i++) {
    const grp = new THREE.Group();
    grp.position.set(-0.25 + i * 0.1, bz, bf - YB); grp.rotation.x = slope;
    scene.add(grp);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.06), M.chrome);
    bezel.position.y = 0.006; bezel.castShadow = true; grp.add(bezel);
    const tex = document.createElement("canvas"); tex.width = tex.height = 256;
    const map = new THREE.CanvasTexture(tex); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const top = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.08, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.15 });
    const side = new THREE.MeshPhysicalMaterial({ color: CAP[i], roughness: 0.3, clearcoat: 0.6, emissive: CAP[i], emissiveIntensity: 0.12 });
    // box face order: +x, -x, +y (top), -y, +z, -z
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.01, 0.048), [side, side, top, side, side, side]);
    cap.position.y = 0.0135; cap.castShadow = true; cap.userData.button = i; grp.add(cap);
    buttons.push({ cap, tex, map, top, side, color: CAP[i], key: "", press: 0 });
  }
  function paintButton(b, i) {
    const dom = document.querySelector(`.mbtn[data-b="${i}"]`), capEl = $("cap" + i);
    const lit = dom && dom.classList.contains("lit"), dim = dom && dom.classList.contains("dim");
    const label = (capEl && capEl.querySelector("img")) || (dom && dom.querySelector("img"));
    const key = (label ? label.src.length + label.src.slice(-40) : "") + lit + dim;
    if (key === b.key) return;
    b.key = key;
    const g = b.tex.getContext("2d"), c = new THREE.Color(b.color);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#" + c.clone().offsetHSL(0, 0, 0.08).getHexString()); grad.addColorStop(1, "#" + c.clone().offsetHSL(0, 0, -0.08).getHexString());
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    if (label && label.complete && label.naturalWidth) {
      const k = Math.min(220 / label.naturalWidth, 110 / label.naturalHeight);
      const w = label.naturalWidth * k, h = label.naturalHeight * k;
      g.drawImage(label, (256 - w) / 2, (256 - h) / 2, w, h);
    }
    b.map.needsUpdate = true;
    const glow = lit ? 0.9 : dim ? 0.02 : 0.15;
    b.top.emissiveIntensity = glow; b.side.emissiveIntensity = glow * 0.8;
    b.top.color.setScalar(dim ? 0.45 : 1);
  }

  // ---- clicks on the 3D buttons (drags still turn the view)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = css.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(buttons.map((b) => b.cap))[0];
    return hit ? hit.object.userData.button : null;
  };
  css.domElement.addEventListener("pointerdown", (e) => {
    const i = pick(e);
    if (i === null) return;
    controls.enabled = false;
    buttons[i].press = performance.now();
    const dom = document.querySelector(`.mbtn[data-b="${i}"]`);
    if (dom) dom.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  window.addEventListener("pointerup", () => { if (state) state.controls.enabled = true; });
  css.domElement.addEventListener("pointermove", (e) => { css.domElement.style.cursor = pick(e) !== null ? "pointer" : ""; });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    // narrow (portrait) screens: a wider lens so the whole machine still fits
    camera.fov = w / h < 1 ? Math.min(55, 30 / (w / h)) : 30;
    camera.updateProjectionMatrix();
    gl.setSize(w, h); css.setSize(w, h);
  }
  window.addEventListener("resize", () => state && state.active && resize());

  function loop(t) {
    if (!state.active) return;
    controls.update();
    buttons.forEach((b, i) => {
      paintButton(b, i);
      const dt = (t - b.press) / 1000;
      b.cap.position.y = 0.0135 - (dt >= 0 && dt < 0.18 ? 0.004 * Math.sin((dt / 0.18) * Math.PI) : 0);
    });
    gl.render(scene, camera);
    css.render(cssScene, camera);
    requestAnimationFrame(loop);
  }
  return { root, gl, css, scene, cssScene, camera, controls, glasses, resize, loop, active: false };
}

function enter() {
  document.body.classList.add("view3d");
  if (!state) state = build();
  // (re)attach the panels: CSS3DRenderer takes the elements out of the page while they are in 3D
  state.glasses.forEach((g) => { if (!g.obj.parent) state.cssScene.add(g.obj); });
  state.root.hidden = false;
  state.active = true;
  state.resize();
  window.dispatchEvent(new Event("resize"));
  requestAnimationFrame(state.loop);
}

function leave() {
  if (!state) return;
  state.active = false;
  state.glasses.forEach((g) => {
    state.cssScene.remove(g.obj);
    const [parent, next] = g.home;
    parent.insertBefore(g.el, next && next.parentNode === parent ? next : null);
    Object.assign(g.el.style, { position: "", transform: "", pointerEvents: "", userSelect: "", display: "" });
  });
  state.root.hidden = true;
  document.body.classList.remove("view3d");
  window.dispatchEvent(new Event("resize"));
}

const btn = $("btn3d");
const set = (on) => {
  on ? enter() : leave();
  btn.textContent = on ? "2D nézet" : "3D gép";
  try { localStorage.setItem("cbj-3d", on ? "1" : "0"); } catch (e) { /* ignore */ }
};
btn.onclick = () => set(!document.body.classList.contains("view3d"));
try { if (localStorage.getItem("cbj-3d") === "1") set(true); } catch (e) { /* ignore */ }
