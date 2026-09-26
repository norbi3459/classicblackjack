import numpy as np, wave, json
w=wave.open('teljes.wav'); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
# highpass-ish: remove the constant low hum by differencing
hop=int(sr*0.01); n=len(x)//hop
fr=x[:n*hop].reshape(n,hop)
win=1024; hann=np.hanning(win)
freqs=np.fft.rfftfreq(win,1/sr)
band=(freqs>900)&(freqs<7000)
E=np.zeros(n); flat=np.zeros(n); pk=np.zeros(n)
for i in range(n):
    a=i*hop; seg=x[a:a+win]
    if len(seg)<win: break
    s=np.abs(np.fft.rfft(seg*hann))[band]+1e-9
    E[i]=np.sqrt((s**2).mean()); flat[i]=np.exp(np.log(s).mean())/s.mean(); pk[i]=freqs[band][s.argmax()]
Edb=20*np.log10(E+1e-9)
floor=np.percentile(Edb,10)
act=Edb>floor+9
# merge gaps < 60 ms, drop events < 40 ms
segs=[]; i=0
while i<n:
    if act[i]:
        j=i
        while j<n and (act[j] or (j+6<n and act[j:j+6].any())): j+=1
        if j-i>=4: segs.append((i,j))
        i=j
    else: i+=1
out=[]
for a,b in segs:
    out.append(dict(t=round(a*0.01,2),d=round((b-a)*0.01,2),lvl=round(float(Edb[a:b].max()-floor),1),flat=round(float(np.median(flat[a:b])),3),
                    f0=round(float(np.median(pk[a:b]))),fs=round(float(pk[a:a+5].mean())),fe=round(float(pk[max(a,b-5):b].mean()))))
json.dump(out,open('segs.json','w'))
print(len(out),'floor',round(floor,1))
import collections
for o in out[:60]: print(o)
