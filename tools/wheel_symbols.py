"""Wheel symbols (game/assets/objects/w_*.png) from the originals in artwork/wheel_src:
the fruit and the bell get the peach sticker rim (the bell stretched taller, as on the machine),
the BAR plate a slightly thicker gold frame.

    python tools/wheel_symbols.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import add_rim  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "artwork", "wheel_src")
OUT = os.path.join(ROOT, "game", "assets", "objects")
TMP = os.path.join(SRC, "_tmp.png")
CRESCENT = {"w_narancs"}  # fruit that get the dark crescent along the bottom, like the lemon


def crescent(im):
    # a dark curved line a little inside the lower edge (as on the lemon): the fruit's shape shifted up by d1
    # minus the shape shifted up by d2, kept to the lower part and faded out towards the sides
    a = np.array(im).astype(np.float32)
    m = a[:, :, 3] > 40
    h = int(np.ptp(np.where(m.any(axis=1))[0]))

    def up(d, dx):
        u = np.zeros_like(m)
        u[:-d, dx:] = m[d:, :-dx]
        return u

    d1, d2, dx = int(h * 0.055), int(h * 0.1), max(2, int(h * 0.02))
    band = m & up(d1, dx) & ~up(d2, dx)
    ys, xs = np.where(m)
    cy, cx, half = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2, (xs.max() - xs.min()) / 2
    yy, xx = np.mgrid[:m.shape[0], :m.shape[1]]
    k = np.clip((yy - cy) / (h * 0.2), 0, 1) * np.clip(1.35 - 1.3 * np.abs(xx - cx) / half, 0, 1)
    k = np.where(band, np.minimum(k, 0.92), 0)[:, :, None]
    a[:, :, :3] = a[:, :, :3] * (1 - k) + np.array([40, 16, 6]) * k
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


# (name, horizontal, vertical stretch)
for name, sx, sy in (("w_szilva", 1, 1), ("w_narancs", 1, 1), ("w_dinnye", 1, 1), ("w_csengo", 1.12, 1.08)):
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA")
    if (sx, sy) != (1, 1):
        im = im.resize((round(im.width * sx), round(im.height * sy)), Image.LANCZOS)
    if name in CRESCENT:
        im = crescent(im)
    im.save(TMP)
    add_rim.main(TMP, os.path.join(OUT, name + ".png"))
os.remove(TMP)

# BAR: the plate on a gold frame a few pixels wider all round
bar = Image.open(os.path.join(SRC, "w_bar.png")).convert("RGBA")
a = np.array(bar.getchannel("A")) > 40
ys, xs = np.where(a)
bar = bar.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
m = 12
out = Image.new("RGBA", (bar.width + 2 * m, bar.height + 2 * m), (0, 0, 0, 0))
d = ImageDraw.Draw(out)
r = bar.height * 0.14
d.rounded_rectangle((0, 0, out.width - 1, out.height - 1), radius=r + m, fill=(74, 44, 8, 255))
d.rounded_rectangle((3, 3, out.width - 4, out.height - 4), radius=r + m - 3, fill=(214, 160, 52, 255))
d.rounded_rectangle((6, 6, out.width - 7, out.height * 0.5), radius=r + m - 6, fill=(246, 206, 106, 255))
out.alpha_composite(bar, (m, m))
out.save(os.path.join(OUT, "w_bar.png"))
print("done")
