// Run: node game/engine.test.js
require("./config.js");
const { Machine, canMake21, bjTotal } = require("./engine.js");
const cfg = globalThis.CBJ.config;
const assert = require("assert");

function seeded(seed) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

assert.ok(canMake21(["Q", "4", "7"]));
assert.ok(canMake21(["A", "K"]));
assert.ok(canMake21(["A", "5", "5"]));
assert.ok(!canMake21(["K", "Q", "2"]));
assert.strictEqual(bjTotal(["A", "K"]), 21);
assert.strictEqual(bjTotal(["A", "A", "9"]), 21);
assert.strictEqual(bjTotal(["K", "Q", "5"]), 25);

const m = new Machine(cfg, seeded(1));
const line = (arr) => arr.map((t) => { const [s, c] = t.split(":"); return { s, c: c || null }; });
assert.strictEqual(m.evaluate(line(["bar", "bar", "bar", "bar"])).mult, cfg.pay4.bar);
assert.strictEqual(m.evaluate(line(["citrom", "citrom", "citrom", "alma"])).mult, cfg.pay3.citrom);
assert.strictEqual(m.evaluate(line(["alma", "narancs", "narancs", "narancs"])).mult, cfg.pay3.narancs);
assert.strictEqual(m.evaluate(line(["cseresznye", "alma", "szilva", "citrom"])).mult, cfg.runPay.cseresznye[1]);
assert.strictEqual(m.evaluate(line(["alma", "szilva", "csillag", "csillag"])).mult, cfg.runPay.csillag[2]);
assert.strictEqual(m.evaluate(line(["alma", "szilva", "citrom", "narancs"])).mult, 0);

// multiplier: collect keeps the win, x1½ pays one and a half on 2..9, x6 pays 6x on K/A
const mm = new Machine(cfg, seeded(3));
mm.s.phase = "multi"; mm.s.pending = 2000;
const c0 = mm.s.credit;
assert.strictEqual(mm.multiCollect().amount, 2000);
assert.strictEqual(mm.s.credit, c0 + 2000);
mm.s.phase = "multi"; mm.s.pending = 2000;
mm.randInt = () => mm.cards.findIndex((c) => c.r === "5");
assert.strictEqual(mm.multiChoose("x1").amount, 3000);
mm.s.phase = "multi"; mm.s.pending = 2000;
mm.randInt = () => mm.cards.findIndex((c) => c.r === "K");
assert.strictEqual(mm.multiChoose("x6").amount, 12000);
assert.strictEqual(mm.s.phase, "multi"); // you may keep multiplying
assert.strictEqual(mm.multiChoose("x6").amount, 72000);
const c1 = mm.s.credit;
mm.multiCollect();
assert.strictEqual(mm.s.credit, c1 + 72000);
assert.strictEqual(mm.s.phase, "idle");

// Kisebb/Nagyobb starts below the "4": nothing to take yet
const g0 = new Machine(cfg, seeded(4));
g0.startGamble();
assert.strictEqual(g0.s.gamble.level, -1);
assert.ok(g0.collect().error);

// ladder choice level
const lc = new Machine(cfg, seeded(5));
lc.startGamble();
lc.s.gamble.level = 3;
const col = lc.collect();
assert.ok(col.choose && lc.s.phase === "choose");
const ch = lc.choose("lClassic");
assert.strictEqual(ch.feature, "classicbj");

// round lamps: 5 catches in one go -> 20x stake; a miss ends it
const rl = new Machine(cfg, seeded(9));
rl.startGamble(); rl.s.gamble.level = 1; rl.collect();
assert.strictEqual(rl.s.phase, "rowcatch");
let last;
for (let i = 0; i < 5; i++) last = rl.rowCatch(true);
assert.ok(last.complete && last.amount === cfg.roundLamps.fullPrize * rl.stake && rl.s.phase === "multi");
const rm = new Machine(cfg, seeded(10));
rm.s.phase = "rowcatch"; rm.rowCatch(true); rm.rowCatch(true);
const miss = rm.rowCatch(false);
assert.ok(miss.miss && miss.caught === 2 && miss.amount === 0 && rm.s.phase === "idle");
const rs = new Machine(cfg, seeded(12));
rs.s.phase = "rowcatch"; rs.rowCatch(true); rs.rowCatch(true); rs.rowCatch(true);
const stop = rs.rowStop();
assert.strictEqual(stop.amount, 3 * cfg.roundLamps.perLamp * rs.stake); // 3 lamps = 12x
assert.strictEqual(rs.s.phase, "multi");

