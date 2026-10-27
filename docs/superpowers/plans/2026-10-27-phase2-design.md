# Phase 2 design: one data decision, one turn composer (27 Oct 2026)

Written for Lorenzo. Design only: nothing is built, nothing is paid, and no switch exists yet. Branch `phase2-design`, cut from `phase1` at b2496fb0 (the gate verdict). The Phase 1 wave session's worktree was not touched.

**Sources:** the Phase 1 gate verdict, handoff and contract; the 21 Oct data-path audit (its path numbers are reused below, as `A1`–`A22`); the code at b2496fb0; and three free replays run for this design:

| Label | What | Result |
|---|---|---|
| `fault-bank-p2design-on` / `-off` | The bank at phase1 HEAD, `*=phase1` and off | Fault 68 / 155 on (46 off); correct 95 / 96 both arms. Three more than the verdict's 65, from the Stream 3 tasks merged after `preset-final` was taken |
| `p2d-b3638-on` / `-off` | b36a, b36l, b37h, b37q and b38l: 25 runs, 382 interviewer turns, with checker verdicts | The firing counts in §1 |

All of these are in `CaseTester-proof-out/`. The counting scripts are in this session's scratchpad (`count2.py`, `count3.py`, `replay-b36-38.sh`), not committed.

**Code abbreviations:** `td` = `lib/orchestrator/turn-data.ts`, `dd` = `data-decisions.ts`, `se` = `settle-turn.ts`, `st` = `stream-turn.ts`, `sr` = `session-runner.ts`, `pt` = `plan-turn.ts`, `fc` = `fact-check.ts`.

**What "Phase 2-owned" means here.** The verdict's "~90" is the 87 replayable fault records that fail with `*=phase1` at HEAD. They split as follows:

