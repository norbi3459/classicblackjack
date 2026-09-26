import numpy as np, wave, sys
from PIL import Image, ImageDraw, ImageFont
w=wave.open('teljes.wav'); sr=w.getframerate()
t0,t1=float(sys.argv[1]),float(sys.argv[2]); name=sys.argv[3]
w.setpos(int(t0*sr)); x=np.frombuffer(w.readframes(int((t1-t0)*sr)),dtype=np.int16).astype(np.float32)/32768
hop=int(sr*0.005); win=2048; fr=(len(x)-win)//hop
hann=np.hanning(win)
S=np.array([np.abs(np.fft.rfft(x[i*hop:i*hop+win]*hann)) for i in range(fr)])
fmax=6000; nb=int(fmax/(sr/win)); db=20*np.log10(S[:, :nb]+1e-6).T[::-1]
lo,hi=np.percentile(db,40),np.percentile(db,99.8); db=np.clip((db-lo)/(hi-lo),0,1)
H=400; img=Image.fromarray((db*255).astype(np.uint8)).resize((min(2000,fr),H))
img=Image.merge('RGB',(img,img.point(lambda v:int(v*0.8)),img.point(lambda v:255-v if v>0 else 0)))
out=Image.new('RGB',(img.width,H+60)); out.paste(img,(0,24)); d=ImageDraw.Draw(out); f=ImageFont.truetype('arial.ttf',14)
dur=t1-t0
for k in range(int(dur*4)+1):
    t=t0+k*0.25; xx=int(k*0.25/dur*img.width); d.line((xx,20,xx,24),fill=(255,255,0))
    if k%2==0: d.text((xx+1,2),f'{int(t//60)}:{t%60:05.2f}',fill=(255,255,0),font=f)
for fq in (500,1000,2000,3000,4000,5000):
    yy=24+int(H*(1-fq/fmax)); d.text((2,yy-7),f'{fq}',fill=(0,255,0),font=f)
rms=np.sqrt((x[:len(x)//hop*hop].reshape(-1,hop)**2).mean(1)); rms/=rms.max()
for i in range(0,len(rms)):
    xx=int(i/len(rms)*img.width); d.line((xx,H+58,xx,H+58-int(rms[i]*32)),fill=(255,150,0))
out.save(f'z_{name}.png'); print(out.size)
