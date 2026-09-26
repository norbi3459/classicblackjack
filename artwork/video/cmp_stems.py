import numpy as np, soundfile as sf
from PIL import Image, ImageDraw, ImageFont
font = ImageFont.truetype('arial.ttf', 14)
srcs = [('eredeti', 'teljes_st.wav'), ('other', 'stem_other.wav'), ('drums', 'stem_drums.wav'), ('vocals', 'stem_vocals.wav'), ('bass', 'stem_bass.wav')]
def spec(x, sr, a, b):
    x = x[int(a * sr):int(b * sr)]; win = 2048; hop = int(sr * 0.004); hann = np.hanning(win); f = np.fft.rfftfreq(win, 1 / sr)
    m = (f > 200) & (f < 6000)
    S = np.array([np.abs(np.fft.rfft(x[i:i + win] * hann))[m] for i in range(0, len(x) - win, hop)])
    return 20 * np.log10(S + 1e-7).T[::-1]
wins = [(171.8, 174.9), (222.9, 225.9), (109.5, 111.6), (28.3, 30.5)]
rows = []
for name, f in srcs:
    x, sr = sf.read(f, dtype='float32'); x = x.mean(1)
    for a, b in wins:
        D = spec(x, sr, a, b)
        rows.append((name, a, D))
lo, hi = np.percentile(rows[0][2], 55), np.percentile(rows[0][2], 99.8)
W, H = 420, 180
img = Image.new('RGB', (W * len(wins), (H + 18) * len(srcs)))
d = ImageDraw.Draw(img)
for k, (name, a, D) in enumerate(rows):
    r, c = k // len(wins), k % len(wins)
    im = Image.fromarray((np.clip((D - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)).resize((W, H))
    img.paste(Image.merge('RGB', (im, im.point(lambda v: v * 0.8), im.point(lambda v: 255 - v if v else 0))), (c * W, r * (H + 18) + 18))
    d.text((c * W + 4, r * (H + 18) + 1), f'{name}  {int(a // 60)}:{a % 60:04.1f}', fill=(255, 255, 0), font=font)
img.save('stems_cmp.png'); print(img.size)
for name, f in srcs:
    x, sr = sf.read(f, dtype='float32'); print(name, 'rms', round(float(np.sqrt((x ** 2).mean())), 4))
