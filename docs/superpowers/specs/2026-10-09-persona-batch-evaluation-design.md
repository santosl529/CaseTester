# Persona batch evaluation — recorder, scorecard, fault review, scoring evaluation

Status: approved 9 Oct 2026, with two changes at review: the ChatGPT baseline runs after the batch (§2.7, §3), and the naming scheme in §2.2.
Scope: the 62-persona text batch (`scripts/personas.ts`) and everything needed to turn it into a pilot-readiness decision and reusable replay/training material.

## 1. Purpose and success criteria

The batch must answer three questions before the pilot:
1. **Is the interviewer ready?** How many interviews contain at least one serious fault that reaches the candidate, how often faults occur per turn, and which failures recur.
2. **Is the scoring right and useful?** Do the reports rate each persona the way it was designed to perform, and are they clearly more useful than what a student gets from free ChatGPT?
3. **Can we replay and later train on what we saw?** Every turn is saved with the exact model inputs, so any failure can be replayed exactly and reviewed turns can become training examples.

Deliverables: a pilot-readiness scorecard; the five most consequential recurring failures, each with a replay set; a scoring-evaluation summary; PRD and progress updates.

Constraints carried from the project rules: ask before every paid step, with an estimate; run waves in parallel; verify by reading transcripts (classifier numbers are not results); no migrations; production behaviour unchanged.

## 2. Components

### 2.1 Per-turn recorder (pipeline hooks; file output)
- `runTurn` (lib/orchestrator/session-runner.ts) gains an optional `onTurnRecord(record)` callback, called once per candidate turn after Settle (and for scripted/code-written turns). Production callers pass none — no behaviour or latency change.
- The interviewer-model context (`TurnContext`, lib/agent/models/interface.ts) gains optional `onRequest(body)` / `onRawOutput(text, attempt)` hooks, called by every adapter for every API call — first attempt, guard-B regeneration, unknown-id retry — so the record holds the **exact request bodies sent**, not a rebuild.
- `TurnRecord` (one JSON object per turn; type in a new `lib/orchestrator/turn-record.ts`):
  - `requests[]`: exact request body, model id, settings (thinking, effort, max tokens), attempt kind;
  - `stateBefore`: phase, elapsed ms, revealed ledger ids, exhibits shown, open data requests, pressure-test state, stall rung, verified figures, recompute flags, turn kind;
  - `outputs[]`: raw text per attempt, parsed turn, validation;
  - `code`: check verdicts for the turn, withheld sentences with reasons, data decisions (`decideData` result), code-written kind if any;
  - `delivered`: segments in order, each with its kind (say / data / question) and delivery time from the turn start, and the saved interviewer line;
  - `timing`: timer marks; `usage`: per-call tokens and model.
- `scripts/live-run.ts` writes `turns.jsonl.gz` beside the run JSON, with a header line: git commit, dirty-tree flag, model ids, persona id/name/brief, wave id, batch version.
- Size ≈ 1 MB/interview uncompressed; record files are git-ignored (`*.jsonl.gz` under `Case Interview Runs/`), the summary outputs are committed.
- The type is designed so a later DB-backed recorder for pilot sessions can reuse it (not built here; would need a migration and a data-retention decision).

### 2.2 Waves and the batch manifest
- The batch runs in **waves of up to 10 personas**; the user chooses each wave's size and persona ids. Each wave is one command, e.g.
  `scripts/persona-batch.ts --personas=1,2,3 --cap=65`, launching the runs in parallel and exiting when they finish.
- **Naming:** the batch is **batch 18**, version `v1`. Runs are numbered 1–62 in the order they are run. Each wave's runs go in `Case Interview Runs/test runs/batch-18-<mon>-<dd>-runs-<x>-<y>/` (the date the wave ran, its first and last run numbers — e.g. `batch-18-oct-09-runs-1-10`, then `batch-18-oct-10-runs-11-15`). Batch-level files (manifest, budget ledger, scorecard, faults, review sheet, bands comparison) live in `Case Interview Runs/test runs/batch-18/`.
- `manifest.json` in the batch folder records: batch version, git commit, bands-file hash, severity-file hash, model ids, and per persona: status (pending / done / failed), run folder, wave id, cost.
- Shared budget ledger across waves (`LLM_BUDGET_FILE` in the batch folder) with the batch cap; each wave also prints its own estimate before starting.
- **Freeze:** a wave refuses to start on a dirty working tree or on a commit different from the manifest's, unless `--new-version=<label>` is passed; runs are then tagged with that version and never pooled with the earlier version in any summary.
- A persona already `done` is skipped unless `--rerun` is given (used for the rerun phase; reruns are tagged `rerun-N`).

