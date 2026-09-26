"""Three-cherry bunch as on the machine's reels, built from the two-cherry drawing symbols_v3/cseresznye_B5.png:
the right cherry is copied once more to the front, below between the two, with its own stem up to the others.

    python tools/cherry3.py <out.png>      (then tools/add_rim.py puts the peach rim round it)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = "artwork/symbols_v3/cseresznye_B5.png"
BERRY = (667, 646, 164)          # right cherry: centre and radius incl. its outline, in source pixels
FRONT = (515, 790)               # where the copy goes
JOIN = (492, 262)                # where the stems meet
OUTLINE, STEM = (100, 4, 15, 255), (118, 203, 62, 255)

src = Image.open(SRC).convert("RGBA")
W, H = src.size
out = Image.new("RGBA", (W, H + 200), (0, 0, 0, 0))

# the front cherry's stem goes behind the two back cherries, from the stub on the copy up to the others
d = ImageDraw.Draw(out)
stub = (FRONT[0] - 40, FRONT[1] - 130)
pts = [stub, (stub[0] + 8, 470), (JOIN[0] + 4, JOIN[1] + 30)]
d.line(pts, fill=OUTLINE, width=34, joint="curve")
d.line(pts, fill=STEM, width=18, joint="curve")
out.alpha_composite(src)

cx, cy, r = BERRY
berry = src.crop((cx - r, cy - r, cx + r, cy + r))
mask = Image.new("L", berry.size, 0)
ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
berry.putalpha(Image.fromarray(np.minimum(np.array(berry.getchannel("A")), np.array(mask))))
out.alpha_composite(berry, (FRONT[0] - r, FRONT[1] - r))
out.save(sys.argv[1])
