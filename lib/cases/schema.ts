import { z } from 'zod';
import { ALL_SWITCHES } from './engine-switches';

const PhaseSchema = z.enum([
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
]);

// docs/interviewer-behavior.md Rule 10 + docs/case-authoring.md "Ledger values
// must be speakable sentences": the orchestrator appends `value` verbatim to
// the interviewer's spoken text on reveal (lib/orchestrator/session-runner.ts),
// so an unlabeled fragment ships straight to the candidate. A pilot run
// revealed "+40% increase in raw coffee bean costs" — a noun-phrase fragment,
// not a sentence — right after "let me pull that data for you," reading as a
// non-sequitur. Catching this needs more than a label-keyword check: the bad
// example above already contains "coffee bean," so keyword presence alone
// doesn't distinguish it from the fixed version, "Raw coffee bean costs are up
// 40% over the past two years." The actual difference is sentence structure —
// terminal punctuation plus a finite verb — so that's what this checks.
const SENTENCE_VERB_RE = new RegExp(
  '\\b(is|are|was|were|has|have|had|remains?|remained|stands?|stood|' +
  'rose|rises|risen|fell|falls|fallen|grew|grows|grown|' +
  'increased|increases|decreased|decreases|surged|surges|' +
  'dropped|drops|jumped|jumps|climbed|climbs|stayed|held|holds|' +
  'comes|came|totals?|totaled)\\b',
  'i',
);

// Phase 1 text that may be spoken or shown before reveal carries no figure (FR-4): digits or number words.
const NUMBER_WORD = /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|half|quarter|percent)\b/i;
export function noFigure(text: string): boolean { return !/\d/.test(text) && !NUMBER_WORD.test(text); }

function isSpeakableSentence(value: string): boolean {
  return /[.!?]\s*$/.test(value.trim()) && SENTENCE_VERB_RE.test(value);
}

const LedgerItemSchema = z.object({
  id: z.string(),
  label: z.string(),        // shown to LLM before reveal (e.g. "Total revenue")
  value: z.string(),        // the actual number — server-only
  releaseWhen: PhaseSchema, // earliest phase at which reveal is legal
  // Rule 6 v4.6 (docs/case-authoring.md "Ledger timeframes"): the period of
  // each figure the value states, keyed by the figure as written — e.g.
  // { "58": "current", "42": "prior" }. Feeds the timeframe check.
  timeframes: z.record(z.string(), z.enum(['current', 'prior', 'change', 'both'])).optional(),
  // The item's name in a promise — "I'll come back to ___ shortly", "I'll share
  // ___ once …", "I can share ___ if you'd like" (13 Oct). Authored, because a
  // name derived from the label can read badly or give the finding away
  // ("a new competitor"). Without it: spokenItemName(label).
  spoken: z.string().min(2).optional(),
  // Phase 1 (docs/superpowers/plans/2026-10-22-phase1-contract.md §1). Authored in cases/phase1/<id>.json and
  // attached at load (lib/cases/phase1-overlay.ts); read only by Phase 1 code behind its switch.
  //   tags — what the item is about: whose (`client` or a factAnchors.tags entity id), which period, what kind of quantity.
  //   askPhrases — 3–5 short "answers questions about…" phrases; shown to the model before reveal (askPhrasesInPrompt),
  //     so no figure and nothing that gives the finding away.
  //   coverExcludes — words that keep a cover from matching this item (chip vs chickpea), with itemCovers on.
  tags: z.object({
    entity: z.string().min(1),
    period: z.array(z.enum(['forecast', 'current', 'historical'])).min(1),
    quantityKind: z.array(z.enum(['total', 'split', 'level', 'trend', 'one-off', 'recurring'])).min(1),
  }).strict().optional(),
  askPhrases: z.array(z.string().min(3).refine(noFigure, 'no figure in an ask phrase')).min(3).max(5).optional(),
  coverExcludes: z.array(z.string().min(2)).optional(),
}).superRefine((item, ctx) => {
  if (!isSpeakableSentence(item.value)) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: `dataLedger item "${item.id}": value must be a complete spoken ` +
        `sentence with terminal punctuation and a verb (docs/case-authoring.md ` +
        `"Ledger values must be speakable sentences"), got: ${JSON.stringify(item.value)}`,
    });
  }
});

const MathStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  answer: z.number(),                      // ground truth — server-only
  tolerance: z.number(),                    // ±5% acceptable error — must be explicit in case file
  // Other numerically-different-but-defensible results for the same step (e.g.
  // "COGS dollar increase" measured as actual spend growth vs margin impact).
  // A candidate landing on any of these is NOT an arithmetic error; misusing
  // the figure is a separate (conceptual) judgment the judge makes.
  altAnswers: z.array(z.number()).optional(),
  // Source spans (lib/scoring/math-spans.ts, docs/interviewer-behavior.md
  // Rules 2/3 v4.3): a candidate's number counts toward this step only when it
  // sits near one of these cue phrases in the same clause and states `unit`.
  // Without cues, any number anywhere counted — the 27–28 Sep persona runs'
  // false corrections and false report errors.
  cues: z.array(z.string().min(2)).min(1),
  // A sentence naming one of these is about another quantity, not this step
  // ("And overhead, which drifted 2 points, worth maybe $10M" is no COGS impact).
  notCues: z.array(z.string().min(2)).optional(),
  // A sentence naming one of these is never a mismatch for this step, though
  // a correct figure there still verifies (13 Oct, Larkspur: scenarios — "half
  // of plan", "trigger" — and other routes' or periods' figures).
  flagNotCues: z.array(z.string().min(2)).optional(),
  // "count" (13 Oct): passengers, patients, bags — never a $ or % figure.
  // "ratio" (20 Oct): LTV/CAC, "2.5x" — said with x or times, never a $ or % figure; code says it "about 2 times".
  unit: z.union([z.enum(['percent', 'points', 'usd', 'count', 'ratio']), z.array(z.enum(['percent', 'points', 'usd', 'count', 'ratio'])).min(1)]).optional(),
  // Money's scale (13 Oct, Larkspur): "unit" — a per-unit dollar figure
  // ($4,200 per flight); "million" — stated in $M. A figure stated at another
  // scale is not this step (lib/scoring/math-spans.ts).
  scale: z.enum(['unit', 'million']).optional(),
  // Ledger items the step is derived from; the step is checked only once all
  // are revealed. Empty = derivable from the case prompt alone.
  inputs: z.array(z.string()).default([]),
  // false: excluded from the live recompute hint (prompt facts candidates
  // quote and reuse constantly); still scored.
  live: z.boolean().optional(),
  // Rule 2 v4.6 (docs/case-authoring.md): verifies correct figures, never
  // raises a mismatch — for arithmetic surrounded by legitimate nearby numbers
  // (bean shares: "beans up 40%" sits next to every 10.5).
  verifyOnly: z.boolean().optional(),
  // Figures the candidate states when showing their work for this step (Rule
  // 2 v4.5 "work shown"), e.g. [25, 42] for 25% of COGS × 42% of revenue.
  operands: z.array(z.number()).optional(),
  // What the figure is, and for which period (round-3: a flag names the
  // candidate's claim in these terms). Server-only like the rest.
  quantity: z.string().optional(),
  timeframe: z.enum(['current', 'prior', 'change']).optional(),
  // Step roots (round 6 Task 72; Lorenzo, 21 Oct, the step-check ruling: "The deterministic step check may, without the
  // checker agreeing: link derived claims to the flagged root and stop probing them; ask one neutral input question at
  // the root (for example, "Which row did you use for cancellations?"). It may NOT voice a correction without the
  // checker's agreement."; audit M1–M2, b37 Quillpath Raj and Marcus). dependsOn: the steps this one is computed from — a
  // claim on a step that depends (transitively) on a step the deterministic check flagged is linked to that root, not
  // probed. inputQuestion: the root's one neutral question, said by code as a probe — no figure, no arithmetic, no
  // lead (math-checker-live.ts stepRootOf, plan-turn.ts). A case whose steps declare neither (prof-001) is unchanged.
  dependsOn: z.array(z.string()).optional(),
  inputQuestion: z.string().min(5).optional(),
});