### 2.3 Scorecard extractor (free)
`scripts/batch-scorecard.ts <batch>` reads run JSON + turn records and writes `scorecard.csv`, `scorecard.json` and `scorecard.md`. One row per interview; each column marked by source — **auto** (code), **pre** (Opus pre-screen), **human** (confirmed):

| Group | Columns |
|---|---|
| Completion (auto) | ended normally / abandoned / technical failure / stuck (same probe ≥3 times, or ≥4 consecutive turns with no new stage and no new data) |
| Administration (auto) | each required stage delivered / skipped / repeated (`stageAdministration`, lib/orchestrator/spoken-close.ts) |
| Serious faults (pre → human) | confirmed serious fault count and ids |
| Conversation quality (pre → human) | ignored questions, repeated probes, premature advancement, references to unseen exhibits |
| Candidate effort (auto + pre) | requests asked again before being answered (data_request events); candidate corrections of the interviewer |
| Performance (auto) | first relevant spoken text median/p90 (definition as in the 8 Oct screens: first non-acknowledgment `say` sentence that passes the vetoes, else the data line, else the finished turn); regenerations; vetoes; timeouts; cost (app and simulator separately) |

Batch headline: interviews with ≥1 confirmed serious fault; faults per 100 turns; per-interview longest run of consecutive faulty turns.

Opportunity denominators: explicit asks; ledger items requested; candidate calculations examined by the recompute / verified-figure checks; exhibits shown; stall rungs; recommendation asks. Counts that come from the data-request classifier (69/73 on its hand-labelled set) get a hand-checked sample of 20.

### 2.4 Fault records, pre-screen and human confirmation
- **Fault record** (`faults.jsonl`): id, run, turn, candidate text + two preceding turns, model raw output, orchestrator changes (withheld / decisions), delivered text, expected behaviour with rule or case-fact reference, category (requests / math / grounding / acknowledgment / conversation / administration), severity, attribution (model / orchestrator / **simulator** / ambiguous policy / evaluator uncertain), recovered (and at which turn), source (code / pre-screen / human), status (proposed / confirmed / rejected), reviewer note.
- **Code flags** (free, in the extractor): mechanical faults visible in records — vetoes that removed the whole question, guard-B double misses, loops (same probe ≥3), stages skipped, technical failures, timeouts.
- **Opus pre-screen** (`scripts/batch-prescreen.ts`, Opus 5.5, one call per interview): input = transcript as delivered, condensed turn records, the interviewer-behaviour rules excerpt, the case facts (server-side script — never shipped to the client). Output = proposed faults with exact quotes. Code verifies every quote verbatim against the delivered text (same approach as the scoring evidence audit) and drops unverifiable proposals. Estimate ≈ 62 × (35k in, 4k out) ≈ **$15**; metered under the batch ledger with its own cap.
- **Human confirmation**: `review-sheet.md` lists every proposed serious fault (with context and quotes) plus **8 randomly chosen interviews with no flags**, to be read in full. Verdicts are entered in the sheet and parsed back into `faults.jsonl`. Reported: pre-screen precision (confirmed ÷ proposed) and an estimate of misses from the 8 full reads.

### 2.5 Severity definitions (frozen before the batch; file `evals/severity.md`)
- **Serious** — reaches the candidate and misleads or blocks: a wrong case figure, **or a correct figure attached to the wrong quantity** (both count against FR-4); unrequested release of gated data; false refusal of data the case holds; challenging correct math or approving wrong work; an explicit ask ignored twice; the same probe ≥3 times; ending without a required stage.
- **Moderate** — degrades: a question ignored once; one repeated probe; premature advancement; an unasked offer; an acknowledgment mismatched to the turn (e.g. a disclosure of distress).
- **Minor** — wording.
The user may edit these at spec review; after the freeze, changes create a new version.

### 2.6 Training collection (human-confirmed only)
`training/` holds reviewed examples: the exact inputs from the turn record → the **corrected JSON turn** the model should have produced (`say`, `requests`, `exhibit`, `rescue_item`, `question`), never the delivered text (which contains code-written data lines). Good turns are included as well as corrected ones. Sonnet's output and completed interviews are not treated as correct by default.

