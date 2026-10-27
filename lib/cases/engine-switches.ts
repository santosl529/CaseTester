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
  'misquoteAttribution', // post-wave (26 Oct): a figure the candidate attributes to the interviewer is a quote — `operandLater` does not excuse it
  'misquoteSameTurn',    // post-wave ruling (26 Oct evening): an ATTRIBUTED misquote is corrected on its own turn, not a turn later
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
// (`misquoteSameTurn` was here on 26 Oct afternoon and is now in the preset above. Its unrestricted form added 45
// correction sentences across the 31 slices and two were provably false — b34a a1133734 t31 on the candidate's own
// correct "$320M less $80M … is $240M", b38l 701443f7 t17 on his own correct "$11,000/60 = $183, so a $163 fare",
// both rated CORRECT by the checker. Lorenzo's ruling of 26 Oct evening narrows it to an ATTRIBUTED quote with a
// same-message withdrawal check, which removes both: the restricted form speaks 6 corrections across the slices,
// 3 of them the same sentence two turns earlier, and all 6 are true misquotes the candidate attributed to the
// interviewer or the exhibit. See the post-wave report's §9.)
// `speechNormalization` (27 Oct) reads a spoken arithmetic chain through the disfluencies STT leaves in it, so
// the checker reaches a verdict on speech at all — measured 0 claims over the 131 recorded voice candidate turns
// against 32.3 per 100 typed turns on the same case. It is the first Phase 1 change that makes the engine *raise*
// claims rather than withhold them, so it stays out of the preset until Lorenzo has ruled on the evidence
// (`.superpowers/sdd/2026-10-22-phase1/speech-normalization-report.md`). Nameable for evaluation; off everywhere
// else, and a no-op on the typed corpus by construction.
export const NON_PRESET_SWITCHES = ['recommendationOpensGate', 'refusalNounCheck', 'speechNormalization'] as const;
export const ALL_SWITCHES = [...PHASE1_SWITCHES, ...NON_PRESET_SWITCHES] as const;

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
