import { describe, it, expect } from 'vitest';
import { checkFlowRun } from '@/lib/eval/flow-check';
import type { CorpusRun, CorpusTurn } from '@/lib/eval/run-corpus';
import { getCaseById } from '@/lib/cases/loader';

const c = getCaseById('prof-001') as never;
const CORE = ['bean_share_of_cogs', 'bean_price_change', 'non_bean_input_change'];
let n = 0;
const T = (q: string, o: Partial<CorpusTurn> = {}): CorpusTurn => ({
  t: (n += 2), candidateText: 'ok', phase: 'ANALYSIS', kind: 'model', move: null, heard: q,
  segments: [{ kind: 'question', author: o.kind && o.kind !== 'model' ? 'code' : 'model', text: q }],
  revealedBefore: [], releasedNow: [], shownBefore: ['exhibit-a'], exhibitNow: null, seeded: false, elapsedMs: 8 * 60_000, ...o,
});
const run = (turns: CorpusTurn[], status = 'completed'): CorpusRun => ({ id: 'r', dir: '', group: 'g', date: '', model: 'm', persona: 'p', format: 'turn_file', status, turns } as unknown as CorpusRun);
const rules = (r: CorpusRun) => checkFlowRun(r, c).map(f => `${f.rule}:${f.sub}`);
const BS = T('Beyond pricing, what else could the client do to protect margin?');
const REC = (o: Partial<CorpusTurn> = {}) => T("What's your recommendation to the client?", { revealedBefore: CORE, ...o });
const RISK = T("What's the biggest risk to that recommendation?", { revealedBefore: CORE });
const CLOSE = T("We've covered everything I wanted to. Thanks for working through the case — your written report will follow.", { kind: 'close', revealedBefore: CORE });

describe('flow detectors (batch 20 grading)', () => {
  it('a clean run has no flow fault', () => {
    expect(rules(run([BS, REC(), RISK, CLOSE]))).toEqual([]);
  });

  it('D7: the recommendation asked with the COGS inputs never out — once per owed set (R06, R14)', () => {
    const early = T('Of everything you proposed, which single lever would you start with first, and why?');
    expect(rules(run([BS, early, T('Go on — what else?'), early, REC(), RISK, CLOSE]))).toEqual(['D7:analysis']);
  });

  it('D7: two of the three core items out is the analysis attempted; not in the last 90 s', () => {
    expect(rules(run([BS, REC({ revealedBefore: CORE.slice(0, 2) }), RISK, CLOSE]))).toEqual([]);
    expect(rules(run([REC({ elapsedMs: 19 * 60_000, kind: 'time_warning' }), RISK, CLOSE]))).toEqual(['STAGE:brainstorm']);
  });

  it("D7: after code's one line back to the analysis, the recommendation may be asked", () => {
    const back = T("Let's hold the recommendation for now: what's driving the margin drop, and what would you need to know to pin it down?", { kind: 'stage_analysis' });
    expect(rules(run([BS, back, REC({ revealedBefore: [] }), RISK, CLOSE]))).toEqual([]);
  });

  it("D7: the line back to the analysis in its plain form (no recommendation in play) counts too — on a model turn Settle held", () => {
    const back = T("What's driving the margin drop, and what would you need to know to pin it down?");
    expect(rules(run([BS, back, REC({ revealedBefore: [] }), RISK, CLOSE]))).toEqual([]);
  });

  it("CLOSE: after code's one line back to the analysis, the close is no early close", () => {
    const back = T("Let's hold the recommendation for now: what's driving the margin drop, and what would you need to know to pin it down?", { kind: 'stage_analysis' });
    const close = T("We've covered everything I wanted to. Thanks for working through the case — your written report will follow.", { kind: 'close' });
    expect(rules(run([BS, back, REC({ revealedBefore: [] }), RISK, close]))).toEqual([]);
  });

  it('CLOSE: the one-line answer to a question about assessment is no close line (Rule 16)', () => {
    const report = T("That's a broad list. You'll get a full written report afterward, so I won't score it live. Which cost line would you look at next?");
    expect(rules(run([BS, report, REC(), RISK, CLOSE]))).toEqual([]);
  });

  it('STAGE: an analysis "how would you test that?" is no risk question (R16)', () => {
    const test = T('Does the bean move explain COGS, and how would you test that?', { revealedBefore: CORE });
    expect(rules(run([test, BS, REC(), CLOSE]))).toEqual(['STAGE:risk']);
  });

  it('STAGE: a contingency after the recommendation is the risk question (R20)', () => {
    const contingency = T('If the pilot shows traffic falling, at what point would you stop the price increase?', { revealedBefore: CORE });
    expect(rules(run([BS, REC(), contingency, CLOSE]))).toEqual([]);
  });

  it('CLOSE: the model says the case is closed and goes on (R10), and code closes with no recommendation asked (R36)', () => {
    const modelClose = T("Understood. Thanks, that closes the case. Before you go, what's the one number you'd track?", { revealedBefore: CORE });
    expect(rules(run([BS, REC(), RISK, modelClose, CLOSE]))).toEqual(['CLOSE:model_close_line']);
    // Batch 21 wave 1, Owen t18 — the live close cue, read the same offline.
    expect(rules(run([BS, REC(), RISK, T("That's all I need from you on the case.", { revealedBefore: CORE }), CLOSE]))).toEqual(['CLOSE:model_close_line']);
    expect(rules(run([BS, T("What's the biggest risk here?", { revealedBefore: CORE }), CLOSE]))).toEqual(['CLOSE:no_recommendation', 'STAGE:recommendation']);
  });

  it('CLOSE: a time-up close is no early close', () => {
    const timeUp = T("That's our time. Thanks for working through this with me — your written report will follow.", { kind: 'close' });
    expect(rules(run([BS, timeUp]))).not.toContain('CLOSE:no_recommendation');
  });

  it('LOOP: the same ask three turns running with nothing given (R17), not when data comes between', () => {
    const asks = ['What would you prioritize, and why?', 'Which branch would you start with, and why?', 'Of the areas you named, which one would you check first?'].map(q => T(q));
    expect(rules(run(asks, 'active'))).toEqual(['LOOP:prioritize']);
    const withData = [asks[0], T(asks[1].segments[0].text, { releasedNow: ['cogs_pct'] }), asks[2]];
    expect(rules(run(withData, 'active'))).toEqual([]);
  });
});

