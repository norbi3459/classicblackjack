import numpy as np, json
from PIL import Image, ImageDraw, ImageFont
L=np.load('bands.npy').astype(np.float32); on=json.load(open('onsets.json'))
idx=[int(round(t/0.01)) for t in on]
feat=[]
for i in idx:
    seg=L[i:i+25]
    if len(seg)<25: seg=np.pad(seg,((0,25-len(seg)),(0,0)),mode='edge')
    # spectrum shape (mean, normalized) + decay profile (4 time slices of loudness)
    spec=seg.mean(0); spec=spec-spec.mean()
    loud=np.array([seg[a:a+6].mean() for a in (0,6,12,18)]); loud=loud-loud[0]
    feat.append(np.concatenate([spec, loud*1.5]))
F=np.array(feat)
rng=np.random.default_rng(0); K=10
C=F[rng.choice(len(F),K,replace=False)]
for it in range(60):
    d=((F[:,None,:]-C[None])**2).sum(2); lab=d.argmin(1)
    C=np.array([F[lab==k].mean(0) if (lab==k).any() else C[k] for k in range(K)])
json.dump({'t':on,'lab':lab.tolist()},open('clusters.json','w'))
font=ImageFont.truetype('arial.ttf',13)
rows=[]
for k in range(K):
    ts=[on[i] for i in range(len(on)) if lab[i]==k]
    print(k,len(ts),' '.join(f'{int(t//60)}:{t%60:04.1f}' for t in ts[:12]))
    # montage of 8 examples: 0.4 s band-spectrogram each
    ex=ts[::max(1,len(ts)//8)][:8]
    row=Image.new('RGB',(8*110+60,90),(0,0,0)); d=ImageDraw.Draw(row); d.text((4,30),f'K{k}\n{len(ts)}',fill=(255,255,0),font=font)
    for j,t in enumerate(ex):
        i=int(round(t/0.01)); seg=L[i:i+40].T[::-1]
        seg=(seg-L.mean())/(L.std()*3)+0.5
        im=Image.fromarray((np.clip(seg,0,1)*255).astype(np.uint8)).resize((100,64))
        row.paste(Image.merge('RGB',(im,im,im.point(lambda v:255-v))),(60+j*110,4))
        d.text((60+j*110,72),f'{int(t//60)}:{t%60:04.1f}',fill=(200,200,200),font=font)
    rows.append(row)
S=Image.new('RGB',(rows[0].width,90*K)); [S.paste(r,(0,90*i)) for i,r in enumerate(rows)]; S.save('clusters.png')
