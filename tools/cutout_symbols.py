"""Cut the restored original symbols (assets/symbols_clean/...) out of their background.

The crops still show the reel drum (or the red wheel), the card tag beside the symbol and bits of
the neighbours. GrabCut separates the symbol with its peach rim; per symbol, rectangles given in
fractions of the image force the card tag and the neighbours to background.

    python tools/cutout_symbols.py [outdir]      (needs: pip install opencv-python-headless numpy)
"""
import os
import sys

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..")
REEL = os.path.join(ROOT, "assets", "symbols_clean", "digital-art")
WHEEL = os.path.join(ROOT, "assets", "symbols_clean", "wheel")

# name in the game: (source file, grabcut rect (x0, y0, x1, y1), forced background rects), all in fractions
SYMBOLS = {
    "alma": (os.path.join(REEL, "apple.png"), (0.03, 0.05, 0.86, 0.98), [(0.84, 0.0, 1.0, 1.0), (0.0, 0.0, 1.0, 0.04)]),
    "csengo": (os.path.join(REEL, "bell.png"), (0.08, 0.12, 0.92, 0.9), [(0.0, 0.0, 1.0, 0.1), (0.8, 0.72, 1.0, 1.0), (0.0, 0.85, 1.0, 1.0)]),
    "citrom": (os.path.join(REEL, "lemon.png"), (0.03, 0.05, 0.97, 0.97), []),
    "narancs": (os.path.join(REEL, "orange.png"), (0.05, 0.08, 0.95, 0.92), [(0.0, 0.0, 1.0, 0.06), (0.8, 0.72, 1.0, 1.0), (0.0, 0.8, 0.12, 1.0)]),
    "szilva": (os.path.join(REEL, "plum.png"), (0.05, 0.05, 0.97, 0.97), []),
    "csillag": (os.path.join(REEL, "star.png"), (0.03, 0.05, 0.84, 0.98), [(0.83, 0.0, 1.0, 1.0), (0.0, 0.0, 1.0, 0.04)]),
    "dinnye": (os.path.join(REEL, "watermelon.png"), (0.05, 0.05, 0.84, 0.97), [(0.82, 0.0, 1.0, 1.0), (0.0, 0.0, 0.05, 1.0)]),
    "bar": (os.path.join(REEL, "bar.png"), (0.02, 0.05, 0.97, 0.97), []),
    "szolo": (os.path.join(WHEEL, "grapes.png"), (0.03, 0.03, 0.97, 0.97), []),
}


def cut(src, rect, bgs):
    img = cv2.imread(src, cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    x0, y0, x1, y1 = int(rect[0] * w), int(rect[1] * h), int(rect[2] * w), int(rect[3] * h)
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    # the middle of the symbol is surely the symbol
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    cv2.ellipse(mask, (cx, cy), ((x1 - x0) // 5, (y1 - y0) // 5), 0, 0, 360, cv2.GC_FGD, -1)
    for b in bgs:
        mask[int(b[1] * h):int(b[3] * h), int(b[0] * w):int(b[2] * w)] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    # keep the biggest piece, fill its holes, smooth the edge a little
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = np.where(lab == big, 255, 0).astype(np.uint8)
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    fg = np.zeros_like(fg)
    cv2.drawContours(fg, cnts, -1, 255, -1)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    alpha = cv2.GaussianBlur(fg, (5, 5), 0)
    out = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    out[:, :, 3] = alpha
    ys, xs = np.where(alpha > 8)
    m = 4
    return out[max(0, ys.min() - m):ys.max() + m + 1, max(0, xs.min() - m):xs.max() + m + 1]


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "game", "assets", "sprites")
    os.makedirs(outdir, exist_ok=True)
    for name, (src, rect, bgs) in SYMBOLS.items():
        res = cut(src, rect, bgs)
        cv2.imwrite(os.path.join(outdir, name + ".png"), res)
        print(name, res.shape[1], "x", res.shape[0])