// Stages an exhibit's `after` may name besides earlier exhibits (13 Oct).
export const ORDER_STAGES = ['brainstorm'] as const;
export function isOrderStage(id: string): id is typeof ORDER_STAGES[number] {
  return (ORDER_STAGES as readonly string[]).includes(id);
}

const ExhibitSchema = z.object({
  id: z.string(),
  title: z.string(),
  chartType: z.enum(['bar', 'line', 'table', 'pie']),
  data: z.array(z.record(z.string(), z.unknown())),    // client-safe display data
  // The exhibit's footnotes (definitions, units, "each percentage applies to
  // the stage above"), shown under the table — client-safe, never spoken. Any
  // figure in them must be in a sentence the exhibit covers (consistency test).
  notes: z.string().min(1).optional(),
  interpretationKey: z.string(),           // server-only insight
  // Ledger item ids whose figures this exhibit displays — showing the exhibit
  // releases them (docs/case-authoring.md, interviewer-behavior Rule 11).
  coversLedgerItems: z.array(z.string()).optional(),
  // Release order (new cases, 13 Oct; lib/orchestrator/data-decisions.ts
  // exhibitReady): exhibits that must be out first (each earlier in the list),
  // or a stage (ORDER_STAGES: "brainstorm" — Hollis Bay's sampling exhibit
  // would give the brainstorm away), and ledger items that must be released
  // first. Until then neither the exhibit nor an item only it shows is
  // released, by any path.
  after: z.array(z.string()).optional(),
  requiresItems: z.array(z.string()).optional(),
  // Owed before the case ends (Lorenzo, 13 Oct): an unshown required exhibit
  // holds the recommendation ask and the close — code hands it over, in order;
  // under time pressure it goes out with the recommendation ask instead. A
  // required exhibit's `after` exhibits must be required too.
  required: z.boolean().optional(),
  // Phase 1 (contract §1; restateRules): one line on what the table generally shows, no figures — said when an ask
  // is answered by an exhibit already out ("Exhibit 2 has the route results by year.").
  summary: z.string().min(5).refine(noFigure, 'no figure in an exhibit summary').optional(),
});

const RubricAnchorSchema = z.object({
  needs_work: z.string(),
  meets_bar: z.string(),
  strong: z.string(),
});

// Rule 8 (docs/interviewer-behavior.md): "pacing nudge uses per-phase time
// budgets from case config, not a uniform schedule." Optional — cases without
// pacing fall back to an even split (lib/orchestrator/pacing.ts).
const PacingSchema = z.object({
  phaseBudgetsMs: z.partialRecord(PhaseSchema, z.number().positive()).optional(),
  timeWarningMs: z.number().positive().optional(), // default 90s (text), see DEFAULT_TIME_WARNING_MS
  totalMs: z.number().positive().optional(),        // the case clock; default 20 min (state-machine.ts caseTotalMs)
});

