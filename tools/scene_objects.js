// Builds the list of objects to redraw one by one (artwork/scene/objects.json).
// Every object becomes its own sprite; "lamp" links it to the game lamp it represents,
// "reuse" places the same sprite at several lamps (identical printed parts).
const fs = require("fs");
const path = require("path");
require("../game/config.js");
require("../game/layout.js");
const L = globalThis.CBJ.layout;

const objs = [];
// reuse: [{ id, rect }] = further copies of the same sprite, placed with the same offset relative to their rect
const add = (panel, id, rect, what, o = {}) => objs.push({ panel, id, rect: rect.map(Math.round), what, pad: o.pad ?? 0.25, key: o.key ?? "green", lamp: o.lamp ?? null, reuse: o.reuse ?? null, z: o.z ?? 2 });
const reel = (cx) => [cx - 155, 340, 310, 500];
const big = (n, extra = "") => `the sign with the big glowing orange-red number '${n}' with a thick yellow outline${extra}, including its backing panel.`;

// ---------------- top glass
add("top", "logo", [430, 110, 920, 660], "the big 'Classic BLACK JACK' logo: red script 'Classic' with an orange outline above red distressed block letters 'BLACK' and 'JACK' on light blue rounded tiles with a golden outer outline.", { pad: 0.08 });
add("top", "l25a", L.ladder.l25a, big(25, " and below it the small text '175' and 'BONUS'"), { lamp: "l25a" });
add("top", "l25b", L.ladder.l25b, big(25, " and the small text below it exactly as printed"), { lamp: "l25b" });
add("top", "lMPP", L.ladder.lMPP, "the red sign reading 'MATCH' above 'PLAY' with a '+' sign and the small word 'PLUS' on its right, including its backing panel.", { lamp: "lMPP" });
add("top", "lSuperBJ", L.ladder.lSuperBJ, "the sign with the yellow word 'SUPER' above a small 'Classic BLACK JACK' logo: red script 'Classic', red block letters 'BLACK' and 'JACK' on light blue tiles.", { lamp: "lSuperBJ" });
add("top", "lMP", L.ladder.lMP, "the glowing red sign reading 'MATCH' above 'PLAY', including its backing panel.", { lamp: "lMP" });
add("top", "l20", L.ladder.l20, big(20), { lamp: "l20" });
add("top", "lClassic", L.ladder.lClassic, "the small 'Classic BLACK JACK' logo sign: red script 'Classic', red block letters 'BLACK' and 'JACK' on light blue tiles with a golden outline.", { lamp: "lClassic" });
add("top", "lSuperLep", L.ladder.lSuperLep, "the sign reading 'SUPER' in orange letters above 'LÉPÉSEK' in red letters (Hungarian, accents on both É letters), including its backing panel.", { lamp: "lSuperLep" });
add("top", "l10", L.ladder.l10, big(10), { lamp: "l10" });
add("top", "rowBar", L.ladder.lRow, "the long horizontal rounded red bar with five round lamp sockets in it. Make all five round sockets empty dark circles (remove their icons).", { pad: 0.12, lamp: "lRow", z: 1 });
add("top", "roundLamp", L.roundLamps[0], "one glowing round lamp with a small cartoon figure icon on an orange background, with its round rim.", { pad: 0.35, reuse: L.roundLamps.map((r, i) => ({ id: "rc" + (i + 1), rect: r })) });
add("top", "l4", L.ladder.l4, big(4), { lamp: "l4" });
add("top", "sign4below", [205, 1790, 210, 120], "the small red sign with its lettering exactly as printed.");
add("top", "plus", L.plus, "the green sign reading 'PLUS', including its frame.", { lamp: "plus", key: "magenta" });
add("top", "stop", L.stop, "the dark red sign reading 'STOP', including its frame.", { lamp: "stop" });
add("top", "lepesFel", L.lepesFel, "the red house-shaped sign pointing up with yellow letters 'LÉPÉS' above 'FEL' (Hungarian).", { lamp: "lepesFel" });
add("top", "lepesLe", L.lepesLe, "the red sign pointing down with yellow letters 'LÉPÉS' above 'LE' (Hungarian).", { lamp: "lepesLe" });
add("top", "wheelDisc", [660, 860, 600, 640], "the round wheel: the red disc with its dark radial spokes and its thin golden rim. Remove all eight symbols and the center label; leave the disc and the spokes empty.", { pad: 0.06, key: "blue", z: 1 });
const wheelWhat = { bar: "the 'BAR' sign", csengo: "the golden bell", bj: "the small 'Classic BLACK JACK' logo", szilva: "the blue plum with its leaf", citrom: "the yellow lemon", dinnye: "the green watermelon slice", narancs: "the orange", szolo: "the red bunch of grapes" };
for (const [sym, r] of Object.entries(L.wheel)) add("top", "w_" + sym, r, wheelWhat[sym] + " with its golden outline.", { lamp: "w_" + sym, pad: 0.2, key: sym === "dinnye" ? "magenta" : "green" });
add("top", "wc", L.wheelCenter, "the round center label: the words 'HA', 'MINDEN', 'VILÁGÍT' (Hungarian, accent on Á) above a big '25' and the small text '175' and 'BONUS'.", { lamp: "wc", pad: 0.1 });
add("top", "helpsBanner", [440, 1690, 580, 200], "the dark blue rounded banner strip with the small yellow-green header sign on top. Remove the four red signs on the banner and leave it empty.", { pad: 0.08, z: 1 });
add("top", "h_dupla", L.helps.dupla, "the small sign with the red word 'DUPLA' on top and 'BLACK' above 'JACK' in red block letters on white tiles.", { lamp: "h_dupla" });
add("top", "h_extra", L.helps.extra, "the small dark red oval sign reading 'EXTRA' above 'LÉPÉS' (Hungarian).", { lamp: "h_extra" });
add("top", "h_joaz", L.helps.joaz, "the small dark red oval sign reading 'JÓ AZ' above 'EGYENLŐ' (Hungarian).", { lamp: "h_joaz" });
add("top", "h_masik", L.helps.masik, "the small dark red oval sign reading 'MÁSIK' above 'KÁRTYA' (Hungarian).", { lamp: "h_masik" });
add("top", "joker", L.joker, "the cartoon joker jester face with a red and yellow hat and the word 'JOKER' on the hat.", { lamp: "joker", pad: 0.12 });
L.triangles.forEach((r, i) => add("top", "tri" + i, r, "the triangular lamp button with its printed icon exactly as it appears.", { lamp: "tri" + i }));
add("top", "hdrSuper", L.bjHdrSuper, "the yellow word 'SUPER' above a small 'Classic BLACK JACK' logo.", { lamp: "hdrSuper" });
add("top", "hdrDupla", L.bjHdrDupla, "the yellow word 'DUPLA' with its dark outline.", { lamp: "hdrDupla", pad: 0.3 });
add("top", "hdrClassic", L.bjHdrClassic, "the small 'Classic BLACK JACK' logo.", { lamp: "hdrClassic" });
add("top", "haVilagit", [1225, 815, 180, 420], "the tall yellow panel headed 'HA VILÁGÍT' with its list of small lines exactly as printed.", { pad: 0.12, z: 1 });
add("top", "orangePanel", [1225, 1235, 175, 160], "the small orange panel with its fine lines exactly as printed.", { pad: 0.15 });
const bps = { 21: 25, 20: 25, 19: 25, 18: 25, 17: 20 }, bpc = { 21: 25, 20: 25, 19: 25, 18: 20, 17: 10 };
for (const [p, r] of Object.entries(L.bjPaySuper)) add("top", "bps_" + p, r, big(bps[p], " and the small text below it exactly as printed"), { lamp: "bps_" + p });
for (const [p, r] of Object.entries(L.bjPayClassic)) add("top", "bpc_" + p, r, big(bpc[p], " and the small text below it exactly as printed"), { lamp: "bpc_" + p });
add("top", "bjCircle", L.bjCircle[21], "one round red lamp disc with a dark center circle. Remove the number, leave the center circle empty.", { key: "blue", pad: 0.3, reuse: [17, 18, 19, 20, 21].map((p) => ({ id: "bc_" + p, rect: L.bjCircle[p] })) });
add("top", "kartyaPontszam", [1265, 1385, 330, 80], "the thin label reading 'KÁRTYA PONTSZÁM' (Hungarian, accents on both Á).", { pad: 0.2 });
const trackR = { 7: [1830, 1690, 110, 150], 13: [1175, 1550, 130, 180], 16: [1580, 1430, 140, 100] };
L.bjTrack.forEach((r, i) => {
  const n = i + 1, rr = trackR[n] || [r[0] - 32, r[1] - 22, r[2] + 64, r[3] + 44];
  add("top", "t_" + n, rr, "only the single red track field (arrow-shaped piece) that contains the small circle closest to the center of the image. Remove the number from its circle and leave the circle empty and dark.", { lamp: "t_" + n, pad: 0.3, z: n === 7 || n === 13 ? 1 : 2 });
});
add("top", "trackWhole", [1165, 1425, 790, 450], "the whole red snake-shaped track made of connected red arrow-shaped fields: the bottom row of arrows pointing right, the U-shaped turn on the right, the middle row of arrows pointing left, the bracket-shaped turn on the left, the upper arrows pointing right and the corner piece at the top. Every field has one small dark round circle; remove all numbers and leave all sixteen circles empty. Do not include the separate red box at the top right, the label above, the yellow track or the background.", { pad: 0.04, z: 1 });
add("top", "trackBox", [1690, 1445, 245, 125], "the red rectangular box with its faint lettering exactly as printed.", { pad: 0.15 });
add("top", "topLeftIcons", [40, 50, 260, 140], "the small round icons exactly as printed.", { pad: 0.15 });
add("top", "topRightLamps", [1630, 40, 330, 150], "the two small red lamp windows.", { pad: 0.15, key: "blue" });
add("top", "topRightSigns", [1640, 380, 300, 230], "the small yellow label and the small 'PLAY' sign with a playing card, exactly as printed.", { pad: 0.12 });
add("top", "bottomRightLabel", [1590, 1960, 230, 60], "the small yellow label with its lettering exactly as printed.", { pad: 0.3 });