// super lépések: the step count is caught first, every move costs one step, the last one evaluates the line
const nd = new Machine(cfg, seeded(11));
nd.startGamble(); nd.s.gamble.level = 3; nd.collect();
nd.choose("lSuperLep");
assert.strictEqual(nd.s.phase, "nudgepick");
assert.strictEqual(nd.nudgePick(7).steps, 7);
assert.strictEqual(nd.s.phase, "nudge");
const s0 = nd.s.stops[2];
nd.nudgeMove(2);
assert.strictEqual(nd.s.stops[2], (s0 + 1) % nd.strips[2].length);
while (nd.s.phase === "nudge") nd.nudgeMove(0);
assert.ok(["idle", "multi"].includes(nd.s.phase));

// joker: catching the 9 completes the collection and starts Kisebb/Nagyobb
const jk = new Machine(cfg, seeded(13));
jk.s.phase = "joker"; jk.s.collectIdx = 2;
const jr = jk.jokerCatch("c_9");
assert.deepStrictEqual(jr.collected, ["4", "5", "6", "7", "8", "9"]);
assert.strictEqual(jk.s.phase, "gamble");
assert.strictEqual(jk.s.collectIdx, 0);
const jk2 = new Machine(cfg, seeded(14));
jk2.s.phase = "joker"; jk2.jokerCatch("c_5");
assert.strictEqual(jk2.s.collectIdx, 4);
assert.strictEqual(jk2.s.phase, "idle");

// long simulation: invariants hold and the features are reachable
const sim = new Machine(cfg, seeded(42));
sim.s.credit = 1e9;
const stats = { spins: 0, wins: 0, t21: 0, tcol: 0, jokers: 0, gambles: 0, chooses: 0, mp: 0, jackpots: 0, bj: 0 };
let moneyIn = 0, moneyOut = 0;
for (let i = 0; i < 200000; i++) {
  const before = sim.s.credit;
  const r = sim.spin();
  if (r.autoHeld) sim.applyHolds(r.autoHeld);
  stats.spins++;
  moneyIn += sim.stake;
  if (r.win.amount) stats.wins++;
  if (r.joker) stats.jokers++;
  if (r.trigger === "21") stats.t21++;
  if (r.trigger === "collection") stats.tcol++;
  assert.ok(sim.s.collectIdx >= 0 && sim.s.collectIdx < cfg.collectRanks.length);
  let guard = 0;
  while (sim.s.phase !== "idle") {
    assert.ok(guard++ < 1000, "stuck in " + sim.s.phase);
    const ph = sim.s.phase;
    if (ph === "joker") { const free = Object.keys(sim.s.helps).filter((k) => !sim.s.helps[k]).concat(r.jokerCards.map((c) => "c_" + c)); sim.jokerCatch(free[sim.randInt(free.length)]); }
    else if (ph === "multi") sim.multiCollect();
    else if (ph === "gamble") {
      stats.gambles++;
      const g = sim.s.gamble;
      if (g.level >= 3 || (g.level >= 0 && sim.rng() < 0.3)) sim.collect();
      else sim.guess(sim.rankIdx(g.card.r) < 6 ? "higher" : "lower");
    } else if (ph === "choose") {
      stats.chooses++;
      const o = sim.s.choice.options;
      sim.choose(o[sim.randInt(o.length)].id);
    } else if (ph === "matchplay") {
      stats.mp++;
      sim.matchCatch(sim.randInt(cfg.matchPlay.wheel.length));
    } else if (ph === "mpdir") {
      const r = sim.matchStep(sim.rng() < 0.5 ? "up" : "down");
      stats.mp4 = (stats.mp4 || 0) + (r.count === 4);
      if (r.jackpot) stats.jackpots++;
    } else if (ph === "plusstop") sim.plusStop(sim.rng() < 0.4);
    else if (ph === "blackjack") { stats.bj++; if (sim.s.bj.points < 17) sim.bjHit(); else sim.bjStand(); }
    else if (ph === "rowcatch") { stats.rows = (stats.rows || 0) + 1; if (sim.rng() < 0.3) sim.rowStop(); else sim.rowCatch(sim.rng() < 0.75); }
    else if (ph === "nudgepick") sim.nudgePick(1 + sim.randInt(16));
    else if (ph === "nudge") { stats.nudges = (stats.nudges || 0) + 1; if (sim.rng() < 0.3) sim.nudgeToggleDir(); sim.nudgeMove(sim.randInt(4)); }
  }
  moneyOut += sim.s.credit - before + sim.stake;
}
console.log(stats);
console.log("visszafizetés (RTP) a jelenlegi tervezet-beállításokkal:", ((moneyOut / moneyIn) * 100).toFixed(1) + "%");
console.log("OK");
