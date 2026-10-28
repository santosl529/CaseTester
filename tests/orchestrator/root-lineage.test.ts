// Phase 1 Stream 3 task 3 — roots via dependsOn (`rootLineage`). Lorenzo: "probe only the root; at most 2 probes per
// lineage, then one correction at the root, worded from the case's definition or ledger line; derived figures wait for
// their root", and his ruling on contract Q1: "no root correction unless the checker rated the root, or a claim in its
// lineage, an error. Otherwise two probes, then the report."
// The Stream 2 review (22 Oct): the overlay's dependsOn (merged under `stepLineage`) must not turn round 6's roots on by
// itself, and an independent slip on an intermediate step must still be probed. Stream 2's real overlays are copied
// here as fixtures (fixtures/phase1-overlays/*.json) until they land in cases/phase1.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Phase1OverlaySchema, applyPhase1Overlay } from '@/lib/cases/phase1-overlay';
import { CaseSchema, type Case } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';
import { stepRootsDeclared, isRootStep, lineageInherits, planCheckerFlags, STEP_PROBE_CAP, type CheckerRow, type StepRoot, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { lineageOf } from '@/lib/orchestrator/worksheet';
import { RAJ, pricing, rootsUpTo } from './fixtures/step-roots-replay';

const merged = (id: string, switches: string): Case => {
  const raw = CaseSchema.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8')));
  const overlay = Phase1OverlaySchema.parse(JSON.parse(readFileSync(`tests/orchestrator/fixtures/phase1-overlays/${id}.json`, 'utf8')));
  return applyPhase1Overlay(raw, overlay, { ENGINE_SWITCHES: switches });
};
// plan-turn's own gate on round 6's roots and on task 3's lineage rules (one line there; read here on the merged
// cases): the case's own file must author the lineage — an input question, which no overlay can add.
const rootsOn = (c: Case) => stepRootsDeclared(c) && c.mathSteps.some(s => s.inputQuestion !== undefined);

describe('an overlay\'s dependsOn runs no lineage rule (the Stream 2 review a; review I6)', () => {
  it('prof-001 with stepLineage: the lineage is merged, and nothing in round 6 or task 3 reads it — the case file declares no input question', () => {
    const c = merged('prof-001', 'prof-001=stepLineage');
    expect(c.mathSteps.filter(s => s.dependsOn).map(s => s.id)).toEqual(['bean_points_added', 'non_bean_points_now', 'non_bean_points_added']);
    expect(stepRootsDeclared(c)).toBe(true);
    expect(isRootStep(c, 'bean_share_of_revenue')).toBe(true);      // others depend on it…
    expect(rootsOn(c)).toBe(false);   // …but no root runs, with or without rootLineage (review I6): the gate is the case file's
  });
  it('the same for prof-002; pricing-001 runs them either way (its own inputQuestion, validated in round 6)', () => {
    const prof2 = merged('prof-002', 'prof-002=stepLineage');
    expect(rootsOn(prof2)).toBe(false);
    expect(rootsOn(merged('pricing-001', 'pricing-001=stepLineage'))).toBe(true);
    // …and with no overlay at all, nothing changes for the cases that declare no lineage of their own.
    expect(rootsOn(getCaseById('prof-001'))).toBe(false);
    expect(rootsOn(getCaseById('pricing-001'))).toBe(true);
  });
});

describe('the lineage (worksheet.ts lineageOf) and its probe budget', () => {
  it('prof-001 merged: bean_share_of_revenue\'s lineage is the three steps built on it', () => {
    const c = merged('prof-001', 'prof-001=stepLineage');
    expect(lineageOf(c, 'non_bean_points_added')).toEqual({ root: 'bean_share_of_revenue', members: ['bean_share_of_revenue', 'bean_points_added', 'non_bean_points_now', 'non_bean_points_added'] });
    expect(lineageOf(c, 'cogs_dollar_impact')).toEqual({ root: 'cogs_dollar_impact', members: ['cogs_dollar_impact'] });
  });
  it('probes are counted across the lineage: the third probe anywhere in it is past the cap', () => {
    const c = merged('prof-001', 'prof-001=stepLineage');
    const spent = { bean_share_of_revenue: 1, bean_points_added: 1 };
    const probesOn = (step: string) => lineageOf(c, step).members.reduce((n, m) => n + (spent[m as keyof typeof spent] ?? 0), 0);
    expect(probesOn('non_bean_points_added')).toBe(2);
    expect(probesOn('non_bean_points_added')).toBeGreaterThanOrEqual(STEP_PROBE_CAP);
    expect(probesOn('cogs_dollar_impact')).toBe(0);
  });
});

describe('what a dependent inherits (review I6, requirement b)', () => {
  const pricingMerged = merged('pricing-001', 'pricing-001=stepLineage');   // its lineage is the case file's own: flat
  const root: StepRoot = { step: 'starter_ltv', value: 405, figures: [405], since: 5 };
  it('a dependent computed from the root\'s own inputs links to it while nothing says otherwise', () => {
    const inherits = lineageInherits(pricingMerged, [{ stepId: 'starter_ltv', value: 405, n: 5 }]);
    expect(inherits(root, 'starter_value_with_upgrades', [1205], 9)).toBe(true);
    expect(inherits(root, 'starter_net_value', [905], 9)).toBe(true);
  });
  it('…and not when the root itself is stated right in the dependent claim\'s own message — that error is their own', () => {
    const inherits = lineageInherits(pricingMerged, [{ stepId: 'starter_ltv', value: 600, n: 9 }]);
    expect(inherits(root, 'starter_ratio', [1.4], 9)).toBe(false);
    expect(inherits(root, 'starter_ratio', [1.4], 11)).toBe(true);
  });
  it('…nor when a step between the root and the claim is stated right since the root (a fixture chain: pricing-001\'s own lineage is flat)', () => {
    const chain = { mathSteps: [
      { id: 'root', answer: 600, tolerance: 10, inputs: ['a'] },
      { id: 'mid', answer: 1400, tolerance: 50, inputs: ['a', 'b'], dependsOn: ['root'] },
      { id: 'leaf', answer: 1100, tolerance: 50, inputs: ['a', 'b', 'c'], dependsOn: ['mid'] },
    ] };
    const rootAt405: StepRoot = { step: 'root', value: 405, figures: [405], since: 5 };
    expect(lineageInherits(chain, [])(rootAt405, 'leaf', [905], 9)).toBe(true);
    expect(lineageInherits(chain, [{ stepId: 'mid', value: 1400, n: 7 }])(rootAt405, 'leaf', [905], 9)).toBe(false);
    // the intermediate's own claim still links: its error can be the root's (round 6's ruled behaviour)
    expect(lineageInherits(chain, [{ stepId: 'mid', value: 1400, n: 7 }])(rootAt405, 'mid', [1205], 9)).toBe(true);
  });
  it('a step that is not computed from the root\'s inputs inherits nothing (a sibling grouping, not a chain)', () => {
    const inherits = lineageInherits(pricingMerged, []);
    // pro_net_value is built on the Pro cohort, not on Starter's: declared a dependent, it still could not carry the error.
    expect(inherits(root, 'pro_net_value', [2800], 9)).toBe(false);
    const siblings = { mathSteps: [
      { id: 'share', answer: 10.5, tolerance: 0.3, inputs: ['cogs', 'bean_share'] },
      { id: 'other_now', answer: 43.3, tolerance: 0.4, inputs: ['cogs', 'other_change'], dependsOn: ['share'] },
    ] };
    expect(lineageInherits(siblings, [])({ step: 'share', value: 14.5, figures: [14.5], since: 5 } as StepRoot, 'other_now', [40], 9)).toBe(false);
    // …and prof-001, whose authored lineage is such a grouping, never reaches this code at all.
    expect(rootsOn(merged('prof-001', 'prof-001=stepLineage'))).toBe(false);
  });
});

describe('the root\'s one correction (Q1, approved 22 Oct; review C1/I1/I2): b37q Raj e08c362a, starter_ltv at $405', () => {
  const ROOT = 'step:starter_ltv@405';
  const KEY = 'starter_ltv@405';
  const verdicts = RAJ.rows.filter(r => r.subtype === 'verdict') as CheckerRow[];
  const upTo = (n: number) => verdicts.filter(r => (r.payloadJsonb as VerdictPayload).candidateTurnIndex < n);
  const definition = 'Lifetime value is monthly gross margin times expected lifetime in months, and expected lifetime is about one divided by the monthly cancellation rate.';
  // The root's own probe is its input question (booked as attempt 1 on starter_ltv@405 at message 11), and the lineage
  // has spent its two probes — the budget the contract asks for before code corrects.
  const plan = (n: number, over: Record<string, unknown> = {}, probes = STEP_PROBE_CAP, attempts: Record<string, number> = { [KEY]: 1 }) => planCheckerFlags({
    rows: upTo(n), handled: [], turnRows: RAJ.turns.filter(t => t.turnIndex < n), candidateText: RAJ.turns.find(t => t.turnIndex === n)?.text ?? 'Go on.', candidateTurnIndex: n,
    currentFlags: [], attempts, underTimePressure: false, candidateFigures: [], caseData: pricing as never,
    revealedIds: RAJ.records[String(n)]?.revealed ?? [], shownExhibitIds: RAJ.records[String(n)]?.shown ?? [],
    stepRoots: rootsUpTo(RAJ, n), rootLineage: { probes: () => probes, definitionOf: (s: string) => (s === 'starter_ltv' ? definition : undefined) },
    ...over,
  });
  // His 21:1 is the checker's own claim on the root — "$405 from their time on Starter" — so from message 23 the root's
  // value is the candidate's in the checker's words (C1), not the step binder's.
  it('the root\'s correction is said at the root, the case\'s definition first, on the linked claim\'s turn', () => {
    const p = plan(23);
    expect(p.selected).toMatchObject({ key: KEY, action: 'correct', rootCorrection: ROOT, onceRoot: 'step:starter_ltv' });
    expect(p.selected!.line).toBe(`${definition} Starter standalone lifetime value at $40 is about $600, not $405.`);
    expect(p.decisions.find(d => d.id === p.selected!.id)!.reason).toMatch(/built on starter_ltv's 405, flagged by the step check — the root's own correction/);
  });
  it('the lineage\'s claims ride on it: no second line for them', () => {
    const p = plan(23);
    const ids = (p.selected!.riders ?? []).map(r => r.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(p.decisions.filter(d => ids.includes(d.id)).every(d => d.outcome === 'derived')).toBe(true);
    expect(p.waiting.map(w => w.id)).not.toEqual(expect.arrayContaining(ids));
  });
  it('C1: with no claim of the checker\'s on the root at that value, no correction — the step binder alone licenses none', () => {
    // b35q Marcus 7e69eda5 in miniature: the root is the binder's, every checker claim on the step is at another value.
    const rows = upTo(23).map(r => ({ ...r, payloadJsonb: { ...(r.payloadJsonb as VerdictPayload),
      claims: (r.payloadJsonb as VerdictPayload).claims.map(c => (c.codeQuantity.stepId === 'starter_ltv' ? { ...c, candidateValue: '$600', span: 'Starter LTV is $30 × 20 = $600' } : c)) } }));
    expect(plan(23, { rows }).selected?.rootCorrection).toBeUndefined();
  });
  it('C1: a claim on the root that is only a hypothetical is no provenance either', () => {
    const rows = upTo(23).map(r => ({ ...r, payloadJsonb: { ...(r.payloadJsonb as VerdictPayload),
      claims: (r.payloadJsonb as VerdictPayload).claims.map(c => (c.codeQuantity.stepId === 'starter_ltv' ? { ...c, span: 'that would put LTV around $405 if churn were 7%' } : c)) } }));
    expect(plan(23, { rows }).selected?.rootCorrection).toBeUndefined();
  });
  it('I1/I2: two probes on the lineage, and the root at that value probed itself, before code corrects', () => {
    // (The root's own claim, 21:1, is handled by Rule 14 as always — it is the linked claims that wait for it.)
    expect(plan(23, {}, 0).selected?.rootCorrection).toBeUndefined();                  // nothing probed yet
    expect(plan(23, {}, 1).selected?.rootCorrection).toBeUndefined();                  // one probe on the lineage: not yet
    expect(plan(23, {}, STEP_PROBE_CAP, {}).selected?.rootCorrection).toBeUndefined(); // the lineage probed, the root at $405 never
    expect(plan(23).selected).toMatchObject({ rootCorrection: ROOT });
  });
  it('Q1: with no error rating on the root or its lineage, no root correction — the claim goes as before', () => {
    const noError = upTo(23).map(r => ({ ...r, payloadJsonb: { ...(r.payloadJsonb as VerdictPayload), claims: (r.payloadJsonb as VerdictPayload).claims.map(c => ({ ...c, verdict: 'unverifiable' as const, flag: false })) } }));
    expect(plan(23, { rows: noError }).selected?.rootCorrection).toBeUndefined();
  });
  it('a figure they have moved off is not corrected: the checker\'s latest claim on the root must still be at its value', () => {
    const moved = [...upTo(23), { category: 'math_checker', subtype: 'verdict', turnIndex: 22, payloadJsonb: {
      candidateTurnIndex: 22, latencyMs: 0, model: 'm', codeFlags: [], stamps: [],
      claims: [{ ...((upTo(23).at(-1)!.payloadJsonb as VerdictPayload).claims[0] as VettedClaim), span: 'Starter LTV is $30 × 20 = $600', candidateValue: '$600', verdict: 'correct' as const, flag: false, codeQuantity: { kind: 'step' as const, stepId: 'starter_ltv', price: null, target: null } }],
    } }];
    expect(plan(23, { rows: moved }).selected?.rootCorrection).toBeUndefined();
  });
  it('the root\'s value withdrawn since (rootStale): no correction of a figure they took back', () => {
    const p = plan(23, { rootLineage: { probes: () => STEP_PROBE_CAP, definitionOf: () => definition, rootStale: () => '405 withdrawn ("not $405")' } });
    expect(p.selected?.rootCorrection).toBeUndefined();
  });
});
