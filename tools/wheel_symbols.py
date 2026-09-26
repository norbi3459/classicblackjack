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

for name, stretch in (("w_szilva", 1.0), ("w_narancs", 1.0), ("w_dinnye", 1.0), ("w_csengo", 1.08)):
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA")
    if stretch != 1.0:
        im = im.resize((im.width, round(im.height * stretch)), Image.LANCZOS)
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
