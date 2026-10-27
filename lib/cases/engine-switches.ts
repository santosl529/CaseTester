// Per-case engine switches (Phase 1 contract, docs/superpowers/plans/2026-10-22-phase1-contract.md §3;
// Lorenzo, 22 Oct: "A per-case engine switch for every behaviour change. Production prof-001 stays on today's
// behaviour; Phase 1 can be switched on per case for tests and waves."). Every Phase 1 behaviour change reads
// exactly one switch here; off is today's behaviour. A switch is on when, in order:
//   1. ENGINE_SWITCHES names it for the case (evaluation only — production never sets it);
//   2. the case file pins it (`engine` in cases/<id>.json);
//   3. otherwise it is off.
// ENGINE_SWITCHES: entries separated by ";", each `<caseId|*>=<names>`, names separated by ",": a switch name,
// "phase1" (every switch below), or "-name" to turn one off. A case's own entry is read after "*", left to right:
//   ENGINE_SWITCHES='*=phase1'                         every case, every switch
//   ENGINE_SWITCHES='prof-001=phase1,-ackRotation'     prof-001 only, all but one
//   ENGINE_SWITCHES='*=phase1,phase2'                  Phase 1 and the Phase 2 steps built so far
export const PHASE1_SWITCHES = [
  // Stream 2 — the overlay's data merged into the fields today's code reads (cases/phase1/<id>.json).
  'itemCovers',          // overlay covers → factAnchors.covers; coverExcludes read by cover matching
  'tagMatching',         // overlay factTags → factAnchors.tags (a case without them: prof-001)
  'stepLineage',         // overlay dependsOn → mathSteps[].dependsOn
  'mustReachPhase1',     // overlay mustReach appended to the case's (≤ 3 in all)
  'misquoteAnchors',     // overlay misquote anchors → quoteAnchors
  'askPhrasesInPrompt',  // 2.5: an unrevealed item's askPhrases beside its label, in the static prompt
  // Stream 3 — math.
  'worksheet',           // 3.1: the worksheet is kept (code-side; never in a prompt)
  'staleProbeDrop',      // 3.2: a probe or correction is dropped when the worksheet holds a newer value
  'rootLineage',         // 3.3: probe only the root; ≤ 2 probes a lineage, then one root correction; derived wait
  'misquoteFlat',        // 3.4: flat ledger-value correction on a code mismatch the checker rated an error
  'probeGuardMethod',    // 3.5: the guard's replacement asks about method, never names a verified figure
  'spokenMathParser',    // 3.6: chained spoken arithmetic; any consistent reading counts as consistent
  'checkerDefinitions',  // 3.7: the case's definitions go to the live checker
  'correctionRules',     // pre-wave rulings 3 and 4 (26 Oct): one correction per item on every path; none on the closing turn
  // Stream 4 — small fixes inside today's paths.
  'restateRules',        // 4.1: exhibit pointer + summary; a number only if asked; matched item only; not twice in 4 turns
  'coarseKeepNamed',     // 4.2: never drop a model-named item that matches the ask
  'coarseNoRefusal',     // pre-wave ruling 1 (26 Oct): an ask whose coarse items go out this turn is not also refused
  'haikuTagGate',        // 4.3: the check's positives pass the item tag gate; a mismatch defers
  'coverNormalization',  // 4.5: plurals, synonym table, the candidate's own sentence
  'wantCueBroad',        // 4.6: "I'd want / need / confirm" + any noun phrase
  'modelDeferrals',      // 4.7: model-said deferrals registered for E5's stop sequence
  'closeWaitMitigation', // 4.8: no mitigation ask when the last answer or question already covered it
  'recommendationReceived', // 4.9: the time warning skips a fresh rec ask (the narrow reading: the stage record is untouched)
  'ackRotation',         // 4.10: the model's opening acknowledgment through the phrase-pool rotation
] as const;

