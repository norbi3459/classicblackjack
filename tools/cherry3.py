"""Three-cherry bunch as on the machine's reels, built from the two-cherry drawing symbols_v3/cseresznye_B5.png.

The right cherry is copied once more to the front, below between the two. The long stems and the leaf are cut off
and replaced by three short stems that meet just above the cherries.

    python tools/cherry3.py <out.png>      (then tools/add_rim.py puts the peach rim round it)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = "artwork/symbols_v3/cseresznye_B5.png"
BERRY = (667, 646, 164)          # right cherry: centre and radius incl. its outline, in source pixels
FRONT = (515, 790)               # where the copy goes
CUT = 470                        # the source's stems are cut here, just above the back cherries (tops at ~480)
RISE = 62                        # how far above the cut the three stems meet
OUTLINE, STEM = (100, 4, 15, 255), (118, 203, 62, 255)


def stem(d, p0, p1, width):
    # slightly bowed stem with a dark outline
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    bow = (mx + (p1[1] - p0[1]) * 0.08, my)
    pts = [p0, bow, p1]
    d.line(pts, fill=OUTLINE, width=int(width + 14), joint="curve")
    d.line(pts, fill=STEM, width=int(width), joint="curve")


src = Image.open(SRC).convert("RGBA")
W, H = src.size

# back cherries without the long stems and the leaf; where the stems leave the cut are the stub ends
back = np.array(src)
back[:CUT] = 0
xs = np.where(back[CUT, :, 3] > 0)[0]
runs = np.split(xs, np.where(np.diff(xs) > 1)[0] + 1)
stubs = [((r[0] + r[-1]) / 2, CUT, max(10, (r[-1] - r[0]) - 14)) for r in runs]
back = Image.fromarray(back)

# the front cherry: a round cut-out of the right one, stem stub and all
cx, cy, r = BERRY
berry = src.crop((cx - r, cy - r, cx + r, cy + r))
mask = Image.new("L", berry.size, 0)
ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
berry.putalpha(Image.fromarray(np.minimum(np.array(berry.getchannel("A")), np.array(mask))))
ba = np.array(berry)
green = (ba[:, :, 1] > 150) & (ba[:, :, 0] < 160) & (ba[:, :, 3] > 0)
gy, gx = np.where(green)
top = gy.min()
front_stub = (FRONT[0] - r + gx[gy < top + 6].mean(), FRONT[1] - r + top + 4)

join = (sum(s[0] for s in stubs) / len(stubs) + 6, CUT - RISE)
width = sum(s[2] for s in stubs) / len(stubs)

out = Image.new("RGBA", (W, H + 200), (0, 0, 0, 0))
d = ImageDraw.Draw(out)
for sx, sy, _ in stubs:
    stem(d, (sx, sy + 6), join, width)
out.alpha_composite(back)
d = ImageDraw.Draw(out)
stem(d, front_stub, join, width)
out.alpha_composite(berry, (FRONT[0] - r, FRONT[1] - r))
# a small knob where the stems meet
d = ImageDraw.Draw(out)
k = width * 0.75
d.ellipse((join[0] - k - 7, join[1] - k - 7, join[0] + k + 7, join[1] + k + 7), fill=OUTLINE)
d.ellipse((join[0] - k, join[1] - k, join[0] + k, join[1] + k), fill=STEM)
out.save(sys.argv[1])
