"""Render tools/voice-jobs.json to audio/<key>.mp3 with Kokoro (kokoro-onnx, local CPU) and write audio/manifest.json.

    python tools/render_voices.py            # renders only what's missing, prunes clips nothing points at
    python tools/render_voices.py --only 3   # render 3 (a quick listen test)

Model: D:\\hs2-audio\\model (kokoro-v1.0.onnx + voices-v1.0.bin, from the HS2 audio course).
ffmpeg: GameSentenceMiner's copy (none on PATH on this laptop).
"""
import argparse, json, os, subprocess, sys, tempfile, time
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
MODEL = Path(r"D:\hs2-audio\model")
FFMPEG = r"C:\Users\USER\AppData\Roaming\GameSentenceMiner\ffmpeg\ffmpeg.exe"
sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int, default=0)
    args = ap.parse_args()

    spec = json.loads((ROOT / "tools" / "voice-jobs.json").read_text(encoding="utf-8"))
    voices, jobs = spec["voices"], spec["jobs"]
    outdir = ROOT / "audio"
    outdir.mkdir(exist_ok=True)

    todo = [j for j in jobs if not (outdir / f"{j['key']}.mp3").exists()]
    if args.only:
        todo = todo[: args.only]
    print(f"{len(jobs)} lines, {len(todo)} to render", flush=True)

    k = Kokoro(str(MODEL / "kokoro-v1.0.onnx"), str(MODEL / "voices-v1.0.bin")) if todo else None
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        for i, j in enumerate(todo, 1):
            v = voices[j["who"]]
            samples, sr = k.create(j["text"], voice=v["voice"], speed=v["speed"], lang=v["lang"])
            wav = Path(tmp) / "x.wav"
            sf.write(wav, samples, sr)
            mp3 = outdir / f"{j['key']}.mp3"
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-b:a", "48k", str(mp3)], check=True)
            if i % 20 == 0 or i == len(todo):
                print(f"  {i}/{len(todo)}  ({time.time() - t0:.0f}s)", flush=True)

    keys = {j["key"] for j in jobs}
    pruned = 0
    if not args.only:
        for f in outdir.glob("*.mp3"):
            if f.stem not in keys:
                f.unlink(); pruned += 1
    have = {j["key"]: f"{j['key']}.mp3" for j in jobs if (outdir / f"{j['key']}.mp3").exists()}
    manifest = {"voices": {w: v["voice"] for w, v in voices.items()}, "clips": have}
    (outdir / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    size = sum(f.stat().st_size for f in outdir.glob("*.mp3"))
    print(f"manifest: {len(have)}/{len(jobs)} clips, {size / 1e6:.1f} MB, pruned {pruned}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
