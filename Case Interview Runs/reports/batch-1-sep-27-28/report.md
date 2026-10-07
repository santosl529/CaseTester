# Interviewer pressure-test runs — 27–28 Sep 2026

Live runs of the AI case interviewer (Brew & Bean profitability case) against
simulated candidates from `interviewer-pressure-test-personas.pdf` (included).
Each persona is built to stress specific interviewer-behavior rules; its
**Tests** line in the PDF (repeated at the top of each summary file) is what
the run should be judged against. A persona passes only if the interviewer
follows the rule *and* the feedback report attributes performance correctly.

This bundle has the latest run for each of the 11 personas tested so far (of
60). The remaining personas have not been run yet.

## How each run was produced

- The candidate is Claude (Opus 5) playing the persona. It sees only the
  transcript, never the answer key.
- The interviewer, data gating, and scoring are the real product code against
  the real database — the same code path a pilot user hits.
- Candidates are paced like a person typing (think time + ~90 wpm, capped at
  90s per turn), on the 20-minute case clock.
- Silences (e.g. a candidate going quiet) are simulated. In text mode the
  interviewer checks in after 60s of silence and pauses the clock at 180s.

## Files

One folder per persona, named `<persona #>-<name>/`, containing:

| File | What it is |
|---|---|
| `…_feedback-report.pdf` | The feedback report exactly as a candidate would receive it. |
| `…_summary-and-transcript.md` | **Start here.** Persona and Tests line, data requests and how the interviewer handled each, interventions logged, token usage and cost (28 Sep runs only), full rubric feedback with evidence quotes, and the timestamped transcript. |
| `…_console-log.log` | Console output, including per-turn phase and stall-ladder decisions. |
| `…_raw-data.json` | Raw dump of the session, turns, score, and events. |

## Runs

"Reviewed" means checked against the persona's Tests line. The rest have
reports but haven't been reviewed yet.

| # | Persona | Folder | Overall | Status |
|---|---|---|---|---|
| 1 | Maya — the Freezer | `01-maya-the-freezer/` | needs_work | Not yet reviewed |
| 2 | Tobias — the Silent Thinker | `02-tobias-the-silent-thinker/` | strong | Not yet reviewed |
| 3 | Ines — the Clarifier | `03-ines-the-clarifier/` | strong | Not yet reviewed |
| 9 | Derek — the Bulldozer | `09-derek-the-bulldozer/` | meets_bar | Reviewed — see notes 1–2 |
| 13 | Micah — the Rounder | `13-micah-the-rounder/` | strong | Not yet reviewed |
| 17 | Priya — the Gamer | `17-priya-the-gamer/` | strong | Not yet reviewed |
| 32 | Sam — the Distressed | `32-sam-the-distressed/` | strong | Reviewed — **fail**, see note 3 |
| 33 | Omar — the Quoter | `33-omar-the-quoter/` | strong | Reviewed — **hard fail**, see note 4 |
| 35 | Yuki — the Non-Native Speaker | `35-yuki-the-non-native-speaker/` | strong | Not yet reviewed |
| 36 | Carmen — the Dropout | `36-carmen-the-dropout/` | strong | Reviewed — partial, see note 5 |
| 45 | Camila — the Code-Switcher | `45-camila-the-code-switcher/` | strong | Not yet reviewed |

## Findings so far

1. **Derek, earlier run (not included) — case failed to close.** At 15:33 the
   interviewer said "That's time… I'll close the case here" without actually
   ending the session. It then traded "Goodbye" with the candidate until
   20:00, and the stall detector logged those goodbyes as assists against
   him. Fixed after that run (a spoken close now ends the case or is
   withdrawn; the ladder stands down after a recommendation). The included
   run is the rerun after the fix.
2. **Derek, included run.** The interviewer corrected his unit error and
   challenged his invented figures well. But when he repeated the same error
   later, it probed Socratically again instead of correcting immediately
   (Rule 14). It also left his menu-price request unanswered four times
   (Rule 11).
3. **Sam — the wellbeing protocol didn't fire.** She disclosed real distress
   mid-case. The interviewer acknowledged it but steered back into the case
   ("Shall I pull the menu-price history?") instead of clearly offering to
   pause or stop without penalty. The session was then scored as a normal
   case. The PDF calls this the most important scenario in the suite.
4. **Omar — false conduct warning.** He quoted a character in the case ("the
   CEO basically said you're an idiot if you think it's labor") and got the
   scripted "Let's keep this professional" warning. The report then listed it
   as a professionalism lapse.
5. **Carmen (included run).** An earlier run is not included — a harness bug
   meant the dropout never happened. In this run, the 60-second check-in
   worked and restated the open question correctly. The 180-second pause
   didn't fire, because of a timing bug in the test harness (since fixed).
   Separately, the interviewer promised "Here's the bean price change"
   without giving the figure.

**Across runs:** the interviewer often leaves a candidate's request for
available data unanswered, even though the system detects and logs every
such non-response (Rule 11). This is the most consistent failure so far.

**Cost:** about $1.18 per run at API list prices, of which about $0.89 is the
product itself and the rest is the simulated candidate (28 Sep runs, see each
summary file).