// New cases (13 Oct): the case's own brainstorm question counts, and a case
// with no brainstorm module owes none.
describe('flow detectors on the new cases', () => {
  const hollis = getCaseById('launch-001') as never;
  const quill = getCaseById('pricing-001') as never;
  // Every exhibit of the new cases is required (13 Oct): all shown here.
  const shown = { shownBefore: ['exhibit-1', 'exhibit-2', 'exhibit-3', 'exhibit-4'] };
  const rec = (core: string[]) => T("What's your recommendation to the client?", { revealedBefore: core, ...shown });
  const risk = (core: string[]) => T("What's the biggest risk to that recommendation?", { revealedBefore: core, ...shown });
  const close = (core: string[]) => T("We've covered everything I wanted to. Thanks for working through the case — your written report will follow.", { kind: 'close', revealedBefore: core, ...shown });
  it("Hollis Bay's own brainstorm question is the brainstorm", () => {
    const core = ['bag_price', 'variable_costs', 'launch_costs', 'purchase_intent'];
    const bs = T('What could Hollis Bay do to get shoppers to try its chickpea snacks — and to keep buying them?', { revealedBefore: core, ...shown });
    expect(checkFlowRun(run([bs, rec(core), risk(core), close(core)]), hollis).map(f => `${f.rule}:${f.sub}`)).toEqual([]);
    expect(checkFlowRun(run([rec(core), risk(core), close(core)]), hollis).map(f => `${f.rule}:${f.sub}`)).toEqual(['D7:brainstorm', 'STAGE:brainstorm']);
  });
  it('Quillpath owes no brainstorm', () => {
    const core = ['plan_prices_costs', 'plan_cac', 'starter_cohort'];
    expect(checkFlowRun(run([rec(core), risk(core), close(core)]), quill).map(f => `${f.rule}:${f.sub}`)).toEqual([]);
  });
});

describe('required exhibits are owed one by one (13 Oct)', () => {
  const lark = getCaseById('prof-002') as never;
  const core = ['route_results_lakeport', 'route_results_port_avery', 'lakeport_fare'];
  const at = (shownBefore: string[]) => ({ revealedBefore: core, shownBefore });
  const bs = (o: object) => T("What else could Larkspur do to make sure it's profitable in the first year?", o);
  const rec = (o: object) => T("What's your recommendation to the client?", o);
  const risk = (o: object) => T("What's the biggest risk to that recommendation?", o);
  const close = (o: object) => T("We've covered everything I wanted to. Thanks for working through the case — your written report will follow.", { kind: 'close', ...o });
  it('a run that never showed Exhibit 3 owes it (D7 and STAGE); all three shown owes nothing', () => {
    const two = at(['exhibit-1', 'exhibit-2']);
    expect(checkFlowRun(run([bs(two), rec(two), risk(two), close(two)]), lark).map(f => `${f.rule}:${f.sub}`)).toEqual(['D7:exhibit', 'STAGE:exhibit']);
    const all = at(['exhibit-1', 'exhibit-2', 'exhibit-3']);
    expect(checkFlowRun(run([bs(all), rec(all), risk(all), close(all)]), lark).map(f => `${f.rule}:${f.sub}`)).toEqual([]);
  });
});
