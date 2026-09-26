import numpy as np, wave, json
w=wave.open('teljes.wav'); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
hop=int(sr*0.01); win=2048; n=(len(x)-win)//hop
hann=np.hanning(win).astype(np.float32)
# mel-ish log bands
freqs=np.fft.rfftfreq(win,1/sr)
edges=np.geomspace(150,9000,33)
band_idx=[np.where((freqs>=edges[i])&(freqs<edges[i+1]))[0] for i in range(32)]
B=np.zeros((n,32),np.float32)
for i in range(n):
    s=np.abs(np.fft.rfft(x[i*hop:i*hop+win]*hann))
    B[i]=[s[ix].mean() if len(ix) else 0 for ix in band_idx]
L=np.log(B+1e-5)
flux=np.maximum(np.diff(L,axis=0),0).sum(1); flux=np.concatenate([[0],flux])
# adaptive threshold
from numpy.lib.stride_tricks import sliding_window_view
med=np.array([np.median(flux[max(0,i-50):i+50]) for i in range(n)])
thr=med+np.std(flux)*1.2
peaks=[i for i in range(1,n-1) if flux[i]>thr[i] and flux[i]>=flux[i-1] and flux[i]>=flux[i+1]]
ev=[]; last=-100
for p in peaks:
    if p-last>=8: ev.append(p); last=p
print('events',len(ev))
np.save('bands.npy',L.astype(np.float16)); json.dump([e*0.01 for e in ev],open('onsets.json','w'))
