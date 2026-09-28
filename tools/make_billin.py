"""Sound of a note going into the bill acceptor (game/assets/sfx/billIn.wav):
sensor click, motor pulls the note in (whirr with gear buzz), short pause while it is checked, motor stacks it,
latch clunk. Synthesised, until a recording of a real acceptor is available.

    python tools/make_billin.py
"""
import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter

SR = 44100
rng = np.random.default_rng(7)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band")
    return lfilter(b, a, x)


def click(level, lo=1500, hi=7000, dur=0.012):
    n = int(dur * SR)
    return bp(rng.standard_normal(n), lo, hi) * np.exp(-np.linspace(0, 9, n)) * level


def motor(dur, f0, f1, level):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    hum = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.3 * np.sign(np.sin(3 * ph)) * 0.4
    gear = bp(rng.standard_normal(n), 500, 1800) * (0.6 + 0.4 * np.sin(ph * 9))   # gear teeth buzz
    x = 0.35 * hum + 0.9 * gear
    env = np.minimum(1, t / 0.05) * np.minimum(1, (dur - t) / 0.06)
    return x * env * level


parts = [
    (0.00, click(0.5, 2500, 9000)),                  # the note hits the sensor
    (0.03, motor(0.85, 90, 115, 0.22)),              # pulled in
    (0.92, click(0.35, 800, 4000, 0.02)),            # stops, checked
    (1.20, motor(0.45, 110, 95, 0.2)),               # stacked
    (1.66, click(0.9, 150, 1200, 0.05)),             # latch clunk
    (1.68, click(0.4, 2000, 8000)),
]
out = np.zeros(int(1.9 * SR))
for t0, s in parts:
    i = int(t0 * SR)
    out[i:i + len(s)] += s[: len(out) - i]
out /= np.abs(out).max() / 0.8
sf.write("game/assets/sfx/billIn.wav", out.astype(np.float32), SR, subtype="PCM_16")
print("ok", len(out) / SR)
