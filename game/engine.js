// Game rules only — no DOM. The UI calls these methods and animates the results.
(function (root) {
  const CBJ = (root.CBJ = root.CBJ || {});

  const SUITS = ["h", "s", "d", "c"];
  const isRed = (suit) => suit === "h" || suit === "d";

  function parseStrip(list) {
    return list.map((t, i) => {
      const [s, c] = t.split(":");
      return { s, c: c || null, suit: SUITS[i % 4] };
    });
  }

  function values21(rank) {
    if (rank === "A") return [1, 11];
    if (rank === "J" || rank === "Q" || rank === "K" || rank === "10") return [10];
    return [parseInt(rank, 10)];
  }

  function canMake21(ranks) {
    let sums = new Set([0]);
    for (const r of ranks) {
      const next = new Set();
      for (const s of sums) for (const v of values21(r)) if (s + v <= 21) next.add(s + v);
      sums = next;
    }
    return sums.has(21);
  }

  // best blackjack total (aces 11 where it does not bust)
  function bjTotal(ranks) {
    let t = 0, aces = 0;
    for (const r of ranks) { if (r === "A") { aces++; t += 11; } else t += values21(r)[0]; }
    while (t > 21 && aces) { t -= 10; aces--; }
    return t;
  }

  class Machine {
    constructor(cfg, rng = Math.random) {
      this.cfg = cfg;
      this.rng = rng;
      this.strips = cfg.strips.map(parseStrip);
      this.cards = cfg.cardWheel.map((t) => ({ r: t.slice(0, -1), suit: t.slice(-1) }));
      this.s = {
        credit: cfg.startCredit,
        stakeIdx: 0,
        holds: [false, false, false, false],
        holdOffer: true, // no hold twice in a row
        stops: this.strips.map(() => 0),
        cardPos: 0,
        phase: "idle", // idle | joker | multi | gamble | choose | rowcatch | nudgepick | nudge | matchplay | mpdir | plusstop | blackjack
        lastWin: 0,
        pending: 0,
        pendingTrigger: null,
        resumePhase: null,
        collectIdx: 0,
        helps: { dupla: false, extra: false, joaz: false, masik: false },
        wheelLit: cfg.matchPlay.wheel.map(() => false),
        roundLit: Array(cfg.roundLamps.count).fill(false),
        nudge: null,
        gamble: null,
        choice: null,
        mp: null,
        bj: null,
      };
    }

    // ---- persistence -------------------------------------------------------
    snapshot() {
      const { credit, stakeIdx, stops, cardPos, collectIdx, helps, wheelLit } = this.s;
      return { credit, stakeIdx, stops, cardPos, collectIdx, helps, wheelLit };
    }
    restore(o) {
      if (!o) return;
      for (const k of ["credit", "stakeIdx", "stops", "cardPos", "collectIdx", "helps", "wheelLit"]) {
        if (o[k] !== undefined) this.s[k] = o[k];
      }
    }

    // ---- helpers -----------------------------------------------------------
    get stake() { return this.cfg.stakes[this.s.stakeIdx]; }
    randInt(n) { return Math.floor(this.rng() * n); }
    cell(reel, stop) {
      const st = this.strips[reel];
      return st[((stop % st.length) + st.length) % st.length];
    }
    line() { return this.s.stops.map((p, i) => this.cell(i, p)); }
    countedCells() {
      if (!this.cfg.countWholeWindow) return this.line();
      const out = [];
      this.s.stops.forEach((p, i) => out.push(this.cell(i, p - 1), this.cell(i, p), this.cell(i, p + 1)));
      return out;
    }
    turnCardWheel() {
      this.s.cardPos = this.randInt(this.cards.length);
      return this.cards[this.s.cardPos];
    }
    get card() { return this.cards[this.s.cardPos]; }
    rankIdx(r) { return this.cfg.ranks.indexOf(r); }
    ladderStep(level) { return this.cfg.ladder[level]; }
    ladderLabel(level) {
      const st = this.cfg.ladder[level];
      return st.options ? st.options.map((o) => o.label).join(" / ") : st.label;
    }

    // ---- base game ---------------------------------------------------------
    cycleStake() {
      if (this.s.phase !== "idle") return false;
      this.s.stakeIdx = (this.s.stakeIdx + 1) % this.cfg.stakes.length;
      return true;
    }

    toggleHold(i) {
      if (this.s.phase !== "idle" || !this.cfg.holdEnabled || !this.s.holdOffer) return false;
      const held = this.s.holds.filter(Boolean).length;
      if (!this.s.holds[i] && held >= 3) return false;
      this.s.holds[i] = !this.s.holds[i];
      return true;
    }

    // the machine's own hold: the longest run of equal symbols from either edge that can still pay
    autoHold(line) {
      const syms = line.map((c) => c.s), { pay3, pay4, runPay } = this.cfg;
      const pays = (s) => pay3[s] || pay4[s] || runPay[s];
      let best = [];
      for (const fromRight of [false, true]) {
        const at = (k) => syms[fromRight ? 3 - k : k];
        let n = 1; while (n < 3 && at(n) === at(0)) n++;
        if (n >= 2 && pays(at(0)) && n > best.length) best = [...Array(n).keys()].map((k) => (fromRight ? 3 - k : k));
      }
      return best; // the UI lights them once the reels have stopped (applyHolds)
    }

    applyHolds(list) {
      if (this.s.phase !== "idle" || !this.s.holdOffer) return;
      list.forEach((i) => (this.s.holds[i] = true));
    }

    evaluate(line) {
      const syms = line.map((c) => c.s);
      const { pay4, pay3, runPay } = this.cfg;
      let best = { mult: 0, desc: "", cells: [] };
      const consider = (mult, desc, cells) => { if (mult > best.mult) best = { mult, desc, cells }; };
      const name = (s) => this.cfg.symbols[s] || s;

      if (syms.every((s) => s === syms[0]) && pay4[syms[0]]) consider(pay4[syms[0]], `4 × ${name(syms[0])}`, [0, 1, 2, 3]);
      if (syms[0] === syms[1] && syms[1] === syms[2] && pay3[syms[0]]) consider(pay3[syms[0]], `3 × ${name(syms[0])}`, [0, 1, 2]);
      if (syms[1] === syms[2] && syms[2] === syms[3] && pay3[syms[3]]) consider(pay3[syms[3]], `3 × ${name(syms[3])}`, [1, 2, 3]);
      for (const sym of Object.keys(runPay)) {
        let l = 0; while (l < 4 && syms[l] === sym) l++;
        let r = 0; while (r < 4 && syms[3 - r] === sym) r++;
        if (l) consider(runPay[sym][l], `${l} × ${name(sym)}`, [...Array(l).keys()]);
        if (r) consider(runPay[sym][r], `${r} × ${name(sym)}`, [...Array(r).keys()].map((k) => 3 - k));
      }
      return best;
    }

    spin() {
      const s = this.s;
      if (s.phase !== "idle") return { error: "Most nem lehet pörgetni." };
      if (s.credit < this.stake) return { error: "Nincs elég kredit." };
      s.credit -= this.stake;
      const held = s.holds.slice();
      s.stops = s.stops.map((p, i) => (held[i] ? p : this.randInt(this.strips[i].length)));
      s.holds = [false, false, false, false];

      const line = this.line();
      const win = this.evaluate(line);
      const amount = win.mult * this.stake;
      s.lastWin = amount;

      const counted = this.countedCells();
      const res = { stops: s.stops.slice(), held, line, win: { ...win, amount }, collected: [], collectionReset: false, joker: false, freeHelps: [], trigger: null };

      if (counted.some((c) => c.c === "JOKER")) {
        res.joker = true;
        res.freeHelps = Object.keys(s.helps).filter((k) => !s.helps[k]);
      }

      const ranks = this.cfg.collectRanks;
      if (amount > 0) {
        res.collectionReset = s.collectIdx > 0;
        s.collectIdx = 0;
      } else {
        while (s.collectIdx < ranks.length && counted.some((c) => c.c === ranks[s.collectIdx])) {
          res.collected.push(ranks[s.collectIdx]);
          s.collectIdx++;
        }
      }

      const lineRanks = counted.filter((c) => c.c && c.c !== "JOKER").map((c) => c.c);
      if (s.collectIdx >= ranks.length) {
        res.trigger = "collection";
        s.collectIdx = 0;
      } else if (lineRanks.length >= 2 && canMake21(lineRanks)) {
        res.trigger = "21";
      }
      // Joker: the light runs over the free helps and the missing 2..9 cards, START catches one
      res.jokerCards = res.joker && !res.trigger ? ranks.slice(s.collectIdx) : [];

      s.pending = amount;
      s.pendingTrigger = res.trigger;
      // the next spin may be held only if this one paid nothing and was not held itself
      s.holdOffer = !amount && !held.some(Boolean) && !res.trigger;
      res.autoHeld = s.holdOffer && this.cfg.autoHold ? this.autoHold(line) : [];
      if (res.joker && (res.freeHelps.length || res.jokerCards.length)) s.phase = "joker";
      else this.advance();
      return res;
    }

    // every win goes to the multiplier menu first; then whatever was waiting (PLUS/STOP, Kisebb/Nagyobb) or idle
    advance() {
      const s = this.s;
      if (s.pending > 0 && this.cfg.multiplier.enabled) { s.phase = "multi"; return s.phase; }
      s.credit += s.pending;
      s.pending = 0;
      return this.resume();
    }
    resume() {
      const s = this.s;
      if (s.resumePhase) { s.phase = s.resumePhase; s.resumePhase = null; return s.phase; }
      const t = s.pendingTrigger;
      s.pendingTrigger = null;
      if (t) this.startGamble();
      else s.phase = "idle";
      return s.phase;
    }
    offerWin(amount, resumePhase = null) {
      this.s.lastWin = amount;
      this.s.pending = amount;
      this.s.resumePhase = resumePhase;
      return this.advance();
    }

    // the help lamps flash, START catches the one that is lit
    // a caught card lights the collection up to that card; the 9 completes it and starts Kisebb/Nagyobb
    jokerCatch(k) {
      if (this.s.phase !== "joker") return { error: "Nincs Joker." };
      if (k.startsWith("c_")) {
        const s = this.s, ranks = this.cfg.collectRanks, i = ranks.indexOf(k.slice(2));
        const collected = ranks.slice(s.collectIdx, i + 1);
        s.collectIdx = Math.max(s.collectIdx, i + 1);
        if (s.collectIdx >= ranks.length) { s.collectIdx = 0; s.pendingTrigger = "collection"; }
        return { card: k.slice(2), collected, next: this.advance() };
      }
      const got = !this.s.helps[k];
      this.s.helps[k] = true;
      return { help: k, got, next: this.advance() };
    }

    // ---- risking a win on the card wheel ------------------------------------------
    // a hit multiplies the pending win and the menu comes back: you risk it as long as you like
    multiChoose(id) {
      const s = this.s;
      if (s.phase !== "multi") return { error: "Nincs kockáztatható nyeremény." };
      const opt = this.cfg.multiplier.options.find((o) => o.id === id);
      if (!opt || opt.mult === 1) return this.finishPending(s.pending, { opt, keep: true });
      const card = this.turnCardWheel();
      const hit = opt.ranks ? opt.ranks.includes(card.r) : opt.color === (isRed(card.suit) ? "red" : "black");
      if (hit) {
        s.pending = Math.floor(s.pending * opt.mult);
        s.lastWin = s.pending;
        return { opt, card, pos: s.cardPos, hit, amount: s.pending, again: true };
      }
      return this.finishPending(0, { opt, card, pos: s.cardPos, hit });
    }
    multiCollect() {
      if (this.s.phase !== "multi") return { error: "Nincs kockáztatható nyeremény." };
      return this.finishPending(this.s.pending, { keep: true });
    }
    finishPending(amount, extra) {
      const s = this.s;
      const trigger = s.pendingTrigger;
      s.credit += amount;
      s.lastWin = amount;
      s.pending = 0;
      this.resume();
      return { ...extra, amount, trigger };
    }

    // ---- Kisebb / Nagyobb --------------------------------------------------
    // starts below the first step: even the "4" has to be won with a correct guess
    startGamble() {
      this.s.phase = "gamble";
      const card = this.turnCardWheel();
      this.s.gamble = { level: -1, card };
      return { card, pos: this.s.cardPos };
    }

    guess(dir) {
      const g = this.s.gamble;
      if (this.s.phase !== "gamble" || !g) return { error: "Nincs Kisebb/Nagyobb játék." };
      const prev = g.card;
      const next = this.turnCardWheel();
      const a = this.rankIdx(prev.r), b = this.rankIdx(next.r);
      let result;
      if (a === b) {
        if (this.s.helps.joaz) { this.s.helps.joaz = false; result = "equal-saved"; }
        else result = "equal-lose";
      } else if ((dir === "higher" && b > a) || (dir === "lower" && b < a)) result = "win";
      else result = "lose";
      g.card = next;
      const out = { prev, next, pos: this.s.cardPos, result, level: g.level, usedHelp: result === "equal-saved" ? "joaz" : null };
      if (result === "win") {
        g.level++;
        out.level = g.level;
        if (g.level >= this.cfg.ladder.length - 1) { out.top = true; out.collect = this.collect(); }
      } else if (result === "lose" || result === "equal-lose") {
        this.s.phase = "idle";
        this.s.gamble = null;
      }
      return out;
    }

    useHelp(k) {
      const s = this.s;
      if (!s.helps[k]) return { error: `${this.cfg.helps[k]}: ez a segítség nincs nálad.` };
      if (k === "joaz") return { error: "A „Jó az egyenlő” magától működik, ha egyenlő lap jön." };
      if (k === "dupla") {
        if (s.phase !== "blackjack" || !s.bj) return { error: "A Dupla Black Jack a Black Jack játékban használható." };
        if (s.bj.dupla) return { error: "Már duplázva van." };
        s.helps.dupla = false;
        s.bj.dupla = true;
        return { help: k };
      }
      const g = s.gamble;
      if (s.phase !== "gamble" || !g) return { error: "Ezt a segítséget a Kisebb/Nagyobb játékban lehet használni." };
      s.helps[k] = false;
      if (k === "masik") { const card = this.turnCardWheel(); g.card = card; return { help: k, card, pos: s.cardPos }; }
      if (k === "extra") {
        g.level = Math.min(g.level + 1, this.cfg.ladder.length - 1);
        const out = { help: k, level: g.level };
        if (g.level >= this.cfg.ladder.length - 1) out.collect = this.collect();
        return out;
      }
      return { error: "Ismeretlen segítség." };
    }

    collect() {
      const g = this.s.gamble;
      if (this.s.phase !== "gamble" || !g) return { error: "Nincs mit elvinni." };
      if (g.level < 0) return { error: "Még nincs mit elvinni — előbb találj el egyet." };
      const step = this.cfg.ladder[g.level];
      this.s.gamble = null;
      if (step.options) {
        this.s.phase = "choose";
        this.s.choice = { level: g.level, options: step.options };
        return { choose: true, options: step.options };
      }
      return this.applyPrize(step);
    }

    // the ladder fields you can risk a win for from the current level (e.g. at 20), or null
    riskOptions() {
      const g = this.s.gamble;
      if (this.s.phase !== "gamble" || !g || g.level < 0) return null;
      const ids = this.cfg.ladder[g.level].risk;
      if (!ids) return null;
      const all = this.cfg.ladder.flatMap((st) => (st.options ? st.options : [st]));
      return ids.map((id) => all.find((o) => o.id === id)).filter(Boolean);
    }
    riskPick(id) {
      const opts = this.riskOptions();
      if (!opts) return { error: "Itt nem lehet kockáztatni." };
      const opt = opts.find((o) => o.id === id);
      if (!opt) return { error: "Ismeretlen mező." };
      this.s.gamble = null;
      return this.applyPrize(opt);
    }

    choose(id) {
      if (this.s.phase !== "choose") return { error: "Nincs választás." };
      const opt = this.s.choice.options.find((o) => o.id === id);
      this.s.choice = null;
      return this.applyPrize(opt);
    }

    applyPrize(step) {
      const p = step.prize;
      if (p.credit) {
        const amount = p.credit * this.stake;
        this.offerWin(amount);
        return { step, amount };
      }
      if (p.feature === "matchplay" || p.feature === "matchplayplus") {
        this.startMatchPlay(p.feature === "matchplayplus");
        return { step, feature: p.feature };
      }
      if (p.feature === "classicbj" || p.feature === "superbj") {
        const deal = this.startBlackJack(p.feature);
        return { step, feature: p.feature, deal };
      }
      if (p.feature === "rowcatch") {
        this.s.roundLit = this.s.roundLit.map(() => false);
        this.s.phase = "rowcatch";
        return { step, feature: p.feature };
      }
      if (p.feature === "superlepesek") {
        this.s.phase = "nudgepick";
        return { step, feature: p.feature };
      }
      this.s.phase = "idle";
      return { step, feature: p.feature, notReady: true };
    }

    // ---- 2nd step: round lamps -------------------------------------------------------
    // hit = START was pressed while the "4" was lit. Every lit lamp is worth 4; TART takes it,
    // a miss loses everything, all 5 pays 20.
    rowCatch(hit) {
      if (this.s.phase !== "rowcatch") return { error: "Nincs kerek lámpa elkapás." };
      const rc = this.cfg.roundLamps;
      if (!hit) {
        const caught = this.s.roundLit.filter(Boolean).length;
        this.s.roundLit = this.s.roundLit.map(() => false);
        this.s.lastWin = 0;
        this.s.phase = "idle";
        return { miss: true, caught, amount: 0 };
      }
      const index = this.s.roundLit.indexOf(false);
      this.s.roundLit[index] = true;
      const caught = index + 1;
      const complete = this.s.roundLit.every(Boolean);
      let amount = 0;
      if (complete) {
        amount = rc.fullPrize * this.stake;
        this.s.roundLit = this.s.roundLit.map(() => false);
        this.offerWin(amount);
      }
      return { index, caught, complete, amount, value: caught * rc.perLamp * this.stake };
    }
    rowStop() {
      if (this.s.phase !== "rowcatch") return { error: "Nincs kerek lámpa elkapás." };
      const caught = this.s.roundLit.filter(Boolean).length;
      const amount = caught * this.cfg.roundLamps.perLamp * this.stake;
      this.s.roundLit = this.s.roundLit.map(() => false);
      if (amount > 0) this.offerWin(amount);
      else this.s.phase = "idle";
      return { caught, amount };
    }
    rowValue() { return this.s.roundLit.filter(Boolean).length * this.cfg.roundLamps.perLamp * this.stake; }

    // ---- Super lépések: catch the number of steps, then move the reels by hand ------
    nudgePick(steps) {
      if (this.s.phase !== "nudgepick") return { error: "Nincs lépésszám elkapás." };
      return { steps: this.startNudge(steps) };
    }
    startNudge(steps) {
      if (!steps) steps = 1 + this.randInt(this.cfg.nudge.maxSteps);
      this.s.phase = "nudge";
      this.s.nudge = { steps, dir: "up" };
      return steps;
    }
    nudgeToggleDir() {
      if (this.s.phase !== "nudge") return null;
      this.s.nudge.dir = this.s.nudge.dir === "up" ? "down" : "up";
      return this.s.nudge.dir;
    }
    // TART picks the reel, LÉPÉS FEL / LE alternate and START picks the direction
    nudgeMove(reel, dir) {
      const ng = this.s.nudge;
      if (this.s.phase !== "nudge" || !ng) return { error: "Nincs Super lépések." };
      if (dir) ng.dir = dir;
      const n = this.strips[reel].length;
      const d = ng.dir === "up" ? 1 : -1;
      this.s.stops[reel] = (((this.s.stops[reel] + d) % n) + n) % n;
      ng.steps--;
      const out = { reel, dir: ng.dir, delta: d, stop: this.s.stops[reel], steps: ng.steps };
      if (ng.steps <= 0) out.finish = this.nudgeFinish();
      return out;
    }
    nudgeFinish() {
      if (this.s.phase !== "nudge") return { error: "Nincs Super lépések." };
      const line = this.line();
      const win = this.evaluate(line);
      const amount = win.mult * this.stake;
      this.s.nudge = null;
      this.s.pendingTrigger = null;
      this.offerWin(amount);
      return { win: { ...win, amount } };
    }

    // ---- Match Play ------------------------------------------------------------
    startMatchPlay(plus) {
      this.s.phase = "matchplay";
      this.s.mp = { plus, rounds: 0 };
    }

    // The wheel's lamps flash at random and stop on one symbol; then LÉPÉS FEL / LE picks the direction and the
    // reels step that way from where they are (no spin): a reel that reaches the symbol stays put, the rest go on
    // until the symbol makes a win. Arriving on the two edges first -> both middle reels have to reach it -> 4 of
    // a kind; in the middle -> the first edge reel to arrive already makes 3.
    matchCatch(idx) {
      if (this.s.phase !== "matchplay") return { error: "Nincs Match Play." };
      const sym = this.cfg.matchPlay.wheel[idx];
      this.s.mp.caught = { idx, sym };
      this.s.phase = "mpdir";
      return { sym };
    }

    matchStep(dir) {
      if (this.s.phase !== "mpdir") return { error: "Nincs Match Play irányválasztás." };
      const mp = this.s.mp, { idx, sym } = mp.caught, cfg = this.cfg.matchPlay;
      const d = dir === "up" ? 1 : -1;
      const on = (i) => this.strips[i][this.s.stops[i]].s === sym;
      const won = () => [0, 1, 2].every(on) || [1, 2, 3].every(on);
      const steps = [];
      for (let guard = 0; !won() && guard < 200; guard++) {
        const moved = [];
        for (let i = 0; i < 4; i++) {
          if (on(i)) continue;
          const n = this.strips[i].length;
          this.s.stops[i] = (((this.s.stops[i] + d) % n) + n) % n;
          moved.push(i);
        }
        steps.push({ moved, stops: this.s.stops.slice() });
      }
      const count = [0, 1, 2, 3].every(on) ? 4 : 3;
      const cells = count === 4 ? [0, 1, 2, 3] : [0, 1, 2].every(on) ? [0, 1, 2] : [1, 2, 3];
      const mult = count === 4 ? this.cfg.pay4[sym] : this.cfg.pay3[sym];
      let amount = (mult || 0) * this.stake;

      this.s.wheelLit[idx] = true;
      let jackpot = 0;
      if (this.s.wheelLit.every(Boolean)) {
        jackpot = cfg.jackpotMult * this.stake;
        amount += jackpot;
        this.s.wheelLit = this.s.wheelLit.map((_, k) => k === idx);
      }
      mp.caught = null;
      mp.rounds++;
      this.s.phase = "matchplay";
      if (!mp.plus) this.s.mp = null;
      this.offerWin(amount, mp.plus ? "plusstop" : null);
      return { sym, count, cells, dir, steps, amount, jackpot, stops: this.s.stops.slice(), plus: mp.plus };
    }

    plusStop(isPlus) {
      if (this.s.phase !== "plusstop") return { error: "Nincs PLUS/STOP." };
      if (isPlus) { this.s.phase = "matchplay"; return { again: true }; }
      this.s.phase = "idle";
      this.s.mp = null;
      return { again: false };
    }

    // ---- Black Jack --------------------------------------------------------------
    startBlackJack(kind) {
      this.s.phase = "blackjack";
      this.s.bj = { kind, cards: [], points: 0, dupla: false };
      return this.bjDeal();
    }
    bjDeal() {
      const bj = this.s.bj;
      const card = this.turnCardWheel();
      bj.cards.push(card);
      bj.points = bjTotal(bj.cards.map((c) => c.r));
      const out = { card, pos: this.s.cardPos, points: bj.points };
      if (bj.points > 21) {
        out.bust = true;
        this.s.phase = "idle";
        this.s.bj = null;
      } else if (bj.points === 21) {
        out.stand = this.bjStand();
      }
      return out;
    }
    bjHit() {
      if (this.s.phase !== "blackjack") return { error: "Nincs Black Jack játék." };
      return this.bjDeal();
    }
    bjStand() {
      const bj = this.s.bj;
      if (this.s.phase !== "blackjack" || !bj) return { error: "Nincs Black Jack játék." };
      const mult = this.cfg.blackjack.pay[bj.kind][bj.points] || 0;
      const amount = mult * this.stake * (bj.dupla ? 2 : 1);
      this.s.bj = null;
      this.offerWin(amount);
      return { points: bj.points, amount, dupla: bj.dupla };
    }
  }

  CBJ.Machine = Machine;
  CBJ.canMake21 = canMake21;
  CBJ.bjTotal = bjTotal;
  if (typeof module !== "undefined" && module.exports) module.exports = { Machine, canMake21, bjTotal };
})(typeof window !== "undefined" ? window : globalThis);
