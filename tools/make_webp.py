"""Makes the WebP copies of the game's PNG images, which is what the game loads (about 15x smaller, for phones).

It also writes the phone set, game/assets/m/... at half size: a phone shows the machine small, and the full-size
pictures (the top background alone is 70 MB once decoded) are more than an iPhone's Safari keeps in memory.

The PNGs under game/assets stay the masters that the other tools write; run this after changing any of them:

    python tools/make_webp.py          only the PNGs newer than their WebP
    python tools/make_webp.py --all    all of them

Quality 92 with lossless alpha: at the size the machine is shown the difference cannot be seen.
The PNGs are not published (game/.assetsignore), only the WebPs.
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "game", "assets")


def main(everything):
    n = saved = 0
    for d, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith(".png") or f.endswith(".orig.png"):
                continue
            src = os.path.join(d, f)
            dst = src[:-4] + ".webp"
            rel = os.path.relpath(dst, ROOT)
            if rel.startswith("m" + os.sep):
                continue
            half = os.path.join(ROOT, "m", rel)
            if not everything and all(os.path.exists(x) and os.path.getmtime(x) >= os.path.getmtime(src) for x in (dst, half)):
                continue
            im = Image.open(src)
            im = im.convert("RGBA") if im.mode in ("P", "LA", "RGBA", "PA") or "transparency" in im.info else im.convert("RGB")
            im.save(dst, "WEBP", quality=92, method=6, alpha_quality=100)
            os.makedirs(os.path.dirname(half), exist_ok=True)
            w, h = im.size
            small = im.resize((max(1, round(w / 2)), max(1, round(h / 2))), Image.LANCZOS) if max(w, h) > 160 else im
            small.save(half, "WEBP", quality=90, method=6, alpha_quality=100)
            n += 1
            saved += os.path.getsize(src) - os.path.getsize(dst)
    print(f"{n} images, {saved / 1e6:.1f} MB smaller")


if __name__ == "__main__":
    main("--all" in sys.argv)
