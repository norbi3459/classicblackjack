"""Three-cherry bunch as on the machine's reels, built from the two-cherry drawing symbols_v3/cseresznye_B5.png.

The right cherry is copied once more to the front, below between the two. The long stems and the leaf are cut off
and replaced by three short stems that leave each cherry along its old stub and bend up to a point just above them.

    python tools/cherry3.py <out.png>      (then tools/add_rim.py puts the peach rim round it)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = "artwork/symbols_v3/cseresznye_B5.png"
BERRY = (667, 646, 164)          # right cherry: centre and radius incl. its outline, in source pixels
LEFT = (362, 640, 168)           # left cherry, the same
FRONT = (515, 790)               # where the copy goes
CUT = 470                        # the source's stems are cut here, just above the back cherries (tops at ~480)
RISE = 62                        # how far above the cut the three stems meet
OUTLINE, STEM = (100, 4, 15, 255), (118, 203, 62, 255)


def stem(d, base, direction, p1, width):
    # a stem that leaves its cherry along the old stub (covering it) and bends smoothly up to p1
    dx, dy = direction
    reach = 0.55 * np.hypot(p1[0] - base[0], p1[1] - base[1])
    ctrl = (base[0] + dx * reach, base[1] + dy * reach)
    pts = []
    for i in range(241):
        t = i / 240
        pts.append(((1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * p1[0],
                    (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * p1[1]))
    # stamped discs give a smooth thick curve (PIL's wide polylines leave notches in bends)
    for rad, col in ((width / 2 + 7, OUTLINE), (width / 2, STEM)):
        for x, y in pts:
            d.ellipse((x - rad, y - rad, x + rad, y + rad), fill=col)


src = Image.open(SRC).convert("RGBA")
W, H = src.size

# back cherries without the long stems and the leaf
back = np.array(src)
back[:CUT] = 0


def stub(a, x_hint, y_min, depth=110):
    # the stem stub near x_hint (searched only just below y_min): where it goes into the cherry
    # and its direction (unit vector pointing up along the stub)
    green = (a[:, :, 1] > 150) & (a[:, :, 0] < 160) & (a[:, :, 2] < 120) & (a[:, :, 3] > 200)
    band = np.zeros_like(green)
    band[y_min:y_min + depth, max(0, int(x_hint) - 45):int(x_hint) + 45] = True
    gy, gx = np.where(green & band)
    lo, hi = gy.max(), gy.min()
    base = (gx[gy >= lo - 3].mean(), lo)
    tip = (gx[gy <= hi + 3].mean(), hi)
    v = np.array(tip) - np.array(base)
    return base, tuple(v / np.hypot(*v))


xs = np.where(back[CUT, :, 3] > 0)[0]
runs = np.split(xs, np.where(np.diff(xs) > 1)[0] + 1)
width = max(10, sum((r[-1] - r[0]) - 14 for r in runs) / len(runs))
stubs = [stub(back, (r[0] + r[-1]) / 2, CUT) for r in runs]
# keep only the two round cherries: the rest of the old stubs would peek out beside the new stems
keep = Image.new("L", (W, H), 0)
for x, y, rr in (LEFT, BERRY):
    ImageDraw.Draw(keep).ellipse((x - rr, y - rr, x + rr, y + rr), fill=255)
back[:, :, 3] = np.minimum(back[:, :, 3], np.array(keep))
back = Image.fromarray(back)

# the front cherry: a round cut-out of the right one, stem stub and all
cx, cy, r = BERRY
berry = src.crop((cx - r, cy - r, cx + r, cy + r))
mask = Image.new("L", berry.size, 0)
ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
berry.putalpha(Image.fromarray(np.minimum(np.array(berry.getchannel("A")), np.array(mask))))
ba = np.array(berry)
g0 = np.where(((ba[:, :, 1] > 150) & (ba[:, :, 0] < 160) & (ba[:, :, 3] > 200)).any(axis=1))[0].min()
(bx, by), fdir = stub(ba, r - 37, g0)
stubs.append(((FRONT[0] - r + bx, FRONT[1] - r + by), fdir))

join = (sum(b[0][0] for b in stubs[:2]) / 2 + 6, CUT - RISE)

# cherries first, then each stem as one smooth line from where it goes into its cherry up to the join
# (drawn over the old stubs, so there is no kink)
out = Image.new("RGBA", (W, H + 200), (0, 0, 0, 0))
out.alpha_composite(back)
out.alpha_composite(berry, (FRONT[0] - r, FRONT[1] - r))
d = ImageDraw.Draw(out)
for (bx, by), v in stubs:
    stem(d, (bx, by - 2), v, join, width)
k = width * 0.75
d.ellipse((join[0] - k - 7, join[1] - k - 7, join[0] + k + 7, join[1] + k + 7), fill=OUTLINE)
d.ellipse((join[0] - k, join[1] - k, join[0] + k, join[1] + k), fill=STEM)
out.save(sys.argv[1])