// ---------------- reel glass
const cardRow = [["2", "hearts"], ["3", "spades"], ["4", "diamonds"], ["5", "clubs"], ["6", "hearts"], ["7", "spades"], ["8", "diamonds"], ["9", "clubs"], ["J", "hearts"], ["Q", "spades"], ["K", "diamonds"], ["A", "clubs"]];
const cr = L.cardRow, cw = cr.w / cr.n;
cardRow.forEach(([rk, suit], i) => {
  const face = "JQK".includes(rk) ? " with its portrait picture" : "";
  add("reel", "r_" + rk, [cr.x + i * cw, cr.y, cw, cr.h], `only the single playing card in the center: the ${rk} of ${suit}${face}, with its corner index and pips exactly as printed and its light blue edge.`, { lamp: "r_" + rk, pad: 0.15, key: suit === "hearts" || suit === "diamonds" ? "green" : "magenta" });
});
add("reel", "kisebb", L.kisebb, "the red sign reading 'KISEBB' (Hungarian).", { lamp: "kisebb", pad: 0.3 });
add("reel", "nagyobb", L.nagyobb, "the red sign reading 'NAGYOBB' (Hungarian).", { lamp: "nagyobb", pad: 0.3 });
add("reel", "finePrintKN", [300, 300, 760, 40], "the thin line of small light print exactly as it appears.", { pad: 0.3 });
add("reel", "reelFrame", reel(545), "the golden ornamental reel window frame. Remove the reel with its fruit symbols and cards completely and fill the whole window opening inside the frame with the chroma-key color, so only the golden frame remains.", { pad: 0.08, key: "magenta", z: 3, reuse: [235, 545, 865, 1175].map((cx, i) => ({ id: "frame" + i, rect: reel(cx) })) });
add("reel", "kerekSign", [1305, 268, 310, 150], "only the fan-shaped golden sign with the brown letters 'KÁRTYA' on the upper arc and 'KERÉK' below it (Hungarian, accents on Á and É). Nothing below the sign.", { pad: 0.12, z: 3 });
const multi = { x6: "X6", x3: "X3", x2b: "X2", x2r: "X2", x1: "X1" };
for (const [id, r] of Object.entries(L.multi)) add("reel", "m_" + id, r, `the tilted card-shaped panel with the red label '${multi[id]}' and the small printed cards on it exactly as printed.`, { lamp: "m_" + id, pad: 0.15 });
for (const [rank, r] of Object.entries(L.collect)) add("reel", "c_" + rank, r, `the single tilted white playing card '${rank}' with its pips exactly as printed and the small golden coin next to it.`, { lamp: "c_" + rank, pad: 0.2, key: "magenta" });
add("reel", "cardRibbon", [1690, 50, 320, 790], "the vertical light-blue zig-zag ribbon strip that runs down behind the column of playing cards, with its golden outline and the small round golden coins along it. Remove all the white playing cards and the tilted multiplier panels on the left; keep only the ribbon and the coins.", { pad: 0.05, z: 1 });
add("reel", "kartyaOszto", [1830, 830, 175, 80], "the small red label reading 'KÁRTYA' above 'OSZTÓ' (Hungarian).", { pad: 0.2 });

const out = path.join(__dirname, "..", "artwork", "scene", "objects.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(objs, null, 1));
console.log(`${objs.length} objects (${objs.filter((o) => o.panel === "top").length} top, ${objs.filter((o) => o.panel === "reel").length} reel) -> ${out}`);
