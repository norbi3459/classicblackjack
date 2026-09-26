import subprocess, re, glob, os
FF = r"C:/Users/balaz/AppData/Local/Programs/Python/Python312/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
for f in sorted(glob.glob('game/assets/sfx/*.mp3')):
    r = subprocess.run([FF, '-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mx = float(re.search(r'max_volume: ([-\d.]+)', r).group(1)); mean = float(re.search(r'mean_volume: ([-\d.]+)', r).group(1))
    g = min(-1.0 - mx, -18.0 - mean)
    out = f[:-4] + '_n.mp3'
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', f, '-af', f'volume={g:.1f}dB', '-b:a', '128k', out])
    os.replace(out, f)
    print(os.path.basename(f), round(mean, 1), round(mx, 1), 'gain', round(g, 1))
