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
// plan-turn's own gate on round 6's roots (one line there; read here on the merged cases).
const rootsOn = (c: Case, lineageOnSwitch: boolean) => stepRootsDeclared(c) && (lineageOnSwitch || c.mathSteps.some(s => s.inputQuestion !== undefined));

describe('the overlay\'s dependsOn alone turns no root on (the Stream 2 review, requirement a)', () => {
  it('prof-001 with stepLineage: the lineage is merged, and round 6\'s roots stay off — it declares no input question', () => {
    const c = merged('prof-001', 'prof-001=stepLineage');
    expect(c.mathSteps.filter(s => s.dependsOn).map(s => s.id)).toEqual(['bean_points_added', 'non_bean_points_now', 'non_bean_points_added']);
    expect(stepRootsDeclared(c)).toBe(true);
    expect(isRootStep(c, 'bean_share_of_revenue')).toBe(true);      // others depend on it…
    expect(rootsOn(c, false)).toBe(false);                           // …but no roots run without the switch
    expect(rootsOn(c, true)).toBe(true);
  });
  it('the same for prof-002, entry-001 and launch-001; pricing-001 runs them either way (its own inputQuestion)', () => {
    for (const id of ['prof-002']) {
      const c = merged(id, `${id}=stepLineage`);
      expect(rootsOn(c, false), id).toBe(false);
    }
    expect(rootsOn(merged('pricing-001', 'pricing-001=stepLineage'), false)).toBe(true);
    // …and with no overlay at all, nothing changes for the cases that declare no lineage of their own.
    expect(rootsOn(getCaseById('prof-001'), true)).toBe(false);
    expect(rootsOn(getCaseById('pricing-001'), false)).toBe(true);
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

describe('an independent slip on an intermediate step is still probed (requirement b)', () => {
  const c = merged('prof-001', 'prof-001=stepLineage');
  const root: StepRoot = { step: 'bean_share_of_revenue', value: 14.5, figures: [14.5], since: 5 };
  it('a dependent claim links to the root while the intermediate stands unstated', () => {
    const inherits = lineageInherits(c, [{ stepId: 'bean_share_of_revenue', value: 14.5, n: 5 }]);
    expect(inherits(root, 'non_bean_points_added', [13], 9)).toBe(true);
  });
  it('…and not once the candidate states the step between them at its right value (43.3 now, so the 13 is their own slip)', () => {
    const inherits = lineageInherits(c, [{ stepId: 'bean_share_of_revenue', value: 14.5, n: 5 }, { stepId: 'non_bean_points_now', value: 43.3, n: 7 }]);
    expect(inherits(root, 'non_bean_points_added', [13], 9)).toBe(false);
    // The intermediate step's own claim is never linked by dependency either way: it is the one that is probed.
    expect(inherits(root, 'non_bean_points_now', [40], 9)).toBe(true);
  });
  it('…nor when the root itself is stated right in the dependent claim\'s own message', () => {
    const inherits = lineageInherits(c, [{ stepId: 'bean_share_of_revenue', value: 10.5, n: 9 }]);
    expect(inherits(root, 'bean_points_added', [5.8], 9)).toBe(false);
    expect(inherits(root, 'bean_points_added', [5.8], 11)).toBe(true);
  });
});

describe('the root\'s one correction (Q1, approved 22 Oct): b37q Raj e08c362a, starter_ltv at $405', () => {
  const ROOT = 'step:starter_ltv@405';
  const verdicts = RAJ.rows.filter(r => r.subtype === 'verdict') as CheckerRow[];
  const upTo = (n: number) => verdicts.filter(r => (r.payloadJsonb as VerdictPayload).candidateTurnIndex < n);
  const definition = 'Lifetime value is monthly gross margin times expected lifetime in months, and expected lifetime is about one divided by the monthly cancellation rate.';
  const plan = (n: number, over: Record<string, unknown> = {}, probes = STEP_PROBE_CAP) => planCheckerFlags({
    rows: upTo(n), handled: [], turnRows: RAJ.turns.filter(t => t.turnIndex < n), candidateText: RAJ.turns.find(t => t.turnIndex === n)?.text ?? 'Go on.', candidateTurnIndex: n,
    currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: [], caseData: pricing as never,
    revealedIds: RAJ.records[String(n)]?.revealed ?? [], shownExhibitIds: RAJ.records[String(n)]?.shown ?? [],
    stepRoots: rootsUpTo(RAJ, n), rootLineage: { probes: () => probes, definitionOf: (s: string) => (s === 'starter_ltv' ? definition : undefined) },
    ...over,
  });
  it('the root\'s correction is said at the root, the case\'s definition first, on the linked claim\'s turn', () => {
    const p = plan(19);
    expect(p.selected).toMatchObject({ key: 'starter_ltv@405', action: 'correct', rootCorrection: ROOT, onceRoot: 'step:starter_ltv' });
    expect(p.selected!.line).toBe(`${definition} Starter standalone lifetime value at $40 is about $600, not $405.`);
    expect(p.decisions.find(d => d.id === p.selected!.id)!.reason).toMatch(/built on starter_ltv's 405, flagged by the step check — the root's own correction/);
  });
  it('the lineage\'s claims ride on it: no second line for them', () => {
    const p = plan(19);
    const ids = (p.selected!.riders ?? []).map(r => r.id);
    expect(p.decisions.filter(d => ids.includes(d.id)).every(d => d.outcome === 'derived')).toBe(true);
    expect(p.waiting.map(w => w.id)).not.toEqual(expect.arrayContaining(ids));
  });
  it('before the root has been probed once the linked claim waits — probe the root first', () => {
    expect(plan(19, {}, 0).selected).toBeNull();
    expect(plan(19, {}, 1).selected).toMatchObject({ rootCorrection: ROOT });
  });
  it('Q1: with no error rating on the root or its lineage, no root correction — the claim goes as before', () => {
    const noError = upTo(19).map(r => ({ ...r, payloadJsonb: { ...(r.payloadJsonb as VerdictPayload), claims: (r.payloadJsonb as VerdictPayload).claims.map(c => ({ ...c, verdict: 'unverifiable' as const, flag: false })) } }));
    const p = plan(19, { rows: noError });
    expect(p.selected?.rootCorrection).toBeUndefined();
  });
  it('a figure they have moved off is not corrected: the checker\'s latest claim on the root must still be at its value', () => {
    const moved = [...upTo(19), { category: 'math_checker', subtype: 'verdict', turnIndex: 18, payloadJsonb: {
      candidateTurnIndex: 18, latencyMs: 0, model: 'm', codeFlags: [], stamps: [],
      claims: [{ ...((upTo(19).at(-1)!.payloadJsonb as VerdictPayload).claims[0] as VettedClaim), span: 'Starter LTV is $30 × 20 = $600', candidateValue: '$600', verdict: 'correct' as const, flag: false, codeQuantity: { kind: 'step' as const, stepId: 'starter_ltv', price: null, target: null } }],
    } }];
    expect(plan(19, { rows: moved }).selected?.rootCorrection).toBeUndefined();
  });
  it('the root\'s value withdrawn since (rootStale): no correction of a figure they took back', () => {
    const p = plan(19, { rootLineage: { probes: () => STEP_PROBE_CAP, definitionOf: () => definition, rootStale: () => '405 withdrawn ("not $405")' } });
    expect(p.selected?.rootCorrection).toBeUndefined();
  });
});
