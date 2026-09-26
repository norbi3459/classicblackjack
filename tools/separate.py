# Separates the gameplay audio with Demucs (GPU): the machine's tones end up in "other", room noise elsewhere
import sys, torch, soundfile as sf
from demucs.api import Separator
src, out = sys.argv[1], sys.argv[2]
sep = Separator(model="htdemucs_ft", device="cuda" if torch.cuda.is_available() else "cpu", segment=7.8, overlap=0.25)
wav, sr = sf.read(src, dtype="float32", always_2d=True)
origin, stems = sep.separate_tensor(torch.from_numpy(wav.T), sr)
for name, t in stems.items():
    sf.write(f"{out}_{name}.wav", t.T.cpu().numpy(), sep.samplerate)
    print(name, t.shape)
