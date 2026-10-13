import { z } from 'zod';

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
  unit: z.union([z.enum(['percent', 'points', 'usd', 'count']), z.array(z.enum(['percent', 'points', 'usd', 'count'])).min(1)]).optional(),
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
  // generic question, owed.
  brainstorm: z.object({
    ask: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    required: z.boolean().default(true),
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
  c.shareBases.forEach((b, i) => {
    if (!ledgerIds.has(b.item)) ctx.addIssue({ code: 'custom', path: ['shareBases', i, 'item'], message: `Unknown ledger item "${b.item}"` });
  });
  c.quoteAnchors.forEach((q, i) => {
    if (!ledgerIds.has(q.item)) ctx.addIssue({ code: 'custom', path: ['quoteAnchors', i, 'item'], message: `Unknown ledger item "${q.item}"` });
    const item = c.dataLedger.find(d => d.id === q.item);
    if (item && Object.keys(item.timeframes ?? {}).length === 0) ctx.addIssue({ code: 'custom', path: ['quoteAnchors', i, 'item'], message: `"${q.item}" has no timeframes, so it has no figures to check` });
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
    for (const id of Object.keys(f.directions)) if (!factIds.has(id)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'directions', id], message: `Unknown ledger item or prompt fact "${id}"` });
    f.drivers.forEach((d, i) => {
      if (!factIds.has(d.of)) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'drivers', i, 'of'], message: `Unknown ledger item or prompt fact "${d.of}"` });
      const sum = d.parts.reduce((a, p) => a + p.value, 0);
      if (Math.abs(sum - d.total) > 0.05) ctx.addIssue({ code: 'custom', path: ['factAnchors', 'drivers', i], message: `parts sum to ${sum}, not ${d.total}` });
    });
  }
});

export type Case = z.infer<typeof CaseSchema>;
