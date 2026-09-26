# time-aligned panels: reels + display (2x) and the upper glass (1x) at given times, plus the loudness curve
import subprocess, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
FF=r"C:/Users/balaz/AppData/Local/Programs/Python/Python312/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
font=ImageFont.truetype('arialbd.ttf',18)
rms=np.load('rms.npy')
def grab(t):
    p=f'win/t_{t:07.2f}.jpg'
    if not os.path.exists(p):
        os.makedirs('win',exist_ok=True)
        subprocess.run([FF,'-hide_banner','-loglevel','error','-y','-ss',f'{t:.2f}','-i','../../forras_kepek_videok/teljes.mp4','-frames:v','1','-q:v','2',p])
    return Image.open(p)
def panel(ts, name, box, scale=2, cols=4):
    ims=[grab(t).crop(box) for t in ts]
    w,h=int(ims[0].width*scale),int(ims[0].height*scale)
    rows=(len(ims)+cols-1)//cols
    S=Image.new('RGB',(cols*w,rows*h+60)); d=ImageDraw.Draw(S)
    for k,(t,im) in enumerate(zip(ts,ims)):
        x=(k%cols)*w; y=(k//cols)*h; S.paste(im.resize((w,h),Image.LANCZOS),(x,y))
        d.rectangle((x,y,x+78,y+22),fill=(0,0,0)); d.text((x+3,y+1),f'{int(t//60)}:{t%60:05.2f}',fill=(255,255,0),font=font)
    # loudness strip for the window
    t0,t1=ts[0],ts[-1]; a=int(t0/0.02); b=int(t1/0.02)+1; seg=rms[a:b]
    if len(seg):
        seg=seg/ (seg.max()+1e-9); W=S.width
        for i,v in enumerate(seg):
            xx=int(i*W/len(seg)); d.line((xx,S.height-2,xx,S.height-2-int(v*56)),fill=(255,160,0))
    S.save(f'p_{name}.jpg',quality=88); print(name,S.size)
if __name__=='__main__':
    t0,t1,st=float(sys.argv[1]),float(sys.argv[2]),float(sys.argv[3]); name=sys.argv[4]
    box=tuple(int(v) for v in sys.argv[5].split(',')); sc=float(sys.argv[6]) if len(sys.argv)>6 else 2
    cols=int(sys.argv[7]) if len(sys.argv)>7 else 4
    ts=[round(t0+i*st,2) for i in range(int(round((t1-t0)/st))+1)]
    panel(ts,name,box,sc,cols)
