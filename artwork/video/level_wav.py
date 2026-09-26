# level the wav samples: peak at most -1 dBFS, mean about -18 dB
import wave, glob, os
import numpy as np
for f in sorted(glob.glob('game/assets/sfx/*.wav')):
    w = wave.open(f); p = w.getparams(); x = np.frombuffer(w.readframes(p.nframes), dtype=np.int16).astype(np.float32); w.close()
    pk = np.abs(x).max() / 32768; rms = np.sqrt((x ** 2).mean()) / 32768
    g = min(0.89 / pk, 0.126 / max(rms, 1e-6))
    y = np.clip(x * g, -32767, 32767).astype(np.int16)
    w = wave.open(f, 'wb'); w.setparams(p); w.writeframes(y.tobytes()); w.close()
    print(os.path.basename(f), 'gain', round(float(20 * np.log10(g)), 1))
