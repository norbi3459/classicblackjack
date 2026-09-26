"""Transcribe the machine's chip tunes from the video's sound and play them back clean.

The machine's music comes from an old sound chip: up to three square-wave voices, tuned about 40 cents sharp of
A=440. So instead of cutting the noisy recording, each tune is read from the Demucs "tones" track
(artwork/video/clean_tones.wav): the narrow tonal peaks of every frame, the fundamentals among them (backed by
their odd harmonics), linked into continuous pitch tracks (glides stay glides). Then it is synthesised again with
band-limited square waves following those tracks: the same melody, no noise.

    python tools/chip_transcribe.py                 all tunes of artwork/video/samples.txt -> artwork/chip/
    python tools/chip_transcribe.py mpLoop joker    only these

For each tune it writes <name>.json (the notes), <name>.wav (resynthesised) and <name>_orig.wav (the cut from
the recording), for side-by-side listening in game/hangok3.html.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "artwork", "video", "clean_tones.wav")
LIST = os.path.join(ROOT, "artwork", "video", "samples.txt")
OUT = os.path.join(ROOT, "artwork", "chip")
LOOPS = {"mpLoop", "multiLoop", "rowLoop", "nudgePick", "chooseLoop"}

N, HOP = 4096, 220            # analysis window / hop (5 ms at 44.1 kHz)
MAX_VOICES = 4


def spectra(x, sr):
    win = np.hanning(N)
    frames = [x[i:i + N] * win for i in range(0, len(x) - N, HOP)]
    return np.abs(np.fft.rfft(np.array(frames), axis=1)), np.fft.rfftfreq(N, 1 / sr)


def peaks(spec, fr):
    # narrow tonal peaks only: magnitude well above the local median (broadband noise has no such peaks)
    from scipy.ndimage import median_filter
    loc = median_filter(spec, size=41) + 1e-9
    P = spec / loc
    k = np.where((P[1:-1] > P[:-2]) & (P[1:-1] >= P[2:]) & (P[1:-1] > 5))[0] + 1
    out = []
    for i in k:
        a, b, c = np.log(spec[i - 1] + 1e-12), np.log(spec[i] + 1e-12), np.log(spec[i + 1] + 1e-12)
        d = 0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c != 0 else 0
        out.append((fr[i] + d * (fr[1] - fr[0]), P[i], spec[i]))
    return out


def fundamentals(pk, fmin=120, fmax=2300):
    # square waves: a fundamental is backed by its 3rd (and 5th) harmonic, not by a strong 2nd
    def near(f, tol=0.025):
        best = None
        for q in pk:
            if abs(q[0] / f - 1) < tol and (best is None or q[1] > best[1]):
                best = q
        return best
    cands = []
    for f, p, m in pk:
        if not fmin < f < fmax:
            continue
        h3, h5, h2 = near(3 * f), near(5 * f), near(2 * f)
        score = np.log(p) + (0.8 * np.log(h3[1]) if h3 else 0) + (0.5 * np.log(h5[1]) if h5 else 0)
        if h2 and h2[1] > p * 1.5 and not h3:
            score -= 2
        cands.append((score, f, m))
    cands.sort(reverse=True)
    chosen = []
    for sc, f, m in cands:
        if len(chosen) >= MAX_VOICES or sc < 3.2:
            break
        if any(abs(f / (g * k) - 1) < 0.03 or abs(g / (f * k) - 1) < 0.03 for _, g, _ in chosen for k in (1, 2, 3, 5, 7)):
            continue
        chosen.append((sc, f, m))
    return [(f, m) for _, f, m in chosen]


def tracks_from(X, fr, min_frames=5):
    # link each frame's fundamentals into continuous tracks (glides and vibrato stay intact)
    live, done = [], []
    for t, spec in enumerate(X):
        fs = fundamentals(peaks(spec, fr))
        used = set()
        for tr in live:
            last = tr["f"][-1]
            best = None
            for i, (f, m) in enumerate(fs):
                if i not in used and abs(f / last - 1) < 0.035 and (best is None or abs(f / last - 1) < abs(fs[best][0] / last - 1)):
                    best = i
            if best is not None:
                used.add(best); tr["f"].append(fs[best][0]); tr["m"].append(fs[best][1]); tr["miss"] = 0
            else:
                tr["miss"] += 1
                if tr["miss"] <= 1:
                    tr["f"].append(last); tr["m"].append(tr["m"][-1] * 0.5)
        for tr in [tr for tr in live if tr["miss"] > 1]:
            live.remove(tr); done.append(tr)
        for i, (f, m) in enumerate(fs):
            if i not in used:
                live.append({"t": t, "f": [f], "m": [m], "miss": 0})
    done += live
    out = []
    for tr in done:
        n = len(tr["f"]) - tr["miss"]
        if n >= min_frames:
            out.append({"t": tr["t"] * HOP, "d": n * HOP, "f": tr["f"][:n], "m": tr["m"][:n]})
    return sorted(out, key=lambda o: o["t"])


def square_track(fs, n, sr):
    # band-limited square wave following a frequency curve (sampled every HOP)
    f = np.interp(np.arange(n), np.arange(len(fs)) * HOP, fs)
    ph = 2 * np.pi * np.cumsum(f) / sr
    y = np.zeros(n)
    for h in range(1, 40, 2):
        lim = (f * h < sr / 2 * 0.9)
        y += lim * np.sin(h * ph) / h
    return y * 4 / np.pi


def render(tracks, length, sr):
    y = np.zeros(length + sr)
    if not tracks:
        return y[:length]
    top = max(np.median(tr["m"]) for tr in tracks)
    for tr in tracks:
        k = tr["d"] + int(0.003 * sr)
        s = square_track(tr["f"] + [tr["f"][-1]], k, sr)
        m = np.array(tr["m"] + [tr["m"][-1]])
        amp = np.interp(np.arange(k), np.arange(len(m)) * HOP, np.sqrt(m / top))
        a = int(0.002 * sr)
        amp[:a] *= np.linspace(0, 1, a); amp[-2 * a:] *= np.linspace(1, 0, 2 * a)
        y[tr["t"]:tr["t"] + k] += s * np.clip(amp, 0, 1.2) * 0.22
    from scipy.signal import butter, lfilter
    b, a2 = butter(2, 7000 / (sr / 2))
    return lfilter(b, a2, y)[:length]


def main(names):
    x, sr = sf.read(SRC, dtype="float32")
    os.makedirs(OUT, exist_ok=True)
    for line in open(LIST, encoding="utf-8"):
        p = line.split()
        if len(p) < 3 or p[1] == "synth" or (names and p[0] not in names):
            continue
        name, s, d = p[0], float(p[1]), float(p[2])
        y = x[int(s * sr):int((s + d) * sr)]
        X, fr = spectra(np.concatenate([y, np.zeros(N)]), sr)
        tracks = tracks_from(X, fr)
        out = render(tracks, len(y), sr)
        if name in LOOPS:
            f = int(0.004 * sr)
            out[:f] *= np.linspace(0, 1, f); out[-f:] *= np.linspace(1, 0, f)
        pk = np.abs(out).max() or 1
        sf.write(os.path.join(OUT, name + ".wav"), (out / pk * 0.85).astype(np.float32), sr, subtype="PCM_16")
        sf.write(os.path.join(OUT, name + "_orig.wav"), y / (np.abs(y).max() or 1) * 0.85, sr, subtype="PCM_16")
        with open(os.path.join(OUT, name + ".json"), "w") as fh:
            json.dump({"name": name, "start": s, "dur": d, "sr": sr, "hop": HOP,
                       "tracks": [{"t": t["t"], "d": t["d"], "f": [round(v, 1) for v in t["f"]]} for t in tracks]}, fh)
        print(f"{name:12s} {len(tracks):3d} notes")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