| Owner | Records |
|---|---|
| Data decisions and turn shape (this design) | **57** (55 data-path records + 2 math records that are turn-shape faults: b33-blake-t22, b36a-jasmine-t14) |
| Math: stale probes, misquotes, probe chains, missed errors (Stream 3's residue; not data or composition) | 23 |
| Stage logic: recommendation re-asks, `close_wait` (4.8 / 4.9 territory) | 7 |

The 35 records tagged `stream: "phase2"` are not replayable:
- 16 are report faults, for scoring;
- 14 are the model's own wording;
- 5 are turn-shape faults the composer's lint would catch. These are listed in §5, as wave-judged.

---

## 1. Inventory: every path that writes interviewer text or decides a data line

### How to read the firing columns

- **rec** is the recorded runs of b36–38, as they ran. b36 and b37 ran on `engine-asks` 29469ee (before round 6); b38 ran later.
- **off** is the replay at HEAD with no switches.
- **on** is the replay at HEAD with `*=phase1`.
- Counts are turns with the row acted, deduplicated per turn, unless the column says "items" or "lines".
- **"—"** means the path doesn't log a row, or the replay can't fire it. The replay serves recorded classifier output, so the message-ask wait (A11) never re-fires.

**Records** are the failing fault records whose wrong call the path made (my attribution from the record note and the replayed turn; marked † where two paths share the blame).

### 1a. Paths that decide a data line (the decision function replaces these)

| # | Path | File · function | Trigger | Firings rec / off / on | Records it owns |
|---|---|---|---|---|---|
| A1 | The model's own mapping and `respond` | `td:turnData` → `dd:decideData` (`dd:422`) | `requests[]` with item ids | explicit with items: 141 release + 16 defer declarations; item-less explicit 36 + 9; mentions 25 + 8 (on; identical off) | b37q-tyler-t6-paid-organic, b37q-marcus-t6-month-to-month, b38l-tyler-t22-onward-restated, b38l-raj-t8-network-fare, b35h-marisol-t10-non-answer† |
| A2 | Label alias for an unmapped ask | `td:1285` → `dd:labelMatch` | item-less explicit ask equal to one label | — | — |
| A3 | `request_group` | `td:1385–1407` | the ask names a case group | 8 / 8 / 8 | — |
| A4 | `request_covers` (per-store) | `td:1445–1457` | a mapped per-store ask that a cover answers | 0 / 0 / 0 | — |
| A4′ | `covers_added` (round 6, Task 68) | `td:1355–1372` | a mapped ask the covers name further items for | 2 / 4 / 5 | — |
| A5 | `request_scope`, plus `coarse_keep_named` (4.2) | `td:1431–1500` → `dd:scopeRule` | a mapped item outside the ask's cut, split or basis | 3 / 3 / 1; keep-named 0 / 0 / 1 | b38l-jasmine-t4-ticket-extras, b34a-jasmine-t4-drug-class |
| A6 | `refusal_remapped` (case names) | `td:1646`, `td:1745–1760` | an item-less ask whose refusal would name a held item | 2 / 2 / 2 | — |
| A7 | `refusal_covered`, plus `cover_gate` (round 6) | `td:1643–1742` → `fc:coverageDetail` | an item-less ask a cover phrase hits | 3 / 7 / 10; cover gate 0 / 1 / 1 | b37h-marisol-t16-chip-bags, b37h-marisol-t18-forecast-actual |
| A8 | Haiku ask check (verdicts, qualifier guard / answer gate, 4.3 tag gate) | `td:checkAsk` (`td:553`), `td:decideCheckedAsk` (`td:454`), `td:haikuTagGate` (`td:651`) | an explicit ask still item-less after A6–A7 | calls (`itemless_defer`) 28 / 19 / 17; applied (`checked_ask`) 28 / 22 / 17; tag gate 0 / 0 / 1; `partial_dropped` 5 / 3 / 3 | b38l-marisol-t12-fuel-restated, b38l-marcus-t24-extras-type†, b34a-marisol-t28-hollow-franchise, b35q-marisol-t12-hollow-held, b37q-raj-t16-demo-coarse, b38l-tyler-t20-demand-evidence |
| A9 | Item-less ask refused ("I don't have …") | `td:turnDataDecided` (`td:711–743`) | check verdict: no item | 32 / 35 / 33 refusal lines (data segment) | b36l-marcus-t6-casm, b36l-jasmine-t2-departures, b38l-tyler-t2-split-refusal, b37h-raj-t16-category-growth, b37h-tyler-t14-repeat-rates |
| A10 | `scope_coarse` (E1: the coarse line + the finer cut refused) | `td:1903–1949` | an ask a scope rule emptied, or a coarse or partial verdict | 9 / 13 / 12 | b36l-raj-t20-fixed-split, b38l-tyler-t6-fare-network |
| A11 | `uncovered_asks` / `probe_turn_requests` (the message's asks) | `td:messageAsks` (`td:1145`), `td:withAsks`; logged `se:204` | an asking sentence with a clause no declaration names | 8 + 2 / — / — | b37h-jasmine-t4-velocity, b37h-raj-t10-velocity, b36l-marisol-t4-fare-half, b38l-raj-t14-passenger-mix, b36l-raj-t14-load-at-140 |
| A12 | `release_checked` (withdraw a model release with no shared word) | `td:uncheckedReleases` (`td:1106`) | a model release of an item not yet out | 1 / 1 / 1 | b37q-marisol-t8-share-coarse |
| A13 | Offer (`explicit:false` → "I can share X if you'd like") | `dd:546–550` (`mentionStatesNeed`) | a mention whose label a need cue names | 1 / 1 / 1 offers | b34a-marcus-t14-offer; b35h-jasmine-t6-chip-volume-offer† |
| A13′ | `mention_asked` (round 6, Task 71) | `td:1302–1319` | a mention an asking sentence names | 0 / 1 / 1 | — |
| A14 | Pressure-test gate deferral | `td:1830–1851` | a gated item asked before the structure probe is answered | — / 3 / 1 lines | b35q-marcus-t4-same-item-stall, b37q-jasmine-t4-cac-stall |
| A15 | Fulfilment and forced releases ("On what you asked about earlier:") | `td:1854–1879` | pressure test satisfied, missed twice, a rec/close kind | — / 9 / 11 lines | — |
| A16 | Deferral lines: the model's defer, cap, release order; won't-get-to at wrap-up | `dd:535`, `dd:552`, `dd:571` | `respond: defer`, cap, `heldForOrder`, wrap-up | defers 35 / 43 items (off / on); won't-get-to 0 / 2 | b38l-marisol-t6-deferral-delivered†, b36l-jasmine-t6-deferral-renames† |
| A16′ | Open-deferral tracking and its resolution (round 6, Task 76; 4.3, 4.4, 4.7) | `td:resolveDeferrals` (`td:962`), `td:closeOpenDeferrals` (`td:951`), `td:nounDeferrals` (`td:812`), `td:modelDeferrals` (`td:862`); `se:774–783` | an item-less deferral on a tagged case; a model promise | resolved 0 / 0 / 2; model deferral 0 / 0 / 1; `refusal_noun` off-preset | b38l-tyler-t24-elasticity, b34l-marisol-t30-wont-get-to |
| A17 | Exhibit handover (asked, covering, the model's field, a stage turn) | `dd:447–462`; stage `sr:codeWrittenTurn` | an asked exhibit, 2+ of its items asked, the model's field, or a stage | 72 data-line handovers + 36 in the question slot (both arms) | b37q-raj-t8-churn-half |
| A18 | `code_written_requests` (asks on a code-written turn) | `sr:codeWrittenAsks` (`sr:466`) | a stage, close, warning or probe turn with asks | 18 / 17 / 16 turns | b33-tyler-t18-want-dropped, b37q-marisol-t16-question-dropped |
| A19 | `request_guard` (regenerate on empty `requests`) | `lib/agent/interviewer.ts:79–95` | an explicit cue and `requests: []` | 4 / 3 / 3 | — (upstream of decisions; kept) |
| A22 | Rescue item (stall rung 3) | `dd:561` | a rung-3 turn | 0 | — |
| A23 | Must-reach (round 6 Task 72; `mustReachPhase1`) | `td:mustReachItems` (`td:180`), `td:1995`; late at `se:678–692` | due at an exhibit or the recommendation ask | 4 / 8 / 17 | — (3 correct records pin it) |
| A24 | Restatements: "As I mentioned", "As the exhibit shows", the 4.1 pointer and recent rules | `dd:527`, `dd:733–741`; `td:restateRules` (`td:1209`) | an explicit re-ask of an item out | lines: mentioned 2 / 3, exhibit 4 / 0, pointer 0 / 3 (+2 in the tail); `restate_rules` 0 / 6 | b34l-tyler-t20-doubled-line†, b34l-marcus-t22-reassignment†, b35q-marcus-t18-hollow-on-screen |
| A25 | Prompt-fact restatement | `td:1984–1991` | a cover reaching a prompt fact | — | — |

### 1b. Paths that write or remove interviewer text (the composer replaces these)

| # | Path | File · function | Trigger | Firings rec / off / on | Records it owns |
|---|---|---|---|---|---|
| C1 | Model `say` admitted sentence by sentence while streaming | `st:streamTurnSegments` (`st:360–388`) + `st:vetoReason` (`st:170`) | every model turn | — | — |
| C2 | Settle's vetoes on say / question (withheld whole sentences) | `se:234–259` | every model turn | turns 40 / 45 / 44. Reasons (on): brainstorm held 12, probe_guard 11, provenance 6, data_talk 4, grading 4, loop 3, rec held 3, question_in_say 2, undelivered_claim 2, unsupported_challenge 2 | b35h-marisol-t24-hollow (data_talk withheld the true refusal), b38l-marcus-t24-extras-type† |
| C3 | Grading remainder (rewrites a question sentence) | `se:239–242` | a grading sentence in the question | — | — |
| C4 | Ack rotation (4.10) | `st:425`, `se:263` | the model's opening acknowledgment | ~1,200 lines over b28–38 (Stream 4b) | — |
| C5 | Math-challenge replacement (the probe guard; `probeGuardMethod`) | `se:287–331` | a withheld doubt on verified or unflagged math | 6 / 11 / 10 | b38l-tyler-t14-125-vetoed (math) |
| C6 | Fallback question appended to a stripped question; "Go on." | `se:336–344` | the question left with no ask | "Go on." alone 0 / 0 / 1 | b33-tyler-t18-stale-reprobe, b37q-marcus-t32-rec-reask (both "Go on." replay artifacts) |
| C7 | Undelivered claim / undelivered figures replacement | `se:349–375` | a question about data not given | 2 / 2 / 2 | — |
| C8 | Pressure-test re-ask / narrow / waiver / code probe / structure ask | `se:384–460` | the probe state | re-ask 5, narrowed 5, replaced duplicate 1 (both arms) | — |
| C9 | Stage holds: exhibit, analysis or brainstorm in place of the model's question; pressure exhibit prepended | `se:486–571` | an owed stage | `stage_hold` 40 / 42 / 42 | — |
| C10 | Checker line: prepended to, or in place of, the question; held for a due stage | `se:589–614`, `se:720–752` | a checker flag this turn | 21 / 30 / 25 (by code 28 / 24) | b34l-marisol-t12-ask-swallowed, b34l-marisol-t26-ask-swallowed (the probe took the only slot) |
| C11 | Stage code lines before code's rec ask | `se:594` | a correction riding on a stage turn | — | — |
| C12 | `pending_data` rewrite ("once you have those figures") | `se:624–645` | data given this turn | 0 | — (the wave-judged b33-marcus-t6) |
| C13 | Loop advance (third ask of one intent) | `se:649–660` | two asks of one intent, nothing given | 3 / 3 / 3 | — |
| C14 | Late must-reach line appended to the data line | `se:678–692` | due at a held exhibit or the model's rec ask | in A23 | — |
| C15 | Wrap-up "We won't get to …" for the model's own promise (4.7) | `se:706–713` | a model promise on a wrap-up turn | in A16′ | — |
| C16 | The composition itself: `[say, ...dataLines, question]` | `se:715` | every turn | 382 | b38l-tyler-t20-dangling-figure, b36l-marisol-t12-dangling-figure, b36l-tyler-t20-dangling-quote, b34a-marcus-t6-exhibit-deferral, b34l-tyler-t20-doubled-line† |
| C17 | Code-written turns (close, close_wait, rec_ask, grace_ask, time_warning, rung1, stage_exhibit / brainstorm / analysis, rec_revision, rec_math_probe) | `sr:codeWrittenTurn` (`sr:484`); kinds from `pt:planTurn` | `turn_kind` | close 25, stage_exhibit 26, close_wait 19, rec_ask 18, stage_brainstorm 10, rec_math_probe 5, time_warning 3 / 2 | the 7 stage-logic records (not this design) |
| C18 | Scripted turns (distress, conduct, exit, offer, silence) | `pt:planExit`, `pt:scriptedOffer`, `sr:runSilence` | screens | 0 in b36–38 | — |
| C19 | Prefix lock: undelivered sentences sent, delivered ones never changed | `se:tailAfterDelivered` (`se:126`) | a streamed turn | `stream_buffer_switch` 4 / 6 / 6 | — |

**Count: 25 data-decision paths (A1–A25, with A20 and A21 moved to C-rows) and 19 text paths (C1–C19): 44 in all.** The audit counted 22. The difference is the round-6 and Phase 1 additions (A4′, A5's keep-named, A7's cover gate, A8's tag gate, A13′, A16′, A23, A24's 4.1 rules, A25) and the text paths the audit didn't cover (C2–C19).

**Shape counts on the composed turn** (b36–38, off / on):
- a data-line phrase in the tail, after the question was composed: 5 / 5;
- a "that figure" in the turn: 9 / 8;
- two or more questions: 8 / 8;
- "Go on." alone: 0 / 1.

These are the composer's baseline numbers.

---

## 2. The decision function

### 2.1 What it replaces, and the shape of the problem

Today a data line comes out of up to six re-decisions of the same ask:
1. the model's mapping;
2. group expansion;
3. covers added;
4. scope drops;
5. the answer gate;
6. the coverage or names remap.

After that come up to three passes of the Haiku check, each re-running `turnData` (`td:680 CHECK_PASSES`). Then follow the E1 narrowing, `nounDeferrals`, `closeOpenDeferrals`, and Settle's late must-reach and won't-get-to additions.

**Each step can undo the one before.** That is how every fault class in §5 arises:
- a scope rule drops the item the model correctly named (b38 Jasmine t4);
- `release_checked` withdraws the closest answer (b37 Marisol t8);
- a refusal goes out for one half of a two-part ask while the other half is answered, or the reverse (the 21 `bare_partial` records);
- a cover matches the model's paraphrase rather than the candidate's words.

The unit is also wrong. Today's unit is the model's `what`, which merges or drops the candidate's sub-asks. The 21 `bare_partial` records are almost all a two-part ask where one part got nothing.

### 2.2 Interface

One module, `lib/orchestrator/ask-decision.ts`, made of pure functions. It runs in two phases, because the Haiku check is asynchronous and must run only where today's code runs it (your "no model call BASE didn't make" ruling, 21 Oct).

```ts
// Phase A — what needs the Haiku check (sync, deterministic)
planAskChecks(input: AskInput): { subAsks: SubAsk[]; toCheck: SubAsk[] }

// Phase B — the decision (sync, deterministic, given the verdicts)
decideAsks(input: AskInput, verdicts: ReadonlyMap<SubAskKey, CheckVerdict | null>): AskDecision
```

Stream calls both phases once the declarations close; the result is cached on the plan, and Settle reads the cache (today both re-run `turnDataChecked`). Same inputs give the same output, so Stream and Settle can't disagree.

```ts
type AskInput = {
  candidate: { text: string; asking: string[] };   // addressed asking sentences (today's messageAskSentences / codeWrittenAsks grammar)
  model: { asks: DeclaredRequest[]; exhibit: string | null; rescue: string | null;
           ownWords: ModelSentence[] };             // admitted say + question sentences, each tagged refuse | defer | promise | other
  detections: DetectedDataRequest[] | null;          // the message classifier (A11 / A18), when it ran
  said: { revealed: Set<string>; shownExhibits: Set<string>; recent: InterviewerTurn[]  /* last 4 */;
          open: OpenDeferral[]; mustReachDone: string[] };
  stage: { kind: TurnKind; phase: Phase; ptOpen: boolean; ptState: PressureTestState; wrapUp: boolean;
           stagesOut: Set<string>; cap: number };
  case: { ledger; factBase; exhibits; tags; definitions };   // server-side; never in a prompt
};

type SubAsk = { key: string; words: string; sentence?: string; source: 'candidate' | 'model' | 'detection';
                modelIds: string[]; detectionIds: string[] };

type Outcome =
  | { kind: 'release'; items: string[]; exhibit?: string; cut?: string /* E1: the finer part refused beside */ }
  | { kind: 'refuse'; words: string }               // true refusal: the case holds nothing for it
  | { kind: 'defer'; words: string; why: 'gate' | 'order' | 'cap' | 'uncertain' | 'model_promise';
      resolves: { items?: string[]; need?: Record<string, string[]> } }
  | { kind: 'point'; items: string[]; form: 'exhibit_summary' | 'line' | 'named_recent' };   // already out

type AskDecision = {
  asks: { subAsk: SubAsk; outcome: Outcome; rule: RuleId; evidence: Evidence }[];   // one per sub-ask
  volunteered: { items: string[]; why: 'must_reach' | 'fulfilment' | 'forced' | 'rescue' }[];
  exhibit: { id: string; covers: string[] } | null;
  offers: string[];          // see open question Q4
  wontGetTo: string[];       // wrap-up: open deferrals closed by name
};
```

`evidence` logs, for each sub-ask, every source's candidates and what each gate said. **The decision is one log row (`ask_decision`), replacing the 20-odd rows in §1a.**

### 2.3 Sub-asks

A sub-ask is one thing the candidate asked for. It is built deterministically, in this order:
1. **The candidate's asking sentences, split at conjuncts.** "departures and average fare"; "the store count, plus turns per store per week". The split uses the grammar that already exists: `ask-qualifiers.ts` conjuncts, `coverageDetail` list entries, `guardParts`. It does not split inside a split ask: "split of X between A and B" is one sub-ask (b38 Tyler t2).
2. **The model's declarations**, aligned to sub-asks by naming-word overlap (`askSentenceFor`). A declaration that aligns with nothing becomes its own sub-ask (`source: 'model'`), as today.
3. **The classifier's detections**, aligned the same way. On a code-written turn these are today's kept detections (A18); the dropped ones become sub-asks too, so they are no longer lost (b33 Tyler t18, b37q Marisol t16).

A sub-ask with no declaration and no detection, which only the deterministic split found, is undeclared. **Undeclared sub-asks may be released or deferred, but never refused without the check** (your 19 Oct R1). Whether the check may be called for them is open question Q1. If it may not, they defer.

### 2.4 Rules, in priority order

Each sub-ask gets candidates from five sources:
- **model** (A1, A13′);
- **haiku** (A8);
- **cover** (A4′, A7, using the 4.5 normalization);
- **names** (A2, A6);
- **detection** (A11, A18).

Group expansion (A3) adds group items as candidates for the group's sub-ask.

Two shared tests:
- **The tag gate:** item tags against the sub-ask's tags, on entity, period and quantity kind (4.3's `itemTagsAgree`, plus round 6's `tagsAgree` and the answer gate's entity and forecast tests).
- **The M6 veto:** `findFalseRefusals` with covers, against everything out or given this turn.

The rules run top to bottom; the first that decides a sub-ask wins.

**R1 — Already given this turn.** A candidate item that another sub-ask releases this turn counts for this sub-ask too: no second line, and no deferral or refusal of it. *(Replaces `dd:decideData`'s two-pass ordering and today's same-turn defer-vs-release fixes. This is also what makes lint L3 hold by construction.)*

**R2 — A model-named item that matches is kept.** An item the model named for this sub-ask is released when it **matches**. Matching means three things:
- (a) the tag gate passes;
- (b) no scope rule calls it a different quantity: a change item asked for a split, a sibling (`changeForSplit`), or a basis ask mapped back to its own item;
- (c) the item's line or label shares a key noun with the sub-ask, or a cover hits. This is the **line test**, read from the candidate's words, not the model's `what`.

A scope rule that says the item is coarser than the ask (a finer cut, a per-unit cut, a split of a stated figure) never drops it. The item goes out, and the cut is refused beside it (E1's form, see R6). *(Generalizes 4.2 `coarseKeepNamed`; replaces A5's drop and A12's withdrawal.)*

A model-named item that fails (a) or (c) is not released for this sub-ask. It falls through to R3–R7 like any other candidate. It is no longer an automatic release (b35h Marisol t10 `longer_term_goals`; b38 Tyler t22 `connecting_passengers` for "onward-leg revenue").

**R3 — A Haiku positive passes the tag gate.** A check item rated `full` that passes the tag gate and R2's (b) is released. A `partial` item, or one a qualifier or period leaves unmet, is released with the cut refused beside it (E1).

A tag mismatch takes the item off. If nothing is left, the sub-ask defers (`uncertain`), never refuses (4.3, your 22 Oct ruling). *(Replaces A8's three passes, `decideCheckedAsk`, `haikuTagGate` and the qualifier guard's E1 paths; the answer gate's topic test stays check-only, as ruled 21 Oct.)*

**R4 — A deterministic match (covers, names, detections) passes the tag gate.** It is released. A cover that misses only on scope gives E1's coarse form after the pressure test, and a named deferral before it (round 6 Task 70's X1). A geography mismatch refuses the cut (audit row 20).

This reads **the candidate's sentence first, and the model's `what` second** (4.5). *(Replaces A2, A4, A4′, A6 and A7. A6's dropped remainder now follows its own sub-ask, so the remap no longer loses "average fare…" — audit row 4.)*

**R5 — Already out: point, don't repeat.** A matching item that is already out is answered by pointing, never released again:
- the exhibit pointer with its summary, when the item is on a shown exhibit, has a summary, and no specific figure was asked;
- the line, when the figure was asked and wasn't said in the last 4 turns;
- "I gave you X a moment ago.", when it was said in the last 4 turns.

This is 4.1's `restateRules` as a rule rather than a post-pass. It also takes the restate cap of 3 and the prompt-fact restatement (A25).

**R6 — True refusal, only when nothing matches.** A sub-ask with no surviving candidate from any source is refused **only when all of these hold**:
- (a) the check rated it `none`, or a deterministic scope or geography rule made the cut (never a check timeout: no verdict defers);
- (b) no ledger item not yet out shares its **head noun** (4.4, tightened to the head noun per your J5 option);
- (c) the M6 veto passes;
- (d) nothing given this turn states it (`statesAsked`).

The model's own refusal sentence for this sub-ask counts toward (a): it stands in for the check's `none`. It is no longer withheld as `data_talk` and then replaced by a hollow deferral (b35h Marisol t24, b38 Marcus t24). Who speaks it is the composer's call (§3).

The **cut refusal of an E1 release** is a refusal of the sub-ask's finer part. It needs (c) and (d) only, as today's `scope_coarse` does.

**R7 — Otherwise defer (`uncertain`).** The named deferral is said in the sub-ask's words and holds no item. It is tracked open, with:
- its need-carriers (4.4's `need`);
- any items the gates vetoed, which don't count as delivering it (Task 76).

It resolves when a later turn delivers a carrier, or with "We won't get to <words> today." on the first wrap-up turn. A model promise ("I'll check what we have", 4.7) for a sub-ask with no other outcome is the same deferral, with `why: 'model_promise'`.

**The gates.** A release chosen by R2–R4 then passes, in order:
1. the pressure-test gate: becomes a gate deferral, booked;
2. the release order (exhibit `after` / `requiresItems`): an order deferral;
3. the cap of 3, with no group split: a cap deferral.

On a wrap-up turn every deferral is "We won't get to … today." (round-3 ruling 4).

**Volunteered and the exhibit, decided after the sub-asks** (not sub-ask outcomes):
- must-reach due now (A23);
- fulfilment and forced releases (A15);
- the rescue item (A22);
- the exhibit (A17): a requested exhibit first; then one covering two or more released items; then the model's field. The model's field never deferred, re-said or repeated.

### 2.5 Every existing path, mapped

| Path | Rule | Kept / changed / dropped, and why |
|---|---|---|
| A1 model mapping | R2 | **Changed:** kept only when it matches (the tag gate, a different quantity, the line test); never dropped by a scope rule |
| A2 label alias | R4 | Kept, as a names candidate |
| A3 `request_group` | candidates + gates | Kept: group items become candidates; the cap never splits a group |
| A4 / A4′ covers on mapped asks | R4 | Merged: covers are a candidate source on every sub-ask, mapped or not |
| A5 `request_scope` / `coarse_keep_named` | R2 (b), E1 cut | **Changed:** a scope rule can mark an item a sibling (excluded) or coarser (released, cut refused). It never drops a matching named item |
| A6 `refusal_remapped` | R4 | **Changed:** the remainder is its own sub-ask, not lost |
| A7 `refusal_covered` / `cover_gate` | R4, R7 | Kept: a tag-vetoed cover defers (round 6) |
| A8 Haiku check | R3 | **Changed:** one pass, on sub-asks still uncertain after R1, R2, R4 and R5 (no `CHECK_PASSES` loop). The topic test stays check-only |
| A9 item-less refusal | R6 | **Changed:** needs the head-noun test and M6; else R7 |
| A10 `scope_coarse` | R3 / R4 E1 form | Kept as the "release + cut" outcome |
| A11 message asks | sub-ask construction | **Changed:** the candidate's sentences are sub-asks, not an add-on after the model's |
| A12 `release_checked` | R2 (c) | **Dropped.** It withdrew on "no shared word with the message", and its one firing removed the closest answer. Replaced by R2's line test on the candidate's words, plus a positive contradiction: a detection mapping the sub-ask to a different item |
| A13 offer | `offers` | Kept, gated strictly (round 6 Task 71); see Q4 |
| A13′ `mention_asked` | sub-ask alignment | Merged: a mention an asking sentence names is a sub-ask's model candidate |
| A14 gate deferral | gate 1 | Kept |
| A15 fulfilment / forced | volunteered | Kept |
| A16 deferral lines | R7 + gates | Kept |
| A16′ deferral tracking | R7 resolution | Kept (the `OpenDeferral` store and `resolveDeferrals`) |
| A17 exhibit | exhibit | Kept |
| A18 code-written asks | sub-ask construction | **Changed:** dropped detections are sub-asks; the composer gives them the data slot (§3) |
| A19 `request_guard` | upstream | Unchanged |
| A22 rescue | volunteered | Kept |
| A23 must-reach | volunteered | Kept; the question-dependent half moves to the composer's late-data slot (§3.3) |
| A24 restatements, 4.1 | R5 | Kept, as a rule |
| A25 prompt facts | R5 | Kept |
| `nounDeferrals` (4.4) | R6 (b) / R7 | Merged (off-preset today; Q2) |
| `modelDeferrals` (4.7) | R7 `model_promise` | Kept |
| Qualifier guard (untagged prof-001) | R3 partial parts | Kept for prof-001 only; tagged cases use the answer gate's reading |
| `data_talk` withholding the model's refusal | R6 evidence | **Changed**, see §3.4 |

### 2.6 What the decision function does not decide

These stay in their own code:
- **The checker** and every probe or correction, Stream 3's area. The composer gives them a slot.
- **Which code-written turn kind runs** (`plan-turn`).
- **The math backstops.**
- **FR-4:** the post-turn audit stays as is, and only code ever writes a figure.

---

## 3. The turn composer

### 3.1 The order

Every interviewer turn, model-written or code-written, is four slots in a fixed order. Each slot holds whole sentences from one author.

| Slot | Author | Holds |
|---|---|---|
| **1. Acknowledgment** | the model's `say` (C1, after admission) or a code ack | The model's admitted say sentences: acknowledgment and plain statements. No questions, no data talk, and no **setup sentences** (§3.2) |
| **2. Data** | code | The decision's lines in sub-ask order. Each sub-ask's outcome is contiguous: a release followed by its cut refusal; a pointer; a refusal; a deferral. Volunteered lines come first, with their short lead (`MUST_REACH_LEAD_*`), then the "earlier" lead-in and the fulfilment releases. The exhibit handover is last in the slot, so nothing after it reads as deferring it (b34a Marcus t6). Won't-get-to lines close the slot |
| **3. Correction** | code | **At most one** per turn: a misquote flat correction (3.4), a root correction (3.3), the checker's correction line, or a stage code line, in that priority. The others are held to a later turn, as today's held-back checker line already is |
| **4. Question** | the model or code | **Exactly one question:** setup sentences plus one question. The candidates are the due stage question, the pressure-test step, the checker probe, the model's question and a fallback, chosen by today's precedence (C8, C9, C10). No data line, correction or exhibit phrase inside it |

**The correction moves after the data.** Today the misquote correction goes first in the data line (`dd:724`). In your order it sits after the data, just before the question it often leads into. The one thing to preserve is that no rotated ack precedes a correction (4.10's review fix). That still holds, because the ack is slot 1 and a correction turn uses the plain ack.

### 3.2 Combining the model's text with code's lines, without splicing

These rules end the cases where a code line sits inside model text:

1. **The model's text is admitted or withheld as whole sentences, never edited.** Today's `vetoReason` stays as the admission test. The grading remainder (C3) is the one rewrite left. I recommend keeping it, because it has no record against it, but it is the one exception to "never edited" and is yours to rule on (Q6).
2. **Every model sentence is classified once** into: ack / statement, setup, question, refusal, deferral or promise, data talk, and the existing veto classes.
   - A **setup** sentence states the premise of a question: it quotes or restates a figure or claim of the candidate's ("On variable cost, you said $8,800 per flight."; "You said roughly 800,000 passengers a year."), or opens a probe ("On the prevalence input:").
   - The test is deterministic: a candidate figure (`candidateFigures`) or a quoted span inside a "you said / you put / earlier you" frame, or a sentence ending in ":".
3. **Setup sentences travel with their question.** Wherever the model wrote one (say or question), it is admitted into slot 4, immediately before the question it sets up. If code replaces the model's question (a stage, pressure-test step, probe or fallback), **the setup is withheld with it.** That ends:
   - b36l Tyler t20, a quote left dangling before code's recommendation ask;
   - b38l Tyler t20 and b36l Marisol t12, where "that figure" landed after a data line.

   Streaming cost: a setup sentence in `say` is held until the question field closes, instead of going out at once. The ack before it still streams first, so first sound doesn't move; only the setup's own delivery does (§6, R-L).
4. **The model's refusal and deferral sentences go to the decision as evidence, not to slot 1.**
   - When the decision refuses or defers that sub-ask, code's line in slot 2 says it, and the model's sentence is withheld as a duplicate (`data_talk`, as today).
   - When the decision releases the item, the model's sentence is withheld (`refuses_released` / `defers_released`).
   - The difference from today: the model's true refusal now drives R6. Today it is withheld and the ask goes to a hollow deferral.
5. **Code never prepends to or appends to the model's question.** Today's splices map as follows:

   | Splice today | Where it goes |
   |---|---|
   | checker line prepended (`se:597`, `se:610`) | slot 3 (a correction) or slot 4 (a probe in place of the question) |
   | pressure exhibit prepended (`se:556`) and stage-exhibit phrase in the question (`se:496`, `se:513`, `se:532`) | slot 2, the exhibit handover |
   | stage code lines (`se:594`) | slot 3 |
   | fallback appended to a stripped question (`se:341`) | slot 4 holds code's question; the stripped remnant's statements are setup (withheld with it) or slot-1 statements, if admitted before streaming closed |
   | late must-reach (`se:688`) and wrap-up won't-get-to (`se:709`) | slot 2's late part (§3.3) |

### 3.3 Streaming and the prefix lock

Today the stream delivers say sentences as they arrive, then the data line once the declarations close, then Settle's tail (C19). The composer keeps that timing. The slots are delivered in order, so the fixed order is also the delivery order:
- **Slot 1** streams sentence by sentence through admission. Today's `heldRefusal` and guard-B holds stay, and setup sentences are now held too.
- **Slot 2** streams when the declarations close and `decideAsks` is done, as today's data line does.
- **Slot 2's late part** carries data that depends on the question: must-reach due at the recommendation ask or a held exhibit, and won't-get-to for a promise the model made on a wrap-up turn. The question field closes last in the schema, so these can only be decided at Settle. **They go out at the head of the tail, before slots 3 and 4**, so the order still holds. On 5 of 382 turns today a data phrase already lands in the tail.
- **Slots 3 and 4** are the tail.

`tailAfterDelivered` stays the safety net. A turn whose composed text no longer starts with what was delivered sends only the undelivered sentences, logged as today.

### 3.4 The lint (deterministic, on every composed turn)

The lint runs on the composed slots before the tail is sent.
- **"Fix"** means the composer applies a deterministic remedy to undelivered parts.
- A violation inside already-delivered text can't be fixed. It is logged (`compose_lint`, `delivered: true`) and counted.

| Id | Rule | Remedy |
|---|---|---|
| **L1** | **No doubled sentence:** two sentences in one turn equal after normalization, or one repeating the other's line (`repeatsLine`) | Drop the later copy. A data line whose item the model already said in slot 1 (it had been revealed, so FR-4 allowed it) is dropped. The booking stands, because the item was said (b34l Tyler t20) |
| **L2** | **No "that figure / that number / that calculation / there" unless its referent is the previous sentence:** "how you got there", "where did that figure come from" need a figure or quote in the sentence immediately before | Prevented by §3.2 rule 3. If it still fires (a question that refers back into slot 2, b38l Tyler t20), replace the question with the probe-method line that names no figure (Stream 3's `probe_method` pool), with the setup withheld (b33 Blake t22's bare wrap-up probe as well) |
| **L3** | **No deferral of something released in the same turn:** a deferral, "Let's hold", "for a little later", "we'll come back to" or "we'll get there" whose words name an item, or an exhibit, given in slot 2 | Code's own: impossible by R1. The model's: withheld (`defers_released`, new veto, the deferral twin of `refuses_released`). b36l Jasmine t6, b38l Marisol t6 |
| **L4** | **No data inserted mid-question:** slot 4 contains no data line, exhibit handover or correction, and no question sentence comes before slot 2 | Structural: the slots make it impossible. The lint asserts it, so a regression shows up as a count (b34a Tyler t12, wave-judged) |
| **L5** | **One question:** exactly one sentence ending "?" in slot 4, on every turn but the close | Zero: the fallback (as `se:344`). Two or more from the model: **log only in the first build**; measure, then decide the remedy with you (8 of 382 turns today, Q7) |
| **L6** | **No "before any data" / "once you have those" when data went out this turn** | Today's `pending_data` (C12), moved into the lint |
| **L7** | **No quote fragment:** a quoted span starting or ending in "…" in a code line | Code's probe quotes the whole clause or drops the quote (b36a Jasmine t14) |

### 3.5 What the composer does not do

- **It writes no new sentence.** Every line comes from an existing phrase pool or a ledger line.
- **It changes no question precedence.** Stage beats probe beats the model's question, as today's C8–C10.
- **It doesn't judge the model's qualitative claims.** That rules out the wave-judged b34l Raj t6 and b37q Marisol t22.

---

## 4. Migration plan

### 4.1 Principles

- **One path family at a time**, each behind its own switch in `engine-switches.ts` and a new `phase2` preset. Off is phase1 HEAD.
- `ENGINE_SWITCHES='*=phase1,phase2'` is the target. The Phase 1 rules apply: per-case resolution, no pins, the production guard.
- **Shadow first.** Each new structure runs beside the old one and logs its decision without speaking it (`ask_decision_shadow`, `compose_lint`). The first switch only turns shadow logging on. Every disagreement between shadow and live on b28–b38 is classified before anything speaks.
- **The old code is deleted only after the last step's gate holds**, and only on your go. Until then, off means the old code runs.

### 4.2 Each step's gate (as Phase 1's §6, per step)

1. **The fault bank, both arms.** No record moves from pass to fail. No record moves from `fails_as_expected` to a skip (`compare --against`). The step's target records flip (§5).
2. **Correct records:** 95 of 96 hold both ways. `b34a-tyler-t30-close` is the known artifact.
3. **0 new false refusals, 0 wrong releases and 0 false corrections** across b28–b38 with the step on. Every changed data turn and every changed line is read by hand against the phase1 HEAD replay. This is the combined replay's method, with no sampling.
4. **prof-001 identical with the switches off:** 0 changed lines and 0 changed checker decisions on the 21 standard slices against phase1 HEAD.
5. **Latency:** code time per turn (mean, p95, max), and first-segment time on streamed turns. Composer steps also report the time a held setup sentence waits. No added model call (the Haiku check count must not rise; Q1).
6. **prof-001 with the step on** is reported separately. It is untagged, so R2's tag gate and R3's answer gate behave differently there.

### 4.3 The steps

| Step | Switch | What changes | Prerequisite |
|---|---|---|---|
| **S0** | none | Bank and harness work: a `lint` assertion kind (composer violations by id), a `subAsk` assertion (one outcome per sub-ask in a window), the shape counts in §1 as a script, and the combined-replay classifier pointed at `ask_decision` rows. Re-check the 57 target records' assertions against §5's expected outcome; any that demand something the design forbids (a refusal where R7 defers) are fixed first, with your ruling | — |
| **S1** | `askDecisionShadow` | `planAskChecks` + `decideAsks` run on every turn and are logged, never spoken. Sub-ask construction (§2.3) built and measured: how many sub-asks per asking turn, how many undeclared, and agreement with the old path's outcome per ask | S0 |
| **S2** | `askRefusals` | **R6 and R7 replace A9, `nounDeferrals` and the item-less refusal**; the model's refusal counts as evidence. Refusals and deferrals change; releases don't | S1 |
| **S3** | `askModelKeep` | **R2 replaces A5's drop and A12's withdrawal**; the line test | S2 |
| **S4** | `askMatches` | **R3 and R4 replace A2, A4, A4′, A6, A7 and A8's passes**: one check pass, candidate-sentence-first matching | S3 |
| **S5** | `askPartials` | **Per-sub-ask outcomes:** the conjunct split goes live, and E1's "release + cut" is applied per sub-ask. This is where most `bare_partial` records move | S4 |
| **S6** | `askPoint` | **R5 replaces A24's post-pass and A25** | S4 |
| **S7** | `askEveryTurn` | **Code-written turns** run the same decision on the message's sub-asks (A18's dropped detections), and **the data slot is never given up to a probe or stage question** (C10's swallowed asks, as far as detections exist) | S5, C1 |
| **C1** | `composeShadow` | The composer builds the four slots beside the old composition and logs the lint (L1–L7) and slot diffs; nothing spoken changes | S1 |
| **C2** | `composeData` | Slot 2's order (sub-ask order, the exhibit last, the late part at the head of the tail) + **L1** (doubled lines) + **L3** (`defers_released`) | C1 |
| **C3** | `composeSetup` | Setup sentences travel with their question; withheld with a replaced question; **L2** | C2 |
| **C4** | `composeSlots` | **One correction slot** (priority, others held); **the question selector** (one question; L4, L6, L7; L5 logged); the splices in §3.2 rule 5 removed | C3 |
| **B1** (optional) | `lookupDeferral` | "Let me check what we have": a background lookup with a stronger model, answered next turn (§4.4) | S2–S7 measured |

**Order:**

1. S0 and S1 first; nothing speaks yet.
2. Then two lines, alternating so each gate is read once: S2 → S3 → S4 for decisions, C1 → C2 for the composer.
3. Then S5, S6, C3, S7, C4.
4. Then the B1 decision.

S7 waits for C1, because it changes which slot a code-written turn's data occupies. C4 goes last, because it touches the checker's line and therefore Stream 3's records.

### 4.4 Step B1 (optional): is the lookup worth it?

The lookup only pays for asks that end in R7 `uncertain`: no match, but a ledger item shares the head noun. R7 already resolves these:
- by delivery, when a later turn gives a carrier;
- by "We won't get to …" at the wrap-up.

The lookup would replace "We won't get to …" with a real answer one turn later.

**Recommendation: decide after S5, on S1–S5's shadow counts.** Build it only if both hold:
- (a) R7 `uncertain` fires on more than about 1 asking turn in 10 on b28–b38;
- (b) more than half of those close unresolved at the wrap-up.

Today's closest proxy is the item-less named deferral: 18–20 checks per 25 runs on b36–38, about 0.75 a run. Most resolve or turn into refusals. I expect (a) to hold and (b) to fail, which would mean no build. That is not measured yet.

The lookup's costs:
- a model call on a turn that doesn't make one today;
- its first concurrency: a background result consumed next turn, with a "never charge twice" claim per lookup (`scoring-claim.ts`'s pattern);
- a replay that can't prove it, because a new verdict means wave-judged only.

---

## 5. What each step should flip, and the expected order of wins

Expected, not proven: each step's replay is the proof. ✓ means I expect the record to flip on the replay. ? means it depends on a recorded verdict or a judgement in the record's assertion. ✗ means it won't flip offline (wave-judged, or outside this design).

### S2 `askRefusals` — 7 expected, 2 possible

| Record | Why | |
|---|---|---|
| b35h-marisol-t24-hollow | the model's true refusal "repeat rate for sampled households" now counts (R6); no hollow pointer | ✓ |
| b38l-marcus-t24-extras-type | the model's "no extras by type" refusal now counts; the E1 cut refusal "by type" | ✓ |
| b38l-tyler-t24-elasticity | no item has "elasticity": refused, not "I'll check" plus a restatement | ✓ |
| b34l-marisol-t30-wont-get-to | "competitor cost breakdown by labor and utilization": refused, not "That's one we've covered … We won't get to that" | ✓ |
| b35h-raj-t26-chip-margin | the "margin" half refused beside the cannibalization line | ✓ (with S5) |
| b37h-raj-t22-chip-buyers | "respondents' chip buying": refused beside the cannibalization line | ✓ (with S5) |
| b37h-marisol-t16-chip-bags | "the number of bags of chips": refused beside `why_now` (the count rule) | ✓ |
| b37q-raj-t16-demo-coarse | "prior demo requests": refused beside `signup_channels` | ? (the head noun "demo" is in `signup_channels`' line: R6 (b) may defer) |
| b38l-tyler-t22-onward-restated | onward-leg revenue refused | ? (needs S3's line test) |

### S3 `askModelKeep` — 3 expected, 1 possible

| Record | Why | |
|---|---|---|
| b38l-jasmine-t4-ticket-extras | `extras_revenue`, named and matching: kept | ✓ |
| b37q-marisol-t8-share-coarse | `why_pro_fell` no longer withdrawn | ✓ |
| b38l-tyler-t22-onward-restated | the line test fails `connecting_passengers` → R6 | ✓ |
| b35h-marisol-t10-non-answer | the line test fails `longer_term_goals` ("growth platform" carries no "marketing" or "year two") → refused | ? (the label carries "year-two marketing"; the line test must read the line, not the label) |

### S4 `askMatches` — 5 expected, 3 possible

| Record | Why | |
|---|---|---|
| b36l-jasmine-t2-departures | "total departures" cover → `network_totals` released, the fare half deferred or refused | ✓ |
| b36l-marcus-t6-casm | the CASM cover → `unit_costs` | ✓ |
| b38l-tyler-t2-split-refusal | the volume-vs-fare split → `routes_schedule` / `network_totals`, not refused | ✓ |
| b37h-raj-t16-category-growth | the growth half → `why_now` | ✓ |
| b37h-tyler-t14-repeat-rates | `planning_assumptions` (3 bags a household) answers it; with S6 a pointer | ✓ |
| b34a-jasmine-t4-drug-class | `current_treatment` + `nimbrel` coarse, the drug-class cut refused | ? |
| b35q-marisol-t12-hollow-held | `why_pro_fell` / Exhibit 1's note via covers | ? |
| b34a-marisol-t28-hollow-franchise | the recorded check maps `company_size`; R3's entity gate takes it off; `option_b` needs a cover for "existing franchise" | ? (case data) |

### S5 `askPartials` — 15 expected, 1 possible

Expected (the "one sub-ask got nothing" records):
- b36l-marisol-t4-fare-half
- b36l-raj-t14-load-at-140
- b36l-raj-t20-fixed-split
- b37h-jasmine-t4-velocity
- b37h-raj-t10-velocity
- b37h-marisol-t18-forecast-actual
- b37q-marcus-t6-month-to-month
- b37q-tyler-t6-paid-organic (the assertion wants "paid / organic" named: the cut refusal must say the candidate's words, not the split label)
- b38l-raj-t14-passenger-mix
- b38l-raj-t8-network-fare
- b38l-tyler-t6-fare-network
- b38l-tyler-t20-demand-evidence
- b38l-marisol-t12-fuel-restated
- b33-jordan-t10-store-count (`stores_count` shares "store": R7 defers and the deferral resolves)
- b33-marisol-t16-volume-per-store (the same)

Possible:
- b37q-raj-t8-churn-half: Exhibit 2 for the churn half needs its release order at t8. ?

### S6 `askPoint` — 1 expected, 1 possible

| Record | Why | |
|---|---|---|
| b35q-marcus-t18-hollow-on-screen | Exhibit 2's note pointed to | ✓ |
| b34l-marcus-t22-reassignment | the doubled restatement goes to a pointer; the reassignment half refused (with S5, C2) | ? |

### S7 `askEveryTurn` — 3 expected, 3 not offline

| Record | Why | |
|---|---|---|
| b33-tyler-t18-want-dropped | the detection on the rec_math_probe turn becomes a sub-ask | ✓ |
| b37q-marisol-t16-question-dropped | the stage-exhibit turn's detection becomes a sub-ask | ✓ |
| b35h-jasmine-t6-chip-volume-offer | the offer of a different item no longer stands in for a direct ask | ✓ |
| b34l-marisol-t12-ask-swallowed, b34l-marisol-t26-ask-swallowed | no detection was recorded and the model declared nothing; only an undeclared sub-ask can carry them, and its refusal needs the check | ✗ offline, unless you rule yes on Q1 (then a new Haiku verdict, wave-judged) |
| b34l-tyler-t22-ramp-refusal | the turn kind changed in the replay | ✗ (diverged in effect) |

### C2 `composeData` — 4 expected

| Record | Why | |
|---|---|---|
| b34l-tyler-t20-doubled-line | L1 | ✓ |
| b34a-marcus-t6-exhibit-deferral | the exhibit last in slot 2 | ✓ |
| b36l-jasmine-t6-deferral-renames | L3 | ✓ |
| b38l-marisol-t6-deferral-delivered | L3 | ✓ |

### C3 `composeSetup` — 4 expected

| Record | Why | |
|---|---|---|
| b38l-tyler-t20-dangling-figure | setup with its question | ✓ |
| b36l-marisol-t12-dangling-figure | the same | ✓ |
| b36l-tyler-t20-dangling-quote | setup withheld with the replaced question | ✓ |
| b33-blake-t22-bare-probe | L2: a bare "there" two turns after its claim (a code probe) | ✓ |

### C4 `composeSlots` — 1 expected

- b36a-jasmine-t14-fragment-quote: L7. ✓

### Not flipped by this design

| Records | Why |
|---|---|
| b34a-marcus-t14-offer | Q4: flips only if offers are dropped |
| b35q-marcus-t4-same-item-stall, b37q-jasmine-t4-cac-stall | deferrals the pressure-test gate makes by design |
| b36a-marisol-t14-nimbrel-unintroduced | needs a case-order rule ("introduce an entity before a line naming it"): a proposed R8, not designed here |
| The 23 math records and the 7 stage-logic records | outside this design |

### Totals

- **About 43 expected flips and 7 possible**, of the 57 this design owns:
  - 6 are left unflipped: offers, the gate stalls, the case-order record, and the two b34l records without a detection;
  - b34l-tyler-t22-ramp-refusal can't be judged offline, because the replay turn diverged.
- Of the wave-judged `phase2` records, C2–C4 should show fixed in a wave on b33-sofia-t10-two-openings (L1), b34a-tyler-t12-three-questions (L4 / L5), b34l-marisol-t6-before-competitor (L3), b35h-marisol-t18-no-question (L5) and b38l-tyler-t6-self-answered-probe (setup withheld with its question).

### Expected order of wins

1. **S2 and C2.** They are the safest: they change refusals and ordering, not releases. Together they fix the worst-graded classes: hollow deferrals (firm) and doubled lines.
2. **S3 and S4.** False refusals (false) and wrong releases (firm).
3. **S5.** The largest batch (15). It is also the riskiest for new false refusals, because the conjunct split creates new refusal candidates.
4. **C3, S6, S7, C4.** Few records each, but they fix the turn shape the hand grades keep naming.

---

## 6. Risks: past fixes the old paths encode, and the records that pin them

Each row is a fix the new design must keep, where it lives today, and the correct records (✔) or failing-fixed records that would show it broken. "Pinned by" records are what the step's gate runs.

| # | Past fix the new design must keep | Lives in | Pinned by | Risk in the new design, and the guard |
|---|---|---|---|---|
| R-A | **True refusals stay refusals:** "I don't have historical price elasticity", "waste or spoilage data by store", "departure time", "category volume", "turns per store", "segment size", "frequency expansion", "onward legs", "business vs leisure" | A9 + the check's `none` | ✔ b33-raj-t14, b33-tyler-t12, b33-owen-t10, b34a-marcus-t4, b34l-tyler-t18, b35h-marcus-t6, b35h-marisol-t6, b35h-tyler-t22, b36a-marcus-t10, b36a-tyler-t10, b36l-raj-t8, b36l-marcus-t12, b37h-raj-t12, b37h-marisol-t14, b37h-marisol-t20, b38l-tyler-t14, b38l-tyler-t16, b38l-marcus-t14, and b36a-jasmine-t4 under R-B (19 `true_refusal`) | R6 (b)'s head-noun test turns a true refusal into a deferral when an item shares the noun. 4.4 did exactly this and cost 3 correct records, which is why it left the preset. **Guard:** the head noun, not any noun (your J5); the step's gate requires 19 of 19 |
| R-B | **No refusal of held data (M6)** | `decideCheckedAsk` `keep`, `gateParts`, `findFalseRefusals` with covers | ✔ b36a-jasmine-t4-coarse-refusal ("trend" refused beside the exhibit) | S5's conjunct split makes more refusal candidates. **Guard:** every refusal, cut refusals included, goes through M6 and `statesAsked` against everything given this turn (R6 (c)(d)) |
| R-C | **A named deferral holds no item, and resolves: never hollow** (your 21 Oct round 6 ruling 4) | A16′ `OpenDeferral`, `closeOpenDeferrals` | ✔ b35q-marcus-t6/t8-deferral-delivered, b37q-jasmine-t8-cac, b38l-marcus-t8-casm, b38l-marcus-t16-deferral-delivered, b33-jordan-t2-deferral | R7 adds deferrals. **Guard:** every R7 deferral is tracked; the wrap-up closes it by name; a bank check that no deferral is open at the close |
| R-D | **The pressure-test gate defers, and its deferral names the item** | A14, `gate_defer` | ✔ b34a-tyler-t4-gate-deferral, b36a-marisol-t2-deferral | The gate becomes a transform after the rules. **Guard:** gate order preserved (the gate before the cap); the gated ids are still booked for fulfilment (A15) |
| R-E | **A tag mismatch off the check may defer, never refuse** (21 Oct round 6 ruling 1); the Haiku tag gate defers (22 Oct) | `answerGate` `defer`, `haikuTagGate`, `TAGS_ON_NONCHECK_PATHS` off | ✔ b38l-tyler-t16-answer-gate; Task 76 fix round 1 (b34a Marcus t10's wrong deferral) | R2 applies the tag gate to model-named items on every path, which `TAGS_ON_NONCHECK_PATHS` deliberately kept off because it added a wrong deferral. **Guard:** S3 runs the tag gate on model items with mismatch → keep, logged, in shadow first; only on your ruling (Q3) does mismatch → fall through |
| R-F | **No added model call** (21 Oct) | `toCheck` excludes gate, scope and region refusals; cover-vetoed asks are never checked | the ask-check count (254 on b28–38 with Phase 1) | Sub-asks multiply asks. **Guard:** the check runs only on sub-asks that today's code would have checked (an item-less explicit declaration, or a detection), never on an undeclared sub-ask without Q1; the count is gated per step |
| R-G | **Must-reach releases with its lead, never as "what you asked earlier"**; once per item | A23, `MUST_REACH_LEAD_*`, `flags.mustReach` | ✔ b38l-raj-t20, b38l-marisol-t24, b38l-marcus-t24, b38l-jasmine-t20, b35h-raj-t26-cannibalization | Moving the late part to the head of the tail. **Guard:** same lead strings and the same "volunteered" event; only the position changes, and the late part is the one place it can go |
| R-H | **Exhibit handover rules:** one per turn, release order (`after`, `requiresItems`), items it covers not re-said | A17, `exhibitReady`, `heldForOrder` | ✔ b33-raj-t8, b33-fiona-t4, b33-owen-t4, b36a-marisol-t8, b36a-tyler-t16, b36a-raj-t24, b37h-raj-t26, b37h-tyler-t16, b37q-raj-t8, b37q-raj-t10, b37h-jasmine-t6, b34l-marisol-t6 | Moving the exhibit to the end of slot 2, and code's stage-turn exhibit out of the question slot. **Guard:** the exhibit id chosen is unchanged in every replayed turn (a structural diff, not a wording one) |
| R-I | **Restatement rules (4.1):** pointer with summary, figure only when asked, never twice in 4 turns; a direct re-ask is read again (review F5) | `restateRules`, `FIGURE_ASK`, `SPLIT_ASK` | the 4.1 records fixed in Phase 1 (b38l Tyler t22's 90-word doubled line among them) | R5 must keep F5's direct re-ask exception. **Guard:** port `FIGURE_ASK` / `SPLIT_ASK` as-is; the 13 restatement records that pass today must still pass |
| R-J | **Corrections are said once, and before the question; the checker line is booked only if heard** | C10, `lineHeard`, the undo at `se:720–747` | ✔ b33-tyler-t8, b35h-marisol-t12, b35q-raj-t14, b35q-marisol-t26, b35q-tyler-t8, b37h-marisol-t12, b37h-marisol-t16, b37q-tyler-t12, b37q-tyler-t30, b38l-tyler-t12 (10 `correct_correction`) | One correction slot holds the rest back. **Guard:** a held correction keeps its booking undone (the existing undo), so it rides the next turn; the 10 records hold; the correction-for-probe trade (your open item 5) isn't made worse, so `WRAP_UP_PROBES = 2` stays the binding limit |
| R-K | **A due stage question beats a probe; a probe beats the model's question; a correction still goes first** (15 Oct, 19 Oct R7) | C9, C10 precedence | ✔ the 21 `correct_probe` records (b33-tyler-t16 … b38l-jasmine-t26) | C4's question selector. **Guard:** port the precedence unchanged; C4's gate requires all 21 |
| R-L | **First sound stays early;** a streamed sentence is never changed | C1, C19 prefix lock | latency: code p95 138 ms today; first segment ~0.95 s (M0) | Holding setup sentences delays them. **Guard:** the ack always streams first; report the setup hold time; a setup is held at most until the question field closes, never past the model's end |
| R-M | **`data_talk` withholds the model's refusal, because code's line says it** (one refusal, said by code) | C2 | the 4 `data_talk` vetoes on b36–38 | §3.2 rule 4 keeps the withholding, but now the decision reads the sentence first. **Guard:** never two refusals of one sub-ask (L1 catches it; the bank asserts it) |
| R-N | **prof-001 is untagged;** round 6's gates are off there and decide as before | `factBase.answerGate` null | the 21 standard slices, prof-001 identical off; Q4 of Phase 1 ("round 6 + Phase 1" with `tagMatching`) | The decision function on an untagged case. **Guard:** the R2 / R3 tag gates pass everything when tags are absent; prof-001 reported separately with the switch on |
| R-O | **No figure reaches the candidate except from the ledger** (FR-4) | the post-turn audit; `unsaidFigures`; askPhrases with no figures | the audit, 0 across every replay | Cut-refusal words come from the candidate's sentence (S5). **Guard:** keep `unsaidFigures` and `dropStatedFigures` on every refusal part, as today |
| R-P | **A deferral never promises a finer cut the case doesn't hold** ("bean cost per pound") | `labelAsk`: one ask per item in its own label | the 13 Oct ruling; no bank record | R7 says the sub-ask's own words. **Guard:** R7 deferrals of a sub-ask with a coarse item name the item (`labelAsk`), and only item-less ones use the candidate's words |

**The three risks I'd watch most:**
1. **R-A + R-B in S5.** Splitting into sub-asks creates refusal candidates the old code never had. It is the one step that can add false refusals in bulk. That is why it comes after S2–S4, whose refusal rules it reuses.
2. **R-E in S3.** Running the tag gate on the model's own items reverses Task 76's fix round 1. My design keeps mismatches released, and logged only, until you rule.
3. **R-J / R-K in C4.** It touches the checker's slot, and the math records are the most fragile in the bank (Stream 3's 23 failing ones). C4 should not move any of them.

---

## 7. Size and build order

Single agent, sequential, TDD, one commit per step. Token estimates are for build plus review, from Phase 1's actuals (Stream 4a: ~590k build, ~210k review for six smaller tasks).

| Step | Code | Tests | Replay, read by hand | Rough size (agent tokens) |
|---|---|---|---|---|
| S0 | bank: `lint`, `subAsk` assertions; shape script | ~20 | bank both arms | 120k |
| S1 | `ask-decision.ts` skeleton, sub-ask construction, shadow log (~500 lines) | ~80 | shadow-vs-live disagreements, all classified | 350k |
| S2 | R6 / R7 live; the model-refusal evidence | ~40 | changed refusals and deferrals | 200k |
| S3 | R2 + the line test | ~40 | changed releases | 200k |
| S4 | R3 / R4, one check pass; remove A2–A8's re-decisions behind the switch | ~60 | changed data turns | 300k |
| S5 | conjunct sub-asks live, per-sub-ask E1 | ~60 | every new refusal, read | 300k |
| S6 | R5 | ~25 | restatements | 120k |
| S7 | code-written turns, the data slot kept | ~30 | code-written turns | 150k |
| C1 | `turn-composer.ts` (~350 lines), slot model, lint L1–L7 in shadow | ~70 | lint counts on b28–38 | 250k |
| C2 | slot 2 order, L1, L3 live | ~30 | changed lines | 150k |
| C3 | setup classification and holding; L2 live; the stream change | ~40 | changed lines + latency | 200k |
| C4 | one correction, the question selector; remove `se:589–614`'s splices | ~50 | changed lines; the 23 math records | 250k |
| **Total** | | | | **about 2.6M** (excluding B1) |

**Recommended build order:** S0 → S1 → C1 → S2 → C2 → S3 → S4 → S5 → S6 → C3 → S7 → C4, then the B1 decision.

Shadow runs both structures early, so their logs inform each other. Each live step changes one kind of thing:
- refusals;
- ordering;
- the model's releases;
- matches;
- partials;
- restatements;
- setup sentences;
- code-written turns;
- question choice.

At your +800k-per-session pace that is about 3–4 sessions. A natural first session is S0 + S1 + C1 (shadow only, nothing spoken changes), ending with the disagreement counts that size S2–S5 properly.

---

## 8. Open questions for Lorenzo

- **Q1 — The check on undeclared sub-asks.** A sub-ask only the deterministic split found (no declaration, no detection) can be released or deferred under §2.3. Refusing it needs the Haiku check, which is a call today's code doesn't make on that ask. It costs roughly one Haiku 4.5 call on the turns where it fires; frequency unmeasured until S1. Yes means S7 can flip the two b34l swallowed asks in a wave; no means they defer.
- **Q2 — `refusalNounCheck` (4.4).** It is off the preset by your ruling. R6 (b) brings back its idea, tightened to the head noun (J5). Is the head-noun form acceptable as the S2 rule, gated on 19 of 19 true refusals?
- **Q3 — The tag gate on the model's own items (R-E).** Task 76 kept tags off non-check paths after one wrong deferral. Proposed: in S3, a mismatch on a model-named item is logged and still released. It falls through to R3–R7 only on your later ruling, with the shadow count in front of you.
- **Q4 — Offers.** Your 21 Oct ruling made an unasked offer a firm fault. Should code's offer line (A13) go entirely (b34a Marcus t14 flips), or stay with today's strict gate?
- **Q5 — Correction position.** Your order puts the correction after the data lines; today a misquote correction is said first. Confirm "ack → data → correction → question" applies to misquote corrections too.
- **Q6 — The grading remainder** (C3) is the one place code rewrites a model sentence. Keep it as the documented exception, or withhold the whole sentence?
- **Q7 — Two model questions (L5).** 8 of 382 turns on b36–38 carry two or more "?" sentences. Log only in C1–C4, then choose a remedy (keep the last question, or the first) on the counts?
- **Q8 — The fault bank's denominator for Phase 2.** Proposed: the gate counts the 57 records owned here, with the 23 math and 7 stage records reported but not counted. That would avoid repeating Phase 1's condition-1 ambiguity.
- **Q9 — `progress.md` and the PRD.** I left both untouched, so as not to collide with the running Phase 1 session on the same files. Once you approve this design, I'd add the §16 "proposed, awaiting ruling" entry and a "## Now" line.

---

## 9. Lorenzo's rulings (27 Oct) and what they change

| | Ruling | Change to the design |
|---|---|---|
| Q1 | The check may run on sub-asks the request reader recognizes; it may release (through the tag gate) or defer, never refuse. Report the calls and latency | R6 never refuses an undeclared sub-ask. b34l-marisol-t12/t26 become wave-judged |
| Q2 | Head-noun form only if 19/19 true refusals hold, no hollow deferral is added and a record flips | **Measured in S1: it fails the first condition (11/18).** R6 runs without it |
| Q3 | A tag mismatch on a model item: logged only, keep releasing | R2 logs `tagMismatch` and releases |
| Q4 | Drop code's offer line | No offer outcome; A13 goes in the step that retires it |
| Q5 | A correction of what the candidate just said goes before the data; others after | Slots: ack → correction (just said) → data → other corrections → question |
| Q6 | No rewrite; whole sentences only | The grading remainder (C3) is withheld whole |
| Q7 | Keep the last question, withhold the earlier; log first, then enforce | L5 logs in C1, acts in C4 |
| Q8 | Gate = the 57 owned + all correct records + 0 new false refusals, wrong releases or false corrections | `evals/fault-bank/phase2-owned.json` |

## 10. Session 1 (27 Oct): S0, S1, C1 built in shadow

**Nothing the candidate hears changed.** Over b22l and b28–b38 (1,557 interviewer turns), `*=phase1,phase2` matched `*=phase1` on every turn, timing fields aside. Bank verdicts were identical on all 311 records.

**S0 — bank fixes:**
- b38l-tyler-t20, b36l-marisol-t12 and b33-blake-t22: their `says` pattern also matched a correctly fixed turn, so they now assert L2.
- b37q-tyler-t6: accepts the refusal in the candidate's own cut ("by source"). Proposed.
- b34l-marisol-t12/t26: drop a probe must-not that their own correct records contradict; wave-judged under Q1.

Bank: `*=phase1` 70/153, off 48/154, correct records 95/96 both arms.

**S1 — the shadow decision against today** (`scripts/ask-shadow-report.ts`): 1,358 sub-asks, 892 agree with today. The disagreements:

| Class | Count |
|---|---:|
| none → defer (355 of them undeclared) | 371 |
| defer → release | 27 |
| none → release | 23 |
| refuse → defer | 13 |
| release → defer | 9 |
| point → refuse | 8 |
| point → defer | 5 |
| none → point | 5 |
| defer → refuse | 2 |
| none → refuse | 1 |
| release → refuse | 1 |
| defer → point | 1 |

On the bank (`fault-bank.ts shadow`):
- true refusals 18/18 (11/18 with the head-noun test);
- other correct records 21/21;
- the 57 owned: 18 pass, 30 fail, 9 not this structure's to judge.

**C1 — the composer against today** (`scripts/compose-shadow-report.ts`):
- 108 turns would change;
- L5 40 → 3 turns, L2 6 → 4, L4 2 → 1;
- L1, L3, L6 and L7 unchanged (L3 is the decision's; L7 is the checker's wording);
- no rule added anywhere.

**What session 1 changes in the plan:**
1. **The undeclared sub-ask split is about half precise** (30-sample: ~16 real asks, ~14 statements, purpose clauses or rhetoric). S7 must not speak on undeclared sub-asks until the split improves. Q1's checks would fire on 12.6% of turns.
2. **Four owned records demand a refusal where the rulings give a deferral:** b38l-tyler-t22, b38l-marisol-t12, b35h-raj-t26, b34l-marisol-t30. The check mapped them to items the gates reject, and 4.3's "a mismatch defers, never refuses" applies. Six more are undeclared asks, which Q1 never refuses. These need Lorenzo's reading before S2's gate is set.
3. **Every setup sentence the composer would move had already streamed** (26 of 26), so C3's stream hold is required, not optional.
4. **R2's strict line test is relaxed to a positive contradiction plus E1's cut.** The strict form dropped correct semantic mappings ("departures flown by the fleet" → the schedule).

## 11. Session 2 (27 Oct): the rulings, S2 and C2 live behind switches

**Lorenzo's rulings on session 1, and what each changed:**
1. **Undeclared sub-asks stay shadow-only, and Q1's calls stay off, until the splitter reaches ≥90% real asks on 100 labelled.** The splitter was rebuilt twice and measured on held-out samples (`evals/splitter/README.md`): 46% (A, v1) → 74% (B, v2) → 67% (C, v3, outside the replay corpus). **Not met.** S7 waits.
2. **The six undeclared-ask records** accept a deferral that resolves (`answered.wontResolves`). The four Haiku-mapped records stay strict. Rule 3 is refined: a clear tag mismatch with nothing else matching is R6 evidence; an uncertain one defers.
3. **The relaxed keep-rule (R2):** approved, if it shows 0 new wrong releases. It is still shadow-only. S2 and C2 change no release, so the proof falls to S3.
4. **The flaky test:** three clean full runs; no recurrence, nothing changed.
5. **b37q-tyler-t6's wording:** confirmed. C3 is required; its first-sound cost is measured below.

**S2 `askRefusals`, as built:** for a declared sub-ask, R6's true refusal replaces today's hollow deferral, silence or wrong-item restatement, and only with evidence: the check's none, the model's own refusal, a clear tag mismatch or a deterministic cut. The other rules:
- nothing is refused that today already refuses or defers;
- a restatement is kept when the refusal is its finer cut;
- R7's uncertain deferrals are not spoken;
- today's refusals are never turned into deferrals;
- offers are dropped (Q4).

The first S2 replay changed 47 turns, and the hand read found two kinds of harm:
- false "We won't get to …" closures for data since delivered;
- coarse answers lost.

The limits above come from that read. **The second S2 replay changed 7 turns, all right.**

**C2 `composeData`, as built:**
- the exhibit handover is last in the data line;
- L1: a line the model's say already spoke is not said again (a release stays booked);
- L3: a deferral naming what the turn gave says the items it still holds, or is dropped when it is wholly about what was given.

C2 changed 26 turns: 17 only in exhibit order, 7 L3 renames, 2 L1 drops. One regression was found and fixed (a deferral that held nothing was dropped).

**The gate (Phase 1 + Q8):**

| Condition | Result |
|---|---|
| 0 new false refusals, wrong releases or false corrections, b22l + b28–b38 | **Met:** all 33 changed turns read by hand |
| Owned records | 2 → **8 of 57**: b34a-marcus-t14-offer, b34a-marcus-t6-exhibit-deferral, b34l-tyler-t20-doubled-line, b35h-marisol-t24-hollow, b36l-jasmine-t6-deferral-renames, b38l-marisol-t6-deferral-delivered, plus S0's two |
| Correct records | **95/96 both arms** (the known "Go on." artifact) |
| Switches off | **Identical** to b2496fb0 on 31 slices, both checker arms, 2,895 turns |
| Latency | Code time ~16–23 ms mean, < 60 ms p95; no model call added |

**C3's cost, measured** on the 26 turns where a setup sentence would be held, from the recorded live timings (text mode):
- 21 turns: no delay (the acknowledgment comes first);
- 5 turns: +0.7 s to +1.8 s;
- overall median +0 ms, mean +172 ms.

**Not flipped, and why:**
- the 21 bare_partial records need S5's per-sub-ask cuts;
- the four strict Haiku-mapped records: R6's evidence isn't there on three of them;
- the six undeclared-ask records need S7;
- the math and stage records are outside this design.

## 12. Session 3 (27 Oct): phase1 merged, batch 39, S3 and C3

**Base.** phase1 2a8dca76 merged into phase2-design (73408507, local only, Lorenzo's approval). Every gate was re-run on the merged code.

**Replay fidelity.** Model turns had been served no classifier detections, so answers that came through the message's own asks were lost on replay, and batch 39 didn't reproduce under `*=phase1`. `recordedMessageDetections` now serves them; since 27 Oct that is the default (`REPLAY_MESSAGE_DETECTIONS=0` for the old runner).

Re-running Phase 1's gate with it:
- F1, F3 and F4 stay 0 on every slice; F2-next is lower on the same 3 slices, higher on none;
- the bank with `*=phase1` goes 84 → 78 of 173 (eight batch-39 records had passed on the artifact; one Phase 1 record gained, one lost with switches off only);
- correct records 95/95 unchanged.

**Batch 39.** 22 owned records: the 18 on Lorenzo's list plus 4 D9 silences; the owned set is 79. Aldermoor Tyler t22, ruled: no refusal and no pointer (the bar is in the prompt), full answer pending.

**The pointer measurement** (report only; nothing changed): turning off 4.1's exhibit-pointer branch passes the 8 pointer records only because they assert the phrase. The turn restates the same wrong item's whole line instead (+22 words a turn, 64 turns), and 6 of Phase 1's restatement fixes break. **Not a net win.** The fault is which item is pointed at: S6's work.

**S3, built with these switches:**

| Switch | What it does |
|---|---|
| `askModelKeep` | R2 releases a model item declared as a release that passes the line test, never overriding the model's own deferral |
| `refusalContradiction` | Drops a refused part only when a line given this turn states it |
| `wontGetToGiven` | A wrap-up closure says only the parts nothing since states |

C2 fix: a dropped deferral is never silence.

**The S3 gate:**
- 4 changed turns plus 1 from the C2 fix, all read: 0 new false refusals, wrong releases or false corrections;
- D9 never above `*=phase1` on any slice;
- true refusals 19/19;
- bank 85 → 87 of 173;
- owned 18 of 77 replayable;
- correct records 94/95 — `b37q-marisol-t18-why-pro-fell` pinned the late release R2 now makes at t8 (a record-window question for Lorenzo).

The first S3 build failed its own read in three ways, each fixed before the gate:
- it overrode the model's deferrals on 6 turns;
- it made one wrong release (b32 f59f5ea8 t8);
- C2 turned a just-released item's deferral into a false refusal.

**C3 `composeSetup`:** holds setup sentences only after a spoken acknowledgment. With an acknowledgment simulated (`REPLAY_ACK=1`), 15 turns change and no lint rule rises (L2 10 → 8). Without one, it changes nothing (1,994 turns identical).

**Voice:** with Thinking sounds on, the acknowledgment played on every turn (8–17 Oct, median 0.4–0.5 s), so the held setup always follows it. With fillers off (18–19 Oct), it played on 5 of 52 turns, and C3 does nothing on the other 47.

## 13. Session 3b: Lorenzo's session-3 rulings, two measurements, S4 first

**b37q-marisol-t18.** The window was widened as ruled: why_pro_fell may be given anywhere from t8 to t18, and upgrade_timing is still required at t18. Correct records are back to 95/95. In the replayed t8 the item gives the reason Pro fell, not the share, and the turn neither refuses the exact share nor points to an exhibit. Exhibit 3 (new customers by plan) is never shown in that run: its figures go out as a spoken line at t8. That is unchanged from `*=phase1`.

**Why `refusalContradiction` flipped none of the 8 batch-39 false refusals.** Every refused part maps to no item. `named()` comes from the false-refusal veto (`refusedItemIds` + `coverageOf`), which by design maps nothing for a finer cut or a question-worded part ("per customer by plan", "before versus after", "whether …"), and each of these refusals carries such words. Per record:

| Record | Why the rule doesn't flip it |
|---|---|
| b39l-raj-t20 | No item mapped; the contradicting item (new_routes_context) is deferred, not given this turn |
| b39l-marcus-t14 | No item mapped; new_routes_context (via exhibit 3) states the part |
| b39l-jasmine-t2 | Nothing given this turn; departures are behind the structure gate |
| b39q-raj-t10 | The rule fires on the sub-clause only; upgrade_timing's line doesn't state "whether 20% is the full share" |
| b39q-marisol-t6 | No item mapped; plan_prices_costs states both parts |
| b39q-victor-t12 | No item mapped; why_pro_fell states the part |
| b39l-marcus-t4 (fuel) | Not a contradiction: nothing given this turn, a refusal of a held coarse item |
| b39l-marisol-t2 (breakdown) | Not a contradiction: nothing given this turn, a refusal of a held coarse item |

**The coverage version (`refusalCoverage`, measurement only).** A refused part is dropped when a line given this turn covers its words, read against the item's line, label, names and cover phrases with statesAsked's half-the-nouns test. It **fails the gate**:
- true refusals 17/19, correct records 93/95, bank 86/174;
- 30 corpus turns changed, about 19 of them losing a true refusal ("FY2024 fares", "the split of the $20M fixed", "diagnosis rate trend", "week-by-week sign-ups"); 2 more garble a sentence;
- it fixes 3 records (b39l-marcus-t14, b39q-marisol-t6, b39q-victor-t12) and breaks 7.

Word coverage can't tell a finer cut from the item it sits beside. Kept off.

**Option B (`restateOwnLine`, outside every preset).** The pointer branch says the item's own line instead, with no summary, plus a true refusal for each finer part of the declared ask that the line doesn't hold. **It is not a net win:**
- it moves the bank exactly as pointer-off does: the 8 pointer records pass on the phrase, b39a-marisol-t24 still fails, and Phase 1's restatement fixes break (5 with `phase2`, 6 with `phase1`);
- the first build took cuts from the candidate's sentences, which gave refusals of non-asks and one candidate figure; it was fixed to use the declared ask's words only;
- after the fix, cut refusals fire on 2 corpus turns, both wrong: "flights per year on Lakeport" is held, and the split "Millbrook routes to use as benchmarks…" is garbled;
- the repeated line belongs to the same wrong item.

The pointer fault is the item choice (which item answers the ask), not the pointer form.

**Order.** On the shadow decision, S4 reaches more batch-39 faults than S6: 6 false refusals are answered by R1–R4 at their turns (fuel t4, marisol t6, raj t10, victor t12, jasmine t2, raj t20). Proposed next: S4. This is an estimate from shadow rows; S4 is not built.

## 14. S4 `askMatches` (27 Oct): built, gate passed

**What it does.** R3 and R4 run live over today's decisions, in the same form as S2 and S3 (in the `phase2` preset). A declared sub-ask that R3 or R4 matches gets one of these outcomes:
- released, where today said nothing or refused it (with E1's cut refused beside it);
- a gate or order deferral, where today said nothing or pointed elsewhere.

**Limits, set by the first replay's read:**
- never over a deferral today makes (S3's rule: b33 5cfdf48e t2 would have released the store count over the model's "before any data");
- never a refusal turned into a deferral (S2's ruling: b39q dd74b01b t2's "split of Starter sign-ups").

The old A2–A8 passes still run; their check calls are the only ones made (212 = 212).

**Gate:**
- 3 changed corpus turns, all read and right: b36l a7d9f44e t6/t8 (CASM → `unit_costs`) and b39l 52904ce7 t20;
- true refusals 19/19; correct records 95/95;
- D9 equal on every slice; F1/F3/F4 0;
- bank 87 → 88 of 173; owned 18 → 19;
- switches off identical (1,994 turns).

**The 6 batch-39 false refusals: 1 flips** (b39l-raj-t20), against my shadow estimate of 6. The estimate misread the shadow:
- Marisol t6 and Victor t12: the decision also refuses the cut;
- Fuel t4: the cut refusal still names fuel;
- Raj t10: inside the data path the decision is R2 (no detections there), not R4;
- Jasmine t2: the decision itself refuses "departures" (R6).

Extending the cut drop to R2, measured and reverted: it fixed Raj t10 and broke 2 (dropped the true refusal "turns per store per week"; garbled another). That is S5's per-sub-ask E1.

## 15. S6 widened (`askPoint`, 27 Oct): failed its gate in one round, stopped

**What it does.** Before a restatement points or repeats, the ask check (the recorded verdict, else a live call on that turn) rates the item:
- full → R5 as today;
- partial → the item's line plus the missing part refused;
- none → a true refusal under R6's guards.

**Paid replay** (Lorenzo's go, $0.50 cap):
- 62 calls to Haiku 4.5, 1 per distinct (case, ask) that S6 needed and no run had recorded;
- $0.1137 in all ($0.0018 a call);
- latency median 502 ms, p90 798 ms, max 1.0 s;
- 1,889 input and 16 output tokens per call (medians);
- the verdicts are replayed through `REPLAY_CHECKS`, so every arm is deterministic.

**Calls per run:** S6 fires on 56 of the 1,994 corpus turns, in 42 of 150 runs: 73 asks checked, 0.49 calls a run. In live use each call adds its latency to that turn, capped at the check's 1.5 s timeout; the turn waits for it before the data line.

**Gate: failed.**
- Pointer records: 1/9 flip on substance (b39q-tyler-t22: the price-test line answers "can't be measured yet").
- Why the other 8 don't flip:
  - the check is asked the model's `what`, which names the item the model chose ("Entry Option B … terms"), not the candidate's question;
  - on the real question, Haiku rates the mismatched item full ("length of the royalty term" → option_b).
- New false refusals: 2 (b22l 27c2d0fb t22 "what sits inside the fixed costs" — fixed_costs holds the split, already out; b38l 701443f7 t14 "load factors … on the contested routes" — held, said in the same turn).
- One regression: b39l-raj-t20 fails again ("estimated demand for unserved city pairs" refused beside the new routes' deferral).
- Unchanged: true refusals 19/19, correct 95/95, non-pointer restatement records 15/18 both arms.

The switch is off and outside every preset (95dbf229). The wave runs without it.

**What a next round would need** (not started):
- check the candidate's own sentence, not the model's `what`;
- block "none" when the check maps the ask to any item, out or not;
- run R6's statesAsked against the whole data line, not only the items given.

Haiku's full-on-mismatch rating is the open risk.

## 16. `restateLineInvite` (27 Oct): failed its gate in one round, stopped

**What it does.** On R5's pointer path, the item's own line is said with no exhibit summary. Then, once per item, a statement follows: "If you're after something more specific, ask me." No model call; free.

**Gate: failed.**
- **Pointer records:** 8/9 pass the phrase test; b39a-marisol-t24 still has no refusal of the royalty term.
- **On substance**, read turn by turn, no turn claims the exhibit answers the ask. But:
  - Tyler t22 reads both entry-option lines, which is the whole entry-options exhibit aloud;
  - Dana t12, Raj t22 and Raj t28 repeat long, figure-heavy lines of the same wrong item.
- **Phase 1's restatement records:** 5 that pass today break (6 with `phase1` alone): b34l-marcus-t10, b35q-raj-t22, b36l-tyler-t6, b37q-marcus-t22, b37q-raj-t14, and b34l-marcus-t22 on `phase1`. Non-pointer restatement records: 15/18 → 10/18.
- **Unchanged:** true refusals 19/19, correct records 95/95; bank 88 → 91 of 173.

**Spoken length vs today's pointer** (43 changed corpus turns): a median of +2 words a turn, mean +4.8, range −8 to +42. Today's summaries are about as long as the lines that replace them.

The switch is off and outside every preset. As with option B and pointer-off, the pointer form isn't the fault: the item is wrong.

## 17. Item-choice experiment (27 Oct): a stronger model choosing the item, with no added latency — measurement only

**Spend:** $0.70 of the $3 cap: arm A $0.42 (3 Opus calls), arm B $0.28 (87 Sonnet calls). Both switches are off and outside every preset (fd494dea). The default path is identical (1,994 turns).

**Test set:** 87 labelled turns:
- the 9 pointer records;
- the 8 batch-39 false refusals;
- the 19 true refusals;
- the 15 passing non-pointer restatement records;
- 36 correct records that touch the data line.

### Arm A — Opus-authored case notes (`caseNotesDraft`)

**How it was built:**
- Opus 5.5 wrote notes for Larkspur, Quillpath and Brew & Bean (60 items: 551 answer phrases, 167 not-held phrases). Its inputs were the case JSON and 512 real candidate asks from batches ≤ 38; batch 39 was held out.
- The drafts are in `evals/case-notes-draft/`, not `cases/`.
- They run as cover phrases through the existing coverage matcher. A not-held phrase stops a restatement and refuses the missing part (under the refusal guards).

**Result on the bank (current preset):**
- pointer records: 1/9 (b39q-raj-t28; only 5 of the 9 are on these cases — the 4 Aldermoor records are outside arm A);
- batch-39 false refusals: 1/8 (S4's existing flip; Hollis Bay has no notes);
- true refusals 18/19 (b38l-marcus-t14 is lost);
- correct records 94/95; restatement 15 → 14.

**Corpus-wide** (the three cases, every changed turn read):
- 46 turns changed;
- about 15 new pointer lines on turns where nothing asked for them: the broader cover phrases match asks to items already out;
- one new false refusal (b39l 065501fe t14: "the four non-contested routes", held);
- one unasked release (b39q t8);
- one refusal turned into a hollow deferral (b39q dd74b01b t2);
- one improvement (b29 t8: a hollow deferral of competitor pricing becomes a true refusal).

Wider phrase lists make more asks match, and so produce more pointers. Arm A fails every threshold.

### Arm B — a parallel Sonnet judge (`itemJudge`)

**How it was built:**
- Sonnet 5.5 (thinking off via `between_tools`, effort low, the case's ledger in a cached system prompt).
- Input: the candidate's raw message and every item, with an already-out flag.
- Output per ask: items, full or partial, and the missing part.

**Latency:**
- per call: p50 1.9 s, p90 3.0 s, max 4.8 s (82 cached-read calls: p50 1.9 s, p90 3.0 s);
- started at `reads_done`, the verdict lands before `data_line_delivered` on 53 of 87 turns (61%), and before the model's requests close — when code decides the data line — on 33 (38%).

**Cost:** $0.0032 a call. At the corpus's 13 candidate messages an interview, about **$0.04 an interview**.

**Accuracy**, with every verdict applied and every moved turn read:
- the bank shows 12 of the 17 targets passing (6 pointer, 6 false refusal);
- on substance, 5 are clean (Jasmine t2, Marisol t6, Raj t10, Tyler t22, Victor t12);
- 1 has the right outcome but unusable wording: Marcus t8, where the judge's commentary is spoken inside the refusal;
- 3 are partial or accidental (Marcus t14, Dana t12, Raj t28);
- 3 do not fix the fault: Marisol t14 (a new silence), Raj t22 (the whole cohort line read out), Marcus t14's frequency;
- regressions: true refusals 18/19 (b33-raj-t14, the competitor-pricing part lost and the refusal garbled), 1 wrong release (b36a-marisol-t6: peak share for "how the eligible pool has grown"), correct records 93/95 (b36a-marisol-t8: lines replace the exhibit handover), 2 long Option A restatements.

**In time only** (the no-wait rule): 3 targets pass; true refusals 18/19; correct 94/95.

The applier is mine and part of what was measured: it aligns the judge's asks to the turn's lines by key nouns. Its first version dropped refusals whenever any item was named, and was fixed once (only a full answer clears a refusal); the first run showed true refusals 10/19.

### Against Lorenzo's thresholds

| Threshold | Arm A | Arm B |
|---|---|---|
| 0 new false refusals | ✗ 1 | ✗ the garbled true refusal; 1 wrong release |
| 19/19 true refusals | ✗ 18/19 | ✗ 18/19 |
| Most of the 17 targets on substance | ✗ 1 | ✗ 5 clean (all verdicts); 3 in time |
| ≥ 90% of turns in time | — | ✗ 61% (38% by when the data line is decided) |

Neither arm meets them. Decision for Lorenzo.

## 18. Arm B's raw judge verdicts scored against the hand labels (27 Oct; free; no applier)

Each of the 87 labelled turns was scored by hand against its record's graded note and assertions (`evals/item-judge-draft/scores.json`). A turn is right when:
- the item the label names is among the judge's items;
- a refused ask gets no item rated full (partial with the refused part as `missing` counts);
- the full / partial / none class doesn't overstate.

10 turns carry no data ask in the message and are not scored.

| Turn class | Scored | Right | Errors |
|---|---|---|---|
| Pointer | 9 | 6 (67%) | 1 overrated full, 1 "none" where the answer is held, 1 invented ask |
| Batch-39 false refusals | 8 | 8 (100%) | — |
| True refusals | 18 | 18 (100%) | — |
| Restatements | 15 | 15 (100%) | — |
| Correct records | 27 | 25 (93%) | 1 overrated full, 1 missed ask |
| **All** | **77** | **72 (94%)** | |

**Errors in detail:**
- The one "none" where the answer is held is b39a-tyler-t22 (the board test). The prompt sets the bar, and prompt facts were not in the judge's input, so this is an input gap rather than a judging one.
- Overrated full: b39a-raj-t12 ("what competes" in Europe → the US-only current_treatment), b35q-marcus-t6 (sign-ups "by month" → the averages).
- Missed ask: b33-jordan-t2 (the cost breakdown is not listed).
- Invented ask: b39a-marcus-t8.

**On true refusals:** the judge never rates an item full. It says "none" on 8 of 18, and on the other 10 it says partial with the refused part as `missing`.

**The arm B applier's faults were mostly the applier's:**
- noun alignment to the wrong ask;
- `missing` text spoken verbatim;
- partials treated as answers.

That bears on Lorenzo's async next-turn self-correction idea, which is not built.

## 19. Judge round 2 (27 Oct): Haiku 5.5 vs Sonnet 5.5, both with prompt facts (paid $0.31 of a $1 cap; no applier)

**Set-up.** Same input as arm B: the candidate's raw message plus every ledger item. The case prompt and its prompt facts are now added as citable `prompt:<id>` items.
- Haiku 5.5: thinking disabled, effort low, no fallback (it has none).
- Sonnet 5.5: as round 1.

Each turn is scored by hand against the round-1 labels (`evals/item-judge-draft/scores-round2.json`).

| Turn class | Sonnet 5.5 + prompt facts | Haiku 5.5 + prompt facts |
|---|---|---|
| Pointer | 7/9 | 7/9 |
| Batch-39 false refusals | 8/8 | 7/8 |
| True refusals | 18/18 | 18/18 |
| Restatements | 15/15 | 12/15 |
| Correct records | 26/27 | 26/27 |
| **All** | **74/77 (96%)** | **70/77 (91%)** |
| "None" where the answer is held | 0 (the board-bar case fixed by the prompt facts) | 0 |
| "Full" on a refused ask | 0 | 0 |
| Partial on a held answer, with a held part as `missing` | 0 | 5 |

**Error detail:**
- Sonnet's 3: "what competes" in Europe → Nimbrel full; an invented ask (b39a-marcus-t8); "by month" → the averages full.
- Haiku shares the first two. Its 5 partial-on-held turns are b35q-raj-t22, b39l-marcus-t14, b36l-tyler-t6, b34l-marcus-t10 and b38l-marcus-t8. On each, the `missing` part is something a line already holds, so a refusal built from it would be false.
- Round 1's missed ask (b33-jordan-t2) is caught by both.

**Latency.** The verdict lands at `reads_done` + the call. Recorded `model_requests_closed` is a median of 1,944 ms.

| Model | Per call p50 / p90 / max | Landing from message arrival p50 / p90 | Before requests close | Before the data line | $ a call |
|---|---|---|---|---|---|
| Sonnet 5.5 + prompt facts | 1,869 / 3,265 / 41,684 ms (one outlier) | 1,918 / 3,363 ms | 45% | 62% | $0.0034 |
| Haiku 5.5 + prompt facts | 1,656 / 2,617 / 3,850 ms | 1,704 / 2,646 ms | 59% | 75% | $0.0002 |
