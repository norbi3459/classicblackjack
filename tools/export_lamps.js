// Builds the lamp list (id, panel, rect, mask shape) from game/layout.js.
// Run: node tools/export_lamps.js  -> artwork/lamps.json
const fs = require("fs");
const path = require("path");
require("../game/config.js");
require("../game/layout.js");
const L = globalThis.CBJ.layout;
const cfg = globalThis.CBJ.config;

const out = [];
const add = (panel, id, r, shape = "auto") => out.push({ panel, id, rect: r.map(Math.round), shape });

// top glass
for (const [id, r] of Object.entries(L.ladder)) add("top", id, r);
for (const [sym, r] of Object.entries(L.wheel)) add("top", "w_" + sym, r);
add("top", "wc", L.wheelCenter, "ellipse");
L.roundLamps.forEach((r, i) => add("top", "rc" + (i + 1), r, "ellipse"));
add("top", "plus", L.plus);
add("top", "stop", L.stop);
add("top", "lepesFel", L.lepesFel);
add("top", "lepesLe", L.lepesLe);
for (const [k, r] of Object.entries(L.helps)) add("top", "h_" + k, r);
L.triangles.forEach((r, i) => add("top", "tri" + i, r));
add("top", "joker", L.joker);
L.bjTrack.forEach((r, i) => add("top", "t_" + (i + 1), [r[0] - 22, r[1] - 16, r[2] + 44, r[3] + 32]));
for (const [p, r] of Object.entries(L.bjCircle)) add("top", "bc_" + p, r, "ellipse");
for (const [p, r] of Object.entries(L.bjPaySuper)) add("top", "bps_" + p, r);
for (const [p, r] of Object.entries(L.bjPayClassic)) add("top", "bpc_" + p, r);
add("top", "hdrSuper", L.bjHdrSuper);
add("top", "hdrDupla", L.bjHdrDupla);
add("top", "hdrClassic", L.bjHdrClassic);

// reel glass
for (const [rank, r] of Object.entries(L.collect)) add("reel", "c_" + rank, r, "rect");
for (const [id, r] of Object.entries(L.multi)) add("reel", "m_" + id, r);
add("reel", "kisebb", L.kisebb);
add("reel", "nagyobb", L.nagyobb);
const cr = L.cardRow, cw = cr.w / cr.n;
cfg.ranks.forEach((rk, i) => add("reel", "r_" + rk, [cr.x + i * cw, cr.y, cw, cr.h], "rect"));

const file = path.join(__dirname, "..", "artwork", "lamps.json");
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${out.length} lamps -> ${file}`);
