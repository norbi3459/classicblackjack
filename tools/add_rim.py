"""Put the peach "sticker" rim of the machine's symbols (as on the plum) round a cut-out symbol.

    python tools/add_rim.py <in.png> <out.png>      (needs: pip install opencv-python-headless numpy pillow)
"""
import sys

import cv2
import numpy as np
from PIL import Image

PEACH_TOP, PEACH_BOTTOM = np.array([250, 196, 140]), np.array([236, 140, 96])  # sampled from the plum's rim
EDGE = np.array([150, 70, 50])


def main(src, dst):
    im = np.array(Image.open(src).convert("RGBA")).astype(np.float32)
    a = (im[:, :, 3] > 40).astype(np.uint8)
    # keep only the symbol itself (drop stray specks)
    n, lab, st, _ = cv2.connectedComponentsWithStats(a)
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = st[k, :4]
    a = (lab == k).astype(np.uint8)
    r = max(8, int(max(w, h) * 0.05)), max(3, int(max(w, h) * 0.008))
    pad = r[0] + r[1] + 6
    a = np.pad(a, pad)
    im = np.pad(im, ((pad, pad), (pad, pad), (0, 0)))
    im[:, :, 3] *= np.pad((lab == k), pad) > 0
    disk = lambda d: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * d + 1, 2 * d + 1))
    rim = cv2.dilate(a, disk(r[0]))
    rim = cv2.morphologyEx(rim, cv2.MORPH_CLOSE, disk(r[0]))  # smooth, sticker-like outline
    edge = cv2.dilate(rim, disk(r[1]))
    H = im.shape[0]
    t = (np.arange(H) / H)[:, None, None]
    peach = PEACH_TOP * (1 - t) + PEACH_BOTTOM * t
    out = np.zeros_like(im)
    out[edge > 0, :3] = EDGE
    out[edge > 0, 3] = 255
    m = rim > 0
    out[m, :3] = np.broadcast_to(peach, out[:, :, :3].shape)[m]
    # the symbol on top
    sa = im[:, :, 3:4] / 255
    out[:, :, :3] = out[:, :, :3] * (1 - sa) + im[:, :, :3] * sa
    out[:, :, 3] = np.maximum(out[:, :, 3], im[:, :, 3])
    # soft outer edge
    out[:, :, 3] = cv2.GaussianBlur(out[:, :, 3], (3, 3), 0)
    ys, xs = np.where(out[:, :, 3] > 8)
    out = out[ys.min() - 2:ys.max() + 3, xs.min() - 2:xs.max() + 3]
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