export const CaseSchema = z.object({
  id: z.string().regex(/^[a-z]+-\d{3}$/, 'Case id must match pattern like prof-001'),
  title: z.string().min(1),
  firmStyle: z.enum(['mckinsey', 'bcg', 'bain', 'generic']).default('mckinsey'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prompt: z.string().min(50),
  interviewerNotes: z.string(),
  dataLedger: z.array(LedgerItemSchema).min(1),
  mathSteps: z.array(MathStepSchema).min(1),
  exhibits: z.array(ExhibitSchema),
  structureKey: z.string().min(1),
  recommendationKey: z.string().min(1),
  // Rule 3 v4.5 (docs/case-authoring.md "Answer-key ideas"): the specific
  // ideas in the model answer, with the phrases that name them. A report may
  // not fault a candidate for not producing one (lib/scoring/answer-key-pass.ts).
  // Server-only, like recommendationKey.
  answerKeyIdeas: z.array(z.object({
    idea: z.string().min(1),
    phrases: z.array(z.string().min(3)).min(1),
  })).default([]),
  pacing: PacingSchema.optional(),
  // Case format (Rule 9 v4.10): interviewer-led cases owe the exhibit and the
  // brainstorm before a normal end (lib/orchestrator/stage-evidence.ts);
  // candidate-led cases leave the order to the candidate. Only interviewer-led
  // cases exist so far.
  format: z.enum(['interviewer_led', 'candidate_led']).default('interviewer_led'),
  // The brainstorm (new cases, 13 Oct; lib/orchestrator/brainstorm.ts): the
  // case's own brainstorm question — code's stage line (several rotate), and
  // the brainstorm when the interviewer asks it — and whether the case owes
  // one (false: no brainstorm module, as in Quillpath). Without it: the
  // generic question, owed. `after` (Lorenzo, 13 Oct; Larkspur's brainstorm
  // assumes the new-routes plan): exhibits that must be out before it — code
  // hands them over first, and the interviewer's earlier brainstorm question is
  // held. Required exhibits only, none that waits on the brainstorm itself.
  brainstorm: z.object({
    ask: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    required: z.boolean().default(true),
    after: z.array(z.string().min(1)).optional(),
  }).optional(),
  // The core analysis (fact guards Phase 5, 12 Oct): the ledger items the case
  // turns on — no recommendation ask and no close before they are out, unless
  // the clock is out (batch 20: recommendations asked at 7 min with the COGS
  // split never released). `ask` is code's one line back to it.
  analysisCore: z.object({
    items: z.array(z.string()).min(1),
    // Attempted once this many of the items are out (default: all). Batch 20
    // grading: two of the three COGS inputs out is the analysis attempted.
    minItems: z.number().int().min(1).optional(),
    ask: z.string().min(1),
  }).optional(),
  // Must-reach items (round 6 Task 72; Lorenzo, 21 Oct, round 6: "Code releases a case-declared item at a declared
  // point if the candidate hasn't asked by then … The report should note when an item was volunteered."; audit row 9,
  // b36 Larkspur Jasmine: Exhibit 3 at t10, the competitor never told). `before`: an exhibit id — released in the data
  // line of the turn that hands that exhibit over, ahead of it — or "recommendation" — released before code's (or the
  // model's) recommendation ask (turn-data.ts mustReachItems). Never on a close turn, never twice, past the release cap.
  // Phase 1 (contract §1): at most 3 per case; `why` names the runs that missed the item (overlay entries need it).
  mustReach: z.array(z.object({ item: z.string(), before: z.string().min(1), why: z.string().min(5).optional() }).strict()).max(3).optional(),
  // Phase 1 (contract §1; rootLineage, checkerDefinitions): a quantity's one-line definition, no figures — the
  // wording of a root correction and context for the live checker. Server-only.
  definitions: z.array(z.object({
    term: z.string().min(2),
    text: z.string().min(5).refine(noFigure, 'no figure in a definition'),
    steps: z.array(z.string()).optional(),
    items: z.array(z.string()).optional(),
  }).strict()).optional(),
  // Phase 1 engine switches pinned by the case file (lib/cases/engine-switches.ts); absent = today's behaviour.
  engine: z.partialRecord(z.enum(ALL_SWITCHES), z.boolean()).optional(),
  // Voice (lib/voice/keyterms.ts; Lorenzo's brief, 17 Oct): the case's own
  // names and terms Flux is told to expect — the client, products, places —
  // beside the generic ones ("COGS", "MECE"). 9ccf0836 heard "Cogshare".
  sttKeyterms: z.array(z.string().min(2)).max(40).default([]),
  // Rule 2/14 unit check (lib/orchestrator/unit-check.ts): cost lines whose
  // shares candidates convert into points of revenue, and the ledger item that
  // gives that line's own share of revenue (its timeframes give the values).
  // Without it the case has no nested-percentage check.
  shareBases: z.array(z.object({
    name: z.string().min(1),
    aliases: z.array(z.string().min(2)).default([]),
    item: z.string(),
  })).default([]),
  // Rule 6 option 4 misquote check (lib/orchestrator/misquote.ts, v4.11): the
  // words candidates use for each quotable ledger item, whether the item
  // states levels or a change, and for a share item what it is a share of.
  // The figures come from the item's timeframes. Without it the case has no
  // misquote check.
  quoteAnchors: z.array(z.object({
    item: z.string(),
    names: z.array(z.string().min(2)).min(1),
    kind: z.enum(['level', 'change']).default('level'),
    of: z.array(z.string().min(2)).optional(),
    // A route- or entity-scoped anchor: its names count only where one of these words comes earlier in the
    // sentence (misquote.ts). A scoped name never names the item on its own (fact-check.ts buildFactBase).
    scope: z.array(z.string().min(2)).min(1).optional(),
  })).default([]),
  // Fact checks (lib/orchestrator/fact-check.ts, 12 Oct): what code needs to
  // tell a true statement about the case from a false one, beyond the ledger
  // items' own figures (quoteAnchors + timeframes). Without it the case has no
  // interviewer truth check, misquote check of prompt facts, or refusal check.
  //   promptFacts — quantities the case prompt states (not ledger items): the
  //     names people use, level or change, figures by period. Always known to
  //     the candidate (the prompt is read out first).
  //   names — more names for ledger items, beyond quoteAnchors (menu prices,
  //     revenue per store), used to read refusals and claims.
  //   groups — phrases that name several ledger items at once ("what's inside
  //     COGS" → the bean share and the input price changes).
  //   directions — up / down / flat per ledger item or prompt fact, where the
  //     timeframes don't give it (an item with no figures, like flat menu prices).
  //   drivers — how a total change splits into parts ("of the 16 COGS points,
  //     beans 4.2, other inputs 11.8"), so "mostly beans" can be checked.
  //   covers — per ledger item or prompt fact, phrases of asks it answers
  //     though they don't name it ("same-store" → the store count, flat;
  //     "aircraft size" → the competitor line). Before code refuses an ask it
  //     checks these (Lorenzo, 13 Oct): a covering item is given, a prompt
  //     fact restated (fact-check.ts coverageOf).
  factAnchors: z.object({
    promptFacts: z.array(z.object({
      id: z.string().min(1),
      names: z.array(z.string().min(2)).min(1),
      kind: z.enum(['level', 'change']),
      unit: z.enum(['percent', 'dollar', 'count']),
      values: z.record(z.string(), z.enum(['current', 'prior', 'change', 'both'])),
      // The fact in one sentence, from the prompt's own figures: what code says to correct a misquote of it.
      say: z.string().min(5),
    })).default([]),
    names: z.record(z.string(), z.array(z.string().min(2))).default({}),
    groups: z.array(z.object({ names: z.array(z.string().min(2)).min(1), items: z.array(z.string()).min(1) })).default([]),
    directions: z.record(z.string(), z.enum(['up', 'down', 'flat'])).default({}),
    drivers: z.array(z.object({
      of: z.string().min(1),               // a ledger item or prompt fact whose change is split
      total: z.number(),
      parts: z.array(z.object({ names: z.array(z.string().min(2)).min(1), value: z.number() })).min(2),
    })).default([]),
    covers: z.record(z.string(), z.array(z.string().min(3)).min(1)).default({}),
    //   tags — round 6 (Lorenzo, 21 Oct: "It may release the matched item only if
    //     the item's tags (company; forecast vs current; quantity) also agree with
    //     the ask"): the words that name the client's own product or business in an
    //     ask; each other company or product (its words, the items about it — items
    //     in no entity are the client's); the items stating a forecast, plan or
    //     estimate. Present = the case opts into round 6's cover matching and gate
    //     (fact-check.ts coverageOf, item-tags.ts tagsAgree); prof-001 has none.
    //     `rival` (Task 70 fix round 2, controller ruling, 21 Oct): the entity competes with
    //     the client (Larkspur's entrant, Aldermoor's Nimbrel) — its items are the comparator
    //     and meet a competitor or benchmark scope. Not the client's own other business
    //     (Hollis Bay's chips).
    tags: z.object({
      clientWords: z.array(z.string().min(2)),
      entities: z.array(z.object({ id: z.string().min(1), rival: z.boolean().optional(), words: z.array(z.string().min(2)).min(1), items: z.array(z.string()) }).strict()),
      forecast: z.array(z.string()),
    }).optional(),
  }).optional(),
  // Pricing math (lib/orchestrator/pricing-check.ts, 12 Oct): the cost lines a
  // price change leaves fixed in dollars at flat volume (their current shares
  // of revenue sum to the cost base), and the cost lines that may be treated
  // as variable with volume for a break-even — each set an accepted answer.
  // Without it the case has no pricing check.
  // Step flags live (Lorenzo, 13 Oct, after Larkspur's false corrections):
  // a case's deterministic step flags probe the candidate only once its step
  // binding is validated — zero false flags on its transcripts. Until then
  // (absent or false) they are report-only: logged, never a probe or a
  // correction. Only prof-001 is validated.
  stepFlagsLive: z.boolean().optional(),
  // Ledger lookup live (Lorenzo, 13 Oct, Larkspur rulings b): a misread of a
  // figure that only a ledger line states (no exhibit shows it; cell-lookup.ts)
  // is corrected only once the lookup is checked on the case's transcripts.
  // Until then (absent or false) such flags are report-only: logged, never
  // corrected. No case is live yet.
  ledgerLookupLive: z.boolean().optional(),
  pricingModel: z.object({
    costItems: z.array(z.string()).min(1),
    variableSets: z.array(z.array(z.string()).min(1)).min(1),
    revenueItem: z.string().optional(),
  }).optional(),
  // Deprecated: the judge scores against the generic 8-dimension rubric in
  // lib/scoring/rubric.ts (docs/Case Interview Feedback Rubric.pdf). Per-case
  // anchors are tolerated in case files but no longer read.
  rubricAnchors: z.record(z.string(), RubricAnchorSchema).optional(),
}).superRefine((c, ctx) => {
  const ledgerIds = new Set(c.dataLedger.map(d => d.id));
  c.mathSteps.forEach((step, i) => step.inputs.forEach((id, j) => {
    if (!ledgerIds.has(id)) {
      ctx.addIssue({ code: 'custom', path: ['mathSteps', i, 'inputs', j], message: `Unknown ledger item "${id}"` });
    }
  }));
  // Step roots (round 6 Task 72): known steps, no cycle; the input question asks — no figure, no arithmetic (FR-4).
  const stepIds = new Set(c.mathSteps.map(st => st.id));
  const cyclic = (id: string, seen: string[]): boolean => seen.includes(id)
    || (c.mathSteps.find(st => st.id === id)?.dependsOn ?? []).some(d => cyclic(d, [...seen, id]));
  c.mathSteps.forEach((step, i) => {
    (step.dependsOn ?? []).forEach((id, j) => {
      if (!stepIds.has(id) || id === step.id) ctx.addIssue({ code: 'custom', path: ['mathSteps', i, 'dependsOn', j], message: `Unknown math step "${id}"` });
    });
    if ((step.dependsOn ?? []).some(d => stepIds.has(d) && d !== step.id && cyclic(d, [step.id]))) ctx.addIssue({ code: 'custom', path: ['mathSteps', i, 'dependsOn'], message: `"${step.id}" depends on itself` });
    if (step.inputQuestion !== undefined && (/\d/.test(step.inputQuestion) || !step.inputQuestion.trim().endsWith('?'))) ctx.addIssue({ code: 'custom', path: ['mathSteps', i, 'inputQuestion'], message: 'An input question asks, with no figure in it' });
  });
  c.shareBases.forEach((b, i) => {
    if (!ledgerIds.has(b.item)) ctx.addIssue({ code: 'custom', path: ['shareBases', i, 'item'], message: `Unknown ledger item "${b.item}"` });
  });
  c.quoteAnchors.forEach((q, i) => {
    if (!ledgerIds.has(q.item)) ctx.addIssue({ code: 'custom', path: ['quoteAnchors', i, 'item'], message: `Unknown ledger item "${q.item}"` });
    const item = c.dataLedger.find(d => d.id === q.item);
    if (item && Object.keys(item.timeframes ?? {}).length === 0) ctx.addIssue({ code: 'custom', path: ['quoteAnchors', i, 'item'], message: `"${q.item}" has no timeframes, so it has no figures to check` });
  });
  // The brainstorm's own wait: known, required exhibits, none waiting (through its predecessors) on the brainstorm.
  const waitsOnBrainstorm = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return (c.exhibits.find(x => x.id === id)?.after ?? []).some(a => isOrderStage(a) || waitsOnBrainstorm(a, seen));
  };
  (c.brainstorm?.after ?? []).forEach((id, j) => {
    const ex = c.exhibits.find(x => x.id === id);
    if (!ex) ctx.addIssue({ code: 'custom', path: ['brainstorm', 'after', j], message: `Unknown exhibit "${id}"` });
    else if (ex.required !== true) ctx.addIssue({ code: 'custom', path: ['brainstorm', 'after', j], message: `"${id}" must be required: the brainstorm would wait on an exhibit that may never go out` });
    else if (waitsOnBrainstorm(id)) ctx.addIssue({ code: 'custom', path: ['brainstorm', 'after', j], message: `"${id}" waits on the brainstorm itself` });
  });
  c.exhibits.forEach((e, i) => {
    (e.after ?? []).forEach((id, j) => {
      if (isOrderStage(id)) {
        // A case without a brainstorm never has it out: the exhibit would wait forever.
        if (c.brainstorm?.required === false || c.format === 'candidate_led') ctx.addIssue({ code: 'custom', path: ['exhibits', i, 'after', j], message: `"${id}": this case has no brainstorm stage` });
        return;
      }
      const at = c.exhibits.findIndex(x => x.id === id);
      if (at < 0 || at >= i) ctx.addIssue({ code: 'custom', path: ['exhibits', i, 'after', j], message: `"${id}" is not an exhibit earlier in the list` });
    });
    if (e.required) (e.after ?? []).forEach((id, j) => {
      if (!isOrderStage(id) && c.exhibits.find(x => x.id === id)?.required !== true) ctx.addIssue({ code: 'custom', path: ['exhibits', i, 'after', j], message: `"${id}" comes before required "${e.id}", so it must be required too` });
    });
    (e.requiresItems ?? []).forEach((id, j) => {
      if (!ledgerIds.has(id)) ctx.addIssue({ code: 'custom', path: ['exhibits', i, 'requiresItems', j], message: `Unknown ledger item "${id}"` });
    });
  });
  c.analysisCore?.items.forEach((id, i) => {
    if (!ledgerIds.has(id)) ctx.addIssue({ code: 'custom', path: ['analysisCore', 'items', i], message: `Unknown ledger item "${id}"` });
  });
  (c.mustReach ?? []).forEach((m, i) => {
    if (!ledgerIds.has(m.item)) ctx.addIssue({ code: 'custom', path: ['mustReach', i, 'item'], message: `Unknown ledger item "${m.item}"` });
    if (m.before !== 'recommendation' && !c.exhibits.some(e => e.id === m.before)) ctx.addIssue({ code: 'custom', path: ['mustReach', i, 'before'], message: `"${m.before}" is neither an exhibit nor "recommendation"` });
  });
  (c.definitions ?? []).forEach((d, i) => {
    (d.steps ?? []).forEach((id, j) => { if (!stepIds.has(id)) ctx.addIssue({ code: 'custom', path: ['definitions', i, 'steps', j], message: `Unknown math step "${id}"` }); });
    (d.items ?? []).forEach((id, j) => { if (!ledgerIds.has(id)) ctx.addIssue({ code: 'custom', path: ['definitions', i, 'items', j], message: `Unknown ledger item "${id}"` }); });
  });
  // Item tags' entities: checked where the case has entity tags (prof-001's come with its overlay's factTags).
  const entityIds = new Set(['client', ...(c.factAnchors?.tags?.entities.map(e => e.id) ?? [])]);
  if (c.factAnchors?.tags) c.dataLedger.forEach((d, i) => {
    if (d.tags && !entityIds.has(d.tags.entity)) ctx.addIssue({ code: 'custom', path: ['dataLedger', i, 'tags', 'entity'], message: `"${d.tags.entity}" is neither "client" nor a factAnchors.tags entity` });
  });
  if (c.pricingModel) {
    const pm = c.pricingModel;
    [...pm.costItems, ...pm.variableSets.flat(), ...(pm.revenueItem ? [pm.revenueItem] : [])].forEach(id => {
      if (!ledgerIds.has(id)) ctx.addIssue({ code: 'custom', path: ['pricingModel'], message: `Unknown ledger item "${id}"` });
    });
  }
  const f = c.factAnchors;
  if (f) {
    const factIds = new Set([...ledgerIds, ...f.promptFacts.map(p => p.id)]);
    f.promptFacts.forEach((p, i) => {
      if (ledgerIds.has(p.id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'promptFacts', i, 'id'], message: `"${p.id}" is a ledger item, not a prompt fact` });
      // Every figure must be stated in the prompt (or an exhibit): a prompt fact adds no new number.
      for (const v of Object.keys(p.values)) {
        const inPrompt = new RegExp(`(?<![\\d.])${v.replace('.', '\\.')}(?![\\d])`).test(c.prompt);
        const inExhibit = c.exhibits.some(e => JSON.stringify(e.data).includes(`:${v}`));
        if (!inPrompt && !inExhibit) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'promptFacts', i, 'values', v], message: `${v} is not stated in the prompt or an exhibit` });
      }
      // The correction sentence adds no figure the fact doesn't state (FR-4).
      for (const n of p.say.match(/\d+(?:\.\d+)?/g) ?? []) {
        if (!(n in p.values)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'promptFacts', i, 'say'], message: `"${n}" in say is not one of the fact's figures` });
      }
    });
    for (const id of Object.keys(f.names)) if (!ledgerIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'names', id], message: `Unknown ledger item "${id}"` });
    f.groups.forEach((g, i) => g.items.forEach((id, j) => {
      if (!ledgerIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'groups', i, 'items', j], message: `Unknown ledger item "${id}"` });
    }));
    for (const id of Object.keys(f.covers)) if (!factIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'covers', id], message: `Unknown ledger item or prompt fact "${id}"` });
    if (f.tags) {
      f.tags.entities.forEach((e, i) => {
        if (e.id === 'client' || f.tags!.entities.findIndex(x => x.id === e.id) !== i) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'tags', 'entities', i, 'id'], message: `Entity id "${e.id}" is reserved or repeated` });
        e.items.forEach((id, j) => { if (!factIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'tags', 'entities', i, 'items', j], message: `Unknown ledger item or prompt fact "${id}"` }); });
      });
      f.tags.forecast.forEach((id, i) => { if (!factIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'tags', 'forecast', i], message: `Unknown ledger item or prompt fact "${id}"` }); });
    }
    for (const id of Object.keys(f.directions)) if (!factIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'directions', id], message: `Unknown ledger item or prompt fact "${id}"` });
    f.drivers.forEach((d, i) => {
      if (!factIds.has(d.of)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'drivers', i, 'of'], message: `Unknown ledger item or prompt fact "${d.of}"` });
      const sum = d.parts.reduce((a, p) => a + p.value, 0);
      if (Math.abs(sum - d.total) > 0.05) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'drivers', i], message: `parts sum to ${sum}, not ${d.total}` });
    });
  }
});

export type Case = z.infer<typeof CaseSchema>;