// Switches outside the `phase1` preset: nameable, never turned on by `*=phase1`. Lorenzo rejected 4.9's wider
// reading on 26 Oct — a received recommendation opening the end gate removes post-recommendation pushback probes,
// and pushback is a scored rubric dimension (five runs closed 3–8 minutes early; b34a Jasmine lost eight turns).
// It stays nameable for evidence, never on by default.
// 4.4 (Lorenzo, 26 Oct): dropped from the preset on the fault bank's evidence. With `*=phase1` it cost three
// correct-behaviour records and three fault records, and left its own `false_refusal` class unchanged at 7/15 —
// both graded false refusals are fixed by 4.2 and 4.5 acting alone. Its harm is the realism regression: a true
// "I don't have that" becomes a promise later withdrawn as "we won't get to it", which the bank records as a
// fault in its own right. Nameable for evidence, never on by default.
// `restatePointerOff` (27 Oct): measurement only — 4.1's exhibit-pointer branch off (the line said instead), to weigh
// the batch-39 pointer regression before S6. Never in a preset.
// `refusalCoverage` (27 Oct): measurement only — S3's contradiction rule without its item mapping: a refused part is
// dropped when a line given this turn covers its words (the item's line, label, names and cover phrases). Never in a preset.
// `restateOwnLine` (27 Oct, S6's start — Lorenzo's option B): 4.1's exhibit pointer replaced by the item's own line, plus a
// true refusal for any finer part the item doesn't hold; no summaries, no model calls. Off until its gate is read.
export const NON_PRESET_SWITCHES = ['recommendationOpensGate', 'refusalNounCheck', 'restatePointerOff', 'refusalCoverage', 'restateOwnLine'] as const;
// Phase 2 (docs/superpowers/plans/2026-10-27-phase2-design.md §4; Lorenzo's rulings, 27 Oct): one switch per migration
// step, the `phase2` preset naming them all. Session 1 builds the two shadow steps only — they log what the new
// structures would decide and say, and change nothing the candidate hears.
export const PHASE2_SWITCHES = [
  'askDecisionShadow',   // S1: the one data decision (lib/orchestrator/ask-decision.ts), logged as `ask_decision_shadow`
  'composeShadow',       // C1: the four-slot composer and its lint (lib/orchestrator/turn-composer.ts), logged as `compose_shadow`
  'askRefusals',         // S2: the decision's true refusals (R6) and uncertain deferrals (R7) spoken for declared sub-asks; offers dropped
  'composeData',         // C2: the data slot — the exhibit last, no line the model's say already said (L1), no deferral of what it released (L3)
  'refusalContradiction', // S3: no refused part that a line released or restated this turn states
  'wontGetToGiven',      // S3: a wrap-up "We won't get to …" says only the parts nothing given since states
  'askModelKeep',        // S3: R2 live — a model-named item that matches the ask is kept (today's scope drop and release_checked withdrawal)
  'composeSetup',        // C3: after a spoken acknowledgment, setup sentences travel with their question (else streamed as today)
] as const;
export const ALL_SWITCHES = [...PHASE1_SWITCHES, ...NON_PRESET_SWITCHES, ...PHASE2_SWITCHES] as const;

export type EngineSwitch = typeof ALL_SWITCHES[number];
export const isEngineSwitch = (s: string): s is EngineSwitch => (ALL_SWITCHES as readonly string[]).includes(s);

type Env = Record<string, string | undefined>;
type CaseLike = { id: string; engine?: Partial<Record<EngineSwitch, boolean>> };

// The env value parsed once per distinct string; a name that is no switch throws (a typo would silently test nothing).
const parsed = new Map<string, Map<string, Map<EngineSwitch, boolean>>>();
export function parseEngineSwitches(raw: string): Map<string, Map<EngineSwitch, boolean>> {
  const hit = parsed.get(raw);
  if (hit) return hit;
  const out = new Map<string, Map<EngineSwitch, boolean>>();
  for (const entry of raw.split(';').map(s => s.trim()).filter(Boolean)) {
    const eq = entry.indexOf('=');
    if (eq <= 0) throw new Error(`ENGINE_SWITCHES: "${entry}" is not <caseId|*>=<names>`);
    const caseId = entry.slice(0, eq).trim();
    const set = out.get(caseId) ?? new Map<EngineSwitch, boolean>();
    for (const name of entry.slice(eq + 1).split(',').map(s => s.trim()).filter(Boolean)) {
      const off = name.startsWith('-');
      const bare = off ? name.slice(1) : name;
      if (bare === 'phase1') { for (const s of PHASE1_SWITCHES) set.set(s, !off); continue; }
      if (bare === 'phase2') { for (const s of PHASE2_SWITCHES) set.set(s, !off); continue; }
      if (!isEngineSwitch(bare)) throw new Error(`ENGINE_SWITCHES: unknown switch "${bare}"`);
      set.set(bare, !off);
    }
    out.set(caseId, set);
  }
  parsed.set(raw, out);
  return out;
}

// Lorenzo's D2 guard (22 Oct): ENGINE_SWITCHES is for evaluation only. In production mode (NODE_ENV=production, as
// on Vercel and `next start`) the case loader refuses to start with it set.
export function assertNoEngineSwitchesInProduction(env: Env = process.env): void {
  if (env.NODE_ENV === 'production' && env.ENGINE_SWITCHES?.trim()) {
    throw new Error(`ENGINE_SWITCHES is set in production mode ("${env.ENGINE_SWITCHES}"): Phase 1 switches are for evaluation only — refusing to start`);
  }
}

export function switchOn(c: CaseLike, name: EngineSwitch, env: Env = process.env): boolean {
  const raw = env.ENGINE_SWITCHES?.trim();
  if (raw) {
    const table = parseEngineSwitches(raw);
    const own = table.get(c.id)?.get(name);
    if (own !== undefined) return own;
    const all = table.get('*')?.get(name);
    if (all !== undefined) return all;
  }
  return c.engine?.[name] ?? false;
}

// Every switch's value for a case: the run header and the session flags record it.
export function engineSwitchesOf(c: CaseLike, env: Env = process.env): Partial<Record<EngineSwitch, true>> {
  return Object.fromEntries(ALL_SWITCHES.filter(s => switchOn(c, s, env)).map(s => [s, true]));
}
