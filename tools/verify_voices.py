"""Listen back to the recorded clips with Whisper and flag words Kokoro may have mangled.

    D:\\sensei-ears\\venv\\Scripts\\python.exe tools/verify_voices.py            # clips containing tricky words
    D:\\sensei-ears\\venv\\Scripts\\python.exe tools/verify_voices.py --all      # every clip

Prints each clip's text vs what Whisper heard, plus a word-overlap score; low scores are worth a listen.
"""
import argparse, json, re, sys
from pathlib import Path
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
TRICKY = re.compile(r"metoprolol|paracetamol|korotkoff|tachyp|bradyp|A I 2|N H I|D G Y|milligram|millimetres|Pacimol|Betaloc|tympanic|brachial|sphygmo|whānau|NKDA|qid|Q I D|preceptor|\d", re.I)


def words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower().replace("’", "'"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    jobs = json.loads((ROOT / "tools" / "voice-jobs.json").read_text(encoding="utf-8"))["jobs"]
    pick = jobs if args.all else [j for j in jobs if TRICKY.search(j["text"])]
    model = WhisperModel("small", device="cpu", compute_type="int8")
    scores = []
    for j in pick:
        f = ROOT / "audio" / f"{j['key']}.mp3"
        if not f.exists():
            print(f"MISSING {f.name}"); continue
        segs, _ = model.transcribe(str(f), language="en", beam_size=5, vad_filter=False)
        heard = " ".join(s.text.strip() for s in segs)
        want, got = words(j["text"]), set(words(heard))
        score = sum(1 for w in want if w in got) / max(1, len(want))
        scores.append((score, j, heard))
    scores.sort(key=lambda x: x[0])
    for score, j, heard in scores:
        flag = "  " if score >= 0.85 else "??"
        print(f"{flag} {score:.2f} [{j['who']}] {j['text'][:90]}\n        heard: {heard[:90]}")
    print(f"\n{len(scores)} clips checked; {sum(1 for s in scores if s[0] < 0.85)} below 0.85")
    return 0


if __name__ == "__main__":
    sys.exit(main())
