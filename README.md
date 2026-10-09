# CLS Practical Trainer

Rehearsal partner for the two BN2 Clinical Learning Suite practicals: **Vital Signs** (722.556) and **Medication Administration** (722.544). Both are Met / Not Met against a line-by-line marking sheet; this app is built from those sheets.

Live: https://jeremyspm.github.io/cls-trainer/ (unlisted, `noindex`).

## What's in it
- **Walkthrough** – each run step by step: what to do, what to say, the rubric line it earns, and its source.
- **What's next?** – order drill; distractors favour the steps that come *later* (jumping ahead is how steps get missed).
- **Live run** – the app speaks the patient and RN (speechSynthesis), listens for your key words (SpeechRecognition: Chrome/Edge, not Firefox), injects curveballs, then you self-mark against the verbatim rubric.
- **BP Lab** – two-step manual BP on a simulated aneroid gauge: palpation with a vibrating pulse, 30 s wait, stethoscope-before-pump gate, deflation-rate meter, synthesized Korotkoff sounds, optional equipment faults.
- **Chart it** – plot obs on the NZ adult vital signs chart (tap where the mark goes), read Janine's slide 38–39 examples.
- **Real chart practice** (`paper.html`) – the actual Adult Vital Signs Chart from Janine's deck (slide 34), printable or for a pen app: two stories on Mr Luke to chart, then the answers drawn on the same chart. `python tools/build-paper.py` cleans the picture, `node tools/build-paper-pdf.mjs` prints `print/vs-chart-practice.pdf` from the page itself.

## Sources
Model lines come from the course's own demo videos (transcribed locally, 8 Oct 2026), the two marking sheets, Janine's *Vital Signs 2026* deck, Joan's *Medication Administration & Patient Education* decks, the HQSC National Medication Chart user guide, and Medsafe data sheets. Every step carries a source chip in the UI.

## Files
- `js/data.js` – rubrics (verbatim), steps, curveballs, drug facts
- `js/app.js` – views and the run engine · `js/voice.js` – speak/listen · `js/bp.js` – BP Lab
- `js/chart-vs.js` – Chart it · `js/paper.js` – real chart practice (only knows where rows sit on the picture; rows, zones and EWS come from `data.js` + `chart-vs.js`)
- `tests/check.mjs` – the gate: `node tests/check.mjs` must report 0 failed · `tests/drive.mjs` – drives every flow in headless Chrome

Progress is stored only in the browser (localStorage keys prefixed `cls.`).
