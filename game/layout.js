// Positions of every lamp / window on the restored glass artwork, in 2048-wide texture pixels.
// Open index.html?debug to see all rectangles drawn on top of the artwork.
(function (root) {
  const CBJ = (root.CBJ = root.CBJ || {});
  const reelHole = (cx) => ({ x: cx - 92, y: 410, w: 184, h: 348 });
  const trackPts = [
    [1265, 1822], [1375, 1825], [1482, 1827], [1590, 1827], [1699, 1830], [1807, 1832], [1882, 1760], [1712, 1687],
    [1615, 1685], [1517, 1685], [1415, 1684], [1316, 1682], [1240, 1610], [1411, 1542], [1511, 1545], [1647, 1474],
  ];
  const bjRows = { 21: 760, 20: 890, 19: 1025, 18: 1160, 17: 1290 };

  CBJ.layout = {
    top: { w: 2048, h: 2116, img: "assets/top_glass.webp" },
    msgH: 120,
    reelGlass: { w: 2048, h: 1160, img: "assets/reel_glass_holes.webp" },
    deckH: 330,

    reels: [reelHole(235), reelHole(545), reelHole(865), reelHole(1175)],
    reelCenterY: 568,
    reelPitch: 97,

    // the card wheel's middle is level with the reels' middle line (reel windows 410 + 348 / 2 = 584)
    cardWheel: { x: 1377, y: 470, w: 200, h: 228, centerY: 584, pitch: 114 },

    // printed strips (left of each reel window, slightly slanted; the 5th belongs to the card wheel), top -> bottom
    printedStrips: [
      { x0: 121, y0: 352, x1: 91, y1: 812 },
      { x0: 433, y0: 352, x1: 409, y1: 812 },
      { x0: 739, y0: 352, x1: 726, y1: 812 },
      { x0: 1042, y0: 352, x1: 1040, y1: 812 },
    ],
    cardStrip: { x0: 1317, y0: 348, x1: 1319, y1: 808 },
    printedStripW: 34,

    // ---- top glass
    ladder: {
      l4: [220, 1680, 200, 110], lRow: [128, 1520, 692, 156], l10: [200, 1370, 230, 130],
      lClassic: [100, 1210, 215, 150], lSuperLep: [310, 1205, 210, 165], l20: [170, 1070, 260, 130],
      lSuperBJ: [100, 910, 205, 160], lMP: [300, 910, 230, 165], lMPP: [160, 775, 250, 120],
      l25b: [130, 570, 320, 210], l25a: [100, 310, 370, 260],
    },
    wheel: {
      bar: [905, 870, 110, 110], csengo: [1038, 938, 128, 108], bj: [1070, 1045, 190, 145], szilva: [1035, 1210, 140, 135],
      citrom: [885, 1275, 150, 120], dinnye: [755, 1215, 135, 135], narancs: [670, 1045, 150, 140], szolo: [745, 905, 140, 115],
    },
    roundLamps: [195, 338, 480, 620, 757].map((cx) => [cx - 64, 1534, 128, 128]),
    wheelCenter: [870, 1040, 180, 215],
    plus: [510, 1190, 205, 105],
    stop: [510, 1300, 205, 110],
    lepesFel: [840, 1410, 230, 160],
    lepesLe: [840, 1570, 230, 160],
    helps: { dupla: [450, 1730, 175, 155], extra: [575, 1745, 160, 145], joaz: [725, 1750, 160, 135], masik: [870, 1750, 165, 135] },
    triangles: [[455, 1935, 185, 110], [790, 1935, 175, 110], [1120, 1932, 170, 115], [1445, 1935, 175, 112]],
    joker: [980, 1690, 220, 190],
    bjTrack: trackPts.map(([x, y]) => [x - 34, y - 34, 68, 68]),
    bjCircle: Object.fromEntries(Object.entries(bjRows).map(([p, y]) => [p, [1612, y, 110, 110]])),
    bjPaySuper: Object.fromEntries(Object.entries(bjRows).map(([p, y]) => [p, [1440, y + 8, 165, 106]])),
    bjPayClassic: Object.fromEntries(Object.entries(bjRows).map(([p, y]) => [p, [1735, y + 8, 165, 106]])),
    bjHdrSuper: [1330, 590, 230, 150],
    bjHdrDupla: [1560, 620, 170, 90],
    bjHdrClassic: [1775, 615, 230, 140],

    // ---- reel glass
    collect: {
      2: [1800, 700, 92, 122], 3: [1880, 625, 92, 122], 4: [1800, 540, 92, 122], 5: [1880, 465, 92, 122],
      6: [1800, 380, 92, 122], 7: [1880, 305, 92, 122], 8: [1800, 220, 92, 122], 9: [1880, 145, 92, 122],
    },
    // one zigzag column: each panel starts where the one above ends
    multi: { x6: [1590, 68, 186, 142], x3: [1590, 210, 186, 142], x2b: [1590, 352, 186, 150], x2r: [1590, 502, 186, 154], x1: [1590, 656, 186, 164] },
    // steel-blue podiums under the ladder signs whose drawing has none (Match Play+, Super BJ, 20, Classic BJ, Match Play, Super lépések)
    ladderPodiums: [
      [183, 842, 226, 80],
      [103, 982, 194, 80],
      [187, 1110, 240, 98],
      [107, 1268, 202, 82],
      [314, 996, 200, 76],
      [318, 1284, 200, 80],
    ],
    // Black Jack pay plaques beside the 17..21 circles (drawn in code, each its own lamp)
    bjPlaques: {
      super: { x: 1440, w: 165, h: 102, y: { 21: 770, 20: 900, 19: 1033, 18: 1170, 17: 1302 } },
      classic: { x: 1737, w: 162, h: 104, y: { 21: 769, 20: 899, 19: 1033, 18: 1169, 17: 1300 } },
    },
    // sun rays behind the help signs: the same, soft glow behind all four
    sunbursts: [
      { cx: 547, cy: 1810, r: 78, for: "h_dupla" },
      { cx: 690, cy: 1812, r: 78, for: "h_extra" },
      { cx: 821, cy: 1818, r: 78, for: "h_joaz" },
      { cx: 954, cy: 1821, r: 78, for: "h_masik" },
    ],
    // Match Play wheel disc (drawn in code): 8 segments, the symbols sit in their middles
    wheelDisc: { cx: 957, cy: 1150, r: 272, inner: 128 },
    // KISEBB and NAGYOBB: two equal plaques
    kisebb: [285, 250, 310, 58],
    nagyobb: [640, 250, 310, 58],
    cardRow: { x: 112, y: 80, w: 1118, h: 170, n: 12 },
    display: [1352, 908, 586, 100],
    stakeLed: [1500, 856, 190, 46],
  };
})(typeof window !== "undefined" ? window : globalThis);
