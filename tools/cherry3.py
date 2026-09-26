"""Three-cherry bunch as on the machine's reels, built from the two-cherry drawing symbols_v3/cseresznye_B5.png:
the right cherry (with its stem stub) is copied once more to the front, below between the two. The stems of the
back cherries are cut just above them (leaf and all), each ending in a rounded tip.

    python tools/cherry3.py <out.png>      (then tools/add_rim.py puts the peach rim round it)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = "artwork/symbols_v3/cseresznye_B5.png"
BERRY = (667, 646, 164)          # right cherry: centre and radius incl. its outline, in source pixels
FRONT = (515, 790)               # where the copy goes
CUT = 482                        # stems end here: just above the back cherries (their tops are at ~480)
OUTLINE, STEM = (100, 4, 15, 255), (118, 203, 62, 255)

src = Image.open(SRC).convert("RGBA")
W, H = src.size
out = Image.new("RGBA", (W, H + 200), (0, 0, 0, 0))

out.alpha_composite(src)

cx, cy, r = BERRY
berry = src.crop((cx - r, cy - r, cx + r, cy + r))
mask = Image.new("L", berry.size, 0)
ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
berry.putalpha(Image.fromarray(np.minimum(np.array(berry.getchannel("A")), np.array(mask))))
out.alpha_composite(berry, (FRONT[0] - r, FRONT[1] - r))

# cut the stems short: clear everything above CUT, then round off each stem end
a = np.array(out)
a[:CUT - 12] = 0
row = a[CUT - 12, :, 3] > 0
d = ImageDraw.Draw(out := Image.fromarray(a))
xs = np.where(row)[0]
runs = np.split(xs, np.where(np.diff(xs) > 1)[0] + 1) if len(xs) else []
for run in runs:
    x0, x1 = run[0], run[-1]
    cx, rr = (x0 + x1) / 2, (x1 - x0) / 2
    y = CUT - 12
    d.ellipse((cx - rr, y - rr, cx + rr, y + rr), fill=OUTLINE)
    d.ellipse((cx - rr + 8, y - rr + 8, cx + rr - 8, y + rr - 8), fill=STEM)
    d.rectangle((cx - rr + 8, y, cx + rr - 8, y + 4), fill=STEM)
out.save(sys.argv[1])
