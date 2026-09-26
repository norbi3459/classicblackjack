# Kisebb/Nagyobb flashing sound, rebuilt from the video (3:43.0, 2:51.9): two alternating chip blips
#  A: 3500 Hz tick, then ~1940 -> 1870 Hz ;  B: 1270 -> 1335 Hz, then 1870 Hz.  One blip every 0.16 s.
import numpy as np, wave
sr = 44100
def pulse(freqs, dur, duty=0.25):
    n = int(sr * dur); f = np.interp(np.arange(n), np.linspace(0, n, len(freqs)), freqs)
    ph = np.cumsum(f / sr) % 1.0
    y = np.where(ph < duty, 1.0, -0.33)
    return y
def env(n, a=0.003, r=0.02):
    e = np.ones(n); na = int(sr * a); nr = int(sr * r)
    e[:na] = np.linspace(0, 1, na); e[-nr:] = np.linspace(1, 0, nr); return e
def blipA():
    t = pulse([3500, 3500], 0.018, 0.5) * 0.35
    m = pulse([1940, 1930, 1870, 1870, 1870], 0.10)
    y = np.concatenate([t, m]); return y * env(len(y))
def blipB():
    a = pulse([1270, 1335], 0.045)
    b = pulse([1870, 1870], 0.065)
    y = np.concatenate([a, b]); return y * env(len(y))
slot = int(sr * 0.16)
out = np.zeros(slot * 8)
for k in range(8):
    b = blipA() if k % 2 == 0 else blipB()
    out[k * slot:k * slot + len(b)] += b
# soft low-pass like the cabinet speaker (one-pole), then level
y = np.zeros_like(out); a = 0.55
for i in range(1, len(out)): y[i] = y[i - 1] + a * (out[i] - y[i - 1])
y = y / np.abs(y).max() * 0.6
w = wave.open('game/assets/sfx/guessLoop.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((y * 32767).astype(np.int16).tobytes()); w.close()
print('ok', len(y) / sr, 's')
