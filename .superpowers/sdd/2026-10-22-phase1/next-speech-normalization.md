# Queued: speech normalization for the arithmetic checker (Lorenzo's brief, 27 Oct)

Queued behind the in-flight round (narrow W3, item 4's prompt, the re-score, the C5 live check).
**Free unless noted; no push, no merge. Report before adding it to any preset.**

## Why this exists
The 26 Oct finding (Stream 3 task 6, §7): **all 24 real STT sentences in `Case Interview Runs/voice-live/`
produce no claim at all** — fillers and commas break every chain, so "So fifty eight divided by four, um,
gives us around, um, sorry, uh, fourteen point five" is neither verified nor flagged. It is pinned by a test
so it cannot drift. The arithmetic checker is effectively blind on speech, and fixing it means *raising*
claims on speech — the opposite risk profile from everything Phase 1 has done so far.

## 1. Measure first
Run the candidate-math path — `checkCandidateMath`, the arithmetic check, verified figures, with
`spokenMathParser` on — over:
- the recorded **voice** candidate turns in `Case Interview Runs/voice-live/`;
- the **same case's typed turns**, for comparison.

Report **per 100 turns**: claims parsed, verified correct, flagged, unclear.

Then list **every voice turn where a figure or equation the candidate clearly said wasn't parsed**, grouped
by STT pattern — e.g. "one fifty", "point two", "three twenty million", "a third", "times / over / divided
by", ranges, currency words, run-on sentences with no punctuation.

## 2. Build a normalizer for the patterns that actually occur
Under **its own switch**. It must:
- let spoken arithmetic reach **verified correct** when one reading is unambiguous;
- **never create a flag the typed form wouldn't**;
- leave ambiguous readings **unclear**.

## 3. Speech-like replay
Transform the typed corpus's candidate turns into STT-style text (number words, no punctuation, spoken
currency and scale) and replay.

**Gate:**
- verified-correct and flag rates within a few points of the typed originals;
- **0 new false flags or false corrections**;
- typed corpus output **identical** with the switch on;
- **prof-001 identical** with the switches off.
