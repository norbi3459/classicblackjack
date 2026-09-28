// Every tunable number and rule of the machine lives here.
// Items marked TERVEZET are best guesses from the photos and still need confirmation.
(function (root) {
  const CBJ = (root.CBJ = root.CBJ || {});

  CBJ.config = {
    startCredit: 10000,
    stakes: [50, 100, 200],

    symbols: {
      szilva: "Szilva", citrom: "Citrom", narancs: "Narancs", dinnye: "Dinnye", alma: "Alma",
      szolo: "Szőlő", korte: "Körte", cseresznye: "Cseresznye", csillag: "Csillag",
      csengo: "Csengő", bar: "BAR", bj: "Classic Black Jack",
    },

    // TERVEZET: multipliers of the stake, read from the pay table (25/175 = 200x confirmed)
    pay4: { bj: 25, bar: 25, korte: 25, dinnye: 20, citrom: 20, szolo: 20, szilva: 10, alma: 10, narancs: 10, csengo: 10 },
    pay3: { bj: 25, bar: 20, korte: 15, dinnye: 10, citrom: 10, szolo: 10, szilva: 10, alma: 10, narancs: 5, csengo: 5 },
    // pays for 1, 2, 3 (or 4) in a row from either edge of the middle line
    runPay: { cseresznye: [0, 2, 5, 10, 10], csillag: [0, 2, 5, 10, 10] },

    // Reel strips, top to bottom as printed on the narrow strip left of each reel window (docs/tarcsaszalagok.md).
    // Order follows the colours readable on the photo; unreadable cells were filled in. "symbol:card" = card tag.
    strips: [
      ["szilva", "cseresznye:5", "dinnye", "citrom:2", "alma", "cseresznye", "korte:9", "szilva:K", "dinnye:4", "csengo", "alma:7", "szilva", "citrom:6", "narancs:A", "szilva", "dinnye:3", "cseresznye:8", "bar", "szolo:J", "szilva:JOKER", "alma:Q", "bj", "csillag:2"],
      ["korte", "szilva:3", "alma", "csengo:9", "narancs", "citrom:7", "szolo", "bar:5", "szilva:2", "szilva:4", "cseresznye:J", "alma", "citrom", "dinnye:7", "csillag:A", "narancs", "szilva:6", "bj", "bar:K", "szilva:8", "alma:JOKER", "cseresznye:3", "citrom:Q"],
      ["szilva", "szolo:8", "szilva:4", "citrom", "bj:K", "narancs", "alma:3", "dinnye:6", "csengo", "cseresznye:2", "alma:9", "csillag", "narancs:5", "alma:A", "dinnye", "szilva:7", "bar", "korte:J", "citrom", "szilva:Q", "alma:JOKER", "korte:K", "cseresznye:4"],
      ["szilva", "szilva:9", "citrom:5", "cseresznye", "dinnye:2", "citrom", "szilva:K", "alma:3", "bj", "dinnye:8", "alma:6", "szilva", "csengo:4", "narancs:3", "bar", "dinnye:A", "citrom:7", "korte", "dinnye", "citrom:JOKER", "narancs:J", "csillag:2", "szolo:Q"],
    ],

    // only the middle 4 positions play (confirmed), for fruits and for cards
    countWholeWindow: false,

    // card set of the machine (top card row on the reel glass): no 10
    ranks: ["2", "3", "4", "5", "6", "7", "8", "9", "J", "Q", "K", "A"],
    rankLabel: {}, // J Q K A are printed as-is on this machine (the jack is "J", confirmed)
    collectRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],

    // TERVEZET: the small card reel (KÁRTYA KERÉK); every rank once red, once black
    cardWheel: ["2h", "3s", "4d", "5c", "6h", "7s", "8d", "9c", "Jh", "Qs", "Kd", "Ac", "2s", "3d", "4c", "5h", "6s", "7d", "8c", "9h", "Js", "Qd", "Kc", "Ah"],

    helps: {
      dupla: "Dupla Black Jack",
      extra: "Extra lépés",
      joaz: "Jó az egyenlő",
      masik: "Másik kártya",
    },
    // the 4 triangle buttons under the top glass, left to right (owner: extra step, other card, pay out;
    // the leftmost is not known yet - Dupla Black Jack for now). "fizet" = take the win, like TÉT (ELVISZ).
    triangles: ["dupla", "extra", "masik", "fizet"],

    // Kisebb/Nagyobb ladder, bottom to top (confirmed order). "options" = the two alternate, START picks.
    ladder: [
      { id: "l4", label: "4", prize: { credit: 4 } },
      { id: "lRow", label: "kerek lámpák", prize: { feature: "rowcatch" } },
      { id: "l10", label: "10", prize: { credit: 10 } },
      { options: [
        { id: "lClassic", label: "Classic Black Jack", prize: { feature: "classicbj" } },
        { id: "lSuperLep", label: "Super lépések", prize: { feature: "superlepesek" } },
      ] },
      // at 20 the machine offers a risk by itself: Classic Black Jack and Super Classic Black Jack flash in turn,
      // START catches one, TÉT takes the 20, TART goes on guessing (owner, 2026-09-28)
      { id: "l20", label: "20", prize: { credit: 20 }, risk: ["lClassic", "lSuperBJ"] },
      { options: [
        { id: "lSuperBJ", label: "Super Classic Black Jack", prize: { feature: "superbj" } },
        { id: "lMP", label: "Match Play", prize: { feature: "matchplay" } },
      ] },
      { id: "lMPP", label: "Match Play +", prize: { feature: "matchplayplus" } },
      { id: "l25b", label: "25", prize: { credit: 25 } }, // TERVEZET
      { id: "l25a", label: "25 / 175", prize: { credit: 200 } },
    ],

    // risking a base-game win on the card wheel (options alternate, START picks)
    multiplier: {
      enabled: true,
      options: [
        { id: "x6", label: "×6 (K vagy A)", mult: 6, ranks: ["K", "A"] },
        { id: "x3", label: "×3 (J, Q, K, A)", mult: 3, ranks: ["J", "Q", "K", "A"] },
        { id: "x2b", label: "×2 (fekete)", mult: 2, color: "black" },
        { id: "x2r", label: "×2 (piros)", mult: 2, color: "red" },
        { id: "x1", label: "×1½ (2–9)", mult: 1.5, ranks: ["2", "3", "4", "5", "6", "7", "8", "9"] },
      ],
    },

    // 2nd ladder step: the "4" flashes, START while it is lit catches the next round lamp (each worth 4);
    // TART takes what is lit, a miss loses it all, all 5 = 20
    roundLamps: { count: 5, perLamp: 4, fullPrize: 20 },

    // Super lépések: the number of steps is caught on the right-hand track, then the reels are moved by hand
    nudge: { maxSteps: 16 },

    matchPlay: {
      wheel: ["bar", "csengo", "bj", "szilva", "citrom", "dinnye", "narancs", "szolo"], // clockwise from top
      jackpotMult: 200,
    },

    // TERVEZET: Black Jack pay per final score (right side of the top glass)
    blackjack: {
      pay: {
        superbj: { 21: 25, 20: 25, 19: 25, 18: 25, 17: 20 },
        classicbj: { 21: 25, 20: 25, 19: 25, 18: 20, 17: 10 },
      },
    },

    holdEnabled: true,
    // automatic hold: after a spin that paid nothing (and was not itself a hold spin) the machine holds
    // the reels of a started line by itself (2 or 3 equal symbols from the left or the right edge)
    autoHold: true,
  };
})(typeof window !== "undefined" ? window : globalThis);
