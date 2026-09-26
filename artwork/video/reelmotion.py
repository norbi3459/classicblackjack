# per-reel "is it spinning" signal: vertical smear makes horizontal edges disappear in the reel window
import subprocess, numpy as np
FF=r"C:/Users/balaz/AppData/Local/Programs/Python/Python312/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
W,H=380,150; X,Y=80,712; FPS=10
cmd=[FF,'-hide_banner','-loglevel','error','-i','../../forras_kepek_videok/teljes.mp4','-vf',f'fps={FPS},crop={W}:{H}:{X}:{Y},format=gray','-f','rawvideo','-']
p=subprocess.Popen(cmd,stdout=subprocess.PIPE)
fr=[]
while True:
    b=p.stdout.read(W*H)
    if len(b)<W*H: break
    fr.append(np.frombuffer(b,np.uint8).reshape(H,W).astype(np.float32))
fr=np.array(fr); print(fr.shape)
np.save('reelcrop.npy',fr.astype(np.uint8))
# horizontal-edge energy (d/dy) vs vertical-edge energy (d/dx) per reel column band
dy=np.abs(np.diff(fr,axis=1))[:, :, :]; dx=np.abs(np.diff(fr,axis=2))
bands=[(10,95),(100,185),(190,275),(280,365)]
sig=np.zeros((len(fr),4))
for k,(a,b) in enumerate(bands):
    ey=dy[:, :, a:b].mean(axis=(1,2)); ex=dx[:, :, a:b].mean(axis=(1,2))
    sig[:,k]=ey/(ex+1e-3)
np.save('reelsig.npy',sig)