### 2.7 Scoring evaluation
**Persona bands** (`evals/persona-bands.json`, drafted by Claude from each persona's brief, reviewed and corrected by the user, then frozen; hash in the manifest):
- per persona × 8 dimensions: an allowed set of ratings from `needs_work | meets_bar | strong`, or `not_assessed` expected (a stage the persona never reaches), or no expectation;
- each cell: confidence (high / medium) and a one-line reason quoting the brief.
- Comparator (`scripts/batch-bands.ts`, free): each scored dimension is in band / one step off / two steps off; agreement reported separately for high- and medium-confidence cells; runs with confirmed simulator attribution excluded.
- The scoring-QA counters already logged per run (`scoring_qa`: verifier drops, evidence strips, reconcile merges, answer-key drops, transcript artifacts) are aggregated across the batch.

**Blind comparison with a free-ChatGPT baseline:**
- 12 interviews, stratified 4 strong / 4 average / 4 struggling (by persona design), at least 2 with confirmed interviewer faults.
- Baseline prompt (what a student would type): case prompt + transcript + "Here's my mock case interview transcript. Give me detailed feedback on my performance." No rubric.
- **Runs after the batch** (post-batch phase), not during the waves; its tooling is built then too.
- Baseline model: to be named by the user before that phase (whatever free ChatGPT runs then); fallback GPT-6 Luna via the existing OpenAI key — a few cents.
- `scripts/blind-packet.ts` renders both reports as plain text with product names removed, assigns A/B randomly per pair, writes `blind/packet.md` and a separate `blind/key.json`. Blinding is partial (structure and style may reveal the source) — recorded as a limitation.
- Per report the user records: wrong claims about the transcript (count), specific (points to moments), actionable next steps, priorities right, anything wrong or harmful; per pair: preference and "ours clearly better" (yes / no). `scripts/blind-tally.ts` unblinds and summarises.

## 3. Protocol and spend gates
1. **Build** (free, TDD, a checkpoint after each piece): recorder → manifest/waves → scorecard extractor → pre-screen → bands comparator. (Blind packet + tally are built in step 7.)
2. **Draft and freeze:** Claude drafts the bands and the severity file; the user reviews; both are committed and hashed.
3. **Smoke** (≈ $1.20, ask first): one scored persona through every step (record completeness, extractor, pre-screen on that run).
4. **Waves** (≈ $0.77 per persona, batch cap $65, ask before each wave): the user names the personas and the wave size (≤10).
5. **Scorecard** (free) → **pre-screen** (≈ $15, ask) → **user confirmation**.
6. **Reruns** (≈ $15–25, ask): each persona with a confirmed serious fault runs twice more (tagged `rerun-N`).
7. **Scoring evaluation (post-batch):** bands comparison (free); then build the blind packet + tally, generate the baseline for 12 interviews (cents, ask), user's blind read, tally.
8. **Deliverables** (§1) and PRD/progress updates.

Total ≈ $85–110 API; user time ≈ 45 min (bands review), 2–3 h (fault confirmation), ≈ 2 h (blind read).

## 4. Testing
- Recorder: unit tests with fake models — every attempt's request body captured (first, guard-B regeneration, unknown-id retry); state snapshot taken before the turn; delivered text equals the saved line; no callback → no change (existing runner tests unchanged).
- Manifest: refuses a dirty tree and a changed commit; `--new-version` tags; skip/rerun logic.
- Extractor and comparators: fixture runs (a small synthetic run plus one saved real run) with hand-computed expected rows; "stuck" and loop detection on a fixture with a 14-turn loop.
- Pre-screen: quote verification drops a paraphrased quote and keeps an exact one; parser handles malformed model output (no fault rows rather than a crash).
- Blind packet: product names removed; A/B assignment recorded only in the key file; tally reproduces a hand-computed fixture.

## 5. Out of scope
- The human voice listening check (separate small task — text personas cannot judge interruptions, pauses or delivery).
- A DB-backed recorder for pilot sessions (needs a migration and a retention decision).
- Accuracy against a human grader and grading consistency (`regrade.ts --repeat`) — not selected for this round.
- Any fix to faults found — the batch reports them; fixes follow as separate work.

## 6. Decisions
- Settled at review: batch 18, version `v1`, wave folders `batch-18-<mon>-<dd>-runs-<x>-<y>`; ChatGPT baseline post-batch; severity definitions as written (still editable until the freeze in step 2).
- Open: baseline model for the blind comparison (before the post-batch phase).
