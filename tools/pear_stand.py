"""The pear as on the machine's reels: leaning well to the right, sitting on a thin cylinder-shaped stand.

    python tools/pear_stand.py <upright_pear.png> <out.png> [tilt]     (then tools/add_rim.py puts the rim round it)
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

OUTLINE = (92, 38, 18, 255)
TOP, SIDE, SIDE_DARK = (253, 232, 184, 255), (236, 170, 96, 255), (196, 116, 58, 255)


def main(src, dst, tilt=38.0):
    pear = Image.open(src).convert("RGBA").rotate(-tilt, resample=Image.BICUBIC, expand=True)
    pear = pear.crop(pear.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())
    a = np.array(pear.getchannel("A")) > 40
    w, h = pear.size
    # the stand: as wide as the pear's bottom part, centred under its lowest point
    rows = np.where(a.any(axis=1))[0]
    low = a[int(h * 0.8):]
    xs = np.where(low.any(axis=0))[0]
    cx = (xs.min() + xs.max()) / 2
    sw = (xs.max() - xs.min()) * 1.05
    eh, th = sw * 0.16, sw * 0.08           # ellipse height of the top face, thickness of the side
    top_y = rows.max() - eh * 0.55          # the pear sinks a little into the stand's top face
    W, H = max(w, int(cx + sw / 2) + 10), int(top_y + eh / 2 + th) + 12
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    x0, x1 = cx - sw / 2, cx + sw / 2
    lw = max(4, int(sw * 0.025))
    # side band (a cylinder seen from slightly above), then the top face
    d.ellipse((x0, top_y - eh / 2 + th, x1, top_y + eh / 2 + th), fill=SIDE_DARK, outline=OUTLINE, width=lw)
    d.rectangle((x0 + lw / 2, top_y, x1 - lw / 2, top_y + th), fill=SIDE)
    d.line((x0, top_y, x0, top_y + th), fill=OUTLINE, width=lw)
    d.line((x1, top_y, x1, top_y + th), fill=OUTLINE, width=lw)
    d.ellipse((x0, top_y - eh / 2, x1, top_y + eh / 2), fill=TOP, outline=OUTLINE, width=lw)
    out.alpha_composite(pear, (0, 0))
    out.save(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 38.0)
