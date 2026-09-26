# other (tones) and other+drums (tones + mechanical clicks), both with the steady hum/room noise removed
import numpy as np, soundfile as sf, noisereduce as nr
o, sr = sf.read('stem_other.wav', dtype='float32'); d, _ = sf.read('stem_drums.wav', dtype='float32')
o = o.mean(1); d = d.mean(1)
noise = o[int(180.0 * sr):int(180.6 * sr)]  # 3:00.0-3:00.6: only the machine's hum between sounds
def clean(x):
    return nr.reduce_noise(y=x, sr=sr, y_noise=noise, stationary=True, prop_decrease=0.9, n_fft=4096, freq_mask_smooth_hz=150, time_mask_smooth_ms=40)
tones = clean(o)
sf.write('clean_tones.wav', tones, sr)
sf.write('clean_full.wav', tones + d, sr)
print('ok', sr)
