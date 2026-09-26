# cuts every sample from the cleaned tracks (Demucs + noisereduce); loops from the tones-only track
import numpy as np, soundfile as sf
T, sr = sf.read('artwork/video/clean_tones.wav', dtype='float32'); F, _ = sf.read('artwork/video/clean_full.wav', dtype='float32')
LOOPS = {'mpLoop', 'multiLoop', 'rowLoop', 'nudgePick', 'chooseLoop', 'guessLoop'}
def best_loop(x, a, b, lo, hi):
    # the end point near [lo,hi] whose next 60 ms best matches the loop start
    w = int(0.06 * sr); ref = x[int(a * sr):int(a * sr) + w]
    best = (-2, b)
    for e in np.arange(lo, hi, 0.001):
        seg = x[int(e * sr):int(e * sr) + w]
        c = float((ref * seg).sum() / (np.sqrt((ref ** 2).sum() * (seg ** 2).sum()) + 1e-9))
        if c > best[0]: best = (c, e)
    return best
out = []
for line in open('artwork/video/samples.txt'):
    p = line.split()
    if len(p) < 3 or p[1] == 'synth': continue
    n, s, d = p[0], float(p[1]), float(p[2])
    x = T if n in LOOPS else F
    e = s + d
    if n in LOOPS:
        c, e = best_loop(x, s, e, e - 0.03, e + 0.03)
    y = x[int(s * sr):int(e * sr)].copy()
    fi, fo = int(0.004 * sr), int((0.004 if n in LOOPS else 0.03) * sr)
    y[:fi] *= np.linspace(0, 1, fi); y[-fo:] *= np.linspace(1, 0, fo)
    pk = np.abs(y).max(); rms = np.sqrt((y ** 2).mean())
    y *= min(0.89 / pk, 0.126 / max(rms, 1e-6))
    sf.write(f'game/assets/sfx/{n}.wav', y, sr, subtype='PCM_16')
    out.append(f'{n} {s:.3f}-{e:.3f}')
print('\n'.join(out))
